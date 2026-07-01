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
GOOGLE_STATE_DIR = Path.home() / ".config" / "google-credentials"
LIVE_CONTEXTS = X_OUT / "robert_x_dm_live_contexts.json"
STATE_PATH = X_OUT / "robert_x_dm_live_inbox_state.json"
RUN_LOG_PATH = X_OUT / "robert_x_dm_live_inbox_runs.json"
DAILY_NEW_THREADS_PATH = X_OUT / "robert_x_dm_live_inbox_new_threads.json"
INTAKE_BUILDER = X_ROOT / "work" / "build_daily_x_lead_intake.py"
NEW_LEADS_CSV = X_OUT / "x_dm_daily_new_leads.csv"
COMPANY_OS_X_ASSET = REPO_ROOT / "flow-v4" / "assets" / "x_dm_daily_intake.json"
COMPANY_OS_X_HEALTH = REPO_ROOT / "flow-v4" / "assets" / "x_scraper_health.json"
ROBERT_HANDOFF_STATE = GOOGLE_STATE_DIR / "robert_handoff_operator_state.json"

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
    "rates",
    "budget",
    "brand deal",
    "ambassador",
    "demo",
    "product",
    "platform",
    "startup",
    "launch",
    "tool",
    "agent",
    "robot",
    "framework",
    "software",
    "saas",
    "beta",
    "trial",
    "integrat",
    "pilot",
    "customer",
)

