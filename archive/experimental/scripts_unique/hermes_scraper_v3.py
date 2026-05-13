"""
hermes_scraper_v3.py
─────────────────────────────────────────────────────────────
Hermes  Gmail → Claude AI Extraction → Firestore → FLOW Kanban
─────────────────────────────────────────────────────────────
Changes from v2:
  • Switched from OpenAI → Anthropic Claude (claude-haiku-4-5-20251001)
  • Full email thread conversation extracted and stored for Kanban card
  • Field names mapped EXACTLY to FLOW Kanban board schema
  • date_received properly parsed from Gmail Date header
  • email_conversation stored as structured list for Kanban renderer
  • Clean display values — no nulls / "None" strings on cards
"""

import asyncio
import base64
import json
import logging
import re
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

import anthropic
from google.cloud import firestore
from googleapiclient.errors import HttpError

# ─────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────

CONCURRENCY       = 20          # parallel Gmail metadata fetches
THREAD_CONCURRENCY = 10         # parallel full thread fetches
CHUNK_SIZE        = 45          # emails per AI extraction batch
BACKUP_INTERVAL   = 100         # checkpoint save interval
BACKUP_FILE       = Path("scraped_emails_backup.json")
LOG_FILE          = Path.home() / ".config/google-credentials/pipeline_live.log"

# Gmail search query — cast a wide net for Unaligned/Scoble opportunities
GMAIL_QUERY = (
    "("
    "from:scoble OR subject:unaligned OR subject:scobelizer OR subject:aligned "
    'OR subject:partnership OR subject:collaboration OR subject:"interview request" '
    'OR subject:"tech discussion" OR subject:AI OR subject:"sponsored interview" '
    "OR subject:startup OR subject:sponsorship OR subject:marketing "
    'OR subject:"paid opportunity" OR subject:affiliate OR subject:feature '
    "OR subject:funding OR subject:growth OR subject:podcast OR subject:opportunity"
    ")"
)

# Keyword pre-filter (fast, in-process — runs before any AI call)
KEYWORDS = [
    "scoble", "scobelizer", "unaligned", "aligned",
    "partnership", "collaboration", "interview", "sponsor",
    "tweet", "retweet", "discussion", "ai", "tech", "podcast",
    "demo", "invest", "deal", "opportunity", "introduce",
    "startup", "marketing", "affiliate", "feature", "funding",
    "growth", "launch", "promotion", "exposure", "paid",
]

# FLOW Kanban column mapping (matches board stage labels exactly)
COLUMN_MAP = {
    "partnership":   "Lead In",
    "sponsorship":   "Lead In",
    "interview":     "Lead In",
    "collaboration": "Lead In",
    "intro":         "Lead In",
    "other":         "Lead In",
}

# Priority → urgency label (matches FLOW board filter values)
URGENCY_MAP = {
    "HOT":  "high",
    "WARM": "medium",
    "COLD": "low",
}

# ─────────────────────────────────────────────────────────────
# LOGGING
# ─────────────────────────────────────────────────────────────

LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger("hermes")


# ─────────────────────────────────────────────────────────────
# DATE PARSING UTILITY
# ─────────────────────────────────────────────────────────────

def _parse_date_display(raw_date: str) -> str:
    """
    RFC 2822 email Date header → clean human-readable string.
    e.g. "Mon, 10 Jun 2025 14:32:00 -0400" → "Jun 10, 2025"
    Falls back gracefully on malformed headers.
    """
    if not raw_date:
        return ""
    try:
        dt = parsedate_to_datetime(raw_date)
        return dt.astimezone(timezone.utc).strftime("%b %d, %Y")
    except Exception:
        match = re.search(r"\d{1,2}\s+\w+\s+\d{4}", raw_date)
        if match:
            try:
                return datetime.strptime(match.group(), "%d %b %Y").strftime("%b %d, %Y")
            except Exception:
                pass
        return raw_date[:30].strip()


