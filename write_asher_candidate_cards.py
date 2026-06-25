#!/usr/bin/env python3
import argparse
import email.utils
import json
import os
import re
from datetime import datetime
from pathlib import Path

import httpx

ENV_FILE = Path.home() / ".config/google-credentials/unaligned-scraper.env"
STATUS_FILE = Path.home() / ".config/google-credentials/codex_asher_candidate_write_status.json"

INTERNAL_EMAILS = {
    "asherunaligned@gmail.com",
    "scobleizer@gmail.com",
    "unalignedx@gmail.com",
    "samlevin@mac.com",
    "samlevin@me.com",
}

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

from lead_blocklist import is_blocked_email, is_blocked_lead

BLOCKED_CONTACTS = {
    "mailer-daemon@googlemail.com",
}

BLOCKED_DOMAINS = {
    "aumail.docusign.net",
}


def load_env():
    if not ENV_FILE.exists():
        return
    for raw in ENV_FILE.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export "):].strip()
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def write_status(**data):
    STATUS_FILE.write_text(json.dumps({"updated_at": datetime.utcnow().isoformat(), **data}, indent=2))


def parse_addr(raw):
    name, addr = email.utils.parseaddr(raw or "")
    return (name or "").strip().strip('"'), (addr or "").strip().lower()


def domain_for(addr):
    return addr.split("@", 1)[1].lower() if "@" in addr else ""


def company_from_email(addr):
    domain = domain_for(addr)
    if not domain or domain in FREE_EMAIL_DOMAINS:
        return ""
    base = domain.split(".")[0]
    return base.replace("-", " ").replace("_", " ").title()


def clean_subject(subject):
    subject = re.sub(r"^(re|fwd?):\s*", "", subject or "", flags=re.I).strip()
    return subject or "Collaboration follow-up"


def first_external(record):
    thread = record.get("thread") or []
    for msg in reversed(thread):
        name, addr = parse_addr(msg.get("from", ""))
        if addr and addr not in INTERNAL_EMAILS:
            return name, addr, msg
    email_record = record.get("email", {})
    name, addr = parse_addr(email_record.get("from", ""))
    return name, addr, (thread[-1] if thread else {})


def classify(text):
    lowered = text.lower()
    if any(x in lowered for x in ["not interested", "no budget", "cash poor", "doesn't involve me paying"]):
        return "dead-leads"
    if any(x in lowered for x in ["invoice", "paid", "$", "pricing", "rate", "sponsor", "campaign", "launch"]):
        return "warm"
    return "cold"


def lead_from_record(record):
    email_record = record.get("email", {})
    thread = record.get("thread") or []
    name, addr, latest_external = first_external(record)
    if not addr or addr in INTERNAL_EMAILS:
        return None
    if addr in BLOCKED_CONTACTS or domain_for(addr) in BLOCKED_DOMAINS or is_blocked_email(addr):
        return None
    text = " ".join([email_record.get("subject", ""), email_record.get("snippet", "")] + [m.get("body", "") for m in thread])
    subject = clean_subject(email_record.get("subject"))
    if is_blocked_lead(
        email=addr,
        contact_name=name,
        business_name=company_from_email(addr),
        title=subject,
        thread_text=text,
    ):
        return None
    priority = classify(text)
    body = latest_external.get("body") or email_record.get("snippet") or ""
    return {
        "email_id": email_record.get("id", ""),
        "title": subject,
        "name": name or addr.split("@", 1)[0],
        "email_addr": addr,
        "business": company_from_email(addr),
        "priority": priority,
        "intent": "collaboration",
        "notes": body[:900],
        "evidence": body[:350],
        "deal_value": "",
        "reply_hook": "Review this Asher Gmail lead and decide whether to add it to the active board.",
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidates", default=str(Path.home() / ".config/google-credentials/asher_full_candidates.json"))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    load_env()
    import scraper_v4 as s

    s.SUPABASE_ANON = os.environ.get("SUPABASE_ANON_KEY", s.SUPABASE_ANON)
    s.SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", s.SERVICE_ROLE_KEY)

    data = json.loads(Path(args.candidates).read_text())
    resp = httpx.get(
        f"{s.SUPABASE_URL}/rest/v1/cards?select=id,email,gmail_thread_id,list_id&limit=1000",
        headers=s._sb_headers(),
        timeout=30,
    )
    resp.raise_for_status()
    existing = resp.json()
    existing_threads = {str(c.get("gmail_thread_id") or "") for c in existing if c.get("gmail_thread_id")}
    active_emails = {
        str(c.get("email") or "").lower(): c
        for c in existing
        if c.get("email") and c.get("list_id") not in INACTIVE_STAGES
    }
    active_domains = {}
    for card in existing:
        stage = card.get("list_id") or ""
        addr = str(card.get("email") or "").lower()
        domain = domain_for(addr)
        if domain and domain not in FREE_EMAIL_DOMAINS and stage not in INACTIVE_STAGES:
            active_domains.setdefault(domain, []).append(card)

    cards = []
    skipped = []
    prepared = []
    for record in data.get("records", []):
        email_record = record.get("email", {})
        tid = email_record.get("gmail_thread_id") or ""
        if email_record.get("split_from_gmail_thread_id"):
            skipped.append({"gmail_thread_id": tid, "reason": "handled_by_split_writer"})
            continue
        if tid in existing_threads:
            skipped.append({"gmail_thread_id": tid, "reason": "existing_thread"})
            continue
        lead = lead_from_record(record)
        if not lead:
            skipped.append({"gmail_thread_id": tid, "reason": "no_external_contact"})
            continue
        contact = lead["email_addr"].lower()
        domain = domain_for(contact)
        if contact in active_emails:
            skipped.append({"gmail_thread_id": tid, "contact": contact, "reason": "active_card_same_email", "existing_id": active_emails[contact]["id"]})
            continue
        if domain and domain not in FREE_EMAIL_DOMAINS and domain in active_domains:
            skipped.append({"gmail_thread_id": tid, "contact": contact, "reason": "active_card_same_domain", "existing_ids": [c["id"] for c in active_domains[domain]][:3]})
            continue

        card = s.build_card(lead, email_record, record.get("thread") or [])
        card["list_id"] = "new"
        card["lead_source"] = "ASHER-GMAIL-CANDIDATE"
        card["activity"] = [{
            "time": datetime.utcnow().isoformat() + "Z",
            "user": "Codex Asher importer",
            "action": "imported from Asher Gmail candidate export",
        }]
        cards.append(card)
        prepared.append({"gmail_thread_id": tid, "contact": contact, "title": card["title"]})

    written = 0 if args.dry_run else s.upsert_cards(cards)
    write_status(
        phase="dry_run" if args.dry_run else "candidate_cards_written",
        candidates=args.candidates,
        prepared=len(cards),
        written=written,
        skipped_count=len(skipped),
        skipped=skipped[:200],
        prepared_cards=prepared[:200],
    )
    print(json.dumps(json.loads(STATUS_FILE.read_text()), indent=2))


if __name__ == "__main__":
    main()
