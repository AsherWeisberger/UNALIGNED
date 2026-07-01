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
REPO_ROOT = Path("/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES")


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


def send_telegram(text: str) -> bool:
    token = os.environ.get("TELEGRAM_TOKEN", "").strip()
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if not token or not chat_id:
        return False
    try:
        resp = httpx.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text},
            timeout=15,
        )
        return resp.status_code == 200
    except Exception:
        return False


def morning_telegram_summary(
    *,
    status: str,
    robert_ok: bool,
    asher_ok: bool,
    thread_sync: dict,
    candidate_sync: dict,
) -> str:
    x_health = read_json(REPO_ROOT / "flow-v4/assets/x_scraper_health.json")
    x_bridge = read_json(STATE_DIR / "x_bridge_status.json")
    x_log_tail = ""
    live_log = STATE_DIR / "live_x_inbox_scraper.log"
    try:
        lines = live_log.read_text(encoding="utf-8", errors="replace").splitlines()
        x_log_tail = "\n".join(lines[-3:])
    except Exception:
        pass

    x_ok = bool(x_health.get("ok")) and int(x_health.get("inspected") or 0) > 0
    x_line = "X scrape: "
    if x_health.get("ran_at"):
        x_line += (
            f"{'OK' if x_ok else 'ISSUE'} — inspected {x_health.get('inspected', 0)}, "
            f"business {x_health.get('relevant_count', x_health.get('new_threads', 0))}, "
            f"stop={x_health.get('stop_reason', 'n/a')}"
        )
    else:
        x_line += "no health record"

    bridge_line = "X bridge: "
    if x_bridge:
        bridge_line += (
            f"{x_bridge.get('inserted', 0)} new, {x_bridge.get('updated', 0)} refreshed, "
            f"{x_bridge.get('enriched', 0)} enriched, {x_bridge.get('merged_gmail_cards', 0)} gmail merges"
        )
    else:
        bridge_line += "not run"

    gmail_line = (
        f"Gmail: Robert {'OK' if robert_ok else 'SKIP'} | Asher {'OK' if asher_ok else 'SKIP'} | "
        f"threads patched {int(thread_sync.get('written', 0) or 0)} | "
        f"candidates {int(candidate_sync.get('written', 0) or 0)}"
    )

    status_emoji = {"ok": "✅", "degraded": "⚠️", "failed": "🚨"}.get(status, "ℹ️")
    lines = [
        f"{status_emoji} UNALIGNED morning run — {status.upper()}",
        gmail_line,
        x_line,
        bridge_line,
    ]
    if not x_ok and x_log_tail:
        if "Apple Events" in x_log_tail or "No logged-in X tab" in x_log_tail:
            lines.append("X fix: Chrome open + pinned https://x.com/i/chat + Allow JS from Apple Events")
    return "\n".join(lines)


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
        send_telegram("🌅 UNALIGNED morning scraper started (Gmail + X + pipeline)")
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
        send_telegram(
            morning_telegram_summary(
                status=status,
                robert_ok=robert_ok,
                asher_ok=asher_ok,
                thread_sync=thread_sync,
                candidate_sync=candidate_sync,
            )
        )
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