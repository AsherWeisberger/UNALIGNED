#!/usr/bin/env python3
"""
X intake -> Supabase cards bridge with Gmail merge.

Reads x_dm_daily_intake.json and lands each lead on the cards board with
lead_source='X', deduped on openDm. When a lead's email matches an existing
Gmail-only card, enriches or merges instead of creating a duplicate.

Env:
  SUPABASE_URL, SUPABASE_ANON_KEY (SUPABASE_SERVICE_ROLE_KEY preferred for trash/delete)
  X_INTAKE_JSON (default: flow-v4/assets/x_dm_daily_intake.json)
"""
from __future__ import annotations

import json
import os
import sys
import urllib.parse
from pathlib import Path
from typing import Any

import httpx

ACTIVE_DIR = Path(__file__).resolve().parent
if str(ACTIVE_DIR) not in sys.path:
    sys.path.insert(0, str(ACTIVE_DIR))

from x_lead_qualification import is_qualified_intake_row
from x_gmail_merge import (
    absorb_gmail_patch,
    enrich_gmail_card_patch,
    first_external_email,
    insert_fields,
    is_merge_candidate,
    is_x_card,
    normalize_email,
    pick_gmail_card_for_email,
    refresh_fields,
)

ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = Path.home() / ".config/google-credentials/unaligned-scraper.env"
INTAKE = os.environ.get("X_INTAKE_JSON", str(ROOT / "flow-v4/assets/x_dm_daily_intake.json"))
STATUS_FILE = Path.home() / ".config/google-credentials/x_bridge_status.json"

CARD_SELECT = (
    "id,title,contact_name,business_name,email,phone,list_id,gmail_thread_id,"
    "email_thread,original_email,new_reply_at,updated_at,lead_source,x_open_dm,"
    "description,priority,intent"
)


def load_env() -> None:
    if not ENV_FILE.exists():
        return
    for raw in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def sb_headers(*, write: bool = False) -> dict[str, str]:
    anon = os.environ.get("SUPABASE_ANON_KEY", "")
    service = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not anon:
        raise RuntimeError("SUPABASE_ANON_KEY is missing")
    token = service or anon
    headers = {
        "apikey": anon,
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }
    if write:
        headers["Content-Type"] = "application/json"
    return headers


def supabase_get(path: str) -> Any:
    url = os.environ.get("SUPABASE_URL", "https://hbnpwphxjurvtydezwgh.supabase.co").rstrip("/") + path
    resp = httpx.get(url, headers=sb_headers(), timeout=30)
    resp.raise_for_status()
    return resp.json()


def supabase_patch(path: str, payload: dict[str, Any]) -> int:
    url = os.environ.get("SUPABASE_URL", "https://hbnpwphxjurvtydezwgh.supabase.co").rstrip("/") + path
    resp = httpx.patch(
        url,
        headers={**sb_headers(write=True), "Prefer": "return=minimal"},
        json=payload,
        timeout=20,
    )
    return resp.status_code


def supabase_post(path: str, payload: list[dict[str, Any]]) -> int:
    url = os.environ.get("SUPABASE_URL", "https://hbnpwphxjurvtydezwgh.supabase.co").rstrip("/") + path
    resp = httpx.post(
        url,
        headers={**sb_headers(write=True), "Prefer": "return=minimal"},
        json=payload,
        timeout=20,
    )
    return resp.status_code


def supabase_delete(card_id: str | int) -> int:
    url = (
        os.environ.get("SUPABASE_URL", "https://hbnpwphxjurvtydezwgh.supabase.co").rstrip("/")
        + f"/rest/v1/cards?id=eq.{card_id}"
    )
    resp = httpx.delete(url, headers=sb_headers(), timeout=20)
    return resp.status_code


def load_cards() -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []
    offset = 0
    while True:
        batch = supabase_get(f"/rest/v1/cards?select={CARD_SELECT}&limit=1000&offset={offset}")
        if not isinstance(batch, list) or not batch:
            break
        cards.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    return cards


def index_cards(cards: list[dict[str, Any]]) -> tuple[dict[str, dict[str, Any]], dict[str, list[dict[str, Any]]]]:
    by_open_dm: dict[str, dict[str, Any]] = {}
    by_email: dict[str, list[dict[str, Any]]] = {}
    for card in cards:
        odm = str(card.get("x_open_dm") or "").strip()
        if odm:
            by_open_dm[odm] = card
        email_addr = normalize_email(card.get("email"))
        if email_addr:
            by_email.setdefault(email_addr, []).append(card)
    return by_open_dm, by_email


def retire_gmail_card(gmail_card: dict[str, Any], survivor_id: str | int) -> str:
    status = supabase_patch(
        f"/rest/v1/cards?id=eq.{gmail_card['id']}",
        {"list_id": "trash", "merged_into": survivor_id},
    )
    if status in (200, 204):
        return "trashed"
    delete_status = supabase_delete(gmail_card["id"])
    if delete_status in (200, 204):
        return "deleted"
    return f"retire_failed_{status}_{delete_status}"


