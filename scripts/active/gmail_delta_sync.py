#!/usr/bin/env python3
"""
Fast Gmail delta sync for Company OS.

Uses Gmail historyId checkpoints so the dashboard asks Gmail only what changed
since the last pass, then refreshes the affected Supabase cards. This is the
"while I am working from my phone" lane. The heavier 14 day sync stays available
as a fallback when Gmail says the history checkpoint expired.
"""

from __future__ import annotations

import base64
import email.utils
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import google.auth.transport.requests
import httpx
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError


ROOT = Path(__file__).resolve().parents[2]
ACTIVE_DIR = Path(__file__).resolve().parent
if str(ACTIVE_DIR) not in sys.path:
    sys.path.insert(0, str(ACTIVE_DIR))
ENV_FILE = Path.home() / ".config/google-credentials/unaligned-scraper.env"
STATE_DIR = Path.home() / ".config/google-credentials"
CLIENT_SECRET_FILE = Path(os.environ.get("GOOGLE_CLIENT_SECRET_FILE", str(STATE_DIR / "client_secret.json")))
TOKEN_FILE = Path(os.environ.get("GMAIL_TOKEN_FILE", str(STATE_DIR / "asher-gmail-token.json")))
STATE_FILE = Path(os.environ.get("GMAIL_DELTA_STATE_FILE", str(STATE_DIR / "gmail_delta_asher_state.json")))
STATUS_FILE = Path(os.environ.get("GMAIL_DELTA_STATUS_FILE", str(STATE_DIR / "gmail_delta_asher_status.json")))

SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
TEAM_SENDERS = (
    "scobleizer@gmail.com",
    "asherunaligned@gmail.com",
    "samlevin@mac.com",
    "unalignedx@gmail.com",
    "robert scoble",
    "asher weisberger",
    "sam levin",
)
INACTIVE_STAGES = {"done", "paid-out", "trash", "dead-leads"}

from draft_staleness import stale_draft_clear_patch
from x_gmail_merge import pick_cards_for_email_match


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


def read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_gmail_service(interactive: bool = False) -> Any:
    creds = None
    if TOKEN_FILE.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
        except Exception:
            creds = None
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(google.auth.transport.requests.Request())
        TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
    if not creds and interactive:
        flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRET_FILE), SCOPES)
        creds = flow.run_local_server(port=0)
        TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
    if not creds:
        raise RuntimeError(f"Gmail token missing or invalid: {TOKEN_FILE}")
    return build("gmail", "v1", credentials=creds)


def sb_headers() -> dict[str, str]:
    anon = os.environ.get("SUPABASE_ANON_KEY", "")
    service = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not anon:
        raise RuntimeError("SUPABASE_ANON_KEY is missing")
    return {
        "apikey": anon,
        "Authorization": "Bearer " + (service or anon),
        "Content-Type": "application/json",
    }


def supabase_get(path: str) -> Any:
    url = os.environ.get("SUPABASE_URL", "https://hbnpwphxjurvtydezwgh.supabase.co") + path
    resp = httpx.get(url, headers=sb_headers(), timeout=30)
    resp.raise_for_status()
    return resp.json()


def supabase_patch(card_id: str | int, payload: dict[str, Any]) -> None:
    url = os.environ.get("SUPABASE_URL", "https://hbnpwphxjurvtydezwgh.supabase.co") + f"/rest/v1/cards?id=eq.{card_id}"
    resp = httpx.patch(url, headers={**sb_headers(), "Prefer": "return=minimal"}, json=payload, timeout=20)
    if resp.status_code >= 400:
        raise RuntimeError(f"Supabase patch failed {resp.status_code}: {resp.text[:500]}")


def load_cards() -> list[dict[str, Any]]:
    wanted = (
        "id,title,contact_name,business_name,email,list_id,gmail_thread_id,"
        "email_thread,original_email,draft_reply,draft_reply_status,new_reply_at,updated_at,"
        "lead_source,x_open_dm"
    )
    cards: list[dict[str, Any]] = []
    offset = 0
    while True:
        batch = supabase_get(f"/rest/v1/cards?select={wanted}&limit=1000&offset={offset}")
        if not isinstance(batch, list) or not batch:
            break
        cards.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    return cards


def extract_addresses(text: str) -> list[str]:
    if not text:
        return []
    addresses = []
    for _name, addr in email.utils.getaddresses([text]):
        if addr and "@" in addr:
            addresses.append(addr.lower())
    return list(dict.fromkeys(addresses))


def header_value(payload: dict[str, Any], name: str) -> str:
    for h in payload.get("headers", []) or []:
        if str(h.get("name", "")).lower() == name.lower():
            return str(h.get("value", ""))
    return ""


def b64decode(value: str) -> str:
    try:
        return base64.urlsafe_b64decode(value.encode("utf-8")).decode("utf-8", errors="replace")
    except Exception:
        return ""


