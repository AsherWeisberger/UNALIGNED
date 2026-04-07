"""
UNALIGNED Lead Pipeline — Cloud Function (REST-only, no Firebase Admin SDK)
Triggered by Cloud Scheduler at 9am M-F.
"""
import os, json, base64, re, time, logging, requests
from datetime import datetime, timedelta
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import openai

logging.getLogger().setLevel(logging.INFO)

# ─── CONFIG ───────────────────────────────────────────────────
PROJECT    = os.environ.get("PROJECT_ID", "unaligned-fc556")
FS_URL     = f"projects/{PROJECT}/databases/(default)/documents"
FS_BASE    = "https://firestore.googleapis.com/v1"
FS_REST    = f"{FS_BASE}/{FS_URL}"
TOKEN_PATH="/tmp/gmail-token.json"
BOARD_DOC  = "boards/shared-board"
STATS_DOC  = "boards/_pipeline_stats"
FIREBASE_API_KEY=os.environ.get("FIREBASE_API_KEY","")
FS_KEY_PARAM    = f"?key={FIREBASE_API_KEY}" if FIREBASE_API_KEY else ""

# ─── GCP ACCESS TOKEN ─────────────────────────────────────────
_METADATA_URL  = "http://metadata.google.internal/computeMetadata/v1"
_METADATA_FLAVOR = {"Metadata-Flavor": "Google"}

def _gcp_token():
    import requests as _req
    r = _req.get(
        f"{_METADATA_URL}/instance/service-accounts/default/token",
        headers=_METADATA_FLAVOR, timeout=5
    )
    r.raise_for_status()
    return r.json()["access_token"]

# ─── HELPERS ──────────────────────────────────────────────────

def _secret(name):
    """Fetch a secret from GCF Secret Manager via REST API (returns decoded string)."""
    token = _gcp_token()
    url = f"https://secretmanager.googleapis.com/v1/projects/{PROJECT}/secrets/{name}/versions/latest:access"
    r = requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=15)
    r.raise_for_status()
    import base64
    b64 = r.json()["payload"]["data"]
    return base64.b64decode(b64).decode("utf-8")

def _ensure_tokens():
    if not os.path.exists(TOKEN_PATH):
        with open(TOKEN_PATH, "w") as f: f.write(_secret("gmail-oauth-token"))

# ─── FIRESTORE CLIENT (googleapiclient) ─────────────────────────
_FIRESTORE_BUILD = None

def _fs_client():
    global _FIRESTORE_BUILD
    if _FIRESTORE_BUILD is None:
        _FIRESTORE_BUILD = build("firestore", "v1", http=requests.Session(), cache_discovery=False)
    return _FIRESTORE_BUILD

def _fs_get(path):
    """Firestore GET — returns dict or None."""
    try:
        client = _fs_client()
        doc_path = f"{PROJECT}/databases/(default)/documents/{path}"
        result = client.projects().databases().documents().get(
            name=doc_path
        ).execute()
        return result
    except HttpError as e:
        if e.resp.status == 404: return None
        raise

def _fs_patch(path, body):
    """Firestore PATCH — update specific fields."""
    client = _fs_client()
    doc_path = f"{PROJECT}/databases/(default)/documents/{path}"
    # Use updateMask to only touch specified fields
    mask = ",".join(body.keys())
    result = client.projects().databases().documents().patch(
        name=doc_path,
        body={"fields": body},
        updateMask={"fieldPaths": list(body.keys())}
    ).execute()
    return result

def _fs_commit(path, operations):
    """Firestore batchWrite."""
    client = _fs_client()
    doc_name = f"projects/{PROJECT}/databases/(default)/documents/{path}"
    writes = []
    for op in operations:
        writes.append({
            "update": {"name": doc_name, "fields": op},
            "updateMask": {"fieldPaths": list(op.keys())}
        })
    result = client.projects().databases().documents().batchWrite(
        body={"writes": writes}
    ).execute()
    return result

def _fs_headers():
    return {"Content-Type": "application/json"}

def _firestore_json(doc_dict):
    """Convert a Python dict to Firestore REST field format."""
    def fmt(v):
        if v is None: return {"nullValue": None}
        if isinstance(v, bool): return {"booleanValue": v}
        if isinstance(v, int): return {"integerValue": str(v)}
        if isinstance(v, float): return {"doubleValue": v}
        if isinstance(v, str): return {"stringValue": v}
        if isinstance(v, dict): return {"mapValue": {"fields": {kk: fmt(vv) for kk, vv in v.items()}}}
        if isinstance(v, list): return {"arrayValue": {"values": [fmt(i) for i in v]}}
        return {"stringValue": str(v)}
    return {k: fmt(v) for k, v in doc_dict.items()}

