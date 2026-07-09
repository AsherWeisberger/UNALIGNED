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
# Split threads often live in Robert's inbox while Asher only has a short forward fork.
# Try Robert first (primary scraper inbox), then Asher — same order as deal_tracker.py.
GMAIL_MAILBOX_TOKENS: list[tuple[str, Path]] = [
    ("robert", STATE_DIR / "gmail-token.json"),
    ("asher", STATE_DIR / "asher-gmail-token.json"),
]

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
CLOSED_RESURFACE_STAGES = frozenset({"paid-out", "done"})
RESURFACE_STAGE_DONE = "engaged"
RESURFACE_STAGE_PAID = "invoice-sent"
NEVER_TOUCH_STAGES = frozenset({"trash", "dead-leads"})
ACTIVE_REFRESH_STAGES = frozenset({"negotiating", "invoice-sent", "engaged", "first-touch", "rates-sent"})
STALE_THREAD_SEC = int(os.environ.get("GMAIL_DELTA_STALE_THREAD_SEC", str(36 * 3600)))
MAX_ACTIVE_THREAD_REFRESH = int(os.environ.get("GMAIL_DELTA_ACTIVE_REFRESH_LIMIT", "3"))
MAX_CLOSED_THREAD_REFRESH = int(os.environ.get("GMAIL_DELTA_CLOSED_REFRESH_LIMIT", "8"))
MAX_HEAL_PER_RUN = int(os.environ.get("GMAIL_DELTA_HEAL_LIMIT", "5"))
MAX_HEAL_PROBE_PER_RUN = int(os.environ.get("GMAIL_DELTA_HEAL_PROBE_LIMIT", "40"))
LEGACY_RATE_LIMIT_FILE = Path(os.environ.get("GMAIL_RATE_LIMIT_FILE", str(STATE_DIR / "gmail_api_rate_limit.json")))
HEAL_PROBE_CURSOR_FILE = Path(os.environ.get("GMAIL_HEAL_PROBE_CURSOR_FILE", str(STATE_DIR / "gmail_heal_probe_cursor.json")))
REFRESH_CURSOR_FILE = Path(os.environ.get("GMAIL_ACTIVE_REFRESH_CURSOR_FILE", str(STATE_DIR / "gmail_active_refresh_cursor.json")))
CLOSED_REFRESH_CURSOR_FILE = Path(os.environ.get("GMAIL_CLOSED_REFRESH_CURSOR_FILE", str(STATE_DIR / "gmail_closed_refresh_cursor.json")))


class GmailRateLimited(RuntimeError):
    def __init__(self, retry_after: str = "") -> None:
        self.retry_after = retry_after
        super().__init__(retry_after or "Gmail API rate limit exceeded")

from draft_staleness import stale_draft_clear_patch
from x_gmail_merge import message_contact_set, normalize_email, pick_cards_for_email_match, slice_thread_for_contact


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


def parse_retry_after_from_error(exc: HttpError) -> str:
    text = " ".join([
        str(getattr(exc, "content", b"") or b""),
        str(exc),
    ])
    match = re.search(r"Retry after ([0-9TZ:\.-]+)", text, flags=re.IGNORECASE)
    if not match:
        return ""
    raw = match.group(1).strip()
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(raw).astimezone(timezone.utc).isoformat()
    except Exception:
        return match.group(1).strip()


def rate_limit_file_for(mailbox: str = "") -> Path:
    label = str(mailbox or "").strip().lower()
    if not label:
        return LEGACY_RATE_LIMIT_FILE
    return STATE_DIR / f"gmail_api_rate_limit_{label}.json"


def _rate_limit_active_for_file(path: Path) -> tuple[bool, str]:
    data = read_json(path, {})
    retry_after = str(data.get("retry_after") or "").strip()
    if not retry_after:
        return False, ""
    raw = retry_after[:-1] + "+00:00" if retry_after.endswith("Z") else retry_after
    try:
        until = datetime.fromisoformat(raw).astimezone(timezone.utc).timestamp()
    except Exception:
        try:
            path.unlink(missing_ok=True)
        except Exception:
            pass
        return False, retry_after
    if datetime.now(timezone.utc).timestamp() < until:
        return True, retry_after
    try:
        path.unlink(missing_ok=True)
    except Exception:
        pass
    return False, ""


def record_gmail_rate_limit(exc: HttpError, mailbox: str = "") -> str:
    retry_after = parse_retry_after_from_error(exc)
    payload = {
        "retry_after": retry_after,
        "recorded_at": now_iso(),
        "mailbox": str(mailbox or "").strip().lower() or None,
        "message": str(exc)[:500],
    }
    write_json(rate_limit_file_for(mailbox), payload)
    return retry_after


def gmail_rate_limit_active(mailbox: str | None = None) -> tuple[bool, str]:
    """Return whether a mailbox (or any mailbox when None) is in Gmail cooldown."""
    if mailbox is not None:
        label = str(mailbox or "").strip().lower()
        paths = [rate_limit_file_for(label)] if label else [LEGACY_RATE_LIMIT_FILE]
        if label:
            paths.append(LEGACY_RATE_LIMIT_FILE)
        active_retries: list[str] = []
        for path in paths:
            limited, retry_after = _rate_limit_active_for_file(path)
            if limited and retry_after:
                active_retries.append(retry_after)
        if active_retries:
            return True, min(active_retries)
        return False, ""

    checked: list[str] = []
    for label in ("robert", "asher"):
        limited, retry_after = gmail_rate_limit_active(label)
        if limited and retry_after:
            checked.append(retry_after)
    limited, retry_after = _rate_limit_active_for_file(LEGACY_RATE_LIMIT_FILE)
    if limited and retry_after:
        checked.append(retry_after)
    if checked:
        return True, min(checked)
    return False, ""


