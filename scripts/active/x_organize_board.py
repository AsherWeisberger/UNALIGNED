#!/usr/bin/env python3
"""
Prune and dedupe X leads on the Supabase board after a full intake sync.

- Trash X cards outside the recent window (default 30 days) per intake JSON.
- Trash duplicate X cards sharing the same external email (keep best survivor).
- Re-run Gmail -> X merge via x_bridge.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import httpx

ACTIVE_DIR = Path(__file__).resolve().parent
ROOT = ACTIVE_DIR.parents[1]
if str(ACTIVE_DIR) not in sys.path:
    sys.path.insert(0, str(ACTIVE_DIR))

from x_gmail_merge import first_external_email, normalize_email, parse_email_thread

ENV_FILE = Path.home() / ".config/google-credentials/unaligned-scraper.env"
INTAKE = ROOT / "flow-v4/assets/x_dm_daily_intake.json"
STATUS_FILE = Path.home() / ".config/google-credentials/x_organize_board_status.json"

CARD_SELECT = (
    "id,title,contact_name,business_name,email,phone,list_id,gmail_thread_id,"
    "email_thread,original_email,new_reply_at,updated_at,created_at,lead_source,"
    "x_open_dm,description,priority,intent"
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
    headers = {
        "apikey": anon,
        "Authorization": f"Bearer {service or anon}",
        "Accept": "application/json",
    }
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


def load_recent_intake_keys(days: int) -> tuple[set[str], dict[str, dict[str, Any]]]:
    leads = json.loads(INTAKE.read_text(encoding="utf-8"))
    cutoff = (datetime.now() - timedelta(days=days)).date()
    valid: set[str] = set()
    by_open_dm: dict[str, dict[str, Any]] = {}
    for lead in leads:
        odm = str(lead.get("openDm") or "").strip()
        raw_date = str(lead.get("newestDmDate") or "").strip()
        if not odm or not raw_date:
            continue
        try:
            dm_date = datetime.strptime(raw_date[:10], "%Y-%m-%d").date()
        except ValueError:
            continue
        if dm_date < cutoff:
            continue
        valid.add(odm)
        by_open_dm[odm] = lead
    return valid, by_open_dm


def priority_rank(priority: Any) -> int:
    return {"hot": 3, "warm": 2, "cold": 1}.get(str(priority or "").lower(), 0)


def card_survivor_score(card: dict[str, Any]) -> tuple[int, int, int, str]:
    thread_len = len(parse_email_thread(card))
    has_gmail = 1 if card.get("gmail_thread_id") else 0
    return (
        has_gmail,
        priority_rank(card.get("priority")),
        thread_len,
        str(card.get("updated_at") or card.get("created_at") or ""),
    )


def trash_card(card_id: str | int, *, merged_into: str | int | None = None) -> bool:
    payload: dict[str, Any] = {"list_id": "trash"}
    if merged_into is not None:
        payload["merged_into"] = merged_into
    return supabase_patch(card_id, payload) in (200, 204)


def prune_stale_x_cards(cards: list[dict[str, Any]], valid_open_dm: set[str], *, dry_run: bool) -> list[dict[str, Any]]:
    trashed = []
    for card in cards:
        odm = str(card.get("x_open_dm") or "").strip()
        if not odm:
            continue
        if odm in valid_open_dm:
            continue
        if str(card.get("list_id") or "") in {"trash", "dead-leads", "done", "paid-out"}:
            continue
        if not dry_run:
            trash_card(card["id"])
        trashed.append({"id": card["id"], "x_open_dm": odm, "business": card.get("business_name")})
    return trashed


def dedupe_x_by_email(cards: list[dict[str, Any]], *, dry_run: bool) -> list[dict[str, Any]]:
    x_cards = [c for c in cards if str(c.get("x_open_dm") or "").strip()]
    by_email: dict[str, list[dict[str, Any]]] = {}
    for card in x_cards:
        if str(card.get("list_id") or "") in {"trash", "dead-leads", "done", "paid-out"}:
            continue
        email_addr = normalize_email(card.get("email"))
        if not email_addr:
            continue
        by_email.setdefault(email_addr, []).append(card)

    merged = []
    for email_addr, group in by_email.items():
        if len(group) < 2:
            continue
        group.sort(key=card_survivor_score, reverse=True)
        survivor = group[0]
        for duplicate in group[1:]:
            if not dry_run:
                trash_card(duplicate["id"], merged_into=survivor["id"])
            merged.append(
                {
                    "email": email_addr,
                    "survivor_id": survivor["id"],
                    "trashed_id": duplicate["id"],
                }
            )
    return merged


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=0, help="Keep X leads with DM activity in this window. 0 disables age pruning.")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-bridge", action="store_true")
    args = parser.parse_args()

    load_env()
    if not INTAKE.exists():
        print(f"x_organize_board: intake missing at {INTAKE}", file=sys.stderr)
        return 1

    cards = load_cards()
    pruned = []
    if args.days > 0:
        valid_open_dm, _ = load_recent_intake_keys(args.days)
        pruned = prune_stale_x_cards(cards, valid_open_dm, dry_run=args.dry_run)
    deduped = dedupe_x_by_email(cards, dry_run=args.dry_run)

    bridge_summary = None
    if not args.dry_run and not args.skip_bridge:
        proc = subprocess.run(
            [sys.executable, str(ACTIVE_DIR / "x_bridge.py")],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            timeout=600,
        )
        bridge_summary = {
            "returncode": proc.returncode,
            "stdout": (proc.stdout or "").strip()[-500:],
            "stderr": (proc.stderr or "").strip()[-500:],
        }

    summary = {
        "ran_at": datetime.now().isoformat(),
        "window_days": args.days,
        "valid_open_dm": len(valid_open_dm) if args.days > 0 else None,
        "pruned_stale_x_cards": len(pruned),
        "deduped_email_groups": len(deduped),
        "pruned": pruned[:100],
        "deduped": deduped[:100],
        "bridge": bridge_summary,
        "dry_run": args.dry_run,
    }
    STATUS_FILE.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    kept_msg = f"kept {len(valid_open_dm)} intake leads, " if args.days > 0 else "age prune disabled, "
    print(
        f"x_organize_board: {kept_msg}"
        f"pruned {len(pruned)} stale X cards, deduped {len(deduped)} email duplicates"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())