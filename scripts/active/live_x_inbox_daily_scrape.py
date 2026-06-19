#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import random
import re
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import parse_qs, urlparse


REPO_ROOT = Path("/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES")
X_ROOT = Path("/Users/asherweisberger/Documents/Codex/2026-06-05/most-efficient-way-to-get-leads")
X_OUT = X_ROOT / "outputs"
LIVE_CONTEXTS = X_OUT / "robert_x_dm_live_contexts.json"
STATE_PATH = X_OUT / "robert_x_dm_live_inbox_state.json"
RUN_LOG_PATH = X_OUT / "robert_x_dm_live_inbox_runs.json"
DAILY_NEW_THREADS_PATH = X_OUT / "robert_x_dm_live_inbox_new_threads.json"
INTAKE_BUILDER = X_ROOT / "work" / "build_daily_x_lead_intake.py"
NEW_LEADS_CSV = X_OUT / "x_dm_daily_new_leads.csv"
COMPANY_OS_X_ASSET = REPO_ROOT / "flow-v4" / "assets" / "x_dm_daily_intake.json"

BUSINESS_SIGNALS = (
    "collab",
    "collaboration",
    "sponsor",
    "sponsorship",
    "campaign",
    "partner",
    "partnership",
    "paid",
    "pricing",
    "rate",
    "budget",
    "invoice",
    "payment",
    "promo",
    "promotion",
    "feature",
    "interview",
    "podcast",
    "speaker",
    "speaking",
    "event",
    "summit",
    "conference",
    "demo",
    "product",
    "launch",
    "newsletter",
    "customer",
    "brand",
    "creator",
    "media",
    "press",
    "coverage",
)

NON_BUSINESS_SIGNALS = (
    "good morning",
    "good night",
    "thanks for following",
    "huge fan",
    "hello friend",
    "how are you",
)

GROUP_CHAT_SIGNALS = (
    " sent a post",
    " reacted ",
    "screenshots protected",
)

MONTHS = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}

WEEKDAYS = {
    "mon": 0,
    "tue": 1,
    "wed": 2,
    "thu": 3,
    "fri": 4,
    "sat": 5,
    "sun": 6,
}

INBOX_EXTRACT_JS = r"""
(() => {
  const clean = (s) => (s || '').replace(/\n{3,}/g, '\n\n').trim();
  const normalize = (href) => {
    if (!href) return '';
    try {
      return new URL(href, location.origin).toString();
    } catch (err) {
      return href;
    }
  };
  const links = Array.from(document.querySelectorAll('a[href*="/i/chat/"], a[href*="/messages/"]'));
  const seen = new Set();
  const rows = [];
  const timeRe = /(\d{1,2}:\d{2}\s*(AM|PM))|(\d+\s*[smhdw])|([A-Z][a-z]{2}\s+\d{1,2})|((Mon|Tue|Wed|Thu|Fri|Sat|Sun))/i;

  for (const link of links) {
    const href = normalize(link.getAttribute('href'));
    if (!href || seen.has(href)) continue;
    if (href.includes('/messages/settings')) continue;

    const rect = link.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
    if (rect.width < 120 || rect.height < 24) continue;

    const text = clean(link.textContent || link.innerText || '');
    if (!text) continue;

    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    let title = lines[0] || '';
    let timestamp = lines.find(line => timeRe.test(line)) || '';
    let preview = lines.slice(1).join(' ');

    if (!timestamp) {
      const match = text.match(timeRe);
      if (match) {
        timestamp = match[0];
        const idx = text.indexOf(timestamp);
        title = clean(text.slice(0, idx)) || title;
        preview = clean(text.slice(idx + timestamp.length)) || preview;
      }
    }

    seen.add(href);
    rows.push({
      url: href,
      title,
      timestamp,
      preview,
      lines,
      top: Math.round(rect.top),
      height: Math.round(rect.height),
    });
  }

  rows.sort((a, b) => a.top - b.top);
  return JSON.stringify({
    url: location.href,
    scrollY: Math.round(window.scrollY),
    viewportHeight: Math.round(window.innerHeight),
    count: rows.length,
    threads: rows,
  });
})()
"""

