#!/usr/bin/env python3
"""Side-by-side report: Chrome live scraper vs X API shadow lane."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

STATE_DIR = Path.home() / ".config/google-credentials"
X_OUT = Path.home() / "Documents/Codex/2026-06-05/most-efficient-way-to-get-leads/outputs"
REPO = Path("/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES")

CHROME_CONTEXTS = X_OUT / "robert_x_dm_live_contexts.json"
CHROME_NEW = X_OUT / "robert_x_dm_live_inbox_new_threads.json"
CHROME_HEALTH = REPO / "flow-v4/assets/x_scraper_health.json"
API_CONTEXTS = STATE_DIR / "x_api_shadow/x_api_shadow_contexts.json"
API_SUMMARY = STATE_DIR / "x_api_shadow/x_api_shadow_summary.json"
REPORT = STATE_DIR / "x_api_shadow/x_scrape_side_by_side.json"


def read_json(path: Path, default=None):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def thread_key(url: str) -> str:
    if not url:
        return ""
    parsed = urlparse(url)
    if "recipient_id=" in url:
        qs = parse_qs(parsed.query)
        rid = (qs.get("recipient_id") or [""])[0]
        return f"dm:{rid}" if rid else ""
    if "conversation_id=" in url:
        qs = parse_qs(parsed.query)
        cid = (qs.get("conversation_id") or [""])[0]
        return f"dm:{cid}" if cid else ""
    if "/i/chat/" in url:
        slug = url.rstrip("/").split("/")[-1]
        return f"dm:{slug}" if slug else ""
    for prefix in ("chat:", "conversation:", "recipient:", "dm:"):
        if url.startswith(prefix):
            return f"dm:{url[len(prefix):]}"
    return url


def compact(text: str, limit: int = 120) -> str:
    return " ".join((text or "").split())[:limit]


def main() -> int:
    chrome_contexts = read_json(CHROME_CONTEXTS, {})
    api_contexts = read_json(API_CONTEXTS, {})
    chrome_new = read_json(CHROME_NEW, [])
    chrome_health = read_json(CHROME_HEALTH, {})
    api_summary = read_json(API_SUMMARY, {})

    if not isinstance(chrome_contexts, dict):
        chrome_contexts = {}
    if not isinstance(api_contexts, dict):
        api_contexts = {}

    chrome_by_key = {thread_key(url): {"url": url, **ctx} for url, ctx in chrome_contexts.items()}
    api_by_key = {thread_key(url): {"url": url, **ctx} for url, ctx in api_contexts.items()}

    chrome_keys = set(chrome_by_key)
    api_keys = set(api_by_key)
    overlap = chrome_keys & api_keys
    chrome_only = sorted(chrome_keys - api_keys)
    api_only = sorted(api_keys - chrome_keys)

    mismatches = []
    for key in sorted(overlap):
        c = chrome_by_key[key]
        a = api_by_key[key]
        c_preview = compact(c.get("preview") or (c.get("messages") or [{}])[-1].get("text", ""))
        a_preview = compact(a.get("preview") or (a.get("messages") or [{}])[-1].get("text", ""))
        if c_preview != a_preview:
            mismatches.append({
                "key": key,
                "chrome_url": c.get("url"),
                "api_url": a.get("url"),
                "chrome_preview": c_preview,
                "api_preview": a_preview,
                "chrome_business": c.get("business_candidate"),
                "api_business": a.get("business_candidate"),
            })

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "chrome": {
            "health": chrome_health,
            "context_count": len(chrome_contexts),
            "new_threads_last_run": len(chrome_new) if isinstance(chrome_new, list) else 0,
            "source": str(CHROME_CONTEXTS),
        },
        "api_shadow": {
            "summary": api_summary,
            "context_count": len(api_contexts),
            "source": str(API_CONTEXTS),
        },
        "comparison": {
            "overlap_threads": len(overlap),
            "chrome_only_count": len(chrome_only),
            "api_only_count": len(api_only),
            "preview_mismatches": len(mismatches),
            "chrome_only_sample": chrome_only[:15],
            "api_only_sample": api_only[:15],
            "mismatch_sample": mismatches[:15],
        },
        "verdict": _verdict(chrome_health, api_summary, len(overlap), len(chrome_only), len(api_only)),
        "monthly_cost_estimate_usd": {
            "shadow_run": api_summary.get("estimated_api_cost_usd"),
            "projected_daily_if_replaced": round((api_summary.get("estimated_api_cost_usd") or 0) * 1.0, 2),
            "projected_monthly_if_replaced": round((api_summary.get("estimated_api_cost_usd") or 0) * 30, 2),
        },
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


def _verdict(chrome_health, api_summary, overlap, chrome_only, api_only) -> str:
    if not api_summary.get("ok"):
        return "API shadow not ready — set up X OAuth token first, then rerun shadow + compare."
    if overlap == 0 and (chrome_only or api_only):
        return "No URL overlap yet — likely Chrome is on /i/chat while API returns legacy DM conversation IDs. Compare message text manually before cutover."
    if api_only > chrome_only * 2:
        return "API sees more threads than Chrome last cached — API may be fresher or Chrome run was shallow."
    if chrome_only > api_only * 2:
        return "Chrome sees threads API missed — encrypted XChat may not be in dm_events yet."
    return "Partial overlap — review preview mismatches, then run shadow for 7 days before switching production."


if __name__ == "__main__":
    raise SystemExit(main())