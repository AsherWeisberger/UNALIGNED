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
STATUS_FILE = Path.home() / ".config/google-credentials/codex_thread_sync_status.json"

TEAM_SENDERS = (
    "scobleizer@gmail.com",
    "asherunaligned@gmail.com",
    "samlevin@mac.com",
    "unalignedx@gmail.com",
    "robert scoble",
    "asher weisberger",
    "sam levin",
)
INACTIVE_STAGES = {"done", "paid-out", "trash", "dead-leads"}


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


def norm_body(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def is_inbound(msg):
    sender = str(msg.get("from") or "").lower()
    return bool(sender) and not any(team in sender for team in TEAM_SENDERS)


def parse_sender_email(msg):
    raw = str(msg.get("email") or msg.get("from") or "").strip()
    if not raw:
        return ""
    _name, addr = email.utils.parseaddr(raw)
    if addr and "@" in addr:
        return addr.lower().strip()
    match = re.search(r"[\w.+%-]+@[\w.-]+\.[A-Za-z]{2,}", raw)
    return match.group(0).lower() if match else ""


def inbound_sender_emails(thread):
    emails = []
    for msg in thread or []:
        if not is_inbound(msg):
            continue
        addr = parse_sender_email(msg)
        if addr and addr not in emails:
            emails.append(addr)
    return emails


def message_date(msg):
    return msg.get("date_iso") or msg.get("date") or datetime.utcnow().isoformat()


def pick_card_for_email(cards_by_email, addr, linked_thread_ids):
    matches = cards_by_email.get(addr.lower(), [])
    if not matches:
        return None
    unlinked = [c for c in matches if not c.get("gmail_thread_id")]
    if unlinked:
        return unlinked[0]
    for card in matches:
        tid = str(card.get("gmail_thread_id") or "")
        if tid and tid not in linked_thread_ids:
            return card
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dump", default=str(Path.home() / ".config/google-credentials/robert_14_day_gmail_dump.json"))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    load_env()
    import scraper_v4 as s

    s.SUPABASE_ANON = os.environ.get("SUPABASE_ANON_KEY", s.SUPABASE_ANON)
    s.SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", s.SERVICE_ROLE_KEY)

    dump = json.loads(Path(args.dump).read_text())
    freshest = {}
    for record in dump.get("records", []):
        tid = record.get("email", {}).get("gmail_thread_id")
        thread = record.get("thread") or []
        if not tid or not thread:
            continue
        prev = freshest.get(tid)
        if not prev or len(thread) > len(prev.get("thread") or []):
            freshest[tid] = record

    cards = []
    offset = 0
    while True:
        cards_resp = httpx.get(
            f"{s.SUPABASE_URL}/rest/v1/cards?select=id,email,gmail_thread_id,list_id,email_thread,original_email,new_reply_at&limit=1000&offset={offset}",
            headers=s._sb_headers(),
            timeout=30,
        )
        cards_resp.raise_for_status()
        batch = cards_resp.json()
        cards.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    by_thread = {c.get("gmail_thread_id"): c for c in cards if c.get("gmail_thread_id")}
    cards_by_email = {}
    for card in cards:
        addr = str(card.get("email") or "").strip().lower()
        if addr and "@" in addr:
            cards_by_email.setdefault(addr, []).append(card)

    updates = []
    skipped = []
    linked_thread_ids = set()
    for tid, record in freshest.items():
        card = by_thread.get(tid)
        match_mode = "thread_id"
        if not card:
            fresh_thread = record.get("thread") or []
            for addr in inbound_sender_emails(fresh_thread):
                card = pick_card_for_email(cards_by_email, addr, linked_thread_ids)
                if card:
                    match_mode = "email"
                    break
        if not card:
            continue
        fresh_thread = record.get("thread") or []
        existing_thread = card.get("email_thread") if isinstance(card.get("email_thread"), list) else []
        if not fresh_thread:
            continue
        if any(isinstance(m, dict) and m.get("recovered_from_quote") for m in existing_thread):
            skipped.append({"id": card["id"], "gmail_thread_id": tid, "reason": "manual_recovered_quote"})
            continue

        existing_sig = [norm_body(m.get("body")) for m in existing_thread]
        fresh_sig = [norm_body(m.get("body")) for m in fresh_thread]
        needs_thread_link = not card.get("gmail_thread_id")
        if existing_sig == fresh_sig and not needs_thread_link:
            skipped.append({"id": card["id"], "gmail_thread_id": tid, "reason": "same"})
            continue

        if not needs_thread_link and len(fresh_thread) <= len(existing_thread):
            skipped.append({
                "id": card["id"],
                "gmail_thread_id": tid,
                "reason": "fresh_thread_not_longer",
                "existing": len(existing_thread),
                "fresh": len(fresh_thread),
            })
            continue

        payload = {}
        if existing_sig != fresh_sig or not existing_thread:
            payload["email_thread"] = fresh_thread
            payload["original_email"] = fresh_thread[:1]
        if needs_thread_link or match_mode == "email":
            payload["gmail_thread_id"] = tid
        last = fresh_thread[-1]
        if is_inbound(last) and card.get("list_id") not in INACTIVE_STAGES:
            payload["new_reply_at"] = message_date(last)
        else:
            payload["new_reply_at"] = None

        linked_thread_ids.add(tid)
        updates.append((card["id"], tid, payload, len(existing_thread), len(fresh_thread), match_mode))

    written = 0
    if not args.dry_run:
        for card_id, tid, payload, old_len, new_len, _match_mode in updates:
            resp = httpx.patch(
                f"{s.SUPABASE_URL}/rest/v1/cards?id=eq.{card_id}",
                headers=s._sb_headers(),
                json=payload,
                timeout=20,
            )
            if resp.status_code in (200, 204):
                written += 1
            else:
                skipped.append({
                    "id": card_id,
                    "gmail_thread_id": tid,
                    "reason": f"patch_failed_{resp.status_code}",
                    "body": resp.text[:200],
                })

    write_status(
        phase="dry_run" if args.dry_run else "synced",
        dump=args.dump,
        dump_threads=len(freshest),
        cards=len(cards),
        prepared=len(updates),
        written=written,
        skipped=skipped[:200],
        email_linked=sum(1 for *_rest, mode in updates if mode == "email"),
        updates=[
            {"id": card_id, "gmail_thread_id": tid, "old_len": old_len, "new_len": new_len, "match_mode": mode}
            for card_id, tid, _payload, old_len, new_len, mode in updates[:200]
        ],
    )
    print(json.dumps(json.loads(STATUS_FILE.read_text()), indent=2))


if __name__ == "__main__":
    main()
