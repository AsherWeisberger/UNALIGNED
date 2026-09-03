#!/usr/bin/env python3
"""Sanity-check returning-collab watch coverage on the live board."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ACTIVE_DIR = Path(__file__).resolve().parent
if str(ACTIVE_DIR) not in sys.path:
    sys.path.insert(0, str(ACTIVE_DIR))

from gmail_delta_sync import (  # noqa: E402
    CLOSED_RESURFACE_STAGES,
    closed_cards_for_watch,
    load_cards,
    load_env,
)


def main() -> int:
    load_env()
    cards = load_cards()
    closed = [
        c for c in cards
        if str(c.get("list_id") or "") in CLOSED_RESURFACE_STAGES
        and str(c.get("gmail_thread_id") or "").strip()
    ]
    watch_pool = closed_cards_for_watch(cards, limit=10_000)
    sample = closed_cards_for_watch(cards, limit=5)
    out = {
        "ok": True,
        "closed_with_gmail_thread": len(closed),
        "watch_pool_size": len(watch_pool),
        "next_watch_batch": [
            {
                "id": c.get("id"),
                "business": c.get("business_name") or c.get("title"),
                "stage": c.get("list_id"),
                "thread_id": c.get("gmail_thread_id"),
            }
            for c in sample
        ],
    }
    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())