def strip_html(text: str) -> str:
    text = re.sub(r"(?is)<(script|style).*?</\1>", " ", text or "")
    text = re.sub(r"(?is)<br\s*/?>", "\n", text)
    text = re.sub(r"(?is)</p>", "\n", text)
    text = re.sub(r"(?is)<[^>]+>", " ", text)
    return re.sub(r"[ \t]+", " ", text).strip()


def decode_body(payload: dict[str, Any]) -> str:
    mime = payload.get("mimeType", "")
    body = payload.get("body") or {}
    if mime == "text/plain" and body.get("data"):
        return b64decode(body["data"])
    parts = payload.get("parts") or []
    plain = []
    html = []
    for part in parts:
        text = decode_body(part)
        if not text:
            continue
        if part.get("mimeType") == "text/html":
            html.append(text)
        else:
            plain.append(text)
    if plain:
        return "\n".join(plain)
    if mime == "text/html" and body.get("data"):
        return strip_html(b64decode(body["data"]))
    if html:
        return strip_html("\n".join(html))
    return ""


def parse_date(raw: str) -> str:
    if not raw:
        return ""
    try:
        return email.utils.parsedate_to_datetime(raw).astimezone(timezone.utc).isoformat()
    except Exception:
        return raw


def date_sort_value(raw: Any) -> float:
    text = str(raw or "")
    if not text:
        return 0
    try:
        value = text[:-1] + "+00:00" if text.endswith("Z") else text
        return datetime.fromisoformat(value).timestamp()
    except Exception:
        pass
    try:
        return email.utils.parsedate_to_datetime(text).timestamp()
    except Exception:
        return 0


def format_message(msg: dict[str, Any]) -> dict[str, Any]:
    payload = msg.get("payload") or {}
    from_raw = header_value(payload, "from")
    to_raw = header_value(payload, "to")
    cc_raw = header_value(payload, "cc")
    reply_to_raw = header_value(payload, "reply-to")
    parsed_from = email.utils.parseaddr(from_raw)
    from_name = parsed_from[0] or parsed_from[1] or from_raw
    from_email = parsed_from[1] or from_raw
    body = decode_body(payload).strip()
    return {
        "from": from_name,
        "email": from_email,
        "to": extract_addresses(to_raw),
        "cc": extract_addresses(cc_raw),
        "reply_to": extract_addresses(reply_to_raw),
        "subject": header_value(payload, "subject"),
        "date": parse_date(header_value(payload, "date")),
        "body": body[:3000],
        "snippet": msg.get("snippet", ""),
        "gmail_thread_id": msg.get("threadId", ""),
        "message_id": msg.get("id", ""),
    }


def message_key(msg: dict[str, Any]) -> str:
    return str(msg.get("message_id") or "") or "||".join([
        str(msg.get("gmail_thread_id") or ""),
        str(msg.get("date") or ""),
        str(msg.get("from") or "").lower(),
        str(msg.get("subject") or "").lower(),
        str(msg.get("body") or "")[:300],
    ])


def is_inbound(msg: dict[str, Any]) -> bool:
    sender = " ".join([str(msg.get("from") or ""), str(msg.get("email") or "")]).lower()
    return bool(sender) and not any(team in sender for team in TEAM_SENDERS)


def inbound_needs_reply(msg: dict[str, Any]) -> bool:
    if not is_inbound(msg):
        return False
    text = " ".join([str(msg.get("body") or ""), str(msg.get("snippet") or "")]).lower()
    no_reply_patterns = (
        r"\bno worries\b.*\bthanks? for the post\b",
        r"\bthanks? for the post\b",
        r"\blooks good\b.*\bthank",
        r"\bthank you\b.*\bposted\b",
    )
    return not any(re.search(pattern, text) for pattern in no_reply_patterns)