def _parse_firestore(doc):
    """Parse Firestore REST response → Python dict."""
    if not doc or "fields" not in doc: return {}
    def parse(v):
        if not v: return None
        t = list(v.keys())[0] if v else None
        if t == "nullValue": return None
        if t == "booleanValue": return v[t]
        if t in ("integerValue", "stringValue"): return v[t]
        if t == "doubleValue": return float(v[t])
        if t == "mapValue": return {kk: parse(vv) for kk, vv in v[t].get("fields", {}).items()}
        if t == "arrayValue": return [parse(x) for x in v[t].get("values", [])]
        return str(v)
    return {k: parse(v) for k, v in doc["fields"].items()}

# ─── GMAIL AUTH ───────────────────────────────────────────────

def get_gmail_service():
    _ensure_tokens()
    creds = Credentials.from_authorized_user_file(TOKEN_PATH, [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
    ])
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        with open(TOKEN_PATH, "w") as f: f.write(creds.to_json())
        try:
            token = _gcp_token()
            import base64 as _b64
            parent = f"projects/{PROJECT}/secrets/gmail-oauth-token"
            requests.post(
                f"https://secretmanager.googleapis.com/v1/{parent}:addVersion",
                headers={"Authorization": f"Bearer {token}"},
                json={"payload": {"data": _b64.b64encode(creds.to_json().encode("utf-8")).decode("utf-8")}},
                timeout=15
            )
            logging.info("Token refreshed and saved to Secret Manager")
        except Exception as e:
            logging.warning(f"Could not save token to Secret Manager: {e}")
    return build("gmail", "v1", credentials=creds)

# ─── PIPELINE ─────────────────────────────────────────────────

BUSINESS_SIGNALS = [
    "partnership","collab","collaboration","advertis","sponsor",
    "interview","podcast","x post","twitter","campaign",
    "paid","rate","proposal","deal","offer","dm me",
    "featured","promotion","brand deal","affiliate",
    "content creation","social media post","paid collab",
    "sponsored","speaker","guest","appear","media kit",
    "rouser","creator","influencer","outreach","pitch"
]
OPENAI_KEY = os.environ.get("OPENAI_API_KEY", "")

def get_email_body(payload):
    body = ""
    if "data" in payload.get("body", {}):
        body = payload["body"]["data"]
    else:
        for p in payload.get("parts", []):
            if p.get("body", {}).get("data"):
                body = p["body"]["data"]; break
    if body:
        try: body = base64.urlsafe_b64decode(body).decode("utf-8", errors="replace")
        except: pass
    return body

def scrape_gmail(service):
    cutoff = (datetime.utcnow() - timedelta(days=30)).strftime("%Y/%m/%d")
    q = f'after:{cutoff} (("scoble") OR ("unaligned") OR ("scobalizer")) ({"|".join(BUSINESS_SIGNALS)}) -is:newsletter -from:notification -from:noreply -subject:security -subject:alert -subject:receipt -subject:order -subject:delivery -subject:calendar -subject:verify -subject:sign-in -subject:payment -subject:confirmation'
    results = service.users().messages().list(userId="me", q=q, maxResults=200).execute()
    msgs = results.get("messages", [])
    logging.info(f"Found {len(msgs)} matching emails")
    emails = []
    for m in msgs:
        try:
            d = service.users().messages().get(userId="me", id=m["id"], format="full").execute()
            hdrs = {h["name"].lower(): h["value"] for h in d.get("payload", {}).get("headers", [])}
            emails.append({
                "id": m["id"],
                "subject": hdrs.get("subject", "(no subject)"),
                "from": hdrs.get("from", ""),
                "date": hdrs.get("date", ""),
                "body": get_email_body(d.get("payload", {}))[:8000],
                "snippet": d.get("snippet", ""),
                "gmail_thread_id": m.get("threadId", m["id"]),
            })
        except Exception as e:
            logging.warning(f"Error fetching {m['id']}: {e}")
    return emails

