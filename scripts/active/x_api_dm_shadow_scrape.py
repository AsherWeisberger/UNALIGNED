#!/usr/bin/env python3
"""
Shadow X API DM poller — runs parallel to Chrome live_x_inbox_daily_scrape.py.

Does NOT replace production intake. Writes to ~/.config/google-credentials/x_api_shadow/
for side-by-side comparison via compare_x_scrape_sources.py.

Auth (first match wins):
  X_ACCESS_TOKEN env
  ~/.config/google-credentials/x-api-oauth-token.json  (OAuth user token JSON)
  xurl cache via subprocess (if xurl is installed)

Setup once on Mac Studio:
  xurl auth oauth2 --headless   # or browser login
  # scopes need dm.read tweet.read users.read
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

STATE_DIR = Path.home() / ".config/google-credentials"
ENV_FILE = STATE_DIR / "unaligned-scraper.env"
X_API_ENV = STATE_DIR / "x-api.env"
SHADOW_DIR = STATE_DIR / "x_api_shadow"
TOKEN_FILE = STATE_DIR / "x-api-oauth-token.json"
SUMMARY_FILE = SHADOW_DIR / "x_api_shadow_summary.json"
CONTEXTS_FILE = SHADOW_DIR / "x_api_shadow_contexts.json"
RUN_LOG = SHADOW_DIR / "x_api_shadow_runs.json"

API_BASE = "https://api.x.com/2"
DM_EVENT_COST = 0.010
USER_READ_COST = 0.010

BUSINESS_SIGNALS = (
    "collab", "collaboration", "sponsor", "sponsorship", "campaign", "partner",
    "partnership", "paid", "pricing", "rate", "budget", "invoice", "payment",
    "promo", "promotion", "feature", "interview", "podcast", "speaker", "speaking",
    "event", "summit", "conference", "demo", "product", "launch", "newsletter",
    "customer", "brand", "creator", "media", "press", "coverage",
)


def load_env() -> None:
    for path in (X_API_ENV, ENV_FILE):
        if not path.exists():
            continue
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            if line.startswith("export "):
                line = line[len("export "):].strip()
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_json(path: Path, default=None):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def bearer_token() -> str:
    if TOKEN_FILE.exists():
        data = read_json(TOKEN_FILE, {})
        if isinstance(data, dict):
            for key in ("access_token", "token"):
                if data.get(key):
                    return str(data[key]).strip()
    token = os.environ.get("X_ACCESS_TOKEN", "").strip()
    if token:
        return token
    try:
        proc = subprocess.run(
            ["xurl", "auth", "print-token"],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if proc.returncode == 0 and proc.stdout.strip():
            return proc.stdout.strip()
    except Exception:
        pass
    return ""


def is_business_text(text: str) -> bool:
    haystack = (text or "").lower()
    return any(signal in haystack for signal in BUSINESS_SIGNALS)


def conversation_key(conv_id: str) -> str:
    return f"https://x.com/messages/compose?conversation_id={conv_id}"


def fetch_dm_events(token: str, max_pages: int, since: datetime | None) -> tuple[list[dict], dict]:
    headers = {"Authorization": f"Bearer {token}"}
    params = {
        "max_results": 100,
        "event_types": "MessageCreate",
        "dm_event.fields": "id,event_type,text,created_at,sender_id,dm_conversation_id",
        "expansions": "sender_id",
        "user.fields": "id,name,username",
    }
    events: list[dict] = []
    users: dict[str, dict] = {}
    pages = 0
    meta = {"pages": 0, "stopped_early": None}

    next_token = None
    while pages < max_pages:
        page_params = dict(params)
        if next_token:
            page_params["pagination_token"] = next_token
        resp = httpx.get(f"{API_BASE}/dm_events", headers=headers, params=page_params, timeout=30)
        if resp.status_code >= 400:
            raise RuntimeError(f"dm_events {resp.status_code}: {resp.text[:400]}")
        payload = resp.json()
        batch = payload.get("data") or []
        for user in payload.get("includes", {}).get("users") or []:
            users[str(user.get("id"))] = user
        if not batch:
            break
        for event in batch:
            created_raw = event.get("created_at")
            if since and created_raw:
                try:
                    created = datetime.fromisoformat(created_raw.replace("Z", "+00:00"))
                    if created < since:
                        meta["stopped_early"] = "reached_since_cutoff"
                        return events, {"users": users, **meta}
                except Exception:
                    pass
            events.append(event)
        pages += 1
        meta["pages"] = pages
        next_token = (payload.get("meta") or {}).get("next_token")
        if not next_token:
            break
    return events, {"users": users, **meta}


def build_threads(events: list[dict], users: dict[str, dict], robert_id: str | None) -> dict[str, dict]:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for event in events:
        conv = str(event.get("dm_conversation_id") or "")
        if not conv:
            continue
        grouped[conv].append(event)

    contexts = {}
    for conv_id, conv_events in grouped.items():
        conv_events.sort(key=lambda e: e.get("created_at") or "")
        messages = []
        for event in conv_events[-24:]:
            sender_id = str(event.get("sender_id") or "")
            user = users.get(sender_id) or {}
            sender_name = user.get("name") or user.get("username") or sender_id
            is_robert = robert_id and sender_id == robert_id
            messages.append({
                "sender": "Robert" if is_robert else "Lead",
                "text": event.get("text") or "",
                "sender_id": sender_id,
                "sender_username": user.get("username") or "",
                "created_at": event.get("created_at"),
            })
        latest = conv_events[-1] if conv_events else {}
        latest_sender = users.get(str(latest.get("sender_id") or ""), {})
        title = latest_sender.get("name") or latest_sender.get("username") or "Unknown"
        preview = latest.get("text") or ""
        thread_blob = " ".join(m.get("text") or "" for m in messages)
        contexts[conversation_key(conv_id)] = {
            "url": conversation_key(conv_id),
            "conversation_id": conv_id,
            "title": title,
            "header": title,
            "preview": preview,
            "message_count": len(messages),
            "messages": messages,
            "business_candidate": is_business_text(thread_blob),
            "source": "x_api_shadow",
            "scraped_at": utc_now(),
            "api_note": "Legacy DM API — may not include encrypted /i/chat threads.",
        }
    return contexts


def resolve_robert_id(token: str) -> str | None:
    headers = {"Authorization": f"Bearer {token}"}
    resp = httpx.get(f"{API_BASE}/users/me", headers=headers, params={"user.fields": "id,name,username"}, timeout=20)
    if resp.status_code >= 400:
        return os.environ.get("ROBERT_X_USER_ID")
    data = resp.json().get("data") or {}
    return str(data.get("id") or "") or None


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Shadow X API DM poller for side-by-side comparison.")
    parser.add_argument("--recent-days", type=int, default=int(os.environ.get("X_API_SHADOW_RECENT_DAYS", "1")))
    parser.add_argument("--max-pages", type=int, default=int(os.environ.get("X_API_SHADOW_MAX_PAGES", "3")))
    args = parser.parse_args()

    load_env()
    token = bearer_token()
    if not token:
        summary = {
            "ok": False,
            "ran_at": utc_now(),
            "error": "missing_x_access_token",
            "setup": [
                "Create X developer app with dm.read + users.read + tweet.read",
                "Run: xurl auth oauth2 (sign in as Robert)",
                "Or save token JSON to ~/.config/google-credentials/x-api-oauth-token.json",
                "Or set X_ACCESS_TOKEN in unaligned-scraper.env",
            ],
        }
        write_json(SUMMARY_FILE, summary)
        print(json.dumps(summary, indent=2))
        return 2

    since = datetime.now(timezone.utc) - timedelta(days=max(args.recent_days, 1))
    try:
        robert_id = resolve_robert_id(token)
        events, meta = fetch_dm_events(token, args.max_pages, since)
        contexts = build_threads(events, meta.get("users") or {}, robert_id)
        business = [c for c in contexts.values() if c.get("business_candidate")]
        estimated_cost = round(len(events) * DM_EVENT_COST + len(meta.get("users") or {}) * USER_READ_COST, 3)
        summary = {
            "ok": True,
            "ran_at": utc_now(),
            "recent_days": args.recent_days,
            "robert_user_id": robert_id,
            "dm_events_fetched": len(events),
            "conversations": len(contexts),
            "business_conversations": len(business),
            "estimated_api_cost_usd": estimated_cost,
            "meta": meta,
            "caveat": "Shadow lane uses legacy dm_events. Chrome scraper reads x.com/i/chat UI which may differ.",
        }
        write_json(CONTEXTS_FILE, contexts)
        write_json(SUMMARY_FILE, summary)
        runs = read_json(RUN_LOG, [])
        if not isinstance(runs, list):
            runs = []
        runs.append(summary)
        write_json(RUN_LOG, runs[-30:])
        print(json.dumps(summary, indent=2))
        return 0
    except Exception as exc:
        summary = {
            "ok": False,
            "ran_at": utc_now(),
            "error": str(exc),
        }
        write_json(SUMMARY_FILE, summary)
        print(json.dumps(summary, indent=2))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())