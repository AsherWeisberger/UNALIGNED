#!/usr/bin/env python3
import argparse
import asyncio
import email.utils
import json
import os
import re
from datetime import datetime, timedelta
from pathlib import Path

ENV_FILE = Path.home() / ".config/google-credentials/unaligned-scraper.env"
OUT_DIR = Path.home() / ".config/google-credentials"
STATUS_FILE = OUT_DIR / "codex_gmail_dump_status.json"


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
    payload = {"updated_at": datetime.utcnow().isoformat(), **data}
    STATUS_FILE.write_text(json.dumps(payload, indent=2))


TEAM_EMAILS = {
    "scobleizer@gmail.com",
    "asherunaligned@gmail.com",
    "samlevin@mac.com",
    "unalignedx@gmail.com",
}

NOISE_EMAIL_FRAGMENTS = (
    "mailer-daemon@",
    "no-reply@",
    "noreply@",
    "meetings-noreply@",
    "support@e.read.ai",
    "executiveassistant@e.read.ai",
    "neo@town.com",
)

GENERIC_OUTREACH_SUBJECTS = (
    "open for collaborations",
    "follow-up from robert scoble",
)


def parse_email_addresses(raw: str) -> list[str]:
    return [
        addr.lower().strip()
        for _name, addr in email.utils.getaddresses([raw or ""])
        if addr and "@" in addr
    ]


def is_team_email(addr: str) -> bool:
    return addr.lower().strip() in TEAM_EMAILS


def is_noise_email(addr: str) -> bool:
    addr = addr.lower().strip()
    return any(fragment in addr for fragment in NOISE_EMAIL_FRAGMENTS)


def is_external_email(addr: str) -> bool:
    return bool(addr) and not is_team_email(addr) and not is_noise_email(addr)


def email_focus_contacts(email_record: dict) -> list[str]:
    contacts: list[str] = []
    sender = parse_email_addresses(email_record.get("from", ""))
    recipients = parse_email_addresses(" ".join([email_record.get("to", ""), email_record.get("cc", "")]))
    for addr in sender + recipients:
        if is_external_email(addr) and addr not in contacts:
            contacts.append(addr)
    return contacts


def message_addresses(message: dict) -> tuple[list[str], list[str]]:
    senders = parse_email_addresses(message.get("from", ""))
    recipients = parse_email_addresses(" ".join([
        message.get("to", ""),
        message.get("cc", ""),
        " ".join(message.get("to_emails") or []),
    ]))
    return senders, recipients


def thread_external_contacts(thread: list[dict]) -> set[str]:
    contacts: set[str] = set()
    for msg in thread:
        senders, recipients = message_addresses(msg)
        for addr in senders + recipients:
            if is_external_email(addr):
                contacts.add(addr)
    return contacts


def looks_like_clumped_thread(email_record: dict, thread: list[dict]) -> bool:
    subject = (email_record.get("subject") or "").lower()
    generic_subject = any(term in subject for term in GENERIC_OUTREACH_SUBJECTS)
    contacts = thread_external_contacts(thread)
    outreach_messages = 0
    for msg in thread:
        body = msg.get("body") or ""
        sender = parse_email_addresses(msg.get("from", ""))
        if sender and is_team_email(sender[0]) and re.search(r"open for new collaborations|looping in Asher|take it from here", body, re.I):
            outreach_messages += 1
    return generic_subject and len(thread) >= 8 and (len(contacts) >= 4 or outreach_messages >= 4)


def contact_thread_id(thread_id: str, contact: str) -> str:
    safe_contact = re.sub(r"[^a-z0-9_.@+-]+", "", contact.lower())
    return f"{thread_id}::{safe_contact}"


