#!/usr/bin/env python3
"""
UNALIGNED Deal Brain SYNC — PHASE 1 (LOCAL SHADOW, READ-ONLY).

Runs the deal-brain loop over ACTIVE Supabase cards and writes each read to a
local JSON that deal_brain_server.py serves to the Company OS UI on :8788.

Adds FLOW SIGNALS: structured triggers the dashboard turns into actions
(e.g. brief materials arrived -> "Start Brief Maker" banner).

SAFETY:
  - Reads Supabase cards + live Gmail. WRITES ONLY to
    ~/.config/google-credentials/deal_brain/live/<card_id>.json
  - Never writes Supabase. Never touches stage/draft/money fields. Never sends.

Usage (source ~/.config/google-credentials/unaligned-scraper.env first):
  python3 scripts/active/deal_brain_sync.py [--limit N] [--card CARD_ID]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

ACTIVE_DIR = Path(__file__).resolve().parent
if str(ACTIVE_DIR) not in sys.path:
    sys.path.insert(0, str(ACTIVE_DIR))
from deal_brain import (  # noqa: E402 — shared brain primitives
    STATE_DIR, fetch_thread, harden_draft, llm_json,
)

LIVE_DIR = Path.home() / ".config" / "google-credentials" / "deal_brain" / "live"

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY", "")
ACTIVE_STAGES = ("new", "first-touch", "engaged", "rates-sent", "negotiating", "invoice-sent", "done")

SYSTEM_SYNC = """You are the UNALIGNED Deal Brain. Read the DEAL STATE (ground truth) and the
THREAD for one sponsorship deal, then report. Be strict and literal. Quote real text as
evidence. Never invent facts.

Hard rules:
- This read is for ONE deal only. Never mix in other clients, invoices, or conferences unless
  they appear verbatim in THIS thread (e.g. Robert busy at ACL July 5-7 is a calendar conflict
  for this deal, not the Alibaba/ACL sponsorship deal).
- The agreement/scope_boundary in DEAL STATE is ground truth; classify every ask against it.
- Money before work. Payment problems get flagged immediately.
- Silence is not agreement: re-raise unconfirmed points from open_items.
- Facts only the human knows become questions_for_human, never guesses.
- Confidential items stay internal, never in a draft.
- Prefer the newest thread messages. If scheduling or payment was resolved later in the thread,
  do not keep stale blockers alive.
- Drafts: no hyphens or em dashes, periods and commas instead. Warm but firm. One email
  answers everything open, numbered like the counterparty numbers. Both time zones for times.

FLOW SIGNALS — set these when the thread shows them (empty list if none):
- brief_materials_received: they sent launch/campaign materials (brief, assets, copy, UTM links, source post, talking points, launch date/time)
- launch_live: their post/campaign is live and our action window is open
- payment_receipt_claimed: they say they paid / sent a receipt or screenshot
- payment_problem: a payment failed, stalled, or is overdue
- scheduling_request: they proposed or asked for times/slots
- scope_change_request: they asked for something beyond the agreed scope
- approval_received: they approved our content/outline/draft

