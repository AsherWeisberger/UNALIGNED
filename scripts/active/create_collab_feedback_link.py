#!/usr/bin/env python3
"""Create a one-time collaborator feedback link for a finished partnership."""

from __future__ import annotations

import argparse
import os
import re
import secrets
import sys
from datetime import datetime, timedelta, timezone

import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://hbnpwphxjurvtydezwgh.supabase.co").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
FEEDBACK_BASE = os.environ.get(
    "COLLAB_FEEDBACK_BASE",
    "https://asherweisberger.github.io/UNALIGNED/feedback.html",
)
CREATE_API = os.environ.get(
    "CREATE_COLLAB_FEEDBACK_API",
    "https://us-central1-unaligned-fc556.cloudfunctions.net/createCollabFeedbackLink",
)

HEADERS = lambda: {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}


def _tier_from_intent(intent: str) -> str:
    match = re.search(r"tier\s*(\d+)", intent or "", re.I)
    return f"Tier {match.group(1)}" if match else ""


def _source_channel(card: dict) -> str:
    source = str(card.get("lead_source") or "").lower()
    if "twitter" in source or source.startswith("x") or "x_dm" in source:
        return "x"
    if card.get("gmail_thread_id"):
        return "gmail"
    return "other"


def _contact_handle(card: dict) -> str:
    email_id = str(card.get("email_id") or "")
    if ":" in email_id:
        handle = email_id.split(":", 1)[1].strip()
        if handle and not handle.startswith("thread:"):
            return handle if handle.startswith("@") else f"@{handle}"
    title = str(card.get("title") or "")
    if title.startswith("@"):
        return title.split()[0]
    return ""


def _thread_key(card: dict) -> str:
    if card.get("gmail_thread_id"):
        return str(card["gmail_thread_id"])
    email_id = str(card.get("email_id") or "").strip()
    return email_id


def fetch_card(card_id: int) -> dict | None:
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/cards?id=eq.{card_id}&select=*&limit=1",
        headers=HEADERS(),
        timeout=30,
    )
    if not resp.ok:
        return None
    rows = resp.json()
    return rows[0] if isinstance(rows, list) and rows else None


def find_pending_invite(card_id: int) -> dict | None:
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/collab_feedback"
        f"?card_id=eq.{card_id}&status=eq.pending&select=id,token,expires_at&order=created_at.desc&limit=1",
        headers=HEADERS(),
        timeout=30,
    )
    if not resp.ok:
        return None
    rows = resp.json()
    return rows[0] if isinstance(rows, list) and rows else None


def invite_from_card(card: dict) -> dict:
    return {
        "brand": str(card.get("business_name") or card.get("title") or "").strip(),
        "contact_name": str(card.get("contact_name") or "").strip(),
        "contact_email": str(card.get("email") or "").strip() or None,
        "contact_handle": _contact_handle(card),
        "thread_key": _thread_key(card),
        "source_channel": _source_channel(card),
        "deliverable": str(card.get("intent") or "").strip(),
        "tier": _tier_from_intent(str(card.get("intent") or "")),
        "card_id": int(card["id"]),
    }


def create_invite_row(fields: dict, days: int) -> tuple[str, int]:
    token = secrets.token_urlsafe(18)
    expires = (datetime.now(timezone.utc) + timedelta(days=max(7, days))).isoformat()
    row = {
        "token": token,
        "brand": fields.get("brand", "").strip(),
        "contact_name": fields.get("contact_name", "").strip(),
        "contact_email": fields.get("contact_email") or None,
        "contact_handle": fields.get("contact_handle", "").strip(),
        "thread_key": fields.get("thread_key", "").strip(),
        "source_channel": fields.get("source_channel", "").strip(),
        "deliverable": fields.get("deliverable", "").strip(),
        "tier": fields.get("tier", "").strip(),
        "status": "pending",
        "expires_at": expires,
    }
    if fields.get("card_id"):
        row["card_id"] = int(fields["card_id"])

    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/collab_feedback",
        headers={**HEADERS(), "Prefer": "return=representation"},
        json=row,
        timeout=30,
    )
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Supabase insert failed ({resp.status_code}): {resp.text[:400]}")

    created = resp.json()
    row_id = created[0]["id"] if isinstance(created, list) and created else 0
    return token, row_id


def print_invite(link: str, row_id: int | str, fields: dict, expires_hint: str = "", existing: bool = False) -> None:
    name = fields.get("contact_name") or "partner"
    brand = fields.get("brand") or "the collaboration"
    print(link)
    print()
    verb = "Existing link" if existing else "New link"
    print(f"{verb} for {name} @ {brand}")
    if fields.get("contact_email"):
        print(f"  email: {fields['contact_email']}")
    if fields.get("contact_handle"):
        print(f"  handle: {fields['contact_handle']}")
    if fields.get("card_id"):
        print(f"  card_id: {fields['card_id']}")
    print()
    print("Paste at end of wrap-up email:")
    print(f"  We'd love 2 minutes of feedback on the collaboration: {link}")
    print()
    if expires_hint:
        print(f"Stored as collab_feedback id={row_id} · expires {expires_hint[:10]}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a collaborator feedback invite link")
    parser.add_argument("--brand", help="Company / campaign name")
    parser.add_argument("--contact", default="", help="Contact first name or full name")
    parser.add_argument("--email", default="", help="Contact email (stored only, not shown on form)")
    parser.add_argument("--card-id", "--from-card", dest="card_id", default="", help="Kanban card id — auto-fills partner identity")
    parser.add_argument("--deliverable", default="", help="e.g. Custom X Post")
    parser.add_argument("--tier", default="", help="e.g. Tier 3")
    parser.add_argument("--days", type=int, default=90, help="Link expiry in days")
    parser.add_argument("--force-new", action="store_true", help="Create a new link even if a pending one exists for this card")
    args = parser.parse_args()

    if not SERVICE_KEY:
        print("ERROR: Set SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
        return 1

    fields: dict = {
        "brand": (args.brand or "").strip(),
        "contact_name": args.contact.strip(),
        "contact_email": args.email.strip() or None,
        "deliverable": args.deliverable.strip(),
        "tier": args.tier.strip(),
    }

    if args.card_id.strip().isdigit():
        card_id = int(args.card_id.strip())
        card = fetch_card(card_id)
        if not card:
            print(f"ERROR: Card {card_id} not found in Supabase", file=sys.stderr)
            return 1
        auto = invite_from_card(card)
        for key, value in auto.items():
            if value and not fields.get(key):
                fields[key] = value
        if not args.force_new:
            pending = find_pending_invite(card_id)
            if pending and pending.get("token"):
                link = f"{FEEDBACK_BASE}?t={pending['token']}"
                print_invite(link, pending.get("id", "?"), fields, pending.get("expires_at", ""), existing=True)
                return 0

    if not fields.get("brand"):
        print("ERROR: --brand is required (or use --from-card with a valid card id)", file=sys.stderr)
        return 1

    try:
        token, row_id = create_invite_row(fields, args.days)
    except RuntimeError as err:
        print(f"ERROR: {err}", file=sys.stderr)
        print("Have you run ops/sql/collab_feedback.sql in the Supabase SQL editor?", file=sys.stderr)
        return 1

    expires = (datetime.now(timezone.utc) + timedelta(days=max(7, args.days))).isoformat()
    link = f"{FEEDBACK_BASE}?t={token}"
    print_invite(link, row_id, fields, expires)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())