def _parse_date_iso(raw_date: str) -> str:
    """Same but returns ISO YYYY-MM-DD for Firestore sorting."""
    if not raw_date:
        return ""
    try:
        dt = parsedate_to_datetime(raw_date)
        return dt.astimezone(timezone.utc).strftime("%Y-%m-%d")
    except Exception:
        return ""


# ─────────────────────────────────────────────────────────────
# STEP 1 — PARALLEL GMAIL METADATA SCRAPE
# ─────────────────────────────────────────────────────────────

METADATA_HEADERS = ["From", "Subject", "Date"]


async def fetch_all_metadata(service, query: str) -> list[dict]:
    """
    Page through Gmail IDs, then fetch metadata for each in parallel.
    Returns list of dicts: {id, subject, from, date, date_iso, snippet, gmail_thread_id}
    """
    ids = []
    page_token = None

    log.info("Paging Gmail IDs …")
    while True:
        resp = service.users().messages().list(
            userId="me", q=query, maxResults=500, pageToken=page_token
        ).execute()
        ids.extend([m["id"] for m in resp.get("messages", [])])
        page_token = resp.get("nextPageToken")
        if not page_token:
            break

    log.info(f"Found {len(ids)} message IDs — fetching metadata …")

    sem  = asyncio.Semaphore(CONCURRENCY)
    loop = asyncio.get_event_loop()
    results: list[dict] = []

    async def fetch_one(msg_id: str, attempt: int = 0) -> dict:
        async with sem:
            try:
                raw = await loop.run_in_executor(
                    None,
                    lambda: service.users().messages().get(
                        userId="me",
                        id=msg_id,
                        format="metadata",
                        metadataHeaders=METADATA_HEADERS,
                    ).execute(),
                )
                hdrs = {h["name"]: h["value"] for h in raw.get("payload", {}).get("headers", [])}
                raw_date = hdrs.get("Date", "").strip()
                return {
                    "id":              msg_id,
                    "subject":         hdrs.get("Subject", "").strip(),
                    "from":            hdrs.get("From", "").strip(),
                    "date_raw":        raw_date,
                    "date":            _parse_date_display(raw_date),
                    "date_iso":        _parse_date_iso(raw_date),
                    "snippet":         raw.get("snippet", "").strip(),
                    "gmail_thread_id": raw.get("threadId", ""),
                }
            except HttpError as e:
                if e.resp.status == 429 and attempt < 3:
                    wait = 2 ** attempt
                    log.warning(f"Rate-limited on {msg_id} — retrying in {wait}s …")
                    await asyncio.sleep(wait)
                    return await fetch_one(msg_id, attempt + 1)
                log.error(f"Failed to fetch metadata for {msg_id}: {e}")
                return {}

    tasks = [fetch_one(i) for i in ids]
    for i, coro in enumerate(asyncio.as_completed(tasks)):
        result = await coro
        if result:
            results.append(result)
        if len(results) % BACKUP_INTERVAL == 0 and results:
            BACKUP_FILE.write_text(json.dumps(results, indent=2))
            log.info(f"  Checkpoint: {len(results)} emails saved.")

    log.info(f"Metadata fetch complete: {len(results)} emails.")
    return results


# ─────────────────────────────────────────────────────────────
# STEP 2 — KEYWORD FILTER
# ─────────────────────────────────────────────────────────────

def keyword_filter(emails: list[dict]) -> list[dict]:
    relevant = []
    for e in emails:
        blob = f"{e['subject']} {e['from']} {e['snippet']}".lower()
        if any(kw in blob for kw in KEYWORDS):
            relevant.append(e)
    log.info(f"Keyword filter: {len(relevant)}/{len(emails)} passed.")
    return relevant


# ─────────────────────────────────────────────────────────────
# STEP 3 — FULL THREAD FETCH (for email_conversation field)
# ─────────────────────────────────────────────────────────────