Return ONE strict JSON object, no markdown:
{"status_summary":"3-5 plain sentences, newest development first",
 "their_asks":[{"ask":"...","classification":"IN_SCOPE|OUT_OF_SCOPE|NEEDS_HUMAN","why":"one line"}],
 "ignored_points":["..."],"we_owe":["..."],"they_owe":["..."],
 "deadline_alerts":["due within ~72h"],
 "flow_signals":[{"signal":"one of the ids above","why":"one line with the evidence"}],
 "draft_needed":true|false,
 "draft":{"to":"...","cc":"...","subject":"...","body":"..."},
 "questions_for_human":["..."],
 "confidence":"high|medium|low"}"""


def _need_env() -> None:
    if not SUPABASE_URL or not SUPABASE_KEY:
        sys.exit("Missing SUPABASE env — source ~/.config/google-credentials/unaligned-scraper.env first.")


def get_active_cards(limit: int, card_id: str | None) -> list[dict]:
    h = {"apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY}
    params: dict[str, str] = {"limit": str(limit), "order": "moved_at.desc.nullslast"}
    if card_id:
        params["id"] = f"eq.{card_id}"
    else:
        params["list_id"] = f"in.({','.join(ACTIVE_STAGES)})"
    r = requests.get(f"{SUPABASE_URL}/rest/v1/cards", headers=h, params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def durable_state_for(card: dict) -> dict | None:
    """A hand-verified deal_state file wins over card-derived state. Match on
    gmail_thread_id membership."""
    tid = str(card.get("gmail_thread_id") or "").strip()
    if not tid:
        return None
    for f in STATE_DIR.glob("*.json"):
        try:
            st = json.loads(f.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        if tid in (st.get("gmail_thread_ids") or []):
            return st
    return None


def ephemeral_state_for(card: dict) -> dict:
    """No durable file: derive a working state from what the board already knows
    (deal_tracker shadow fields, stage, value). Enough for the universal rules."""
    stage = str(card.get("list_id") or "new")
    agreement_txt = str(card.get("agreement") or card.get("deal_state") or "").strip()
    signed = stage in ("invoice-sent", "done", "paid-out") or bool(card.get("ready_to_invoice"))
    boundary = (agreement_txt if agreement_txt else
                "Nothing agreed yet. Quote from standard tiers, no discounts, payment upfront "
                "before anything goes live, no Robert dates confirmed without human approval.")
    return {
        "deal_id": f"card-{card.get('id')}",
        "title": card.get("brand") or card.get("company") or card.get("contact_name") or "Untitled lead",
        "counterparty": {"contacts": [c for c in [card.get("email")] if c]},
        "agreement": {"signed": signed, "scope": agreement_txt or "Nothing agreed yet",
                      "total_usd": card.get("value") or None, "payments": []},
        "scope_boundary": boundary,
        "deliverables": [], "open_items": [], "confidential": [],
        "stage": stage,
    }


def compact(state: dict) -> dict:
    keep = ("deal_id", "title", "counterparty", "agreement", "scope_boundary",
            "deliverables", "schedule", "open_items", "confidential", "stage")
    out = {k: state.get(k) for k in keep if state.get(k)}
    out["recent_log"] = (state.get("log") or [])[-5:]
    return out


def run_card(card: dict) -> bool:
    cid = card.get("id")
    tid = str(card.get("gmail_thread_id") or "").strip()
    state = durable_state_for(card) or ephemeral_state_for(card)
    verified = bool(state.get("verified", False)) or "gmail_thread_ids" in state

    msgs = fetch_thread(tid) if tid else []
    if not msgs:
        # fall back to the cached board thread
        raw = card.get("email_thread")
        if isinstance(raw, list):
            msgs = [{"ts_ms": 0, "date": str(m.get("date") or ""), "sender": str(m.get("from") or "?"),
                     "body": str(m.get("body") or m.get("text") or "")[:1500]} for m in raw if m]
    if not msgs:
        print(f"  card {cid}: no thread, skipped")
        return False
    msgs = msgs[-16:]

    rendered = "\n\n".join(f"[{m['date']}] {m['sender']}:\n{m['body'][:1400]}" for m in msgs)
    user = ("DEAL STATE (ground truth):\n" + json.dumps(compact(state), indent=1) +
            "\n\nTHREAD (oldest first):\n" + rendered)
    result = llm_json(user, system=SYSTEM_SYNC)
    if not result:
        print(f"  card {cid}: llm failed")
        return False
    harden_draft(result)

    LIVE_DIR.mkdir(parents=True, exist_ok=True)
    (LIVE_DIR / f"{cid}.json").write_text(json.dumps({
        "card_id": cid,
        "deal_id": state.get("deal_id"),
        "durable_state": verified,
        "generated": datetime.now(timezone.utc).isoformat(),
        "read": result,
    }, indent=2))
    sigs = ",".join(s.get("signal", "") for s in result.get("flow_signals", [])) or "none"
    print(f"  card {cid}: ok (signals: {sigs})")
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=25)
    ap.add_argument("--card", help="run one card id")
    args = ap.parse_args()
    _need_env()
    cards = get_active_cards(args.limit, args.card)
    print(f"deal_brain_sync: {len(cards)} card(s)")
    ok = 0
    for c in cards:
        try:
            ok += 1 if run_card(c) else 0
        except Exception as e:  # noqa: BLE001 — one bad card never kills the sweep
            print(f"  card {c.get('id')}: error {e}")
    print(f"done: {ok}/{len(cards)} reads written to {LIVE_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
