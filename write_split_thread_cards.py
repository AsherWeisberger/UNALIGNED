#!/usr/bin/env python3
import argparse
import email.utils
import json
import os
from datetime import datetime
from pathlib import Path

import httpx

from lead_blocklist import is_blocked_lead

ENV_FILE = Path.home() / ".config/google-credentials/unaligned-scraper.env"
STATUS_FILE = Path.home() / ".config/google-credentials/codex_split_card_write_status.json"

FREE_EMAIL_DOMAINS = {
    "gmail.com",
    "googlemail.com",
    "icloud.com",
    "mac.com",
    "me.com",
    "outlook.com",
    "hotmail.com",
    "yahoo.com",
}

INACTIVE_STAGES = {"trash", "dead-leads", "done", "paid-out"}

DOMAIN_NAMES = {
    "a16z.com": "a16z",
    "e.read.ai": "Read AI",
    "read.ai": "Read AI",
    "inboxapp.com": "Inbox",
    "madisonalexanderpr.com": "Madison Alexander PR",
    "sendpixi.com": "SendPixi",
}


def load_env():
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export "):].strip()
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def write_status(**data):
    STATUS_FILE.write_text(json.dumps({"updated_at": datetime.utcnow().isoformat(), **data}, indent=2))


def sender_name(raw):
    name, addr = email.utils.parseaddr(raw or "")
    return (name or addr.split("@")[0] if addr else "Contact").strip().strip('"')


def domain_for(addr):
    return addr.split("@", 1)[1].lower() if "@" in addr else ""


def company_from_email(addr):
    domain = domain_for(addr)
    if not domain or domain in FREE_EMAIL_DOMAINS:
        return ""
    if domain in DOMAIN_NAMES:
        return DOMAIN_NAMES[domain]
    base = domain.split(".")[0]
    return base.replace("-", " ").title()


def classify(text):
    lowered = text.lower()
    if any(x in lowered for x in ["doesn’t involve me paying", "doesn't involve me paying", "cash poor", "not our business model"]):
        return "dead-leads"
    if any(x in lowered for x in ["pricing", "costs involved", "rates", "quote", "repost", "sponsor", "paid"]):
        return "rates-sent"
    return "engaged"


def title_for(contact, thread, email_record):
    business = company_from_email(contact)
    name = sender_name(thread[-1].get("from") if thread else email_record.get("from"))
    if business:
        return f"{business} collaboration follow-up"
    return f"{name} collaboration follow-up"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dump", default=str(Path.home() / ".config/google-credentials/robert_codex_latest_gmail_dump.json"))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    load_env()
    import scraper_v4 as s

    s.SUPABASE_ANON = os.environ.get("SUPABASE_ANON_KEY", s.SUPABASE_ANON)
    s.SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", s.SERVICE_ROLE_KEY)

    dump = json.loads(Path(args.dump).read_text())
    resp = httpx.get(
        f"{s.SUPABASE_URL}/rest/v1/cards?select=id,email,gmail_thread_id,title,list_id,business_name,contact_name&limit=1000",
        headers=s._sb_headers(),
        timeout=30,
    )
    resp.raise_for_status()
    existing = resp.json()
    existing_threads = {str(c.get("gmail_thread_id") or ""): c for c in existing if c.get("gmail_thread_id")}
    active_exact_emails = {
        str(c.get("email") or "").lower(): c
        for c in existing
        if c.get("email") and c.get("list_id") not in INACTIVE_STAGES
    }
    active_domains = {}
    for card in existing:
        addr = str(card.get("email") or "").lower()
        stage = card.get("list_id") or ""
        domain = domain_for(addr)
        if domain and domain not in FREE_EMAIL_DOMAINS and stage not in INACTIVE_STAGES:
            active_domains.setdefault(domain, []).append(card)

    cards = []
    skipped = []
    prepared = []
    for record in dump.get("records", []):
        email_record = record.get("email", {})
        if not email_record.get("split_from_gmail_thread_id"):
            continue
        tid = email_record.get("gmail_thread_id")
        contact = (email_record.get("split_contact_email") or "").lower()
        thread = record.get("thread") or []
        if not tid or not contact or not thread:
            skipped.append({"gmail_thread_id": tid, "contact": contact, "reason": "missing_contact_or_thread"})
            continue
        text = " ".join([email_record.get("subject", ""), email_record.get("snippet", "")] + [m.get("body", "") for m in thread])
        if is_blocked_lead(
            email=contact,
            contact_name=sender_name(thread[-1].get("from") if thread else email_record.get("from")),
            business_name=company_from_email(contact),
            title=email_record.get("subject", ""),
            thread_text=text,
        ):
            skipped.append({"gmail_thread_id": tid, "contact": contact, "reason": "blocked_sender"})
            continue
        if tid in existing_threads:
            skipped.append({"gmail_thread_id": tid, "contact": contact, "reason": "already_has_split_card"})
            continue
        suggested_stage = classify(text)
        stage = "new"
        domain = domain_for(contact)
        if contact in active_exact_emails and stage != "rates-sent":
            skipped.append({"gmail_thread_id": tid, "contact": contact, "reason": "active_card_same_email", "existing_id": active_exact_emails[contact]["id"]})
            continue
        if domain in active_domains and stage != "rates-sent":
            skipped.append({"gmail_thread_id": tid, "contact": contact, "reason": "active_card_same_domain", "existing_ids": [c["id"] for c in active_domains[domain]][:3]})
            continue

        lead = {
            "email_id": email_record.get("id", ""),
            "title": title_for(contact, thread, email_record),
            "name": sender_name(thread[-1].get("from") if thread else email_record.get("from")),
            "email_addr": contact,
            "business": company_from_email(contact),
            "priority": "warm" if suggested_stage != "dead-leads" else "cold",
            "intent": "collaboration",
            "notes": (thread[-1].get("body", "") if thread else email_record.get("snippet", ""))[:700],
            "evidence": (thread[-1].get("body", "") if thread else email_record.get("snippet", ""))[:300],
            "suggested_stage": suggested_stage,
            "reply_hook": "Follow up on the collaboration conversation from the split Gmail mega-thread.",
        }
        card = s.build_card(lead, email_record, thread)
        card["gmail_thread_id"] = tid
        card["email_id"] = f"{email_record.get('id', '')}::{contact}"
        card["list_id"] = stage
        card["lead_source"] = "ROBERT-GMAIL-NEW-LEAD"
        card["activity"] = [{
            "time": datetime.utcnow().isoformat() + "Z",
            "user": "Codex splitter",
            "action": "imported from split Gmail mega-thread",
        }]
        cards.append(card)
        prepared.append({"gmail_thread_id": tid, "contact": contact, "title": card["title"], "list_id": stage})

    written = 0 if args.dry_run else s.upsert_cards(cards)
    write_status(
        phase="dry_run" if args.dry_run else "split_cards_written",
        dump=args.dump,
        prepared=len(cards),
        written=written,
        skipped=skipped,
        prepared_cards=prepared,
    )
    print(json.dumps(json.loads(STATUS_FILE.read_text()), indent=2))


if __name__ == "__main__":
    main()
