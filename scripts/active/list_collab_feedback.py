#!/usr/bin/env python3
"""List submitted collaborator feedback (team view)."""

from __future__ import annotations

import json
import os
import sys

import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://hbnpwphxjurvtydezwgh.supabase.co").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def main() -> int:
    if not SERVICE_KEY:
        print("ERROR: Set SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
        return 1

    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/collab_feedback"
        "?select=id,card_id,brand,contact_name,contact_email,contact_handle,source_channel,deliverable,status,overall_score,nps,would_again,went_well,improve,submitted_at"
        "&status=eq.submitted&order=submitted_at.desc&limit=50",
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
        },
        timeout=30,
    )
    if not resp.ok:
        print(f"ERROR: {resp.status_code} {resp.text[:300]}", file=sys.stderr)
        return 1

    rows = resp.json()
    if not rows:
        print("No submitted feedback yet.")
        return 0

    for row in rows:
        print(
            f"[{row.get('submitted_at', '')[:10]}] {row.get('brand', '?')} "
            f"· overall {row.get('overall_score')}/10 · NPS {row.get('nps')} "
            f"· again={row.get('would_again')}"
        )
        if row.get("went_well"):
            print(f"  + {row['went_well'][:160]}")
        if row.get("improve"):
            print(f"  - {row['improve'][:160]}")
        print()
    print(json.dumps(rows, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())