def filter_available_mailboxes(mailboxes: list[tuple[str, Any]]) -> tuple[list[tuple[str, Any]], list[str]]:
    """Drop mailboxes in cooldown so Robert limits do not block Asher (and vice versa)."""
    available: list[tuple[str, Any]] = []
    blocked: list[str] = []
    for label, service in mailboxes:
        limited, retry_after = gmail_rate_limit_active(label)
        if limited:
            if retry_after:
                blocked.append(retry_after)
            continue
        available.append((label, service))
    return available, blocked


def gmail_http_status(exc: Exception) -> int | None:
    resp = getattr(exc, "resp", None)
    return getattr(resp, "status", None)


def raise_if_rate_limited(exc: Exception, mailbox: str = "") -> None:
    if gmail_http_status(exc) == 429 and isinstance(exc, HttpError):
        record_gmail_rate_limit(exc, mailbox)
        raise GmailRateLimited(parse_retry_after_from_error(exc)) from exc


def load_gmail_service(interactive: bool = False, *, token_file: Path | None = None) -> Any:
    token_path = token_file or TOKEN_FILE
    creds = None
    if token_path.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)
        except Exception:
            creds = None
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(google.auth.transport.requests.Request())
        token_path.write_text(creds.to_json(), encoding="utf-8")
    if not creds and interactive:
        flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRET_FILE), SCOPES)
        creds = flow.run_local_server(port=0)
        token_path.write_text(creds.to_json(), encoding="utf-8")
    if not creds:
        raise RuntimeError(f"Gmail token missing or invalid: {token_path}")
    return build("gmail", "v1", credentials=creds)


def load_gmail_mailboxes(interactive: bool = False) -> list[tuple[str, Any]]:
    """Return [(label, service), ...] for every mailbox token that loads."""
    mailboxes: list[tuple[str, Any]] = []
    for label, path in GMAIL_MAILBOX_TOKENS:
        try:
            mailboxes.append((label, load_gmail_service(interactive=interactive, token_file=path)))
        except Exception:
            continue
    if not mailboxes:
        raise RuntimeError("No Gmail mailbox tokens could be loaded")
    return mailboxes


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