THREAD_EXTRACT_JS = r"""
(() => {
  const clean = (s) => (s || '').replace(/\n{3,}/g, '\n\n').trim();
  const panel = document.querySelector('[data-testid="dm-conversation-panel"]');
  const header = document.querySelector('[data-testid="dm-conversation-username"]')?.innerText || '';
  const entries = Array.from(document.querySelectorAll('[data-testid^="message-text-"]')).map((e) => {
    const r = e.getBoundingClientRect();
    const bg = getComputedStyle(e).backgroundColor;
    const isRobert = bg.includes('30, 156, 241') || bg.includes('29, 155, 240') || (panel && r.x + r.width / 2 > panel.getBoundingClientRect().x + panel.getBoundingClientRect().width / 2);
    return {
      sender: isRobert ? 'Robert' : 'Lead',
      text: clean(e.innerText),
      x: Math.round(r.x),
      width: Math.round(r.width),
      bg
    };
  }).filter((m) => m.text);
  return JSON.stringify({
    url: location.href,
    title: document.title,
    header: clean(header),
    message_count: entries.length,
    messages: entries.slice(-24)
  });
})()
"""


def clean(text: str | None) -> str:
    return re.sub(r"\n{3,}", "\n\n", (text or "").strip())


def compact(text: str | None, limit: int = 180) -> str:
    cleaned = re.sub(r"\s+", " ", clean(text))
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 1].rstrip() + "..."


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def read_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def write_json(path: Path, payload) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def osa(script: str) -> str:
    proc = subprocess.run(["osascript"], input=script, text=True, capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip())
    return proc.stdout.strip()


def ensure_chrome_tabs() -> tuple[int, int]:
    script = """
tell application "Google Chrome"
  if (count of windows) is 0 then make new window
  set w to front window
  repeat while (count of tabs of w) < 2
    make new tab at end of tabs of w
  end repeat
  return ((count of tabs of w) as text)
end tell
"""
    osa(script)
    return (1, 2)


def chrome_js(tab_index: int, js: str) -> str:
    escaped = js.replace("\\", "\\\\").replace('"', '\\"')
    return osa(
        f'tell application "Google Chrome"\n'
        f'  execute tab {tab_index} of front window javascript "{escaped}"\n'
        f'end tell\n'
    )


def open_url(tab_index: int, url: str, wait: float) -> None:
    escaped = url.replace('"', '\\"')
    osa(
        f'tell application "Google Chrome"\n'
        f'  set URL of tab {tab_index} of front window to "{escaped}"\n'
        f'end tell\n'
    )
    time.sleep(wait)


def scroll_inbox(tab_index: int, pixels: int) -> None:
    chrome_js(
        tab_index,
        f"window.scrollBy({{ top: {pixels}, left: 0, behavior: 'instant' }}); 'ok';",
    )
    time.sleep(1.0)


def thread_url_key(url: str) -> str:
    parsed = urlparse(url)
    if "recipient_id" in parse_qs(parsed.query):
        rid = parse_qs(parsed.query)["recipient_id"][0]
        return f"https://x.com/messages/compose?recipient_id={rid}"
    return url


def int_or_zero(value) -> int:
    try:
        return int(str(value).strip())
    except Exception:
        return 0


def parse_inbox_timestamp(value: str, today: datetime) -> str | None:
    text = clean(value)
    if not text:
        return None

    relative = re.fullmatch(r"(\d+)\s*([smhdw])", text.lower())
    if relative:
        count = int(relative.group(1))
        unit = relative.group(2)
        if unit == "s":
            dt = today - timedelta(seconds=count)
        elif unit == "m":
            dt = today - timedelta(minutes=count)
        elif unit == "h":
            dt = today - timedelta(hours=count)
        elif unit == "d":
            dt = today - timedelta(days=count)
        else:
            dt = today - timedelta(weeks=count)
        return dt.date().isoformat()

    weekday = text[:3].lower()
    if weekday in WEEKDAYS and len(text) <= 3:
        day_idx = WEEKDAYS[weekday]
        delta = (today.weekday() - day_idx) % 7
        return (today - timedelta(days=delta)).date().isoformat()

    month_match = re.fullmatch(r"([A-Za-z]{3,9})\s+(\d{1,2})(?:,\s*(\d{4}))?", text)
    if month_match:
        month = MONTHS.get(month_match.group(1)[:3].lower())
        day = int(month_match.group(2))
        year = int(month_match.group(3) or today.year)
        if month:
            try:
                return datetime(year, month, day).date().isoformat()
            except ValueError:
                return None

    if re.fullmatch(r"\d{1,2}:\d{2}\s*(AM|PM)", text, flags=re.I):
        return today.date().isoformat()

    iso_match = re.fullmatch(r"\d{4}-\d{2}-\d{2}", text)
    if iso_match:
        return text

    return None