NON_BUSINESS_SIGNALS = (
    "good morning",
    "good night",
    "thanks for following",
    "huge fan",
    "hello friend",
    "how are you",
    "any rts",
    "retweet",
    "impressions would be great",
    "quote tweet",
    "sent a post",
    "reacted ",
    "love your work",
    "big fan",
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
  const isScrollable = (el) => {
    if (!el) return false;
    const style = getComputedStyle(el);
    const overflowY = style.overflowY || '';
    return /(auto|scroll|overlay)/i.test(overflowY) && el.scrollHeight > el.clientHeight + 20;
  };
  const scrollRootFor = (node) => {
    let current = node;
    while (current && current !== document.body) {
      if (isScrollable(current)) return current;
      current = current.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  };
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
  const sampleLink = links.find((link) => clean(link.innerText || link.textContent || ''));
  const scrollRoot = scrollRootFor(sampleLink || document.body);

  for (const link of links) {
    const href = normalize(link.getAttribute('href'));
    if (!href || seen.has(href)) continue;
    if (href.includes('/messages/settings')) continue;

    const rect = link.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
    if (rect.width < 120 || rect.height < 24) continue;

    const text = clean(link.innerText || link.textContent || '');
    if (!text) continue;

    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    let title = lines[0] || '';
    let timestamp = lines.find(line => timeRe.test(line)) || '';
    let preview = lines.slice(1).filter(line => line !== timestamp).join(' ');

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
    scrollRootTag: scrollRoot?.tagName || '',
    scrollRootClass: scrollRoot?.className || '',
    scrollTop: Math.round(scrollRoot?.scrollTop || 0),
    scrollHeight: Math.round(scrollRoot?.scrollHeight || 0),
    clientHeight: Math.round(scrollRoot?.clientHeight || 0),
    count: rows.length,
    threads: rows,
  });
})()
"""

INBOX_SCROLL_JS = r"""
((pixels) => {
  const clean = (s) => (s || '').replace(/\n{3,}/g, '\n\n').trim();
  const isScrollable = (el) => {
    if (!el) return false;
    const style = getComputedStyle(el);
    const overflowY = style.overflowY || '';
    return /(auto|scroll|overlay)/i.test(overflowY) && el.scrollHeight > el.clientHeight + 20;
  };
  const scrollRootFor = (node) => {
    let current = node;
    while (current && current !== document.body) {
      if (isScrollable(current)) return current;
      current = current.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  };
  const links = Array.from(document.querySelectorAll('a[href*="/i/chat/"], a[href*="/messages/"]'));
  const sampleLink = links.find((link) => clean(link.innerText || link.textContent || ''));
  const scrollRoot = scrollRootFor(sampleLink || document.body);
  const visibleLinks = links.filter((link) => {
    const rect = link.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight && rect.width > 120 && rect.height > 24;
  });
  const lastVisibleLink = visibleLinks[visibleLinks.length - 1] || sampleLink;
  const before = Math.round(scrollRoot?.scrollTop || 0);
  const beforeHref = lastVisibleLink?.getAttribute('href') || '';
  const railTarget = lastVisibleLink || scrollRoot || document.body;
  const targetRect = railTarget?.getBoundingClientRect ? railTarget.getBoundingClientRect() : null;
  if (lastVisibleLink && typeof lastVisibleLink.scrollIntoView === 'function') {
    lastVisibleLink.scrollIntoView({ block: 'end', inline: 'nearest', behavior: 'instant' });
  }
  const jump = Math.max(pixels, Math.round((scrollRoot?.clientHeight || pixels) * 0.92));
  for (let i = 0; i < 3; i += 1) {
    railTarget?.dispatchEvent?.(new WheelEvent('wheel', {
      deltaY: Math.round(jump / 3),
      bubbles: true,
      cancelable: true,
      clientX: targetRect ? Math.round(targetRect.left + Math.min(40, targetRect.width / 2)) : 0,
      clientY: targetRect ? Math.round(targetRect.bottom - 18) : 0,
    }));
  }
  if (scrollRoot && typeof scrollRoot.scrollBy === 'function') {
    scrollRoot.scrollBy({ top: jump, left: 0, behavior: 'instant' });
  } else {
    window.scrollBy({ top: jump, left: 0, behavior: 'instant' });
  }
  const after = Math.round(scrollRoot?.scrollTop || 0);
  const progressbar = document.querySelector('[role="progressbar"], [aria-label*="Loading" i]');
  const refreshedLinks = Array.from(document.querySelectorAll('a[href*="/i/chat/"], a[href*="/messages/"]')).filter((link) => {
    const rect = link.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight && rect.width > 120 && rect.height > 24;
  });
  const lastAfterLink = refreshedLinks[refreshedLinks.length - 1];
  return JSON.stringify({
    before,
    after,
    moved: after - before,
    beforeHref,
    afterHref: lastAfterLink?.getAttribute('href') || '',
    progressbarVisible: !!progressbar,
    scrollHeight: Math.round(scrollRoot?.scrollHeight || 0),
    clientHeight: Math.round(scrollRoot?.clientHeight || 0),
    tag: scrollRoot?.tagName || '',
  });
})(__PIXELS__)
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

NATIVE_SCROLL_JXA = r"""
ObjC.import('ApplicationServices');

function mouseClick(x, y) {
  const point = $.CGPointMake(x, y);
  $.CGWarpMouseCursorPosition(point);
  delay(0.05);
  const down = $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseDown, point, $.kCGMouseButtonLeft);
  $.CGEventPost($.kCGHIDEventTap, down);
  const up = $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseUp, point, $.kCGMouseButtonLeft);
  $.CGEventPost($.kCGHIDEventTap, up);
}

function wheel(x, y, amount, repeats) {
  const point = $.CGPointMake(x, y);
  $.CGWarpMouseCursorPosition(point);
  delay(0.03);
  for (let i = 0; i < repeats; i += 1) {
    const evt = $.CGEventCreateScrollWheelEvent(null, $.kCGScrollEventUnitLine, 1, amount);
    $.CGEventPost($.kCGHIDEventTap, evt);
    delay(0.04);
  }
}

const x = __X__;
const y = __Y__;
mouseClick(x, y);
wheel(x, y, __AMOUNT__, __REPEATS__);
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


def osa_jxa(script: str) -> str:
    proc = subprocess.run(["osascript", "-l", "JavaScript"], input=script, text=True, capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip())
    return proc.stdout.strip()


def close_automated_chrome_profiles() -> None:
    """Kill temporary webdriver Chrome profiles before using AppleScript.

    The X scraper must drive Robert's normal logged-in Chrome. OAuth flows,
    Playwright, and browser tests can leave a second "Google Chrome" process open
    with a throwaway user-data-dir; macOS AppleScript may attach to that process
    instead of the real logged-in window. Those windows show the banner
    "Chrome is being controlled by automated test software" and are never the
    right X account for this scraper.
    """
    try:
        proc = subprocess.run(
            ["pgrep", "-fl", "Google Chrome"],
            text=True,
            capture_output=True,
            check=False,
        )
    except Exception:
        return

    killed = []
    for line in (proc.stdout or "").splitlines():
        if not line.strip():
            continue
        pid = line.split(None, 1)[0]
        cmd = line[len(pid):].strip()
        if (
            "--enable-automation" in cmd
            or "--test-type=webdriver" in cmd
            or "org.chromium.Chromium.scoped_dir" in cmd
        ):
            try:
                subprocess.run(["kill", pid], check=False)
                killed.append(pid)
            except Exception:
                pass
    if killed:
        print(f"Closed temporary automated Chrome profile(s): {', '.join(killed)}", flush=True)
        time.sleep(1.0)


INBOX_ROOT_URL = "https://x.com/i/chat"


def is_inbox_root_url(url: str) -> bool:
    base = (url or "").split("#")[0].rstrip("/")
    return base in (INBOX_ROOT_URL, "https://twitter.com/i/chat")


def is_x_inbox_url(url: str) -> bool:
    haystack = (url or "").lower()
    return (
        "x.com/i/chat" in haystack
        or "x.com/messages" in haystack
        or "twitter.com/messages" in haystack
    )


def list_chrome_tabs() -> list[dict]:
    raw = osa(
        """
tell application "Google Chrome"
  if (count of windows) is 0 then make new window
  set out to ""
  repeat with wi from 1 to count of windows
    repeat with ti from 1 to count of tabs of window wi
      set out to out & wi & "|" & ti & "|" & (URL of tab ti of window wi) & linefeed
    end repeat
  end repeat
  return out
end tell
"""
    )
    tabs: list[dict] = []
    for line in (raw or "").splitlines():
        parts = line.split("|", 2)
        if len(parts) != 3:
            continue
        try:
            tabs.append({"window": int(parts[0]), "tab": int(parts[1]), "url": parts[2]})
        except ValueError:
            continue
    return tabs


def pick_pinned_inbox_tab(tabs: list[dict], state: dict) -> dict | None:
    saved_window = int(state.get("pinned_inbox_window") or 0)
    saved_tab = int(state.get("pinned_inbox_tab") or 0)
    if saved_window and saved_tab:
        for tab in tabs:
            if tab["window"] == saved_window and tab["tab"] == saved_tab and is_x_inbox_url(tab["url"]):
                return tab

    for tab in tabs:
        if is_inbox_root_url(tab["url"]):
            return tab

    for tab in tabs:
        if is_x_inbox_url(tab["url"]):
            return tab

    for tab in tabs:
        haystack = (tab.get("url") or "").lower()
        if "x.com/" in haystack or "twitter.com/" in haystack:
            return tab
    return None


def ensure_chrome_tabs(state: dict | None = None) -> tuple[int, int]:
    """Always anchor on Robert's pinned X inbox tab (https://x.com/i/chat).

    The scraper reuses the saved tab index between runs, prefers the exact inbox
    root URL over deep-linked chat threads, and keeps thread scraping on a
    separate worker tab so the pinned inbox tab stays put.
    """
    state = state if isinstance(state, dict) else {}
    tabs = list_chrome_tabs()
    inbox = pick_pinned_inbox_tab(tabs, state)
    if not inbox:
        raise RuntimeError(
            "No logged-in X tab found in normal Chrome. "
            "Pin https://x.com/i/chat in Google Chrome while logged in as Robert, then run again."
        )

    window_index = int(inbox["window"])
    inbox_tab = int(inbox["tab"])
    state["pinned_inbox_window"] = window_index
    state["pinned_inbox_tab"] = inbox_tab

    osa(
        f"""
tell application "Google Chrome"
  activate
  set index of window {window_index} to 1
  set w to window {window_index}
  set active tab index of w to {inbox_tab}
  set URL of tab {inbox_tab} of w to "{INBOX_ROOT_URL}"
end tell
"""
    )

    worker_tab = 0
    saved_worker = int(state.get("pinned_worker_tab") or 0)
    if saved_worker and saved_worker != inbox_tab:
        for tab in tabs:
            if tab["window"] == window_index and tab["tab"] == saved_worker:
                worker_tab = saved_worker
                break

    if not worker_tab:
        raw = osa(
            f"""
tell application "Google Chrome"
  set w to window {window_index}
  make new tab at end of tabs of w
  return count of tabs of w
end tell
"""
        )
        worker_tab = int(raw)

    state["pinned_worker_tab"] = worker_tab
    print(
        f"Chrome pinned inbox tab {inbox_tab} (window {window_index}) -> {INBOX_ROOT_URL} | worker tab {worker_tab}",
        flush=True,
    )
    return inbox_tab, worker_tab


def activate_chrome_tab(tab_index: int) -> tuple[int, int, int, int]:
    script = f"""
tell application "Google Chrome"
  activate
  set w to front window
  set active tab index of w to {tab_index}
  set b to bounds of w
  return ((item 1 of b as text) & "," & (item 2 of b as text) & "," & (item 3 of b as text) & "," & (item 4 of b as text))
end tell
"""
    raw = osa(script)
    left, top, right, bottom = [int(part.strip()) for part in raw.split(",")]
    return left, top, right, bottom


def chrome_js(tab_index: int, js: str) -> str:
    escaped = js.replace("\\", "\\\\").replace('"', '\\"')
    return osa(
        f'tell application "Google Chrome"\n'
        f'  set active tab index of front window to {tab_index}\n'
        f'  execute tab {tab_index} of front window javascript "{escaped}"\n'
        f'end tell\n'
    )


def extract_inbox_payload(tab_index: int) -> dict:
    raw = chrome_js(tab_index, INBOX_EXTRACT_JS)
    return json.loads(raw)


def open_url(tab_index: int, url: str, wait: float) -> None:
    escaped = url.replace('"', '\\"')
    osa(
        f'tell application "Google Chrome"\n'
        f'  set active tab index of front window to {tab_index}\n'
        f'  set URL of tab {tab_index} of front window to "{escaped}"\n'
        f'end tell\n'
    )
    time.sleep(wait)


def scroll_inbox(tab_index: int, pixels: int) -> None:
    js = INBOX_SCROLL_JS.replace("__PIXELS__", str(int(pixels)))
    try:
        result = chrome_js(tab_index, js)
        if result:
            payload = json.loads(result)
            moved = int(payload.get("moved") or 0)
            if moved == 0:
                chrome_js(
                    tab_index,
                    f"window.scrollBy({{ top: {pixels}, left: 0, behavior: 'instant' }}); 'ok';",
                )
    except Exception:
        chrome_js(
            tab_index,
            f"window.scrollBy({{ top: {pixels}, left: 0, behavior: 'instant' }}); 'ok';",
        )
    time.sleep(1.0)


def native_scroll_inbox(tab_index: int, amount: int = -5, repeats: int = 8) -> None:
    left, top, right, bottom = activate_chrome_tab(tab_index)
    width = right - left
    height = bottom - top
    target_x = int(left + width * 0.28)
    target_y = int(top + height * 0.80)
    script = (
        NATIVE_SCROLL_JXA.replace("__X__", str(target_x))
        .replace("__Y__", str(target_y))
        .replace("__AMOUNT__", str(amount))
        .replace("__REPEATS__", str(repeats))
    )
    osa_jxa(script)
    time.sleep(0.5)


def inbox_batch_marker(payload: dict) -> tuple[int, str, str]:
    threads = payload.get("threads") or []
    first_url = thread_url_key((threads[0] if threads else {}).get("url") or "")
    last_url = thread_url_key((threads[-1] if threads else {}).get("url") or "")
    return (len(threads), first_url, last_url)


def wait_for_inbox_batch_change(
    tab_index: int,
    baseline_payload: dict,
    pixels: int,
    attempts: int = 6,
    settle_seconds: float = 0.5,
) -> dict:
    baseline_marker = inbox_batch_marker(baseline_payload)
    latest_payload = baseline_payload

    for attempt in range(1, attempts + 1):
        native_scroll_inbox(tab_index)
        scroll_inbox(tab_index, pixels)
        time.sleep(settle_seconds)
        latest_payload = extract_inbox_payload(tab_index)
        latest_marker = inbox_batch_marker(latest_payload)
        print(
            f"[scroll wait {attempt}/{attempts}] baseline={baseline_marker} latest={latest_marker}",
            flush=True,
        )
        if latest_marker != baseline_marker:
            return latest_payload

    return latest_payload


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

    if text.lower() == "now":
        return today.date().isoformat()

    relative = re.fullmatch(r"(\d+)\s*([smhdw])", text.lower())
    if not relative:
        compact_relatives = re.findall(r"(\d+)\s*([smhdw])", text, flags=re.I)
        if compact_relatives:
            count, unit = compact_relatives[-1]
            relative = (count, unit)
        else:
            relative = None
    if relative:
        if hasattr(relative, "group"):
            count = int(relative.group(1))
            unit = relative.group(2).lower()
        else:
            count = int(relative[0])
            unit = relative[1].lower()
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
    weekday_search = re.search(r"\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b", text, flags=re.I)
    if weekday_search:
        day_idx = WEEKDAYS[weekday_search.group(1)[:3].lower()]
        delta = (today.weekday() - day_idx) % 7
        return (today - timedelta(days=delta)).date().isoformat()

    month_match = re.fullmatch(r"([A-Za-z]{3,9})\s+(\d{1,2})(?:,\s*(\d{4}))?", text)
    if not month_match:
        month_match = re.search(r"\b([A-Za-z]{3,9})\s+(\d{1,2})(?:,\s*(\d{4}))?\b", text)
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
    if re.search(r"\b\d{1,2}:\d{2}\s*(AM|PM)\b", text, flags=re.I):
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
    if any(signal in haystack for signal in NON_BUSINESS_SIGNALS):
        if not any(signal in haystack for signal in BUSINESS_SIGNALS):
            return False
    return any(signal in haystack for signal in BUSINESS_SIGNALS)


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
    data["newest_dm_date"] = (
        candidate.get("parsedDate")
        or parse_inbox_timestamp(candidate.get("timestamp") or "", datetime.now())
        or data.get("newest_dm_date")
        or ""
    )
    return data


def sync_company_os_x_asset() -> None:
    queue_rows = read_json(X_OUT / "robert_x_dm_safe_manual_queue.json", [])
    rank_by_dm = {row.get("Open DM"): row.get("Rank") for row in queue_rows if row.get("Open DM")}
    lead_by_dm = {row.get("Open DM"): row.get("Lead") for row in queue_rows if row.get("Open DM")}
    handoff_state = read_json(ROBERT_HANDOFF_STATE, {"x": {}})
    sent_x = handoff_state.get("x") if isinstance(handoff_state, dict) else {}
    if not isinstance(sent_x, dict):
        sent_x = {}

    rows = []
    with NEW_LEADS_CSV.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            dm = row.get("Open DM", "")
            sent_from_robert = dm in sent_x
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
                    "alreadyEmailedInRobertGmail": sent_from_robert or str(row.get("Already Emailed In Robert Gmail") or "").upper() == "YES",
                    "summaryForTeam": row.get("Summary For Team", ""),
                    "lastLeadMessage": row.get("Last Lead Message", ""),
                    "lastSender": row.get("Last Sender", ""),
                    "lastRobertMessage": row.get("Last Robert Message", ""),
                    "repliedViaX": str(row.get("Replied Via X") or "").upper() == "YES",
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


def write_company_os_x_health(summary: dict) -> None:
    stop_reason = str(summary.get("stop_reason") or "")
    inspected = int(summary.get("inspected") or 0)
    health = {
        **summary,
        "ok": inspected > 0 and "stalled" not in stop_reason,
        "source": "live_x_inbox_daily_scrape.py",
        "note": "This powers the ORGANS X watcher health card.",
    }
    write_json(COMPANY_OS_X_HEALTH, health)


def main() -> None:
    parser = argparse.ArgumentParser(description="Newest-first daily live scrape for Robert's X inbox.")
    parser.add_argument("--wait", type=float, default=4.5, help="Seconds to wait after each X navigation.")
    parser.add_argument("--between-min", type=float, default=1.5, help="Minimum pause between scraped threads.")
    parser.add_argument("--between-max", type=float, default=3.0, help="Maximum pause between scraped threads.")
    parser.add_argument("--recent-days", type=int, default=1, help="Stop once visible inbox rows are older than this many days.")
    parser.add_argument("--max-candidates", type=int, default=80, help="Hard cap on inbox rows to inspect per run.")
    parser.add_argument("--max-irrelevant-streak", type=int, default=25, help="Stop after this many non-business threads in a row.")
    parser.add_argument("--known-stop-streak", type=int, default=3, help="Stop once this many already-processed rows appear in a row.")
    parser.add_argument("--scroll-step", type=int, default=900, help="Pixels to scroll between inbox batches.")
    parser.add_argument("--max-scrolls", type=int, default=8, help="How many inbox scroll batches to inspect.")
    parser.add_argument("--rebuild-intake", action="store_true", help="Rebuild the X intake and sync Company OS after scraping.")
    args = parser.parse_args()

    close_automated_chrome_profiles()
    state = load_state()
    inbox_tab, worker_tab = ensure_chrome_tabs(state)
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
        if scroll_index == 0:
            payload = extract_inbox_payload(inbox_tab)
        else:
            prior_marker = inbox_batch_marker(payload)
            payload = wait_for_inbox_batch_change(inbox_tab, payload, args.scroll_step)
            if inbox_batch_marker(payload) == prior_marker:
                stop_reason = "stalled_after_scroll"
                break
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
    write_company_os_x_health(run_summary)

    if args.rebuild_intake:
        rebuild_intake()

    print(json.dumps(run_summary, indent=2), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        failure = {
            "ran_at": now_iso(),
            "stop_reason": f"exception:{exc}",
            "stop_signature": None,
            "inspected": 0,
            "relevant_count": 0,
            "new_threads": 0,
        }
        try:
            write_company_os_x_health(failure)
        except Exception:
            pass
        raise