def _decode_body(payload: dict) -> str:
    """Recursively extract plain-text body from a Gmail message payload."""
    mime = payload.get("mimeType", "")
    if mime == "text/plain":
        data = payload.get("body", {}).get("data", "")
        if data:
            return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")
    elif mime.startswith("multipart/"):
        for part in payload.get("parts", []):
            text = _decode_body(part)
            if text:
                return text
    return ""


def _clean_body(text: str) -> str:
    """Strip quoted reply blocks and excessive whitespace from email body."""
    lines = text.splitlines()
    cleaned = []
    for line in lines:
        # Stop at common reply-quote markers
        if re.match(r"^(On .+ wrote:|>|_{5,}|From:\s)", line.strip()):
            break
        cleaned.append(line)
    result = "\n".join(cleaned).strip()
    # Collapse 3+ blank lines to 2
    result = re.sub(r"\n{3,}", "\n\n", result)
    return result[:2000]  # cap at 2000 chars per message


async def fetch_thread_conversation(
    email: dict, service, sem: asyncio.Semaphore, loop
) -> list[dict]:
    """
    Fetch every message in a Gmail thread and return a structured conversation list.
    Each item: {from, date, body}
    Ordered oldest → newest.
    """
    thread_id = email.get("gmail_thread_id")
    if not thread_id:
        return []

    async with sem:
        try:
            thread = await loop.run_in_executor(
                None,
                lambda: service.users().threads().get(
                    userId="me", id=thread_id, format="full"
                ).execute(),
            )
        except HttpError as e:
            log.warning(f"Thread fetch failed for {thread_id}: {e}")
            return []

    messages = thread.get("messages", [])
    conversation = []

    for msg in messages:
        hdrs = {h["name"]: h["value"] for h in msg.get("payload", {}).get("headers", [])}
        sender   = hdrs.get("From", "Unknown").strip()
        raw_date = hdrs.get("Date", "").strip()
        body     = _clean_body(_decode_body(msg.get("payload", {})))

        conversation.append({
            "from":      sender,
            "date":      _parse_date_display(raw_date),
            "date_iso":  _parse_date_iso(raw_date),
            "body":      body or "[No body text]",
        })

    return conversation  # oldest first (Gmail default order)


async def fetch_all_conversations(emails: list[dict], service) -> dict[str, list[dict]]:
    """
    Fetch full thread conversations for all emails concurrently.
    Returns dict: { email_id → conversation_list }
    """
    sem  = asyncio.Semaphore(THREAD_CONCURRENCY)
    loop = asyncio.get_event_loop()

    log.info(f"Fetching full thread conversations for {len(emails)} emails …")

    async def fetch_one(email: dict) -> tuple[str, list[dict]]:
        convo = await fetch_thread_conversation(email, service, sem, loop)
        return email["id"], convo

    pairs = await asyncio.gather(*[fetch_one(e) for e in emails])
    result = {email_id: convo for email_id, convo in pairs}
    log.info("Thread conversations fetched.")
    return result


# ─────────────────────────────────────────────────────────────
# STEP 4 — CLAUDE AI EXTRACTION
# ─────────────────────────────────────────────────────────────