def inbox_signature(candidate: dict) -> str:
    preview = compact(candidate.get("preview") or "", 120)
    return "|".join(
        [
            thread_url_key(candidate.get("url") or ""),
            clean(candidate.get("title") or ""),
            clean(candidate.get("timestamp") or ""),
            preview,
        ]
    )


def is_group_chat_candidate(candidate: dict) -> bool:
    url = thread_url_key(candidate.get("url") or "")
    text = " ".join(
        [
            candidate.get("title") or "",
            candidate.get("preview") or "",
        ]
    ).lower()

    if "/i/chat/g" in url:
        return True
    if any(signal in text for signal in GROUP_CHAT_SIGNALS):
        return True
    return False


def is_business_candidate(candidate: dict, thread: dict | None = None) -> bool:
    text_parts = [
        candidate.get("title") or "",
        candidate.get("preview") or "",
    ]
    if thread:
        text_parts.extend(msg.get("text") or "" for msg in (thread.get("messages") or [])[-8:])
    haystack = " ".join(text_parts).lower()
    if any(signal in haystack for signal in BUSINESS_SIGNALS):
        return True
    if any(signal in haystack for signal in NON_BUSINESS_SIGNALS):
        return False
    return False


def load_state() -> dict:
    state = read_json(
        STATE_PATH,
        {
            "updated_at": None,
            "processed_threads": {},
            "last_stop_reason": None,
            "last_stop_signature": None,
            "last_run_summary": None,
        },
    )
    if not isinstance(state.get("processed_threads"), dict):
        state["processed_threads"] = {}
    return state


def load_live_contexts() -> dict[str, dict]:
    payload = read_json(LIVE_CONTEXTS, {})
    return payload if isinstance(payload, dict) else {}


def scrape_thread(worker_tab: int, candidate: dict, wait: float) -> dict:
    open_url(worker_tab, candidate["url"], wait)
    raw = chrome_js(worker_tab, THREAD_EXTRACT_JS)
    data = json.loads(raw)
    data["scraped_at"] = now_iso()
    data["source"] = "live_inbox_daily"
    data["inbox_preview"] = candidate.get("preview") or ""
    data["inbox_timestamp"] = candidate.get("timestamp") or ""
    data["inbox_title"] = candidate.get("title") or ""
    data["inbox_signature"] = inbox_signature(candidate)
    return data


def sync_company_os_x_asset() -> None:
    queue_rows = read_json(X_OUT / "robert_x_dm_safe_manual_queue.json", [])
    rank_by_dm = {row.get("Open DM"): row.get("Rank") for row in queue_rows if row.get("Open DM")}
    lead_by_dm = {row.get("Open DM"): row.get("Lead") for row in queue_rows if row.get("Open DM")}

    rows = []
    with NEW_LEADS_CSV.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            dm = row.get("Open DM", "")
            rows.append(
                {
                    "rank": int(rank_by_dm.get(dm) or 0),
                    "newLead": str(row.get("New Lead") or "").upper() == "YES",
                    "seenInPriorScrape": str(row.get("Seen In Prior Scrape") or "").upper() == "YES",
                    "changedSincePriorScrape": str(row.get("Changed Since Prior Scrape") or "").upper() == "YES",
                    "newestDmDate": row.get("Newest DM Date", ""),
                    "leadScore": int_or_zero(row.get("Lead Score") or 0),
                    "xName": row.get("X Name", "") or lead_by_dm.get(dm, ""),
                    "xUsername": row.get("X Username", ""),
                    "openDm": dm,
                    "contactInfo": row.get("Contact Info", ""),
                    "contactEmails": row.get("Contact Emails", ""),
                    "contactPhones": row.get("Contact Phones", ""),
                    "leadType": row.get("Lead Type", ""),
                    "currentStatus": row.get("Current Status", ""),
                    "alreadyEmailedInRobertGmail": str(row.get("Already Emailed In Robert Gmail") or "").upper() == "YES",
                    "summaryForTeam": row.get("Summary For Team", ""),
                    "lastLeadMessage": row.get("Last Lead Message", ""),
                    "bestNextStep": row.get("Best Next Step", ""),
                    "recommendedOwner": row.get("Recommended Owner", ""),
                    "messageCount": int_or_zero(row.get("Message Count") or 0),
                }
            )
    rows.sort(key=lambda item: ((item.get("rank") or 10**9), -(item.get("leadScore") or 0), item.get("xName", "").lower()))
    write_json(COMPANY_OS_X_ASSET, rows)