def filter_relevant(emails):
    if not OPENAI_KEY: return _kw_filter(emails)
    client = openai.OpenAI(api_key=OPENAI_KEY)
    batch_size = 10
    relevant = []
    for i in range(0, len(emails), batch_size):
        batch = emails[i:i+batch_size]
        txt = "\n".join([f"EMAIL {j+1}: From:{e.get('from','')} | Subject:{e.get('subject','')} | {e.get('snippet','')[:300]}" for j,e in enumerate(batch)])
        prompt = f"""Lead qualification for Robert Scoble. YES if: wants to pay/collaborate/interview Robert, has a partnership deal, media kit, or campaign proposal. NO if: platform notifications, security alerts, newsletters, meeting invites, receipts, spam, cold pitches Robert didn't ask about, existing clients.\n\nEmails:\n{txt}\n\nRespond ONLY with JSON: [{{"email_index":1,"is_relevant":true,"reason":"..."}}]"""
        try:
            resp = client.chat.completions.create(model="gpt-4o-mini", messages=[{"role":"system","content":"JSON only."},{"role":"user","content":prompt}], temperature=0.1, max_tokens=2048, timeout=30.0)
            raw = resp.choices[0].message.content
            if "```json" in raw: raw = raw.split("```json")[1].split("```")[0]
            elif "```" in raw: raw = raw.split("```")[1].split("```")[0]
            for d in json.loads(raw):
                idx = d.get("email_index", 0) - 1
                if idx < len(batch) and d.get("is_relevant"): relevant.append(batch[idx])
        except Exception as e:
            logging.warning(f"Filter error: {e}"); relevant.extend(batch)
        time.sleep(0.3)
    logging.info(f"Filtered {len(emails)} → {len(relevant)}")
    return relevant

def _kw_filter(emails):
    noise = ["security alert","sign-in","receipt","calendar","linkedin notification","newsletter","no-reply","notification"]
    return [e for e in emails if not any(n in (e.get("subject","")+" "+e.get("from","")).lower() for n in noise)
            and any(s in (e.get("subject","")+" "+e.get("from","")).lower() for s in ["partnership","collab","interview","podcast","sponsor","paid","proposal","deal"])]

def extract_leads(emails):
    if not OPENAI_KEY: return [_regex_lead(e) for e in emails]
    client = openai.OpenAI(api_key=OPENAI_KEY)
    leads = []
    batch_size = 10
    for i in range(0, len(emails), batch_size):
        batch = emails[i:i+batch_size]
        logging.info(f"Extracting batch {i//batch_size+1}")
        txt = "\n".join([f"EMAIL {j+1}: ID:{e['id']} Subject:{e['subject']} From:{e['from']} Body:{e['body'][:2500]}" for j,e in enumerate(batch)])
        prompt = f"""Extract from each email: email_id, contact_name, email_address, company_name, title ("WHAT | Company", max 60 chars), description (WHO/WHAT/VALUE/WHY format), priority (hot/warm/cold), estimated_value (dollar or null), intent (1 sentence), urgency (high/medium/low).\n\n{txt}\n\nJSON array only, no markdown."""
        try:
            resp = client.chat.completions.create(model="gpt-4o-mini", messages=[{"role":"system","content":"JSON array only."},{"role":"user","content":prompt}], temperature=0.1, max_tokens=4096, timeout=60.0)
            raw = resp.choices[0].message.content
            if "```json" in raw: raw = raw.split("```json")[1].split("```")[0]
            elif "```" in raw: raw = raw.split("```")[1].split("```")[0]
            for lead in json.loads(raw):
                matched = next((e for e in batch if e["id"] == lead.get("email_id")), batch[0])
                ev = lead.get("estimated_value")
                leads.append({
                    "title": lead.get("title","New Lead")[:60],
                    "description": lead.get("description",""),
                    "priority": lead.get("priority","warm") if str(lead.get("priority","warm")) in ("hot","warm","cold") else "warm",
                    "contactName": lead.get("contact_name",""),
                    "email": lead.get("email_address",""),
                    "phone": lead.get("phone",""),
                    "businessName": lead.get("company_name",""),
                    "estimatedValue": str(ev) if ev else "",
                    "leadSource": "GMAIL",
                    "intent": lead.get("intent",""),
                    "follow_up_urgency": lead.get("urgency","medium"),
                    "original_email": matched,
                    "draft_reply": "",
                    "draft_reply_status": "pending",
                })
        except Exception as e:
            logging.warning(f"Extraction error: {e}")
            for e in batch: lead = _regex_lead(e); lead["original_email"] = e; leads.append(lead)
        time.sleep(0.5)
    logging.info(f"Extracted {len(leads)} leads")
    return leads