EXTRACT_SYSTEM = """\
You are an elite business development AI agent for Unaligned.
Scan incoming email metadata and identify HIGH-VALUE BUSINESS OPPORTUNITIES. Ignore spam.

━━━ PRIMARY OBJECTIVE ━━━
Detect emails related to:
  • Collaborations, partnerships, sponsorships, marketing deals
  • AI startups, tech startups
  • Media, interviews, or exposure opportunities
  • Mentions of "Unaligned" or "Robert Scoble"
  • Any business opportunity involving growth, promotion, or distribution

━━━ IGNORE / FILTER OUT ━━━
  • Newsletters, promotions, discounts
  • Cold spam (SEO, backlinks, crypto, gambling)
  • Generic outreach with no personalization
  • Job applications, verification emails
  • Receipts or invoices (unless tied to a deal conversation)
  If unsure, prioritize emails showing INTENT to collaborate or do business.

━━━ INTENT SIGNALS ━━━
High-value phrases: "let's collaborate", "partnership opportunity",
"we'd love to work with you", "sponsorship", "paid opportunity",
"affiliate deal", "feature you", "interview", "promotion", "exposure",
"AI startup", "raising funding", "marketing help", "growth", "launching"

━━━ PRIORITY SCORING ━━━
  HOT  — clear collaboration or money involved
  WARM — relevant startup or partnership potential
  COLD — weak signal but worth logging

━━━ OUTPUT FORMAT ━━━
Return ONLY a valid JSON array. No markdown fences, no preamble, no commentary.
Each object must have EXACTLY these fields (use null for missing data — NEVER hallucinate):

[
  {
    "email_id":   "<Gmail message ID exactly as given>",
    "name":       "<sender full name or best guess from email address>",
    "business":   "<company or project name, or domain if no company found>",
    "email_addr": "<sender email address>",
    "phone":      "<phone number if present in snippet, else null>",
    "deal_value": "<any mentioned budget or monetary value, else null>",
    "source":     "email",
    "title":      "<email subject line verbatim>",
    "notes":      "<1-2 sentence professional summary of the opportunity>",
    "date":       "<date string as provided — pass through verbatim>",
    "intent":     "<one of: partnership | sponsorship | interview | collaboration | intro | other>",
    "priority":   "<HOT | WARM | COLD>",
    "reply_hook": "<1 punchy sentence opening for a reply — specific to this sender>"
  }
]

RULES:
  • If multiple leads in one email, extract all as separate objects
  • If data is missing, set to null — never guess
  • intent must be lowercase exactly as listed above
  • priority must be uppercase exactly as listed above
  • notes must be professional — no slang, no "omg", no filler
  • Be aggressive capturing real opportunities; be strict filtering spam
"""


def _build_extract_prompt(emails: list[dict]) -> str:
    lines = []
    for i, e in enumerate(emails):
        lines.append(
            f"EMAIL {i+1} | id:{e['id']} | from:{e['from']} | "
            f"date:{e['date']} | subject:{e['subject']} | snippet:{e['snippet']}"
        )
    return "\n".join(lines)


async def extract_all(emails: list[dict], client: anthropic.Anthropic) -> list[dict]:
    """Send keyword-filtered emails to Claude in parallel chunks. Returns extracted leads."""
    chunks = [emails[i:i + CHUNK_SIZE] for i in range(0, len(emails), CHUNK_SIZE)]
    log.info(f"AI extraction: {len(chunks)} chunks via Claude …")

    async def extract_chunk(chunk: list[dict], attempt: int = 0) -> list[dict]:
        try:
            loop = asyncio.get_event_loop()
            resp = await loop.run_in_executor(
                None,
                lambda: client.messages.create(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=4000,
                    system=EXTRACT_SYSTEM,
                    messages=[
                        {"role": "user", "content": _build_extract_prompt(chunk)}
                    ],
                ),
            )
            text = resp.content[0].text.strip()
            # Strip any accidental markdown fences
            text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.MULTILINE).strip()
            parsed = json.loads(text)
            # Handle both bare list and {"leads": [...]} wrapping
            if isinstance(parsed, dict) and "leads" in parsed:
                parsed = parsed["leads"]
            return parsed if isinstance(parsed, list) else []
        except json.JSONDecodeError as e:
            log.warning(f"JSON parse failed (attempt {attempt}): {e}")
            if attempt < 2 and len(chunk) > 10:
                mid = len(chunk) // 2
                a = await extract_chunk(chunk[:mid], attempt + 1)
                b = await extract_chunk(chunk[mid:], attempt + 1)
                return a + b
            return []
        except Exception as e:
            log.error(f"Claude extraction error: {e}")
            return []

    all_results = await asyncio.gather(*[extract_chunk(c) for c in chunks])
    leads = [lead for batch in all_results for lead in batch]
    log.info(f"Extraction complete: {len(leads)} leads identified.")
    return leads


