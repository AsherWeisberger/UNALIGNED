#!/usr/bin/env python3
"""
Sweep pending draft_reply cards and clear any that no longer match the thread.

Run after gmail_delta_sync on dashboard refresh so Organs never keeps a stale
draft when Gmail history did not change (no delta touch for that card).
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

import httpx

ACTIVE_DIR = Path(__file__).resolve().parent
if str(ACTIVE_DIR) not in sys.path:
    sys.path.insert(0, str(ACTIVE_DIR))

from draft_staleness import parse_thread, should_regenerate_draft  # noqa: E402

ENV_FILE = Path.home() / ".config/google-credentials/unaligned-scraper.env"

CARD_SELECT = (
    "id,title,contact_name,business_name,email,list_id,gmail_thread_id,"
    "email_thread,original_email,draft_reply,draft_reply_status,new_reply_at,updated_at"
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


def sb_headers() -> dict[str, str]:
    anon = os.environ.get("SUPABASE_ANON_KEY", "")
    service = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not anon:
        raise RuntimeError("SUPABASE_ANON_KEY is missing")
    return {
        "apikey": anon,
        "Authorization": f"Bearer {service or anon}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }


def supabase_get(path: str) -> Any:
    base = os.environ.get("SUPABASE_URL", "https://hbnpwphxjurvtydezwgh.supabase.co").rstrip("/")
    resp = httpx.get(base + path, headers=sb_headers(), timeout=30)
    resp.raise_for_status()
    return resp.json()


def supabase_patch(card_id: str | int, payload: dict[str, Any]) -> None:
    base = os.environ.get("SUPABASE_URL", "https://hbnpwphxjurvtydezwgh.supabase.co").rstrip("/")
    resp = httpx.patch(
        f"{base}/rest/v1/cards?id=eq.{card_id}",
        headers=sb_headers(),
        json=payload,
        timeout=20,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"patch failed {resp.status_code}: {resp.text[:300]}")


def load_pending_draft_cards() -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []
    offset = 0
    while True:
        batch = supabase_get(
            f"/rest/v1/cards?select={CARD_SELECT}"
            f"&draft_reply_status=eq.pending"
            f"&limit=500&offset={offset}"
        )
        if not isinstance(batch, list) or not batch:
            break
        cards.extend(batch)
        if len(batch) < 500:
            break
        offset += 500
    return cards


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    load_env()
    cards = load_pending_draft_cards()
    cleared: list[dict[str, Any]] = []
    kept = 0

    for card in cards:
        thread = parse_thread(card)
        stale, reason = should_regenerate_draft(card, thread)
        if not stale:
            kept += 1
            continue
        label = f"{card.get('business_name') or card.get('contact_name') or card.get('id')}"
        print(f"  clear stale draft: {label} — {reason}")
        if not args.dry_run:
            supabase_patch(card["id"], {
                "draft_reply": None,
                "draft_reply_status": "",
                "new_reply_at": None,
            })
        cleared.append({
            "id": card.get("id"),
            "brand": card.get("business_name"),
            "contact": card.get("contact_name"),
            "reason": reason,
        })

    summary = {
        "ok": True,
        "pending_checked": len(cards),
        "cleared": len(cleared),
        "kept": kept,
        "cleared_cards": cleared[:50],
        "dry_run": args.dry_run,
    }
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())