def _regex_lead(email):
    sender = email.get("from",""); subj = email.get("subject",""); body = email.get("body","")+email.get("snippet",""); s = (sender+subj+body).lower()
    em_m = re.search(r'[\w.+-]+@[\w.-]+\.[\w.-]+', sender)
    nm_m = re.search(r'^([^<]+)\s*<', sender)
    ph_m = re.search(r'(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}', s)
    mn_m = re.search(r'\$([\d,]+(?:K|M|B)?)', body, re.IGNORECASE)
    dn_m = re.search(r'@([\w-]+)\.', em_m.group(0) if em_m else "")
    pri = "warm"
    if any(w in s for w in ["urgent","asap","deadline","today"]): pri = "hot"
    elif any(w in s for w in ["no rush","whenever","someday"]): pri = "cold"
    ev = None
    if mn_m:
        try:
            v = mn_m.group(1).replace(",","")
            for suf,mul in [("K",1e3),("M",1e6),("B",1e9),("",1)]:
                if v.upper().endswith(suf.upper()): ev = float(re.sub(r'[^\d.]',"",v))*mul; break
        except: pass
    return {
        "title": nm_m.group(1).strip().strip('"') if nm_m else subj[:40],
        "description": body[:500], "priority": pri,
        "contactName": nm_m.group(1).strip().strip('"') if nm_m else "",
        "email": em_m.group(0) if em_m else "",
        "phone": ph_m.group(0) if ph_m else "",
        "businessName": dn_m.group(1).capitalize() if dn_m else "",
        "estimatedValue": str(ev) if ev else "",
        "leadSource": "GMAIL", "intent": body[:200],
        "follow_up_urgency": "medium",
        "original_email": email,
        "draft_reply": "", "draft_reply_status": "pending",
    }

def _fmt_email(email):
    if not email: return {}
    hdrs = {h["name"].lower(): h["value"] for h in email.get("payload",{}).get("headers",[])}
    raw = hdrs.get("from","")
    em_m = re.search(r'<([^>]+)>', raw)
    return {
        "from": re.sub(r"<[^>]+>","",raw).strip() or (em_m.group(1) if em_m else ""),
        "email": em_m.group(1) if em_m else raw,
        "subject": hdrs.get("subject",""), "date": hdrs.get("date",""),
        "body": email.get("body","")[:8000],
        "snippet": email.get("snippet",""),
        "gmail_thread_id": email.get("gmail_thread_id",""),
    }

def _build_label(p):
    return {"hot":{"name":"🔥 Hot","color":"red"},"warm":{"name":"🌡️ Warm","color":"yellow"},"cold":{"name":"❄️ Cold","color":"blue"}}.get(p,{"name":"🌡️ Warm","color":"yellow"})

def _due(urgency):
    days = {"high":1,"medium":3,"low":7}.get(urgency,3)
    return (datetime.utcnow()+timedelta(days=days)).strftime("%Y-%m-%d")