# ─────────────────────────────────────────────────────────────
# STEP 5 — BUILD KANBAN CARD (exact FLOW board schema)
# ─────────────────────────────────────────────────────────────
#
# FLOW board field mapping (from rendered HTML analysis):
#
#   Card header:     name  (WHO section)
#   Subtitle:        business  (WHAT section)
#   Contact block:   email_addr, phone, linkedin, website, location
#   Notes/summary:   notes  (WHY section)
#   Deal value:      deal_value  (VALUE section)
#   First contact:   date_received  (shown in list header)
#   Column:          stage  (Lead In → In Progress → Review → Done → Paid Out)
#   Priority badge:  priority / urgency  (Hot/Warm/Cold filter)
#   Source tag:      source  (All Sources filter)
#   Email thread:    email_conversation  (💬 Email Conversation section)
#   Reply draft:     reply_draft  (✉️ ROBERT SCOBLE EMAIL REPLY section)
#   Subject:         title  (shown in reply draft header)
# ─────────────────────────────────────────────────────────────

def _clean(val, fallback: str = "—") -> str:
    """Sanitize a value to a clean display string. Never returns None/null/empty."""
    if val is None:
        return fallback
    s = str(val).strip()
    if s.lower() in ("null", "none", "n/a", ""):
        return fallback
    return s


def build_kanban_card(
    lead: dict,
    original_email: dict,
    conversation: list[dict],
) -> dict:
    """
    Assemble a complete Firestore document that maps 1:1 to a FLOW Kanban card.
    All fields are sanitised. No nulls leak to the display layer.
    """
    priority = _clean(lead.get("priority"), "COLD").upper()
    intent   = _clean(lead.get("intent"),   "other").lower()

    # Validate enums
    if priority not in ("HOT", "WARM", "COLD"):
        priority = "COLD"
    if intent not in ("partnership", "sponsorship", "interview", "collaboration", "intro", "other"):
        intent = "other"

    urgency = URGENCY_MAP.get(priority, "low")
    stage   = COLUMN_MAP.get(intent, "Lead In")

    # Date from Gmail metadata (fallback to AI-extracted date)
    date_received_display = original_email.get("date") or _clean(lead.get("date"), "")
    date_received_iso     = original_email.get("date_iso") or ""

    return {
        # ── Dedup key ─────────────────────────────────────────────
        "email_id":         lead.get("email_id", original_email.get("id", "")),

        # ── WHO — Contact information ──────────────────────────────
        "name":             _clean(lead.get("name"),       "Unknown Sender"),
        "business":         _clean(lead.get("business"),   "Unknown Company"),
        "email_addr":       _clean(lead.get("email_addr"), ""),
        "phone":            _clean(lead.get("phone"),      ""),
        "linkedin":         "",    # not extractable from email; left blank for manual entry
        "website":          "",    # same
        "location":         "",    # same

        # ── WHAT — Opportunity details ─────────────────────────────
        "title":            _clean(lead.get("title"),      "No Subject"),
        "source":           "email",
        "intent":           intent,

        # ── WHY — Summary ─────────────────────────────────────────
        "notes":            _clean(lead.get("notes"),      "No summary available."),

        # ── VALUE ─────────────────────────────────────────────────
        "deal_value":       _clean(lead.get("deal_value"), ""),

        # ── Pipeline stage & priority ──────────────────────────────
        "stage":            stage,          # FLOW column name
        "priority":         priority,       # HOT | WARM | COLD
        "urgency":          urgency,        # high | medium | low (filter label)

        # ── Dates ─────────────────────────────────────────────────
        "date_received":    date_received_display,   # "Jun 10, 2025" — shown on card
        "date_received_iso": date_received_iso,      # "2025-06-10" — for sorting
        "created_at":       firestore.SERVER_TIMESTAMP,

        # ── 💬 Email Conversation ──────────────────────────────────
        # Stored as a list of {from, date, body} objects, oldest first.
        # The FLOW board renders this in the Email Conversation section.
        "email_conversation": conversation,

        # ── ✉️ Reply draft (populated in Step 6) ─────────────────
        "reply_draft":      "",
        "reply_status":     "Pending",      # Pending | Drafted | Approved | Sent

        # ── Thread enrichment ─────────────────────────────────────
        "thread_length":    len(conversation),
        "gmail_thread_id":  original_email.get("gmail_thread_id", ""),
        "enriched_at":      firestore.SERVER_TIMESTAMP,

        # ── AI metadata ───────────────────────────────────────────
        "reply_hook":       _clean(lead.get("reply_hook"), ""),
    }