def merge_threads(existing: Any, fresh: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if isinstance(existing, str):
        try:
            existing = json.loads(existing)
        except Exception:
            existing = []
    if isinstance(existing, dict):
        existing = [existing]
    if not isinstance(existing, list):
        existing = []
    merged: dict[str, dict[str, Any]] = {}
    for msg in [*existing, *fresh]:
        if not isinstance(msg, dict):
            continue
        key = message_key(msg)
        if not key:
            continue
        prev = merged.get(key)
        if not prev or len(str(msg.get("body") or "")) >= len(str(prev.get("body") or "")):
            merged[key] = dict(msg)
    out = list(merged.values())
    out.sort(key=lambda m: date_sort_value(m.get("date")))
    return out[-50:]


def fetch_thread(service: Any, thread_id: str) -> list[dict[str, Any]]:
    thread = service.users().threads().get(
        userId="me",
        id=thread_id,
        format="full",
        fields="messages(id,threadId,snippet,payload(headers,mimeType,body,parts))",
    ).execute()
    return [format_message(m) for m in thread.get("messages", [])]


def recent_thread_ids(service: Any, limit: int) -> set[str]:
    result = service.users().messages().list(
        userId="me",
        q="newer_than:2d",
        maxResults=limit,
        fields="messages(id,threadId),nextPageToken",
    ).execute()
    return {m["threadId"] for m in result.get("messages", []) if m.get("threadId")}


def history_thread_ids(service: Any, start_history_id: str, max_pages: int = 8) -> tuple[set[str], bool]:
    thread_ids: set[str] = set()
    page_token = None
    pages = 0
    while pages < max_pages:
        pages += 1
        kwargs = {
            "userId": "me",
            "startHistoryId": start_history_id,
            "historyTypes": ["messageAdded"],
            "maxResults": 500,
            "fields": "history(messagesAdded(message(id,threadId))),nextPageToken",
        }
        if page_token:
            kwargs["pageToken"] = page_token
        result = service.users().history().list(**kwargs).execute()
        for item in result.get("history", []) or []:
            for added in item.get("messagesAdded", []) or []:
                msg = added.get("message") or {}
                if msg.get("threadId"):
                    thread_ids.add(msg["threadId"])
        page_token = result.get("nextPageToken")
        if not page_token:
            break
    return thread_ids, bool(page_token)


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--bootstrap-limit", type=int, default=int(os.environ.get("GMAIL_DELTA_BOOTSTRAP_LIMIT", "80")))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--auth", action="store_true")
    args = parser.parse_args()

    load_env()
    service = load_gmail_service(interactive=args.auth)
    profile = service.users().getProfile(userId="me").execute()
    current_history = str(profile.get("historyId") or "")
    state = read_json(STATE_FILE, {})
    last_history = str(state.get("history_id") or "")

    checkpoint_expired = False
    more_available = False
    if last_history:
        try:
            thread_ids, more_available = history_thread_ids(service, last_history)
            mode = "history"
        except HttpError as exc:
            if getattr(exc.resp, "status", None) == 404:
                checkpoint_expired = True
                thread_ids = recent_thread_ids(service, args.bootstrap_limit)
                mode = "recent_fallback"
            else:
                raise
    else:
        thread_ids = recent_thread_ids(service, args.bootstrap_limit)
        mode = "bootstrap"

    cards = load_cards()
    cards_by_thread = {str(c.get("gmail_thread_id")): c for c in cards if c.get("gmail_thread_id")}
    cards_by_email: dict[str, list[dict[str, Any]]] = {}
    for card in cards:
        email_addr = str(card.get("email") or "").strip().lower()
        if email_addr and "@" in email_addr:
            cards_by_email.setdefault(email_addr, []).append(card)

    touched = []
    unknown_threads = []
    for thread_id in sorted(thread_ids):
        try:
            fresh = fetch_thread(service, thread_id)
        except Exception as exc:
            unknown_threads.append({"thread_id": thread_id, "error": str(exc)[:160]})
            continue
        matched: dict[str, dict[str, Any]] = {}
        if thread_id in cards_by_thread:
            matched[str(cards_by_thread[thread_id]["id"])] = cards_by_thread[thread_id]
        for msg in fresh:
            # Only sender email can attach a changed Gmail thread to an existing
            # card. To/Cc contains our team aliases and causes false matches.
            addr = str(msg.get("email") or "").lower()
            if not addr or any(team in addr for team in TEAM_SENDERS):
                continue
            for card in pick_cards_for_email_match(cards_by_email.get(addr, [])):
                matched[str(card["id"])] = card
        if not matched:
            unknown_threads.append({"thread_id": thread_id, "subject": fresh[-1].get("subject") if fresh else ""})
            continue
        for card in matched.values():
            merged = merge_threads(card.get("email_thread") or card.get("original_email") or [], fresh)
            last = merged[-1] if merged else {}
            payload = {
                "gmail_thread_id": thread_id,
                "email_thread": merged,
                "original_email": merged[:1],
            }
            if inbound_needs_reply(last) and str(card.get("list_id") or "") not in INACTIVE_STAGES:
                payload["new_reply_at"] = last.get("date") or now_iso()
            elif str(card.get("list_id") or "") not in INACTIVE_STAGES:
                payload["new_reply_at"] = None
            stale_patch = stale_draft_clear_patch({**card, **payload}, merged)
            if stale_patch:
                payload.update({k: v for k, v in stale_patch.items() if not k.startswith("_")})
            if not args.dry_run:
                supabase_patch(card["id"], payload)
            touched.append({
                "id": card["id"],
                "thread_id": thread_id,
                "business": card.get("business_name") or card.get("title"),
                "messages": len(merged),
                "latest_inbound": bool(payload.get("new_reply_at")),
            })

    if not args.dry_run and current_history:
        write_json(STATE_FILE, {
            "history_id": current_history,
            "updated_at": now_iso(),
            "mode": mode,
            "last_history_id": last_history,
        })

    result = {
        "ok": True,
        "mode": mode,
        "checked_threads": len(thread_ids),
        "cards_updated": len(touched),
        "unknown_threads": unknown_threads[:25],
        "checkpoint_expired": checkpoint_expired,
        "more_available": more_available,
        "history_id": current_history,
        "previous_history_id": last_history,
        "updated": touched[:50],
        "dry_run": args.dry_run,
    }
    write_json(STATUS_FILE, {"updated_at": now_iso(), **result})
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