def import_to_kanban(leads):
    if not leads:
        logging.info("No leads to import"); return []
    doc = _fs_get(BOARD_DOC)
    existing_cards = doc["fields"].get("cards",{}).get("mapValue",{}).get("fields",{}) if doc else {}

    # Build set of existing emails for dedup
    existing_emails = set()
    next_id = 1000
    for k in existing_cards:
        card = parse_fv(existing_cards[k])
        ea = card.get("email","").lower()
        if ea: existing_emails.add(ea)
        try:
            nid = int(k)
            if nid >= next_id: next_id = nid + 1
        except (ValueError, TypeError):
            pass

    new_cards = {}
    imported = []
    for lead in leads:
        ea = lead.get("email","").lower()
        if ea and ea in existing_emails: continue
        cid = str(next_id); next_id += 1
        fe = _fmt_email(lead.get("original_email",{}))
        card = {
            "id":{"integerValue":cid},
            "title":{"stringValue":lead.get("title","New Lead")},
            "listId":{"stringValue":"discovery"},
            "labels":{"arrayValue":{"values":[_build_label(lead.get("priority","warm"))]}},
            "description":{"stringValue":lead.get("description","")},
            "checklist":{"arrayValue":{"values":[]}},
            "activity":{"arrayValue":{"values":[{"mapValue":{"fields":{
                "user":{"stringValue":"Pipeline"},"initials":{"stringValue":"LP"},
                "action":{"stringValue":"imported from Gmail"},
                "time":{"stringValue":datetime.utcnow().isoformat()}
            }}}]}},
            "assignee":{"stringValue":""},
            "dueDate":{"stringValue":_due(lead.get("follow_up_urgency","medium"))},
            "createdBy":{"stringValue":"Pipeline"},
            "createdAt":{"stringValue":datetime.utcnow().isoformat()},
            "contactName":{"stringValue":lead.get("contactName","")},
            "email":{"stringValue":lead.get("email","")},
            "phone":{"stringValue":lead.get("phone","")},
            "businessName":{"stringValue":lead.get("businessName","")},
            "leadSource":{"stringValue":lead.get("leadSource","GMAIL")},
            "estimatedValue":{"stringValue":lead.get("estimatedValue","")},
            "priority":{"stringValue":lead.get("priority","warm")},
            "intent":{"stringValue":lead.get("intent","")},
            "originalEmail":{"mapValue":{"fields":{
                k:{"stringValue":str(v)} for k,v in fe.items()
            }}},
            "thread":{"arrayValue":{"values":[]}},
            "draft_reply":{"stringValue":""},
            "draft_reply_status":{"stringValue":"pending"},
        }
        new_cards[cid] = card
        imported.append(lead)
        if ea: existing_emails.add(ea)

    if imported:
        merged = {**existing_cards, **new_cards}
        merged_fv = {"mapValue":{"fields":merged}}
        logging.info(f"Firestore update cards count: {len(merged)}")
        _fs_patch(BOARD_DOC, {"cards": merged_fv})
        logging.info(f"Imported {len(imported)} leads to Kanban")
    return imported

def parse_fv(v):
    if not v: return {}
    t = list(v.keys())[0] if v else None
    if t == "mapValue": return {kk: parse_fv(vv) for kk,vv in v[t].get("fields",{}).items()}
    if t == "arrayValue": return [parse_fv(x) for x in v[t].get("values",[])]
    if t == "stringValue": return v[t]
    if t == "integerValue": return int(v[t])
    if t == "doubleValue": return float(v[t])
    if t == "booleanValue": return v[t]
    if t == "nullValue": return None
    return str(v)

def save_stats(emails_found, emails_scraped, leads_extracted, new_leads, imported):
    run = {
        "timestamp":{"stringValue":datetime.utcnow().isoformat()},
        "emails_found":{"integerValue":emails_found},
        "emails_scraped":{"integerValue":emails_scraped},
        "leads_extracted":{"integerValue":leads_extracted},
        "new_leads":{"integerValue":len(new_leads)},
        "imported":{"integerValue":len(imported)},
        "by_platform":{"mapValue":{"fields":{"GMAIL":{"integerValue":len(imported)}}}},
    }
    try:
        existing = _fs_get(STATS_DOC)
        if existing:
            runs_fv = existing["fields"].get("runs",{}).get("arrayValue",{}).get("values",[])
            runs_fv.append({"mapValue":{"fields":run}})
            runs_fv = runs_fv[-30:]
            _fs_patch(STATS_DOC, {"runs":{"arrayValue":{"values":runs_fv}},"last_run":{"mapValue":{"fields":run}}})
        else:
            _fs_patch(STATS_DOC, {"runs":{"arrayValue":{"values":[{"mapValue":{"fields":run}}]}},"last_run":{"mapValue":{"fields":run}}})
        logging.info("Stats saved")
    except Exception as e:
        logging.error(f"Stats save failed: {e}")

# ─── ENTRY POINT ──────────────────────────────────────────────

def run_pipeline(request):
    logging.info("=== Pipeline run started ===")
    try:
        service = get_gmail_service()
    except Exception as e:
        logging.error(f"Gmail auth failed: {e}"); return f"ERROR: {e}", 500

    emails = scrape_gmail(service)
    if not emails: return "No emails found", 200

    relevant = filter_relevant(emails)
    if not relevant: save_stats(len(emails), len(emails), 0, [], []); return "No relevant leads", 200

    leads = extract_leads(relevant)
    imported = import_to_kanban(leads)
    save_stats(len(emails), len(emails), len(leads), leads, imported)

    msg = f"OK: {len(emails)} emails → {len(relevant)} relevant → {len(leads)} leads → {len(imported)} imported"
    logging.info(f"=== {msg} ===")
    return msg, 200