def slice_thread_for_contact(thread: list[dict], contact: str) -> list[dict]:
    contact = contact.lower().strip()
    sliced: list[dict] = []
    for msg in thread:
        senders, recipients = message_addresses(msg)
        if contact in senders or contact in recipients:
            sliced.append({**msg, "split_contact_email": contact})
    return sliced


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=14)
    parser.add_argument("--out", default=str(OUT_DIR / "robert_14_day_gmail_dump.json"))
    parser.add_argument("--candidates-out", default=str(OUT_DIR / "robert_14_day_lead_candidates.json"))
    args = parser.parse_args()

    load_env()
    import scraper_v4 as s

    s.SUPABASE_ANON = os.environ.get("SUPABASE_ANON_KEY", s.SUPABASE_ANON)
    s.SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", s.SERVICE_ROLE_KEY)

    cutoff = (datetime.utcnow() - timedelta(days=args.days)).strftime("%Y/%m/%d")
    query = f"after:{cutoff} {s.GMAIL_QUERY}"
    write_status(phase="fetching_metadata", days=args.days, cutoff=cutoff)

    token = s.get_gmail_token()
    emails = await s.fetch_all_metadata(token, query)
    filtered = s.intent_filter(emails)

    write_status(phase="fetching_threads", days=args.days, cutoff=cutoff, emails=len(emails), filtered=len(filtered))
    conversations = await s.fetch_all_conversations(filtered, token)

    existing_ids, existing_threads = s.get_existing_cards_index()
    records = []
    seen_record_keys: set[str] = set()
    split_records = 0
    clumped_threads: set[str] = set()
    for e in filtered:
        thread = conversations.get(e["id"], [])
        tid = e.get("gmail_thread_id") or ""
        should_split = bool(tid and thread and looks_like_clumped_thread(e, thread))
        focused_records: list[tuple[dict, list[dict]]] = []
        if should_split:
            clumped_threads.add(tid)
            contacts = email_focus_contacts(e)
            for contact in contacts[:3]:
                contact_thread = slice_thread_for_contact(thread, contact)
                if not contact_thread:
                    continue
                split_email = {
                    **e,
                    "gmail_thread_id": contact_thread_id(tid, contact),
                    "gmail_original_thread_id": tid,
                    "split_from_gmail_thread_id": tid,
                    "split_contact_email": contact,
                }
                focused_records.append((split_email, contact_thread))
        if not focused_records:
            focused_records = [(e, thread)]

        for focused_email, focused_thread in focused_records:
            focused_tid = focused_email.get("gmail_thread_id") or ""
            record_key = focused_tid or focused_email.get("id") or ""
            if record_key and record_key in seen_record_keys:
                continue
            if record_key:
                seen_record_keys.add(record_key)
            split_records += 1 if focused_email.get("split_from_gmail_thread_id") else 0
            original_tid = focused_email.get("gmail_original_thread_id") or focused_tid
            existing = existing_threads.get(focused_tid) or existing_threads.get(original_tid) or {}
            already_has_card = focused_tid in existing_threads or focused_email.get("id") in existing_ids
            if focused_email.get("split_from_gmail_thread_id"):
                already_has_card = focused_tid in existing_threads
            records.append({
                "email": focused_email,
                "thread": focused_thread,
                "already_has_card": already_has_card,
                "existing_stage": existing.get("list_id", ""),
            })

    out = Path(args.out)
    out.write_text(json.dumps({
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "days": args.days,
        "cutoff": cutoff,
        "query": query,
        "total_emails": len(emails),
        "filtered_emails": len(filtered),
        "split_records": split_records,
        "clumped_threads": sorted(clumped_threads),
        "records": records,
    }, indent=2))

    candidate_records = []
    positive_terms = [
        "let's do it", "lets do it", "locking in", "invoice", "payment", "paid",
        "budget", "rate", "rates", "pricing", "sponsor", "sponsorship",
        "collaboration", "partnership", "campaign", "launch", "post", "video",
        "robert", "unaligned", "scoble",
    ]
    for r in records:
        text = " ".join([
            r["email"].get("subject", ""),
            r["email"].get("from", ""),
            r["email"].get("snippet", ""),
            " ".join(m.get("body", "") for m in r.get("thread", [])),
        ]).lower()
        score = sum(1 for term in positive_terms if term in text)
        if score >= 2 or r["already_has_card"]:
            candidate_records.append({**r, "candidate_score": score})

    Path(args.candidates_out).write_text(json.dumps({
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "days": args.days,
        "cutoff": cutoff,
        "total_candidates": len(candidate_records),
        "records": candidate_records,
    }, indent=2))

    write_status(
        phase="dump_written",
        days=args.days,
        cutoff=cutoff,
        emails=len(emails),
        filtered=len(filtered),
        records=len(records),
        split_records=split_records,
        clumped_threads=len(clumped_threads),
        candidates=len(candidate_records),
        out=str(out),
        candidates_out=str(args.candidates_out),
    )
    print(json.dumps(json.loads(STATUS_FILE.read_text()), indent=2))


if __name__ == "__main__":
    asyncio.run(main())