# ─────────────────────────────────────────────────────────────
# STEP 6 — FIRESTORE UPSERT WITH DEDUP
# ─────────────────────────────────────────────────────────────

async def batch_upsert_leads(cards: list[dict], db: firestore.Client) -> int:
    all_ids = [c["email_id"] for c in cards if c.get("email_id")]

    # Load existing IDs to skip duplicates
    existing_ids: set[str] = set()
    for i in range(0, len(all_ids), 30):   # Firestore __in max = 30
        chunk = all_ids[i:i + 30]
        docs = db.collection("leads").where("email_id", "in", chunk).stream()
        existing_ids.update(d.id for d in docs)

    new_cards = [c for c in cards if c.get("email_id") not in existing_ids]
    if not new_cards:
        log.info("No new leads to write (all already in Firestore).")
        return 0

    batch   = db.batch()
    written = 0
    for i, card in enumerate(new_cards):
        ref = db.collection("leads").document(card["email_id"])
        batch.set(ref, card, merge=True)
        if (i + 1) % 500 == 0:
            batch.commit()
            batch    = db.batch()
            written += 500
            log.info(f"  Committed {written} leads …")

    batch.commit()
    written += len(new_cards) % 500
    log.info(f"Firestore write complete: {written} new leads stored.")
    return written


# ─────────────────────────────────────────────────────────────
# STEP 7 — REPLY DRAFTING VIA CLAUDE
# ─────────────────────────────────────────────────────────────

REPLY_SYSTEM = """\
You write concise, personalized reply drafts on behalf of Robert Scoble / Unaligned.
Return ONLY a JSON array. No markdown, no preamble.
Each object: {"email_id": "<id>", "draft": "<reply text>"}

Draft requirements:
  • Under 90 words
  • Reference the sender's specific company or opportunity — be concrete
  • Mention Robert Scoble's interview or discussion format naturally
  • End with a clear call-to-action (suggest a quick call or next step)
  • Tone: warm, direct, tech-savvy — never generic or corporate-sounding
  • Sign off as: Robert Scoble / Unaligned
"""


async def draft_replies(leads: list[dict], client: anthropic.Anthropic) -> list[dict]:
    if not leads:
        return []

    prompt = "\n".join(
        f"LEAD {i+1} | id:{l['email_id']} | name:{l.get('name','')} | "
        f"company:{l.get('business','')} | intent:{l.get('intent','')} | "
        f"hook:{l.get('reply_hook','')}"
        for i, l in enumerate(leads)
    )

    try:
        loop = asyncio.get_event_loop()
        resp = await loop.run_in_executor(
            None,
            lambda: client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=2000,
                system=REPLY_SYSTEM,
                messages=[{"role": "user", "content": prompt}],
            ),
        )
        text = resp.content[0].text.strip()
        text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.MULTILINE).strip()
        return json.loads(text)
    except Exception as e:
        log.error(f"Reply drafting failed: {e}")
        return []


async def apply_reply_drafts(drafts: list[dict], db: firestore.Client):
    batch = db.batch()
    for i, d in enumerate(drafts):
        if d.get("email_id") and d.get("draft"):
            ref = db.collection("leads").document(d["email_id"])
            batch.set(ref, {
                "reply_draft":  d["draft"],
                "reply_status": "Drafted",
            }, merge=True)
        if (i + 1) % 500 == 0:
            batch.commit()
            batch = db.batch()
    batch.commit()
    log.info(f"Reply drafts applied: {len(drafts)} leads updated.")


