#!/usr/bin/env python3
"""
Restore trashed X cards and enforce partnership/collab/product-only board.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx

ACTIVE_DIR = Path(__file__).resolve().parent
if str(ACTIVE_DIR) not in sys.path:
    sys.path.insert(0, str(ACTIVE_DIR))

from x_lead_qualification import is_qualified_card, is_qualified_intake_row

ENV_FILE = Path.home() / ".config/google-credentials/unaligned-scraper.env"
STATUS_FILE = Path.home() / ".config/google-credentials/x_restore_and_qualify_status.json"
INTAKE = Path("/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/flow-v4/assets/x_dm_daily_intake.json")

CARD_SELECT = (
    "id,title,contact_name,business_name,email,list_id,lead_source,x_open_dm,"
    "description,intent,priority"
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
    token = service or anon
    headers = {"apikey": anon, "Authorization": f"Bearer {token}", "Accept": "application/json"}
    if write:
        headers["Content-Type"] = "application/json"
    return headers


def supabase_get(path: str) -> Any:
    url = os.environ.get("SUPABASE_URL", "https://hbnpwphxjurvtydezwgh.supabase.co").rstrip("/") + path
    resp = httpx.get(url, headers=sb_headers(), timeout=60)
    resp.raise_for_status()
    return resp.json()


def supabase_patch(card_id: str | int, payload: dict[str, Any]) -> int:
    url = (
        os.environ.get("SUPABASE_URL", "https://hbnpwphxjurvtydezwgh.supabase.co").rstrip("/")
        + f"/rest/v1/cards?id=eq.{card_id}"
    )
    resp = httpx.patch(
        url,
        headers={**sb_headers(write=True), "Prefer": "return=minimal"},
        json=payload,
        timeout=20,
    )
    return resp.status_code


def load_x_cards() -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []
    offset = 0
    while True:
        batch = supabase_get(
            f"/rest/v1/cards?select={CARD_SELECT}&or=(lead_source.eq.X,x_open_dm.not.is.null)"
            f"&limit=1000&offset={offset}"
        )
        if not isinstance(batch, list) or not batch:
            break
        cards.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    return cards


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    load_env()
    cards = load_x_cards()
    trashed = [c for c in cards if str(c.get("list_id") or "") == "trash" and c.get("x_open_dm")]
    active = [c for c in cards if str(c.get("list_id") or "") not in {"trash", "dead-leads", "done", "paid-out"}]

    restored = []
    demoted = []

    for card in trashed:
        qualified = is_qualified_card(card)
        target = "new" if qualified else "dead-leads"
        if not args.dry_run:
            supabase_patch(card["id"], {"list_id": target, "merged_into": None})
        restored.append({"id": card["id"], "business": card.get("business_name"), "to": target, "qualified": qualified})

    for card in active:
        if not card.get("x_open_dm"):
            continue
        if is_qualified_card(card):
            continue
        if not args.dry_run:
            supabase_patch(card["id"], {"list_id": "dead-leads"})
        demoted.append({"id": card["id"], "business": card.get("business_name")})

    intake = json.loads(INTAKE.read_text(encoding="utf-8")) if INTAKE.exists() else []
    qualified_intake = [row for row in intake if is_qualified_intake_row(row)]
    if not args.dry_run and INTAKE.exists():
        INTAKE.write_text(json.dumps(qualified_intake, indent=2, ensure_ascii=False), encoding="utf-8")

    summary = {
        "ran_at": datetime.now().isoformat(),
        "dry_run": args.dry_run,
        "trashed_x_seen": len(trashed),
        "restored_to_new": sum(1 for r in restored if r["to"] == "new"),
        "restored_to_dead_leads": sum(1 for r in restored if r["to"] == "dead-leads"),
        "active_demoted": len(demoted),
        "intake_before": len(intake),
        "intake_after": len(qualified_intake),
        "samples_restored": restored[:25],
        "samples_demoted": demoted[:25],
    }
    STATUS_FILE.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())