def merge_gmail_into_x_card(
    x_card: dict[str, Any],
    gmail_card: dict[str, Any],
    *,
    dry_run: bool = False,
) -> dict[str, Any] | None:
    if not is_merge_candidate(gmail_card):
        return None
    if str(gmail_card.get("id")) == str(x_card.get("id")):
        return None
    patch = absorb_gmail_patch(x_card, gmail_card)
    if dry_run:
        return {"survivor_id": x_card["id"], "merged_id": gmail_card["id"], "patch": patch, "action": "dry_run"}
    status = supabase_patch(f"/rest/v1/cards?id=eq.{x_card['id']}", patch)
    if status not in (200, 204):
        return {"survivor_id": x_card["id"], "merged_id": gmail_card["id"], "error": f"patch_failed_{status}"}
    retire_action = retire_gmail_card(gmail_card, x_card["id"])
    x_card.update(patch)
    return {
        "survivor_id": x_card["id"],
        "merged_id": gmail_card["id"],
        "retire_action": retire_action,
        "email": normalize_email(x_card.get("email")),
    }


def merge_gmail_duplicates_for_email(
    email_addr: str,
    survivor: dict[str, Any],
    cards_by_email: dict[str, list[dict[str, Any]]],
    *,
    dry_run: bool = False,
) -> list[dict[str, Any]]:
    if not email_addr or not is_x_card(survivor):
        return []
    merged = []
    exclude = {str(survivor.get("id"))}
    while True:
        gmail_card = pick_gmail_card_for_email(cards_by_email, email_addr, exclude_ids=exclude)
        if not gmail_card:
            break
        result = merge_gmail_into_x_card(survivor, gmail_card, dry_run=dry_run)
        if not result or result.get("error"):
            break
        merged.append(result)
        exclude.add(str(gmail_card.get("id")))
        cards_by_email[email_addr] = [
            c for c in cards_by_email.get(email_addr, []) if str(c.get("id")) not in exclude
        ]
        cards_by_email.setdefault(email_addr, []).append(survivor)
    return merged


def merge_gmail_into_x(
    cards: list[dict[str, Any]],
    cards_by_email: dict[str, list[dict[str, Any]]],
    *,
    dry_run: bool = False,
) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    for card in cards:
        if not is_x_card(card):
            continue
        email_addr = normalize_email(card.get("email"))
        if not email_addr:
            continue
        merged.extend(
            merge_gmail_duplicates_for_email(email_addr, card, cards_by_email, dry_run=dry_run)
        )
    return merged


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    load_env()
    intake_path = Path(INTAKE)
    if not intake_path.exists():
        print(f"X bridge: intake missing at {intake_path}", file=sys.stderr)
        return 1

    leads = json.loads(intake_path.read_text(encoding="utf-8"))
    if not isinstance(leads, list):
        print("X bridge: intake is not a list", file=sys.stderr)
        return 1

    cards = load_cards()
    by_open_dm, cards_by_email = index_cards(cards)

    inserted = updated = enriched = skipped = 0
    merge_events: list[dict[str, Any]] = []

    for lead in leads:
        odm = str(lead.get("openDm") or "").strip()
        if not odm:
            skipped += 1
            continue
        if not is_qualified_intake_row(lead):
            skipped += 1
            continue

        email_addr = first_external_email(lead.get("contactEmails"))
        existing = by_open_dm.get(odm)

        if existing:
            patch = refresh_fields(lead)
            if not args.dry_run:
                status = supabase_patch(
                    f"/rest/v1/cards?x_open_dm=eq.{urllib.parse.quote(odm, safe='')}",
                    patch,
                )
                if status not in (200, 204):
                    print(f"X bridge: refresh failed for {odm} ({status})", file=sys.stderr)
                    continue
            existing.update(patch)
            updated += 1
            if email_addr:
                existing["email"] = email_addr
                merge_events.extend(
                    merge_gmail_duplicates_for_email(
                        email_addr, existing, cards_by_email, dry_run=args.dry_run
                    )
                )
            continue

        gmail_card = pick_gmail_card_for_email(cards_by_email, email_addr) if email_addr else None
        if gmail_card:
            patch = enrich_gmail_card_patch(gmail_card, lead)
            if not args.dry_run:
                status = supabase_patch(f"/rest/v1/cards?id=eq.{gmail_card['id']}", patch)
                if status not in (200, 204):
                    print(f"X bridge: enrich failed for card {gmail_card['id']} ({status})", file=sys.stderr)
                    continue
            gmail_card.update(patch)
            by_open_dm[odm] = gmail_card
            enriched += 1
            if email_addr:
                merge_events.extend(
                    merge_gmail_duplicates_for_email(
                        email_addr, gmail_card, cards_by_email, dry_run=args.dry_run
                    )
                )
            continue

        card = insert_fields(lead)
        if not args.dry_run:
            status = supabase_post("/rest/v1/cards", [card])
            if status not in (200, 201, 204):
                print(f"X bridge: insert failed for {odm} ({status})", file=sys.stderr)
                continue
        inserted += 1
        stub = {"x_open_dm": odm, "email": email_addr, **card}
        by_open_dm[odm] = stub
        if email_addr:
            cards_by_email.setdefault(email_addr, []).append(stub)

    post_merge = merge_gmail_into_x(cards, cards_by_email, dry_run=args.dry_run)
    merge_events.extend(post_merge)

    summary = {
        "inserted": inserted,
        "updated": updated,
        "enriched": enriched,
        "skipped": skipped,
        "merged_gmail_cards": len(merge_events),
        "merge_events": merge_events[:50],
        "dry_run": args.dry_run,
    }
    STATUS_FILE.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(
        "X bridge: "
        f"{inserted} new, {updated} refreshed, {enriched} enriched, "
        f"{len(merge_events)} gmail merges, {skipped} skipped (no openDm)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())