def rebuild_intake() -> None:
    subprocess.run([sys.executable, str(INTAKE_BUILDER)], check=True)
    sync_company_os_x_asset()


def append_run_log(entry: dict) -> None:
    runs = read_json(RUN_LOG_PATH, [])
    if not isinstance(runs, list):
        runs = []
    runs.append(entry)
    runs = runs[-50:]
    write_json(RUN_LOG_PATH, runs)


def main() -> None:
    parser = argparse.ArgumentParser(description="Newest-first daily live scrape for Robert's X inbox.")
    parser.add_argument("--wait", type=float, default=4.5, help="Seconds to wait after each X navigation.")
    parser.add_argument("--between-min", type=float, default=1.5, help="Minimum pause between scraped threads.")
    parser.add_argument("--between-max", type=float, default=3.0, help="Maximum pause between scraped threads.")
    parser.add_argument("--recent-days", type=int, default=2, help="Stop once visible inbox rows are older than this many days.")
    parser.add_argument("--max-candidates", type=int, default=80, help="Hard cap on inbox rows to inspect per run.")
    parser.add_argument("--max-irrelevant-streak", type=int, default=25, help="Stop after this many non-business threads in a row.")
    parser.add_argument("--known-stop-streak", type=int, default=3, help="Stop once this many already-processed rows appear in a row.")
    parser.add_argument("--scroll-step", type=int, default=900, help="Pixels to scroll between inbox batches.")
    parser.add_argument("--max-scrolls", type=int, default=8, help="How many inbox scroll batches to inspect.")
    parser.add_argument("--rebuild-intake", action="store_true", help="Rebuild the X intake and sync Company OS after scraping.")
    args = parser.parse_args()

    inbox_tab, worker_tab = ensure_chrome_tabs()
    state = load_state()
    live_contexts = load_live_contexts()
    processed_threads = state["processed_threads"]
    today = datetime.now()

    open_url(inbox_tab, "https://x.com/i/chat", args.wait)

    seen_candidates: set[str] = set()
    scraped_new_threads: list[dict] = []
    inspected = 0
    relevant_count = 0
    irrelevant_streak = 0
    known_streak = 0
    stop_reason = "max_scrolls_reached"
    stop_signature = None

    for scroll_index in range(args.max_scrolls):
        raw = chrome_js(inbox_tab, INBOX_EXTRACT_JS)
        payload = json.loads(raw)
        candidates = payload.get("threads") or []

        for candidate in candidates:
            url = thread_url_key(candidate.get("url") or "")
            if not url or url in seen_candidates:
                continue
            seen_candidates.add(url)
            inspected += 1

            candidate["url"] = url
            candidate["parsedDate"] = parse_inbox_timestamp(candidate.get("timestamp") or "", today)
            signature = inbox_signature(candidate)
            prior = processed_threads.get(url)

            if is_group_chat_candidate(candidate):
                processed_threads[url] = {
                    "title": candidate.get("title") or "",
                    "timestamp": candidate.get("timestamp") or "",
                    "parsed_date": candidate.get("parsedDate"),
                    "preview": candidate.get("preview") or "",
                    "inbox_signature": signature,
                    "processed_at": now_iso(),
                    "business_candidate": False,
                    "skipped_as": "group_chat",
                    "message_count": 0,
                }
                irrelevant_streak += 1
                print(
                    f"[{inspected}] {candidate.get('title') or 'Untitled'} | "
                    f"{candidate.get('timestamp') or 'no-time'} | group-skip",
                    flush=True,
                )
                if irrelevant_streak >= args.max_irrelevant_streak:
                    stop_reason = "irrelevant_streak"
                    stop_signature = signature
                    break
                continue

            if prior and prior.get("inbox_signature") == signature:
                known_streak += 1
                if known_streak >= args.known_stop_streak:
                    stop_reason = "known_streak"
                    stop_signature = signature
                    break
                continue

            known_streak = 0

            parsed_date = candidate.get("parsedDate")
            if parsed_date:
                age_days = (today.date() - datetime.fromisoformat(parsed_date).date()).days
                if age_days > args.recent_days:
                    stop_reason = f"outside_recent_window:{parsed_date}"
                    stop_signature = signature
                    break

            thread = scrape_thread(worker_tab, candidate, args.wait)
            live_contexts[url] = thread
            write_json(LIVE_CONTEXTS, live_contexts)

            business = is_business_candidate(candidate, thread)
            processed_threads[url] = {
                "title": candidate.get("title") or "",
                "timestamp": candidate.get("timestamp") or "",
                "parsed_date": parsed_date,
                "preview": candidate.get("preview") or "",
                "inbox_signature": signature,
                "processed_at": now_iso(),
                "business_candidate": business,
                "message_count": thread.get("message_count") or 0,
            }

            if business:
                relevant_count += 1
                irrelevant_streak = 0
                scraped_new_threads.append(
                    {
                        "url": url,
                        "title": candidate.get("title") or "",
                        "timestamp": candidate.get("timestamp") or "",
                        "parsedDate": parsed_date,
                        "preview": candidate.get("preview") or "",
                        "header": thread.get("header") or "",
                        "messageCount": thread.get("message_count") or 0,
                        "latestLeadContext": compact(" ".join(msg.get("text") or "" for msg in (thread.get("messages") or [])[-3:]), 320),
                    }
                )
            else:
                irrelevant_streak += 1
                if irrelevant_streak >= args.max_irrelevant_streak:
                    stop_reason = "irrelevant_streak"
                    stop_signature = signature
                    break

            if inspected >= args.max_candidates:
                stop_reason = "max_candidates"
                stop_signature = signature
                break

            pause = random.uniform(args.between_min, args.between_max)
            print(
                f"[{inspected}] {candidate.get('title') or 'Untitled'} | {candidate.get('timestamp') or 'no-time'} | "
                f"{'business' if business else 'skip'} | pause {pause:.1f}s",
                flush=True,
            )
            time.sleep(pause)

        if stop_reason != "max_scrolls_reached":
            break

        if inspected >= args.max_candidates:
            stop_reason = "max_candidates"
            break

        scroll_inbox(inbox_tab, args.scroll_step)

    state["updated_at"] = now_iso()
    state["last_stop_reason"] = stop_reason
    state["last_stop_signature"] = stop_signature
    state["last_run_summary"] = {
        "inspected": inspected,
        "relevant_count": relevant_count,
        "irrelevant_streak_end": irrelevant_streak,
        "known_stop_streak": args.known_stop_streak,
        "recent_days": args.recent_days,
    }
    state["processed_threads"] = processed_threads
    write_json(STATE_PATH, state)
    write_json(DAILY_NEW_THREADS_PATH, scraped_new_threads)

    run_summary = {
        "ran_at": now_iso(),
        "stop_reason": stop_reason,
        "stop_signature": stop_signature,
        "inspected": inspected,
        "relevant_count": relevant_count,
        "new_threads": len(scraped_new_threads),
    }
    append_run_log(run_summary)

    if args.rebuild_intake:
        rebuild_intake()

    print(json.dumps(run_summary, indent=2), flush=True)


if __name__ == "__main__":
    main()
