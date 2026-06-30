#!/usr/bin/env python3
"""Write morning-cron + delta-sync status into ops_health for the dashboard."""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx

ENV_FILE = Path.home() / ".config/google-credentials/unaligned-scraper.env"
STATE_DIR = Path.home() / ".config/google-credentials"


def load_env() -> None:
    if not ENV_FILE.exists():
        return
    for raw in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export "):].strip()
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def sb_headers() -> dict:
    key = os.environ.get("SUPABASE_ANON_KEY", "")
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }


def upsert_ops_health(fields: dict) -> None:
    url = os.environ.get("SUPABASE_URL", "https://hbnpwphxjurvtydezwgh.supabase.co")
    fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    resp = httpx.patch(
        f"{url}/rest/v1/ops_health?id=eq.1",
        headers=sb_headers(),
        json=fields,
        timeout=20,
    )
    if resp.status_code not in (200, 204):
        print(f"ops_health patch failed: {resp.status_code} {resp.text[:300]}", file=sys.stderr)


def main() -> int:
    load_env()
    if not os.environ.get("SUPABASE_ANON_KEY"):
        print("SUPABASE_ANON_KEY missing", file=sys.stderr)
        return 1

    args = sys.argv[1:]
    mode = args[0] if args else "cron_end"

    fields: dict = {}
    now = datetime.now(timezone.utc).isoformat()

    if mode == "cron_start":
        fields = {
            "scraper_last_run": now,
            "scraper_last_status": "running",
        }
    elif mode == "cron_end":
        robert_ok = os.environ.get("PIPELINE_ROBERT_OK", "0") == "1"
        asher_ok = os.environ.get("PIPELINE_ASHER_OK", "0") == "1"
        thread_sync = read_json(STATE_DIR / "codex_thread_sync_status.json")
        candidate_sync = read_json(STATE_DIR / "codex_asher_candidate_write_status.json")
        status = "ok" if (robert_ok or asher_ok) else "degraded"
        if not robert_ok and not asher_ok:
            status = "failed"
        fields = {
            "scraper_last_run": now,
            "scraper_last_status": status,
            "scraper_robert_ok": robert_ok,
            "scraper_asher_ok": asher_ok,
            "cards_patched": int(thread_sync.get("written", 0) or 0),
            "cards_created": int(candidate_sync.get("written", 0) or 0),
        }
        if status == "failed" and os.environ.get("TELEGRAM_TOKEN") and os.environ.get("TELEGRAM_CHAT_ID"):
            try:
                httpx.post(
                    f"https://api.telegram.org/bot{os.environ['TELEGRAM_TOKEN']}/sendMessage",
                    json={
                        "chat_id": os.environ["TELEGRAM_CHAT_ID"],
                        "text": "UNALIGNED morning Gmail sync FAILED — both mailboxes skipped. Re-auth tokens.",
                    },
                    timeout=15,
                )
            except Exception:
                pass
    elif mode == "delta":
        delta = read_json(STATE_DIR / "gmail_delta_asher_status.json")
        fields = {
            "gmail_delta_at": now,
            "gmail_delta_status": "ok" if delta.get("ok", True) else "failed",
            "cards_patched": int(delta.get("patched", delta.get("written", 0)) or 0),
        }
    else:
        print(f"unknown mode: {mode}", file=sys.stderr)
        return 1

    upsert_ops_health(fields)
    print(json.dumps({"ok": True, "mode": mode, "fields": fields}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())