#!/usr/bin/env python3
import argparse
import json
import os
from datetime import datetime
from pathlib import Path

ENV_FILE = Path.home() / ".config/google-credentials/unaligned-scraper.env"
STATUS_FILE = Path.home() / ".config/google-credentials/codex_extraction_status.json"


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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dump", default=str(Path.home() / ".config/google-credentials/robert_14_day_gmail_dump.json"))
    parser.add_argument("--leads", required=True)
    args = parser.parse_args()

    load_env()
    import scraper_v4 as s

    s.SUPABASE_ANON = os.environ.get("SUPABASE_ANON_KEY", s.SUPABASE_ANON)
    s.SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", s.SERVICE_ROLE_KEY)

    dump = json.loads(Path(args.dump).read_text())
    leads = json.loads(Path(args.leads).read_text())
    by_thread = {}
    for record in dump.get("records", []):
        tid = record.get("email", {}).get("gmail_thread_id")
        if tid and tid not in by_thread:
            by_thread[tid] = record

    existing_ids, existing_threads = s.get_existing_cards_index()
    cards = []
    skipped = []
    for lead in leads:
        tid = lead["gmail_thread_id"]
        if tid in existing_threads:
            skipped.append({"gmail_thread_id": tid, "reason": "already_has_card"})
            continue
        record = by_thread.get(tid)
        if not record:
            skipped.append({"gmail_thread_id": tid, "reason": "missing_from_dump"})
            continue
        original = record["email"]
        conversation = record.get("thread") or []
        card = s.build_card(lead, original, conversation)
        if lead.get("list_id"):
            card["list_id"] = lead["list_id"]
        for source_key, card_key in (
            ("email", "email"),
            ("contact_name", "contact_name"),
            ("business_name", "business_name"),
        ):
            if source_key in lead:
                card[card_key] = lead[source_key]
        card["lead_source"] = lead.get("lead_source", "GMAIL-CODEX")
        card["activity"] = [{
            "time": datetime.utcnow().isoformat() + "Z",
            "user": "Codex extraction",
            "action": "imported from Gmail dump",
        }]
        cards.append(card)

    written = s.upsert_cards(cards)
    write_status(
        phase="written",
        requested=len(leads),
        prepared=len(cards),
        written=written,
        skipped=skipped,
        leads_file=args.leads,
    )
    print(json.dumps(json.loads(STATUS_FILE.read_text()), indent=2))


if __name__ == "__main__":
    main()