def extract_attachments(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Filename + mime metadata only — never pulls attachment bytes."""
    out: list[dict[str, Any]] = []
    seen: set[str] = set()

    def walk(part: dict[str, Any]) -> None:
        filename = str(part.get("filename") or "").strip()
        body = part.get("body") or {}
        mime = str(part.get("mimeType") or "").strip()
        attachment_id = body.get("attachmentId")
        if filename and attachment_id:
            size = int(body.get("size") or 0)
            key = f"{filename}|{mime}|{size}"
            if key not in seen:
                seen.add(key)
                out.append({
                    "filename": filename[:180],
                    "mimeType": mime[:120],
                    "size": size,
                })
        for child in part.get("parts") or []:
            if isinstance(child, dict):
                walk(child)

    if isinstance(payload, dict):
        walk(payload)
    return out[:12]


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
    attachments = extract_attachments(payload)
    rfc822_message_id = header_value(payload, "Message-ID")
    references = header_value(payload, "References")
    formatted = {
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
        "gmail_id": msg.get("id", ""),
        "message_id": msg.get("id", ""),
        "rfc822_message_id": rfc822_message_id,
        "references": references,
    }
    if attachments:
        formatted["attachments"] = attachments
    return formatted


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
    if any(re.search(pattern, text) for pattern in no_reply_patterns):
        return False
    returning_collab_patterns = (
        r"\b(new|another|next|future)\s+(collab|collaboration|partnership|campaign|project)\b",
        r"\b(collab|collaborate|partnership|sponsor(?:ship)?|work together)\b",
        r"\b(interested in|would love to|want to|keen to)\b.*\b(collab|partner|post|campaign|work)\b",
        r"\breach(?:ing)? out again\b",
        r"\bfollow(?:ing)? up\b.*\b(collab|campaign|project|partnership)\b",
        r"\bany update\b",
        r"\bcan you send\b.*\b(invoice|pricing|rates?|quote)\b",
    )
    if any(re.search(pattern, text) for pattern in returning_collab_patterns):
        return True
    return True


def resurface_stage_for_card(list_id: str) -> str:
    if list_id == "paid-out":
        return RESURFACE_STAGE_PAID
    return RESURFACE_STAGE_DONE


def normalize_thread_list(raw: Any) -> list[dict[str, Any]]:
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            return []
    if isinstance(raw, dict):
        raw = [raw]
    if not isinstance(raw, list):
        return []
    return [m for m in raw if isinstance(m, dict)]


def fresh_inbound_tail(existing: Any, merged: list[dict[str, Any]]) -> bool:
    """True when the merged thread ends with inbound we have not stored yet."""
    if not merged:
        return False
    last = merged[-1]
    if not inbound_needs_reply(last):
        return False
    prev = normalize_thread_list(existing)
    if not prev:
        return True
    return message_key(last) != message_key(prev[-1])


def build_card_thread_patch(
    card: dict[str, Any],
    merged: list[dict[str, Any]],
    *,
    thread_id: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Build Supabase patch for a refreshed Gmail thread.

    Closed deals (paid-out / done) resurface to invoice-sent when a new inbound
    lands in the chain. Trash and dead-leads are never auto-touched.
    """
    list_id = str(card.get("list_id") or "")
    existing = card.get("email_thread") or card.get("original_email") or []
    last = merged[-1] if merged else {}
    payload: dict[str, Any] = {
        "gmail_thread_id": thread_id,
        "email_thread": merged,
        "original_email": merged[:1],
    }
    meta = {"resurfaced": False, "latest_inbound": False}

    if list_id in NEVER_TOUCH_STAGES:
        stale_patch = stale_draft_clear_patch({**card, **payload}, merged)
        if stale_patch:
            payload.update({k: v for k, v in stale_patch.items() if not k.startswith("_")})
        return payload, meta

    if fresh_inbound_tail(existing, merged):
        inbound_at = last.get("date") or now_iso()
        payload["new_reply_at"] = inbound_at
        payload["needs_reply"] = True
        payload["last_inbound_at"] = inbound_at
        meta["latest_inbound"] = True
        if list_id in CLOSED_RESURFACE_STAGES:
            payload["list_id"] = resurface_stage_for_card(list_id)
            payload["moved_at"] = now_iso()
            payload["deal_state"] = "returning_collab"
            payload["recommended_action"] = (
                "Returning collab — they emailed again on the old chain. Open the thread, re-scope, and reply."
            )
            meta["resurfaced"] = True
            meta["resurfaced_from"] = list_id
    elif list_id not in INACTIVE_STAGES:
        payload["new_reply_at"] = None

    stale_patch = stale_draft_clear_patch({**card, **payload}, merged)
    if stale_patch:
        payload.update({k: v for k, v in stale_patch.items() if not k.startswith("_")})
    return payload, meta


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

        def richness(item: dict[str, Any]) -> tuple[int, int]:
            return (
                len(str(item.get("body") or "")),
                len(item.get("attachments") or []),
            )

        if not prev or richness(msg) >= richness(prev):
            merged[key] = dict(msg)
    out = list(merged.values())
    out.sort(key=lambda m: date_sort_value(m.get("date")))
    return out[-50:]


def fetch_thread(service: Any, thread_id: str, *, mailbox: str = "") -> list[dict[str, Any]]:
    try:
        thread = service.users().threads().get(
            userId="me",
            id=thread_id,
            format="full",
            fields="messages(id,threadId,snippet,payload(headers,mimeType,body,parts))",
        ).execute()
    except HttpError as exc:
        if gmail_http_status(exc) == 404:
            return []
        raise_if_rate_limited(exc, mailbox)
        raise
    return [format_message(m) for m in thread.get("messages", [])]


def thread_exists(service: Any, thread_id: str, *, mailbox: str = "") -> bool:
    if not thread_id:
        return False
    try:
        service.users().threads().get(userId="me", id=thread_id, format="minimal", fields="id").execute()
        return True
    except HttpError as exc:
        if gmail_http_status(exc) == 404:
            return False
        raise_if_rate_limited(exc, mailbox)
        raise


def thread_exists_in_mailboxes(
    mailboxes: list[tuple[str, Any]],
    thread_id: str,
) -> tuple[bool, str]:
    """Cheap existence check — one minimal API call per mailbox, not a full thread pull."""
    for label, service in mailboxes:
        try:
            if thread_exists(service, thread_id, mailbox=label):
                return True, label
        except GmailRateLimited:
            raise
        except HttpError:
            continue
    return False, ""


def normalize_stored_thread_id(raw: Any) -> str:
    """Split-thread cards sometimes store synthetic ids like `<gmail_tid>::contact@email`."""
    text = str(raw or "").strip()
    if "::" in text:
        return text.split("::", 1)[0].strip()
    return text


def lookup_thread_id_by_email(service: Any, email: str) -> str:
    """Pick the Gmail thread with the most contact traffic — not just the newest search hit."""
    tid, _mailbox = lookup_thread_id_by_email_multi([( "primary", service)], email)
    return tid


def lookup_thread_id_by_email_multi(
    mailboxes: list[tuple[str, Any]],
    email: str,
) -> tuple[str, str]:
    """Search every mailbox; return (thread_id, mailbox_label) for the richest match."""
    addr = normalize_email(email)
    if not addr or "@" not in addr:
        return "", ""
    best_tid = ""
    best_mailbox = ""
    # Prefer the thread with the newest contact message; use length only as a tiebreaker.
    best_score = (-1.0, -1)
    for label, service in mailboxes:
        try:
            result = service.users().messages().list(
                userId="me",
                q=f"(from:{addr} OR to:{addr} OR cc:{addr}) newer_than:365d",
                maxResults=30,
                fields="messages(id,threadId)",
            ).execute()
        except Exception:
            continue
        thread_ids: list[str] = []
        seen: set[str] = set()
        for msg in result.get("messages", []) or []:
            tid = str(msg.get("threadId") or "").strip()
            if tid and tid not in seen:
                seen.add(tid)
                thread_ids.append(tid)
        for tid in thread_ids:
            try:
                fresh = fetch_thread(service, tid, mailbox=label)
            except Exception:
                continue
            involved = [m for m in fresh if addr in message_contact_set(m)]
            if not involved:
                continue
            latest = max(date_sort_value(m.get("date")) for m in involved)
            score = (latest, len(involved))
            if score > best_score:
                best_score = score
                best_tid = tid
                best_mailbox = label
    return best_tid, best_mailbox


def fetch_thread_from_mailboxes(
    mailboxes: list[tuple[str, Any]],
    thread_id: str,
) -> tuple[list[dict[str, Any]], str, Any | None]:
    """Return (messages, mailbox_label, service) from the first mailbox that has this thread."""
    for label, service in mailboxes:
        try:
            fresh = fetch_thread(service, thread_id, mailbox=label)
        except GmailRateLimited:
            raise
        except HttpError:
            continue
        if fresh:
            return fresh, label, service
    return [], "", None


def match_cards_for_thread(
    fresh: list[dict[str, Any]],
    thread_id: str,
    cards_by_thread: dict[str, dict[str, Any]],
    cards_by_email: dict[str, list[dict[str, Any]]],
    *,
    closed_cards_by_thread: dict[str, list[dict[str, Any]]] | None = None,
) -> dict[str, dict[str, Any]]:
    """Match a Gmail thread to board cards — including outbound-only updates from the team."""
    matched: dict[str, dict[str, Any]] = {}
    if thread_id in cards_by_thread:
        matched[str(cards_by_thread[thread_id]["id"])] = cards_by_thread[thread_id]
    for closed_card in (closed_cards_by_thread or {}).get(thread_id, []):
        matched[str(closed_card["id"])] = closed_card
    for msg in fresh:
        contacts = message_contact_set(msg)
        for addr in contacts:
            if not addr or addr in {normalize_email(team) for team in TEAM_SENDERS}:
                continue
            if any(team in addr for team in TEAM_SENDERS):
                continue
            for card in pick_cards_for_email_match(cards_by_email.get(addr, [])):
                matched[str(card["id"])] = card
    return matched


def latest_thread_timestamp(card: dict[str, Any]) -> float:
    thread = normalize_thread_list(card.get("email_thread") or card.get("original_email"))
    if not thread:
        return 0.0
    return max(date_sort_value(m.get("date")) for m in thread)


def active_cards_due_for_refresh(
    cards: list[dict[str, Any]],
    limit: int,
    *,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """Active Gmail cards whose stored thread text may lag behind the live Gmail thread."""
    now = datetime.now(timezone.utc).timestamp()
    candidates: list[tuple[float, dict[str, Any]]] = []
    for card in cards:
        list_id = str(card.get("list_id") or "")
        if list_id not in ACTIVE_REFRESH_STAGES:
            continue
        source = str(card.get("lead_source") or "").lower()
        if source in {"connect-form", "x"}:
            continue
        thread_id = normalize_stored_thread_id(card.get("gmail_thread_id"))
        if not thread_id:
            continue
        latest = latest_thread_timestamp(card)
        if latest and (now - latest) < STALE_THREAD_SEC:
            continue
        candidates.append((latest or 0.0, card))
    candidates.sort(key=lambda item: item[0])
    if not candidates:
        return []
    start = max(0, int(offset)) % len(candidates)
    ordered = candidates[start:] + candidates[:start]
    return [card for _, card in ordered[: max(0, limit)]]


def refresh_active_card_threads(
    mailboxes: list[tuple[str, Any]],
    cards: list[dict[str, Any]],
    *,
    dry_run: bool = False,
    limit: int = MAX_ACTIVE_THREAD_REFRESH,
) -> list[dict[str, Any]]:
    """Re-fetch full Gmail threads for active cards even when history delta missed them."""
    cursor = read_json(REFRESH_CURSOR_FILE, {})
    offset = int(cursor.get("offset") or 0)
    due = active_cards_due_for_refresh(cards, max(limit * 4, 12), offset=offset)
    batch = due[: max(0, limit)]
    touched: list[dict[str, Any]] = []
    for card in batch:
        thread_id = normalize_stored_thread_id(card.get("gmail_thread_id"))
        if not thread_id:
            continue
        try:
            fresh, mailbox, _service = fetch_thread_from_mailboxes(mailboxes, thread_id)
            if not fresh:
                continue
        except GmailRateLimited:
            raise
        except Exception as exc:
            touched.append({
                "id": card["id"],
                "thread_id": thread_id,
                "error": str(exc)[:160],
            })
            continue
        merged = merge_threads(card.get("email_thread") or card.get("original_email") or [], fresh)
        card_email = str(card.get("email") or "").strip()
        if card_email:
            merged = slice_thread_for_contact(merged, card_email)
        existing = normalize_thread_list(card.get("email_thread") or card.get("original_email"))
        existing_latest = latest_thread_timestamp(card)
        merged_latest = max((date_sort_value(m.get("date")) for m in merged), default=0.0)
        if len(merged) <= len(existing) and merged_latest <= existing_latest:
            continue
        payload, meta = build_card_thread_patch(card, merged, thread_id=thread_id)
        if not dry_run:
            supabase_patch(card["id"], payload)
        touched.append({
            "id": card["id"],
            "thread_id": thread_id,
            "business": card.get("business_name") or card.get("title"),
            "messages": len(merged),
            "mailbox": mailbox,
            "latest_inbound": meta.get("latest_inbound"),
            "resurfaced": meta.get("resurfaced"),
            "source": "active_refresh",
        })
    if not dry_run and batch:
        write_json(REFRESH_CURSOR_FILE, {
            "offset": (offset + len(batch)) % max(len(due), 1),
            "updated_at": now_iso(),
            "last_batch": len(batch),
        })
    return touched


def closed_cards_for_watch(
    cards: list[dict[str, Any]],
    limit: int,
    *,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """Done/paid-out chains we still poll so returning collabs resurface even if history lagged."""
    candidates: list[tuple[float, dict[str, Any]]] = []
    for card in cards:
        list_id = str(card.get("list_id") or "")
        if list_id not in CLOSED_RESURFACE_STAGES:
            continue
        source = str(card.get("lead_source") or "").lower()
        if source in {"connect-form", "x"}:
            continue
        thread_id = normalize_stored_thread_id(card.get("gmail_thread_id"))
        if not thread_id:
            continue
        candidates.append((latest_thread_timestamp(card), card))
    if not candidates:
        return []
    candidates.sort(key=lambda item: item[0])
    start = max(0, int(offset)) % len(candidates)
    ordered = candidates[start:] + candidates[:start]
    return [card for _, card in ordered[: max(0, limit)]]


def refresh_closed_deal_threads(
    mailboxes: list[tuple[str, Any]],
    cards: list[dict[str, Any]],
    *,
    dry_run: bool = False,
    limit: int = MAX_CLOSED_THREAD_REFRESH,
) -> list[dict[str, Any]]:
    """Re-fetch a small rotating batch of done/paid-out Gmail threads for returning collabs."""
    cursor = read_json(CLOSED_REFRESH_CURSOR_FILE, {})
    offset = int(cursor.get("offset") or 0)
    pool = closed_cards_for_watch(cards, max(limit * 4, 20), offset=offset)
    batch = pool[: max(0, limit)]
    touched: list[dict[str, Any]] = []
    for card in batch:
        thread_id = normalize_stored_thread_id(card.get("gmail_thread_id"))
        if not thread_id:
            continue
        try:
            fresh, mailbox, _service = fetch_thread_from_mailboxes(mailboxes, thread_id)
            if not fresh:
                continue
        except GmailRateLimited:
            raise
        except Exception as exc:
            touched.append({
                "id": card["id"],
                "thread_id": thread_id,
                "error": str(exc)[:160],
            })
            continue
        merged = merge_threads(card.get("email_thread") or card.get("original_email") or [], fresh)
        card_email = str(card.get("email") or "").strip()
        if card_email:
            merged = slice_thread_for_contact(merged, card_email)
        existing = normalize_thread_list(card.get("email_thread") or card.get("original_email"))
        existing_latest = latest_thread_timestamp(card)
        merged_latest = max((date_sort_value(m.get("date")) for m in merged), default=0.0)
        if len(merged) <= len(existing) and merged_latest <= existing_latest:
            continue
        payload, meta = build_card_thread_patch(card, merged, thread_id=thread_id)
        if not dry_run:
            supabase_patch(card["id"], payload)
        touched.append({
            "id": card["id"],
            "thread_id": thread_id,
            "business": card.get("business_name") or card.get("title"),
            "messages": len(merged),
            "mailbox": mailbox,
            "latest_inbound": meta.get("latest_inbound"),
            "resurfaced": meta.get("resurfaced"),
            "source": "closed_refresh",
        })
    if not dry_run and batch:
        write_json(CLOSED_REFRESH_CURSOR_FILE, {
            "offset": (offset + len(batch)) % max(len(pool), 1),
            "updated_at": now_iso(),
            "last_batch": len(batch),
        })
    return touched


def card_needs_thread_heal(card: dict[str, Any], mailboxes: list[tuple[str, Any]]) -> tuple[bool, str]:
    stored_raw = str(card.get("gmail_thread_id") or "").strip()
    stored = normalize_stored_thread_id(stored_raw)
    list_id = str(card.get("list_id") or "")
    if list_id in INACTIVE_STAGES and stored and stored_raw == stored:
        return False, "inactive"
    if stored_raw and stored_raw != stored:
        return True, "synthetic"
    if not stored:
        return True, "missing"
    try:
        exists, _mailbox = thread_exists_in_mailboxes(mailboxes, stored)
    except GmailRateLimited:
        raise
    if exists:
        return False, "live"
    return True, "missing_or_404"


def _heal_probe_candidates(cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Only active Gmail leads need live thread-id healing — not closed/archive cards."""
    candidates: list[dict[str, Any]] = []
    for card in cards:
        list_id = str(card.get("list_id") or "")
        if list_id not in ACTIVE_REFRESH_STAGES:
            continue
        if str(card.get("lead_source") or "").upper() == "X" and card.get("x_open_dm"):
            continue
        source = str(card.get("lead_source") or "").lower()
        if source in {"connect-form", "x"}:
            continue
        email = str(card.get("email") or "").strip().lower()
        if not email or "@" not in email:
            continue
        candidates.append(card)
    return candidates


def heal_stale_card_thread_links(
    mailboxes: list[tuple[str, Any]],
    cards: list[dict[str, Any]],
    cards_by_thread: dict[str, dict[str, Any]],
    *,
    dry_run: bool = False,
) -> list[dict[str, Any]]:
    """Re-link only cards whose Gmail thread id is missing, synthetic, or dead."""
    healed: list[dict[str, Any]] = []
    heal_queue: list[tuple[dict[str, Any], str]] = []
    probe_candidates = _heal_probe_candidates(cards)
    cursor = read_json(HEAL_PROBE_CURSOR_FILE, {})
    offset = int(cursor.get("offset") or 0)
    if probe_candidates:
        start = max(0, offset) % len(probe_candidates)
        ordered = probe_candidates[start:] + probe_candidates[:start]
        probe_batch = ordered[: max(0, MAX_HEAL_PROBE_PER_RUN)]
        write_json(HEAL_PROBE_CURSOR_FILE, {
            "offset": (start + len(probe_batch)) % len(probe_candidates),
            "updated_at": now_iso(),
            "pool_size": len(probe_candidates),
        })
    else:
        probe_batch = []
    for card in probe_batch:
        try:
            needs, reason = card_needs_thread_heal(card, mailboxes)
        except GmailRateLimited:
            raise
        if needs:
            heal_queue.append((card, reason))
    heal_queue.sort(key=lambda item: 0 if item[1] in {"missing", "missing_or_404"} else 1)
    for card, reason in heal_queue[:MAX_HEAL_PER_RUN]:
        stored_raw = str(card.get("gmail_thread_id") or "").strip()
        stored = normalize_stored_thread_id(stored_raw)
        thread_id, source, stale_cleared, mailbox = resolve_thread_id_for_card_multi(
            mailboxes,
            card,
            allow_email_lookup=True,
        )
        if not thread_id:
            continue
        if stored and thread_id == stored and reason not in {"synthetic", "missing_or_404", "missing"}:
            continue
        patch: dict[str, Any] = {"gmail_thread_id": thread_id}
        try:
            fresh, mailbox, _service = fetch_thread_from_mailboxes(mailboxes, thread_id)
            if fresh:
                merged = merge_threads(card.get("email_thread") or card.get("original_email") or [], fresh)
                card_email = str(card.get("email") or "").strip()
                if card_email:
                    merged = slice_thread_for_contact(merged, card_email)
                payload, _meta = build_card_thread_patch(card, merged, thread_id=thread_id)
                patch = payload
        except GmailRateLimited:
            raise
        except Exception:
            pass
        if not dry_run:
            supabase_patch(card["id"], patch)
        card["gmail_thread_id"] = thread_id
        if patch.get("email_thread"):
            card["email_thread"] = patch["email_thread"]
        cur = cards_by_thread.get(thread_id)
        if cur is None or str(cur.get("id")) == str(card.get("id")):
            cards_by_thread[thread_id] = card
        healed.append({
            "id": card["id"],
            "business": card.get("business_name") or card.get("title"),
            "previous_thread_id": stored_raw or stored,
            "thread_id": thread_id,
            "source": source,
            "mailbox": mailbox,
            "stale_cleared": stale_cleared,
            "reason": reason,
        })
    return healed


def resolve_thread_id_for_card(service: Any, card: dict[str, Any]) -> tuple[str, str, bool]:
    """Backward-compatible single-mailbox resolver (used in tests)."""
    thread_id, source, stale, _mailbox = resolve_thread_id_for_card_multi([("primary", service)], card)
    return thread_id, source, stale


def resolve_thread_id_for_card_multi(
    mailboxes: list[tuple[str, Any]],
    card: dict[str, Any],
    *,
    allow_email_lookup: bool = True,
) -> tuple[str, str, bool, str]:
    """Return (thread_id, source, stale_cleared, mailbox_label)."""
    stored_raw = str(card.get("gmail_thread_id") or "").strip()
    stored = normalize_stored_thread_id(stored_raw)
    stored_fresh, stored_mailbox, _ = fetch_thread_from_mailboxes(mailboxes, stored)
    stale_cleared = bool(stored_raw and (stored_raw != stored or not stored_fresh))

    best_tid = ""
    best_source = ""
    best_mailbox = ""
    best_score = (-1.0, -1)

    if stored_fresh:
        latest = max(date_sort_value(m.get("date")) for m in stored_fresh)
        best_tid = stored
        best_source = "stored"
        best_mailbox = stored_mailbox
        best_score = (latest, len(stored_fresh))

    email = str(card.get("email") or "").strip().lower()
    if allow_email_lookup and email and "@" in email:
        discovered, discovered_mailbox = lookup_thread_id_by_email_multi(mailboxes, email)
        if discovered:
            fresh, _, _ = fetch_thread_from_mailboxes(mailboxes, discovered)
            if fresh:
                latest = max(date_sort_value(m.get("date")) for m in fresh)
                score = (latest, len(fresh))
                if score > best_score:
                    best_tid = discovered
                    best_source = "email_lookup"
                    best_mailbox = discovered_mailbox
                    best_score = score

    return best_tid, best_source, stale_cleared, best_mailbox


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


def notify_resurfaced_cards(cards: list[dict[str, Any]]) -> None:
    if not cards:
        return
    lines = []
    for item in cards[:5]:
        name = str(item.get("business") or item.get("id") or "Lead").strip()
        lines.append(f"• {name}")
    extra = len(cards) - len(lines)
    summary = "\n".join(lines)
    if extra > 0:
        summary += f"\n• +{extra} more"
    message = (
        "🔁 Returning collab on old Gmail chain\n"
        f"{summary}\n"
        "Moved back to Active Gmail — reply owed."
    )
    try:
        from pipeline_health import send_telegram

        send_telegram(message)
    except Exception:
        pass


def rate_limited_result(retry_after: str = "") -> dict[str, Any]:
    return {
        "ok": False,
        "rate_limited": True,
        "retry_after": retry_after,
        "error": (
            "Gmail API rate limit — sync paused"
            + (f" until {retry_after}" if retry_after else "")
        ),
    }


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--bootstrap-limit", type=int, default=int(os.environ.get("GMAIL_DELTA_BOOTSTRAP_LIMIT", "80")))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--auth", action="store_true")
    args = parser.parse_args()

    load_env()

    try:
        return _run_delta_sync(args)
    except GmailRateLimited as exc:
        result = rate_limited_result(exc.retry_after)
        write_json(STATUS_FILE, {"updated_at": now_iso(), **result})
        print(json.dumps(result, indent=2))
        return 0


def _run_delta_sync(args: Any) -> int:
    mailboxes, blocked_retries = filter_available_mailboxes(
        load_gmail_mailboxes(interactive=args.auth)
    )
    if not mailboxes:
        result = rate_limited_result(min(blocked_retries) if blocked_retries else "")
        write_json(STATUS_FILE, {"updated_at": now_iso(), **result})
        print(json.dumps(result, indent=2))
        return 0
    thread_ids: set[str] = set()
    checkpoint_expired = False
    more_available = False
    mode = "bootstrap"
    history_ids: dict[str, str] = {}

    for label, service in mailboxes:
        try:
            profile = service.users().getProfile(userId="me").execute()
        except HttpError as exc:
            raise_if_rate_limited(exc, label)
            raise
        current_history = str(profile.get("historyId") or "")
        state_path = STATE_FILE if label == "asher" else STATE_DIR / f"gmail_delta_{label}_state.json"
        state = read_json(state_path, {})
        last_history = str(state.get("history_id") or "")
        history_ids[label] = current_history
        if last_history:
            try:
                ids, more = history_thread_ids(service, last_history)
                thread_ids.update(ids)
                more_available = more_available or more
                mode = "history"
            except HttpError as exc:
                if gmail_http_status(exc) == 404:
                    checkpoint_expired = True
                    thread_ids.update(recent_thread_ids(service, args.bootstrap_limit))
                    mode = "recent_fallback"
                else:
                    raise_if_rate_limited(exc, label)
                    raise
        else:
            thread_ids.update(recent_thread_ids(service, args.bootstrap_limit))
            if mode != "history":
                mode = "bootstrap"

    cards = load_cards()
    # A Gmail thread can map to several cards. Two cases: true duplicates (same deal),
    # and agency threads where distinct deals were intentionally split onto one thread
    # id. We must NOT fan a thread's messages out to every card (that cross contaminates
    # split deals), so keep one card per thread — but prefer an ACTIVE card over a
    # trashed one. The old code kept whichever card happened to be last, which is how a
    # live lead's reply flag landed on a trashed duplicate and went invisible.
    def _thread_owner_rank(c: dict[str, Any]) -> tuple:
        list_id = str(c.get("list_id") or "")
        if list_id in {"trash", "dead-leads"}:
            tier = 0
        elif list_id in CLOSED_RESURFACE_STAGES:
            tier = 1
        else:
            tier = 2
        thread = c.get("email_thread") or c.get("original_email") or []
        n = len(thread) if isinstance(thread, list) else 0
        return (tier, n, str(c.get("updated_at") or ""))
    cards_by_thread: dict[str, dict[str, Any]] = {}
    closed_cards_by_thread: dict[str, list[dict[str, Any]]] = {}
    for c in cards:
        tid = normalize_stored_thread_id(c.get("gmail_thread_id"))
        if not tid:
            continue
        if str(c.get("list_id") or "") in CLOSED_RESURFACE_STAGES:
            closed_cards_by_thread.setdefault(tid, []).append(c)
        cur = cards_by_thread.get(tid)
        if cur is None or _thread_owner_rank(c) > _thread_owner_rank(cur):
            cards_by_thread[tid] = c
    cards_by_email: dict[str, list[dict[str, Any]]] = {}
    for card in cards:
        email_addr = str(card.get("email") or "").strip().lower()
        if email_addr and "@" in email_addr:
            cards_by_email.setdefault(email_addr, []).append(card)

    try:
        healed_links = heal_stale_card_thread_links(
            mailboxes,
            cards,
            cards_by_thread,
            dry_run=args.dry_run,
        )
        refreshed_active = refresh_active_card_threads(
            mailboxes,
            cards,
            dry_run=args.dry_run,
        )
        refreshed_closed = refresh_closed_deal_threads(
            mailboxes,
            cards,
            dry_run=args.dry_run,
        )
    except GmailRateLimited as exc:
        result = rate_limited_result(exc.retry_after)
        write_json(STATUS_FILE, {"updated_at": now_iso(), **result})
        print(json.dumps(result, indent=2))
        return 0
    touched = list(refreshed_active) + list(refreshed_closed)
    unknown_threads = []
    for thread_id in sorted(thread_ids):
        try:
            fresh, _mailbox, _svc = fetch_thread_from_mailboxes(mailboxes, thread_id)
            if not fresh:
                continue
        except GmailRateLimited as exc:
            result = rate_limited_result(exc.retry_after)
            write_json(STATUS_FILE, {"updated_at": now_iso(), **result})
            print(json.dumps(result, indent=2))
            return 0
        except Exception as exc:
            unknown_threads.append({"thread_id": thread_id, "error": str(exc)[:160]})
            continue
        matched = match_cards_for_thread(
            fresh,
            thread_id,
            cards_by_thread,
            cards_by_email,
            closed_cards_by_thread=closed_cards_by_thread,
        )
        if not matched:
            unknown_threads.append({"thread_id": thread_id, "subject": fresh[-1].get("subject") if fresh else ""})
            continue
        for card in matched.values():
            merged = merge_threads(card.get("email_thread") or card.get("original_email") or [], fresh)
            card_email = str(card.get("email") or "").strip()
            if card_email:
                merged = slice_thread_for_contact(merged, card_email)
            payload, meta = build_card_thread_patch(card, merged, thread_id=thread_id)
            if not args.dry_run:
                supabase_patch(card["id"], payload)
            touched.append({
                "id": card["id"],
                "thread_id": thread_id,
                "business": card.get("business_name") or card.get("title"),
                "messages": len(merged),
                "latest_inbound": meta.get("latest_inbound"),
                "resurfaced": meta.get("resurfaced"),
                "source": "history",
            })

    if not args.dry_run:
        for label, current_history in history_ids.items():
            if not current_history:
                continue
            state_path = STATE_FILE if label == "asher" else STATE_DIR / f"gmail_delta_{label}_state.json"
            prev = read_json(state_path, {})
            write_json(state_path, {
                "history_id": current_history,
                "updated_at": now_iso(),
                "mode": mode,
                "last_history_id": str(prev.get("history_id") or ""),
            })

    resurfaced_cards = [item for item in touched if item.get("resurfaced")]
    notify_resurfaced_cards(resurfaced_cards)

    result = {
        "ok": True,
        "mode": mode,
        "healed_thread_links": healed_links[:25],
        "active_threads_refreshed": len(refreshed_active),
        "closed_threads_refreshed": len(refreshed_closed),
        "resurfaced_count": len(resurfaced_cards),
        "resurfaced": resurfaced_cards[:25],
        "checked_threads": len(thread_ids),
        "cards_updated": len(touched),
        "unknown_threads": unknown_threads[:25],
        "checkpoint_expired": checkpoint_expired,
        "more_available": more_available,
        "history_ids": history_ids,
        "updated": touched[:50],
        "dry_run": args.dry_run,
    }
    write_json(STATUS_FILE, {"updated_at": now_iso(), **result})
    print(json.dumps(result, indent=2))
    return 0


def find_thread_id_for_card(service: Any, card: dict[str, Any]) -> str:
    thread_id, _source, _stale = resolve_thread_id_for_card(service, card)
    return thread_id


def _sync_single_card_patch(
    card: dict[str, Any],
    merged: list[dict[str, Any]],
    thread_id: str,
    *,
    source: str,
    mailbox: str,
    stale_cleared: bool,
) -> dict[str, Any]:
    payload, meta = build_card_thread_patch(card, merged, thread_id=thread_id)
    supabase_patch(card["id"], payload)
    note = ""
    if stale_cleared and source == "email_lookup":
        note = "Re-linked to a newer Gmail thread for this contact."
    elif stale_cleared:
        note = "Cleared a stale Gmail thread link."
    return {
        "ok": True,
        "card_id": card["id"],
        "thread_id": thread_id,
        "thread_source": source,
        "mailbox": mailbox,
        "stale_thread_cleared": stale_cleared,
        "note": note,
        "business": card.get("business_name") or card.get("title"),
        "messages": len(merged),
        "latest_inbound": meta.get("latest_inbound"),
        "resurfaced": meta.get("resurfaced"),
    }


def _sync_single_card_impl(card_id: str | int) -> dict[str, Any]:
    mailboxes, blocked_retries = filter_available_mailboxes(load_gmail_mailboxes(interactive=False))
    if not mailboxes:
        return rate_limited_result(min(blocked_retries) if blocked_retries else "")
    rows = supabase_get(
        f"/rest/v1/cards?select=id,title,contact_name,business_name,email,list_id,gmail_thread_id,"
        f"email_thread,original_email,draft_reply,draft_reply_status,new_reply_at&id=eq.{card_id}&limit=1"
    )
    if not isinstance(rows, list) or not rows:
        return {"ok": False, "error": f"Card {card_id} not found"}
    card = rows[0]
    stored_thread = str(card.get("gmail_thread_id") or "").strip()
    stored = normalize_stored_thread_id(stored_thread)

    if stored:
        fresh, mailbox, _service = fetch_thread_from_mailboxes(mailboxes, stored)
        if fresh:
            merged = merge_threads(card.get("email_thread") or card.get("original_email") or [], fresh)
            card_email = str(card.get("email") or "").strip()
            if card_email:
                merged = slice_thread_for_contact(merged, card_email)
            return _sync_single_card_patch(
                card,
                merged,
                stored,
                source="stored",
                mailbox=mailbox,
                stale_cleared=bool(stored_thread and stored_thread != stored),
            )

    thread_id, source, stale_cleared, mailbox = resolve_thread_id_for_card_multi(
        mailboxes,
        card,
        allow_email_lookup=True,
    )
    if stale_cleared and not thread_id:
        supabase_patch(card["id"], {"gmail_thread_id": ""})
        return {
            "ok": False,
            "error": (
                "The saved Gmail thread was deleted or moved. "
                "No newer thread found for this email — run a full Gmail sync or verify the address."
            ),
            "stale_thread_cleared": True,
            "previous_thread_id": stored_thread,
        }
    if not thread_id:
        return {"ok": False, "error": "No Gmail thread linked to this lead yet. Run a full Gmail sync first."}
    fresh, mailbox, _service = fetch_thread_from_mailboxes(mailboxes, thread_id)
    if not fresh:
        if source == "stored":
            supabase_patch(card["id"], {"gmail_thread_id": ""})
        return {
            "ok": False,
            "error": "Gmail thread no longer exists. Run a full Gmail sync to re-link this lead.",
            "stale_thread_cleared": source == "stored",
            "previous_thread_id": stored_thread,
        }
    merged = merge_threads(card.get("email_thread") or card.get("original_email") or [], fresh)
    card_email = str(card.get("email") or "").strip()
    if card_email:
        merged = slice_thread_for_contact(merged, card_email)
    return _sync_single_card_patch(
        card,
        merged,
        thread_id,
        source=source,
        mailbox=mailbox,
        stale_cleared=stale_cleared,
    )


def sync_single_card(card_id: str | int) -> dict[str, Any]:
    """Pull one Gmail thread into a single Supabase card (on-demand from Company OS / Organs)."""
    load_env()
    try:
        return _sync_single_card_impl(card_id)
    except GmailRateLimited as exc:
        return rate_limited_result(exc.retry_after)
    except HttpError as exc:
        if gmail_http_status(exc) == 429:
            return rate_limited_result(record_gmail_rate_limit(exc))
        return {"ok": False, "error": f"Gmail error: {str(exc)[:240]}"}
    except Exception as exc:
        return {"ok": False, "error": str(exc)[:300]}


if __name__ == "__main__":
    if "--card-id" in sys.argv:
        import argparse as _argparse

        _parser = _argparse.ArgumentParser()
        _parser.add_argument("--card-id", required=True)
        _args = _parser.parse_args()
        print(json.dumps(sync_single_card(_args.card_id), indent=2))
        sys.exit(0)
    sys.exit(main())