# ─────────────────────────────────────────────────────────────
# WATERMARK HELPERS (incremental / daily mode)
# ─────────────────────────────────────────────────────────────

async def get_last_run_date(db: firestore.Client) -> str:
    doc = db.collection("_meta").document("pipeline").get()
    return doc.to_dict().get("last_run", "2025/01/01") if doc.exists else "2025/01/01"


async def set_last_run_date(db: firestore.Client):
    db.collection("_meta").document("pipeline").set(
        {"last_run": datetime.utcnow().strftime("%Y/%m/%d")}, merge=True
    )


# ─────────────────────────────────────────────────────────────
# MAIN PIPELINE
# ─────────────────────────────────────────────────────────────

async def run_pipeline(
    service,
    client: anthropic.Anthropic,
    db: firestore.Client,
    incremental: bool = True,
):
    start = datetime.utcnow()
    log.info("═" * 64)
    log.info(f"Hermes v3 pipeline started — {start.strftime('%Y-%m-%d %H:%M UTC')}")
    log.info("═" * 64)

    # Build Gmail query
    if incremental:
        last_run = await get_last_run_date(db)
        query = f"after:{last_run} {GMAIL_QUERY}"
        log.info(f"Incremental mode: emails after {last_run}")
    else:
        query = f"after:2025/01/01 {GMAIL_QUERY}"
        log.info("Full backfill mode")

    # ── Step 1: Scrape metadata ─────────────────────────────
    emails = await fetch_all_metadata(service, query)
    if not emails:
        log.info("No emails found. Pipeline complete.")
        return

    # ── Step 2: Keyword filter ──────────────────────────────
    filtered = keyword_filter(emails)
    if not filtered:
        log.info("No emails passed keyword filter. Pipeline complete.")
        return

    # ── Step 3: Fetch full thread conversations ─────────────
    conversations = await fetch_all_conversations(filtered, service)

    # ── Step 4: Claude AI extraction ───────────────────────
    leads = await extract_all(filtered, client)
    if not leads:
        log.info("Claude extraction returned no leads.")
        return

    # ── Step 5: Build clean Kanban cards ───────────────────
    id_map = {e["id"]: e for e in filtered}
    cards  = []

    for lead in leads:
        email_id    = lead.get("email_id", "")
        original    = id_map.get(email_id, {})
        conversation = conversations.get(email_id, [])

        # Ensure date passes through from Gmail if AI missed it
        if not lead.get("date") and original.get("date"):
            lead["date"] = original["date"]

        card = build_kanban_card(lead, original, conversation)
        cards.append(card)

    # ── Step 6: Upsert to Firestore ─────────────────────────
    written = await batch_upsert_leads(cards, db)

    # ── Step 7: Reply drafts for HOT + WARM leads ───────────
    hot_warm = [c for c in cards if c.get("priority") in ("HOT", "WARM")]
    if hot_warm:
        log.info(f"Drafting replies for {len(hot_warm)} HOT/WARM leads …")
        drafts = await draft_replies(hot_warm, client)
        await apply_reply_drafts(drafts, db)

    # ── Save watermark ──────────────────────────────────────
    await set_last_run_date(db)

    elapsed = (datetime.utcnow() - start).total_seconds()
    log.info("═" * 64)
    log.info(f"Pipeline complete in {elapsed:.1f}s — {written} new leads written.")
    log.info("═" * 64)


# ─────────────────────────────────────────────────────────────
# ENTRYPOINT
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import os
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    CREDS_PATH = Path.home() / ".config/google-credentials/token.json"

    creds   = Credentials.from_authorized_user_file(str(CREDS_PATH))
    service = build("gmail", "v1", credentials=creds)
    db      = firestore.Client()

    # Claude client — reads ANTHROPIC_API_KEY from environment
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    # Set incremental=False for a full historical backfill
    asyncio.run(run_pipeline(service, client, db, incremental=True))
