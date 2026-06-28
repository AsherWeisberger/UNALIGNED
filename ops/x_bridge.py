#!/usr/bin/env python3
"""
X intake -> Supabase cards bridge.

Reads the X DM scraper's output (x_dm_daily_intake.json) and lands each lead on the
cards board with lead_source='X', so X leads flow through the Deal Desk like Gmail leads.

Contract: this READS x_dm_daily_intake.json and never writes it. The "New Leads X" tab
keeps working untouched. openDm is the dedupe identity key.

Rules (mirrors the importer's single-writer contract):
- New lead (no card with this openDm): INSERT with list_id='new'.
- Existing lead that already progressed: UPDATE only the X context fields
  (description, priority). Never reset list_id or draft_reply on re-import.

Env:
  SUPABASE_URL, SUPABASE_ANON_KEY
  X_INTAKE_JSON  (default: flow-v4/assets/x_dm_daily_intake.json)

Schema prerequisite (run once in the Supabase SQL editor):
  alter table public.cards add column if not exists x_open_dm text;
  create unique index if not exists cards_x_open_dm_uniq
    on public.cards (x_open_dm) where x_open_dm is not null;
"""
import os, sys, json, urllib.request, urllib.parse

URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_ANON_KEY"]
INTAKE = os.environ.get("X_INTAKE_JSON", "flow-v4/assets/x_dm_daily_intake.json")
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Accept": "application/json"}

def _req(method, path, body=None, extra=None):
    headers = dict(H)
    if body is not None:
        headers["Content-Type"] = "application/json"
    if extra:
        headers.update(extra)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{URL}/rest/v1/{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read().decode()
        return r.status, (json.loads(raw) if raw else None)

def priority_of(score):
    try: s = float(score)
    except (TypeError, ValueError): return "cold"
    return "hot" if s >= 80 else "warm" if s >= 50 else "cold"

def intent_of(lt):
    lt = (lt or "").lower()
    for k, v in [("sponsor","sponsorship"),("partner","partnership"),("interview","interview"),
                 ("collab","collaboration"),("intro","intro")]:
        if k in lt: return v
    return "other"

def context_blob(L):
    return json.dumps({"x_summary": L.get("summaryForTeam"), "last_message": L.get("lastLeadMessage"),
                       "best_next_step": L.get("bestNextStep"), "lead_score": L.get("leadScore"),
                       "x_username": L.get("xUsername"), "open_dm": L.get("openDm")})

def main():
    leads = json.load(open(INTAKE))
    inserted = updated = skipped = 0
    for L in leads:
        odm = L.get("openDm")
        if not odm:
            skipped += 1; continue
        q = "cards?select=id,list_id&x_open_dm=eq." + urllib.parse.quote(odm, safe="")
        _, found = _req("GET", q)
        if found:  # already on the board: refresh context only, never reset progress
            patch = {"description": context_blob(L), "priority": priority_of(L.get("leadScore"))}
            _req("PATCH", "cards?x_open_dm=eq." + urllib.parse.quote(odm, safe=""), patch,
                 {"Prefer": "return=minimal"})
            updated += 1
        else:      # new X lead: insert at 'new' so the pipeline picks it up
            card = {"x_open_dm": odm, "lead_source": "X", "list_id": "new",
                    "business_name": L.get("xName") or L.get("xUsername") or "X lead",
                    "contact_name": L.get("xName") or "",
                    "title": ("X DM · " + (L.get("xName") or L.get("xUsername") or "")).strip(),
                    "intent": intent_of(L.get("leadType")), "priority": priority_of(L.get("leadScore")),
                    "email": L.get("contactEmails") or "", "phone": L.get("contactPhones") or "",
                    "description": context_blob(L)}
            _req("POST", "cards", [card], {"Prefer": "return=minimal"})
            inserted += 1
    print(f"X bridge: {inserted} new, {updated} refreshed, {skipped} skipped (no openDm)")

if __name__ == "__main__":
    main()
