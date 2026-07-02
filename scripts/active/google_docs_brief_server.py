#!/usr/bin/env python3
"""
Local Google Docs brief server for Company OS Brief Maker.

POST http://127.0.0.1:8767/generate-brief-doc
Body: brief config JSON

Creates a Google Doc using local OAuth credentials and returns the Doc URL so it
can be dropped directly into Robert's calendar.
"""

from __future__ import annotations

from typing import Any

import hashlib
import json
import mimetypes
import os
import re
import time
import subprocess
import sys
import base64
import tempfile
import threading
import traceback
import uuid
import errno
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from urllib import request, error
from urllib.parse import parse_qs, unquote, urlparse

import google.auth.transport.requests
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError


HOST = "127.0.0.1"
PORT = 8767
STATE_DIR = Path.home() / ".config" / "google-credentials"
CLIENT_SECRET_FILE = STATE_DIR / "client_secret.json"
TOKEN_FILE = STATE_DIR / "google-docs-brief-token.json"
API_TOKEN_FILE = STATE_DIR / "brief_api_token.txt"
ROBERT_HANDOFF_PREVIEW_FILE = STATE_DIR / "robert_handoff_operator_preview.json"
BRIEF_JOBS_FILE = STATE_DIR / "brief_builder_jobs.json"
NOTION_EXTRACTOR = Path("/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/scripts/active/extract_notion_brief.mjs")
WEB_ROOT = Path("/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES")
SEND_EMAIL_TOKEN_FILE = WEB_ROOT / "lead-ingest-token.txt"
if str(WEB_ROOT) not in sys.path:
    sys.path.insert(0, str(WEB_ROOT))
SCOPES = [
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive.file",
    # drive.readonly lets us download uploaded Office files (.docx) and PDFs that the
    # Docs API refuses ("The document must not be an Office file").
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/tasks",
]
OPENCODE_CONFIG_FILE = Path.home() / ".config" / "opencode" / "opencode.json"
HERMES_ENV_FILE = Path.home() / ".hermes" / ".env"
DEFAULT_LLM_TARGETS = [
    {"base_url": "http://127.0.0.1:8642/v1", "model": "hermes-agent", "label": "Hermes API Qwen 3.6 35B", "auth": "hermes"},
    {"base_url": "http://127.0.0.1:11434/v1", "model": "qwen3.6:35b-a3b", "label": "Ollama Qwen 3.6 35B"},
]
PREFERRED_LOCAL_MODELS = [
    ("http://127.0.0.1:8642/v1", "hermes-agent"),
    ("http://127.0.0.1:11434/v1", "qwen3.6:35b-a3b"),
]
ALLOWED_ORIGINS = {
    "https://asherweisberger.github.io",
    "https://mac-studio.tail50d3a2.ts.net",
    "http://127.0.0.1:4174",
    "http://localhost:4174",
    "http://127.0.0.1:4173",
    "http://localhost:4173",
}

LOCAL_BRIEF_LLM_ENABLED = str(os.environ.get("LOCAL_BRIEF_LLM_ENABLED") or "1").strip().lower() in {"1", "true", "yes", "on"}
LOCAL_BRIEF_SKIP_FACTS = str(os.environ.get("LOCAL_BRIEF_SKIP_FACTS") or "1").strip().lower() in {"1", "true", "yes", "on"}
LOCAL_BRIEF_SKIP_DRAFTS = str(os.environ.get("LOCAL_BRIEF_SKIP_DRAFTS") or "1").strip().lower() in {"1", "true", "yes", "on"}
LOCAL_BRIEF_LLM_TIMEOUT_SEC = max(15, int(os.environ.get("LOCAL_BRIEF_LLM_TIMEOUT_SEC") or "35"))
NOTION_BRIEF_CACHE_TTL_SEC = max(60, int(os.environ.get("NOTION_BRIEF_CACHE_TTL_SEC") or "3600"))
NOTION_CACHE_DIR = STATE_DIR / "notion-brief-cache"

mimetypes.add_type("text/jsx", ".jsx")
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/javascript", ".mjs")

ACTIVE_SCRIPTS_DIR = WEB_ROOT / "scripts" / "active"
if str(ACTIVE_SCRIPTS_DIR) not in sys.path:
    sys.path.append(str(ACTIVE_SCRIPTS_DIR))

from robert_handoff_operator import (  # type: ignore
    CC_EMAILS as ROBERT_HANDOFF_CC_EMAILS,
    build_contextual_handoff,
    create_mime_message,
    load_env as load_robert_handoff_env,
    load_gmail_send_service as load_robert_gmail_send_service,
    mark_x_asset_sent as mark_robert_x_asset_sent,
)
from x_dm_draft import draft_x_dm_reply_for_lead  # type: ignore


BRIEF_JOBS_LOCK = threading.Lock()
BRIEF_JOBS: dict[str, dict] = {}
BRIEF_JOB_HISTORY_LIMIT = 40
BRIEF_JOB_CONTEXT = threading.local()


def get_api_token() -> str:
    token = line(os.environ.get("BRIEF_API_TOKEN"))
    if token:
        return token
    if API_TOKEN_FILE.exists():
        return line(API_TOKEN_FILE.read_text(encoding="utf-8"))
    return ""


def get_send_email_token() -> str:
    token = line(os.environ.get("SEND_EMAIL_TOKEN") or os.environ.get("LEAD_INGEST_TOKEN"))
    if token:
        return token
    if SEND_EMAIL_TOKEN_FILE.exists():
        raw = SEND_EMAIL_TOKEN_FILE.read_text(encoding="utf-8")
        for part in raw.splitlines():
            part = part.strip()
            if part.startswith("TOKEN="):
                return line(part.split("=", 1)[1])
        return line(raw)
    return ""


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


LOCAL_TZ = ZoneInfo("America/New_York")


def brief_log(message: str) -> None:
    stamp = datetime.now(LOCAL_TZ).strftime("%Y-%m-%d %H:%M:%S")
    print(f"{stamp} {message}", flush=True)


def save_brief_jobs() -> None:
    with BRIEF_JOBS_LOCK:
        ordered = sorted(
            BRIEF_JOBS.values(),
            key=lambda item: line(item.get("created_at")),
            reverse=True,
        )[:BRIEF_JOB_HISTORY_LIMIT]
        BRIEF_JOBS_FILE.write_text(json.dumps({"jobs": ordered}, indent=2), encoding="utf-8")


def load_brief_jobs() -> None:
    if not BRIEF_JOBS_FILE.exists():
        return
    try:
        payload = json.loads(BRIEF_JOBS_FILE.read_text(encoding="utf-8") or "{}")
        jobs = payload.get("jobs") or []
        changed = False
        with BRIEF_JOBS_LOCK:
            BRIEF_JOBS.clear()
            for item in jobs:
                if isinstance(item, dict) and line(item.get("id")):
                    current = dict(item)
                    if line(current.get("status")) in {"queued", "running"}:
                        current["status"] = "error"
                        current["error"] = "Brief build was interrupted when the local brief machine restarted. Please run it again."
                        current["updated_at"] = utc_now_iso()
                        current["finished_at"] = utc_now_iso()
                        changed = True
                    BRIEF_JOBS[line(current.get("id"))] = current
        if changed:
            save_brief_jobs()
    except Exception:
        pass


def brief_job_public(job: dict | None) -> dict:
    item = dict(job or {})
    item.pop("request_payload", None)
    return item


def list_brief_jobs(limit: int = 12) -> dict:
    with BRIEF_JOBS_LOCK:
        ordered = sorted(
            (brief_job_public(item) for item in BRIEF_JOBS.values()),
            key=lambda item: line(item.get("created_at")),
            reverse=True,
        )[:max(1, min(limit, BRIEF_JOB_HISTORY_LIMIT))]
    return {"ok": True, "jobs": ordered}


def get_brief_job(job_id: str) -> dict:
    key = line(job_id)
    with BRIEF_JOBS_LOCK:
        job = BRIEF_JOBS.get(key)
    if not job:
        raise ValueError("Brief job not found.")
    return {"ok": True, "job": brief_job_public(job)}


def update_brief_job(job_id: str, **changes) -> None:
    with BRIEF_JOBS_LOCK:
        job = BRIEF_JOBS.get(job_id) or {}
        job.update(changes)
        BRIEF_JOBS[job_id] = job
    save_brief_jobs()


def set_brief_job_stage(stage: str, detail: str = "") -> None:
    job_id = line(getattr(BRIEF_JOB_CONTEXT, "job_id", ""))
    if not job_id:
        return
    changes = {"updated_at": utc_now_iso(), "stage": line(stage)}
    if detail:
        changes["stage_detail"] = line(detail)
    update_brief_job(job_id, **changes)


def build_brief_job(payload: dict) -> dict:
    job_id = uuid.uuid4().hex[:12]
    source_url = line(payload.get("source_url") or payload.get("notion_url"))
    job = {
        "id": job_id,
        "status": "queued",
        "stage": "queued",
        "created_at": utc_now_iso(),
        "updated_at": utc_now_iso(),
        "source_url": source_url,
        "title": line(payload.get("title")),
        "request_payload": payload,
        "result": None,
        "error": "",
    }
    with BRIEF_JOBS_LOCK:
        BRIEF_JOBS[job_id] = job
    save_brief_jobs()
    brief_log(f"[job {job_id}] queued source={source_url or '(manual)'}")
    return job


def maybe_create_calendar_for_job(payload: dict, doc_url: str) -> dict | None:
    calendar_title = line(payload.get("calendar_title")) or line(payload.get("title"))
    if not calendar_title:
        return None
    if not line(payload.get("calendar_date")):
        return None
    if calendar_mode(payload) == "timed" and not line(payload.get("calendar_start")):
        return None
    working_payload = dict(payload)
    working_payload["calendar_title"] = calendar_title
    working_payload["doc_url"] = doc_url
    return create_calendar_hold(working_payload)


def run_brief_job(job_id: str) -> None:
    with BRIEF_JOBS_LOCK:
        job = BRIEF_JOBS.get(job_id)
    if not job:
        return
    BRIEF_JOB_CONTEXT.job_id = job_id
    payload = dict(job.get("request_payload") or {})
    update_brief_job(job_id, status="running", stage="starting", updated_at=utc_now_iso(), started_at=utc_now_iso(), error="")
    brief_log(f"[job {job_id}] started")
    try:
        set_brief_job_stage("building_doc", "Creating brief doc")
        brief_log(f"[job {job_id}] creating brief doc")
        result = create_brief_doc(payload)
        final_result = dict(result)
        merged_payload = dict(payload)
        if isinstance(final_result.get("payload"), dict):
            merged_payload.update(final_result.get("payload") or {})
        set_brief_job_stage("inferring_calendar", "Reading posting date")
        brief_log(f"[job {job_id}] inferring calendar fields")
        inferred_calendar = infer_calendar_fields_from_payload(merged_payload)
        if inferred_calendar:
            merged_payload.update(inferred_calendar)
            if isinstance(final_result.get("payload"), dict):
                final_result["payload"] = dict(final_result.get("payload") or {})
                final_result["payload"].update(inferred_calendar)
            brief_log(f"[job {job_id}] calendar fields inferred {inferred_calendar.get('calendar_date')} {inferred_calendar.get('calendar_start', '')}".rstrip())
        set_brief_job_stage("creating_calendar", "Creating calendar item" if inferred_calendar or line(merged_payload.get("calendar_date")) else "Finalizing brief")
        brief_log(f"[job {job_id}] creating calendar item" if inferred_calendar or line(merged_payload.get("calendar_date")) else f"[job {job_id}] no calendar item requested")
        calendar_result = maybe_create_calendar_for_job(merged_payload, line(result.get("url")))
        if calendar_result:
            final_result["calendar"] = calendar_result
            brief_log(f"[job {job_id}] calendar {calendar_result.get('kind')} ready")
        update_brief_job(
            job_id,
            status="done",
            stage="done",
            updated_at=utc_now_iso(),
            finished_at=utc_now_iso(),
            result=final_result,
            title=line(final_result.get("title")) or line(job.get("title")),
            error="",
        )
        brief_log(f"[job {job_id}] done doc={line(final_result.get('url'))}")
    except Exception as exc:
        brief_log(f"[job {job_id}] error {exc}")
        update_brief_job(
            job_id,
            status="error",
            stage="error",
            updated_at=utc_now_iso(),
            finished_at=utc_now_iso(),
            error=str(exc),
            error_trace=traceback.format_exc(limit=8),
        )
    finally:
        BRIEF_JOB_CONTEXT.job_id = ""


def start_brief_job(payload: dict) -> dict:
    job = build_brief_job(payload)
    worker = threading.Thread(target=run_brief_job, args=(job["id"],), daemon=True)
    worker.start()
    return {"ok": True, "job": brief_job_public(job)}


def allowed_origin(origin: str | None) -> str:
    normalized = line(origin)
    if normalized in ALLOWED_ORIGINS:
        return normalized
    return "*"


def send_json(handler: BaseHTTPRequestHandler, status: int, payload: dict) -> None:
    body = json.dumps(payload).encode("utf-8")
    try:
        handler.send_response(status)
        handler.send_header("Content-Type", "application/json")
        handler.send_header("Access-Control-Allow-Origin", allowed_origin(handler.headers.get("Origin")))
        handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        handler.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Brief-Token")
        handler.send_header("Vary", "Origin, Access-Control-Request-Private-Network")
        if line(handler.headers.get("Access-Control-Request-Private-Network")).lower() == "true":
            handler.send_header("Access-Control-Allow-Private-Network", "true")
        handler.send_header("Content-Length", str(len(body)))
        handler.end_headers()
        handler.wfile.write(body)
    except BrokenPipeError:
        pass


def safe_static_path(request_path: str) -> Path | None:
    parsed = urlparse(request_path or "/")
    raw_path = unquote(parsed.path or "/")
    candidate = "index.html" if raw_path in {"", "/"} else raw_path.lstrip("/")
    path_parts = [part for part in Path(candidate).parts if part not in {"", "."}]
    if any(part.startswith(".") for part in path_parts):
        return None
    resolved = (WEB_ROOT / candidate).resolve()
    try:
        resolved.relative_to(WEB_ROOT.resolve())
    except ValueError:
        return None
    if not resolved.is_file():
        return None
    return resolved


def send_file(handler: BaseHTTPRequestHandler, file_path: Path, *, head_only: bool = False) -> None:
    mime_type, _ = mimetypes.guess_type(str(file_path))
    body = file_path.read_bytes()
    handler.send_response(200)
    handler.send_header("Content-Type", mime_type or "application/octet-stream")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    if not head_only:
        handler.wfile.write(body)


def require_api_token(handler: BaseHTTPRequestHandler) -> bool:
    origin = line(handler.headers.get("Origin")).lower()
    client_host = line((handler.client_address or ("",))[0]).lower()
    host = line(handler.headers.get("Host")).lower()
    referer = line(handler.headers.get("Referer")).lower()
    if origin == "https://asherweisberger.github.io" and host.startswith("mac-studio.tail50d3a2.ts.net"):
        return True
    if origin == "https://mac-studio.tail50d3a2.ts.net" and host.startswith("mac-studio.tail50d3a2.ts.net"):
        return True
    # Same-origin GET (e.g. /send-email-token bootstrap) often omits Origin — allow Mac dashboard.
    if host.startswith("mac-studio.tail50d3a2.ts.net") and (
        not origin
        or origin in {"null", "file://"}
        or origin.startswith("https://mac-studio.tail50d3a2.ts.net")
        or referer.startswith("https://mac-studio.tail50d3a2.ts.net")
    ):
        return True
    if client_host in {"127.0.0.1", "::1", "localhost"} and (
        host.startswith("127.0.0.1:8767")
        or host.startswith("localhost:8767")
        or origin in {"", "null", "file://", "http://127.0.0.1:4174", "http://localhost:4174", "http://127.0.0.1:4173", "http://localhost:4173"}
    ):
        return True
    token = get_api_token()
    if not token:
        return True
    auth = line(handler.headers.get("Authorization"))
    if auth == f"Bearer {token}":
        return True
    header_token = line(handler.headers.get("X-Brief-Token"))
    return header_token == token


def load_docs_service(interactive: bool = True):
    creds = None
    if TOKEN_FILE.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
        except Exception:
            creds = None
    if creds and not creds.has_scopes(SCOPES):
        creds = None
    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(google.auth.transport.requests.Request())
            TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
        except Exception:
            creds = None
    if not creds and interactive:
        flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRET_FILE), SCOPES)
        creds = flow.run_local_server(port=0)
        TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
    if not creds:
        raise RuntimeError("Google Docs auth is not ready.")
    return build("docs", "v1", credentials=creds)


def load_drive_service(interactive: bool = True):
    creds = None
    if TOKEN_FILE.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
        except Exception:
            creds = None
    if creds and not creds.has_scopes(SCOPES):
        creds = None
    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(google.auth.transport.requests.Request())
            TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
        except Exception:
            creds = None
    if not creds and interactive:
        flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRET_FILE), SCOPES)
        creds = flow.run_local_server(port=0)
        TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
    if not creds:
        raise RuntimeError(
            "Google Drive read access is not authorized yet. Run "
            "scripts/active/reauth_brief_google.py once to grant it."
        )
    return build("drive", "v3", credentials=creds)


def _docx_bytes_to_lines(data: bytes) -> list[str]:
    """Extract readable text from a .docx (a zip of XML) without extra dependencies.

    Handles tables and structured-document-tag fields cleanly by turning paragraph
    and row boundaries into line breaks, then stripping every XML tag so only the
    text nodes remain (no leaked markup).
    """
    import io
    import zipfile

    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        xml = zf.read("word/document.xml").decode("utf-8", "ignore")
    # Preserve structure: paragraphs and table rows become line breaks, cells tab-separated.
    xml = re.sub(r"</w:p>", "\n", xml)
    xml = re.sub(r"</w:tr>", "\n", xml)
    xml = re.sub(r"</w:tc>", "\t", xml)
    # Remove every remaining tag; what's left is the actual text content.
    text = re.sub(r"<[^>]+>", "", xml)
    text = (
        text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
        .replace("&quot;", '"').replace("&#39;", "'").replace("&apos;", "'")
    )
    lines: list[str] = []
    for raw in text.split("\n"):
        cleaned = re.sub(r"[ \t]+", " ", raw).strip()
        if cleaned:
            lines.append(cleaned)
    return lines


def _public_drive_download(file_id: str) -> bytes:
    """Download a link-shared Drive file with no auth, the same way a browser would."""
    url = f"https://drive.google.com/uc?export=download&id={file_id}"
    req = request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with request.urlopen(req, timeout=30) as resp:
        data = resp.read()
    # Large files return an HTML virus-scan interstitial with a confirm token.
    if data[:1] == b"<" and b"confirm=" in data:
        token = ""
        m = re.search(rb"confirm=([0-9A-Za-z_\-]+)", data)
        if m:
            token = m.group(1).decode()
        if token:
            url2 = f"https://drive.google.com/uc?export=download&confirm={token}&id={file_id}"
            req2 = request.Request(url2, headers={"User-Agent": "Mozilla/5.0"})
            with request.urlopen(req2, timeout=30) as resp2:
                data = resp2.read()
    return data


def _bytes_to_lines(data: bytes, name: str = "", mime: str = "") -> list[str]:
    if data[:2] == b"PK" or "wordprocessingml" in mime or name.lower().endswith(".docx"):
        return _docx_bytes_to_lines(data)
    try:
        return [line(item) for item in data.decode("utf-8", "ignore").splitlines() if line(item)]
    except Exception:
        return []


def drive_file_to_source(file_id: str) -> dict:
    """Fallback reader for files the Docs API rejects: download from Drive and parse.

    Tries the authorized Drive API first (works for files shared to the account),
    then a public link download (works for 'anyone with the link' files). Handles
    uploaded Word files (.docx) without extra dependencies.
    """
    name = "Robert Brief"
    mime = ""
    data = b""

    # 1) Authorized Drive API (handles files explicitly shared to this account / shared drives)
    try:
        service = load_drive_service(interactive=False)
        meta = service.files().get(fileId=file_id, fields="name,mimeType", supportsAllDrives=True).execute()
        name = line(meta.get("name")) or name
        mime = str(meta.get("mimeType") or "")
        media = service.files().get_media(fileId=file_id).execute()
        data = media.encode("utf-8", "ignore") if isinstance(media, str) else media
    except Exception as exc:
        brief_log(f"Drive API read failed for {file_id} ({exc}); trying public link download")
        # 2) Public link download (handles 'anyone with the link' files)
        try:
            data = _public_drive_download(file_id)
        except Exception as exc2:
            raise ValueError(
                "Could not read this file. The brief maker's Google account cannot see it and it is "
                "not openable by link. Easiest fix: open it in Google Docs, choose File then "
                "Save as Google Docs, and paste that new link."
            ) from exc2

    lines = _bytes_to_lines(data, name=name, mime=mime)
    if not lines:
        raise ValueError(
            f"Could not extract text from this file ({mime or 'unknown type'}). "
            "Open it in Google Docs and use File then Save as Google Docs, then paste that link."
        )
    return {"title": name, "lines": lines[:1200], "links": []}


def load_calendar_service(interactive: bool = True):
    creds = None
    if TOKEN_FILE.exists():
      try:
          creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
      except Exception:
          creds = None
    if creds and not creds.has_scopes(SCOPES):
        creds = None
    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(google.auth.transport.requests.Request())
            TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
        except Exception:
            creds = None
    if not creds and interactive:
        flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRET_FILE), SCOPES)
        creds = flow.run_local_server(port=0)
        TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
    if not creds:
        raise RuntimeError("Google Calendar auth is not ready.")
    return build("calendar", "v3", credentials=creds)


def load_tasks_service(interactive: bool = True):
    creds = None
    if TOKEN_FILE.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
        except Exception:
            creds = None
    if creds and not creds.has_scopes(SCOPES):
        creds = None
    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(google.auth.transport.requests.Request())
            TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
        except Exception:
            creds = None
    if not creds and interactive:
        flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRET_FILE), SCOPES)
        creds = flow.run_local_server(port=0)
        TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
    if not creds:
        raise RuntimeError("Google Tasks auth is not ready.")
    return build("tasks", "v1", credentials=creds)


def line(value: str | None) -> str:
    return str(value or "").strip()


def normalize_calendar_date(value: datetime) -> str:
    return value.strftime("%Y-%m-%d")


def normalize_calendar_time(value: datetime) -> str:
    return value.strftime("%H:%M")


def infer_calendar_mode_from_text(*values: str) -> str:
    haystack = " ".join(line(value).lower() for value in values if line(value))
    if re.search(r"\b(interview|meeting|call|zoom|podcast|spaces|livestream|webinar|demo)\b", haystack):
        return "timed"
    return "all_day"


def parse_human_schedule_text(raw_value: str) -> dict | None:
    raw = line(raw_value)
    if not raw:
        return None
    text = raw
    month_pattern = r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
    fragment_match = re.search(
        rf"((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+)?{month_pattern}\s+\d{{1,2}}(?:st|nd|rd|th)?(?:\s*,?\s*\d{{4}})?(?:\s+at)?(?:\s+\d{{1,2}}(?::\d{{2}})?\s*(?:AM|PM))?(?:\s+(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|PT|ET|CT|MT))?",
        text,
        flags=re.I,
    )
    if fragment_match:
        text = fragment_match.group(0)
    text = re.sub(r"(?<=\d)(st|nd|rd|th)\b", "", text, flags=re.I)
    text = re.sub(r"\b(EST|EDT|CST|CDT|MST|MDT|PST|PDT|PT|ET|CT|MT)\b", lambda m: {
        "EST": "-0500",
        "EDT": "-0400",
        "CST": "-0600",
        "CDT": "-0500",
        "MST": "-0700",
        "MDT": "-0600",
        "PST": "-0800",
        "PDT": "-0700",
        "PT": "-0700",
        "ET": "-0400",
        "CT": "-0500",
        "MT": "-0600",
    }.get(m.group(1).upper(), m.group(0)), text)
    text = re.sub(r"\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b,?\s*", "", text, flags=re.I)
    text = re.sub(r"\b(?:on|at)\b", " ", text, flags=re.I)
    text = re.sub(r"\s+", " ", text.replace(",", " ")).strip()
    current_year = datetime.now(LOCAL_TZ).year
    formats = [
        ("%B %d %Y %I:%M %p %z", True),
        ("%b %d %Y %I:%M %p %z", True),
        ("%B %d %Y %H:%M %z", True),
        ("%b %d %Y %H:%M %z", True),
        ("%B %d %Y %I:%M %p", True),
        ("%b %d %Y %I:%M %p", True),
        ("%B %d %Y %H:%M", True),
        ("%b %d %Y %H:%M", True),
        ("%B %d %Y", False),
        ("%b %d %Y", False),
    ]
    candidates = [text]
    if not re.search(r"\b20\d{2}\b", text):
        with_year = re.sub(r"^([A-Za-z]+ \d+)", rf"\1 {current_year}", text)
        candidates = [with_year]
    for candidate in candidates:
        for fmt, has_time in formats:
            try:
                parsed = datetime.strptime(candidate, fmt)
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=LOCAL_TZ)
                else:
                    parsed = parsed.astimezone(LOCAL_TZ)
                end = parsed + timedelta(minutes=30)
                payload = {
                    "calendar_date": normalize_calendar_date(parsed),
                    "calendar_mode": "timed" if has_time else "all_day",
                }
                if has_time:
                    payload["calendar_start"] = normalize_calendar_time(parsed)
                    payload["calendar_end"] = normalize_calendar_time(end)
                return payload
            except ValueError:
                continue
    return None


def infer_calendar_fields_from_payload(payload: dict) -> dict:
    if line(payload.get("calendar_date")):
        return {}
    hints = [
        line(payload.get("email_context")),
        line(payload.get("go_live")),
        line(payload.get("go_live_note")),
        line(payload.get("title")),
        line(payload.get("announcement")),
    ]
    for hint in hints:
        parsed = parse_human_schedule_text(hint)
        if parsed:
            if not line(parsed.get("calendar_mode")):
                parsed["calendar_mode"] = infer_calendar_mode_from_text(*hints)
            return parsed
    return {}


def slug_filename(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", str(value or "")).strip("_")
    return cleaned or "Robert_Brief"


def gdoc_units(value: str) -> int:
    return len(str(value or "").encode("utf-16-le")) // 2


def extract_google_doc_id(url: str) -> str:
    match = re.search(r"/document/d/([a-zA-Z0-9_-]+)", str(url or ""))
    return match.group(1) if match else ""


def extract_section(lines: list[str], heading: str) -> list[str]:
    target = heading.lower()
    start = None
    for idx, current in enumerate(lines):
        if current.lower() == target:
            start = idx + 1
            break
    if start is None:
        return []
    captured: list[str] = []
    for current in lines[start:]:
        lowered = current.lower()
        if current.endswith(":") and len(captured) >= 1:
            break
        if any(
            lowered == marker
            for marker in (
                "recommended post structure",
                "campaign timeline",
                "how to write viral posts",
                "key messaging pillars (aha moments)",
                "notable poly ai customers",
                "campaign focus",
                "primary goal:",
                "what is poly ai solving?",
                "the problem:",
                "the solution:",
            )
        ):
            if lowered != target:
                break
        captured.append(current)
    return captured


def pick_first_url(text: str) -> str:
    match = re.search(r"https?://[^\s)>\]]+", text or "")
    return match.group(0) if match else ""


def post_json(url: str, payload: dict, timeout: int = 120) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    with request.urlopen(req, timeout=timeout) as response:
        body = response.read().decode("utf-8")
        return json.loads(body or "{}")


def fetch_json(url: str, timeout: int = 15) -> dict:
    req = request.Request(url, headers={"Content-Type": "application/json"}, method="GET")
    with request.urlopen(req, timeout=timeout) as response:
        body = response.read().decode("utf-8")
        return json.loads(body or "{}")


def load_hermes_api_key() -> str:
    env_key = line(os.environ.get("API_SERVER_KEY"))
    if env_key:
        return env_key
    if HERMES_ENV_FILE.exists():
        try:
            for raw_line in HERMES_ENV_FILE.read_text(encoding="utf-8").splitlines():
                current = raw_line.strip()
                if current.startswith("API_SERVER_KEY="):
                    return line(current.split("=", 1)[1])
        except Exception:
            return ""
    return ""


def json_headers(extra: dict[str, str] | None = None) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if extra:
        headers.update(extra)
    return headers


def hermes_auth_headers() -> dict[str, str]:
    key = load_hermes_api_key()
    if not key:
        return {}
    return {"Authorization": f"Bearer {key}"}


def post_json_with_headers(url: str, payload: dict, headers: dict[str, str] | None = None, timeout: int = 120) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = request.Request(url, data=data, headers=json_headers(headers), method="POST")
    with request.urlopen(req, timeout=timeout) as response:
        body = response.read().decode("utf-8")
        return json.loads(body or "{}")


def fetch_json_with_headers(url: str, headers: dict[str, str] | None = None, timeout: int = 15) -> dict:
    req = request.Request(url, headers=json_headers(headers), method="GET")
    with request.urlopen(req, timeout=timeout) as response:
        body = response.read().decode("utf-8")
        return json.loads(body or "{}")


def extract_json_block(text: str) -> dict:
    raw = line(text)
    if not raw:
        raise ValueError("Empty model response.")
    raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.I)
    raw = re.sub(r"\s*```$", "", raw)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw, flags=re.S)
        if match:
            return json.loads(match.group(0))
    raise ValueError("Could not parse model JSON response.")


def load_local_llm_targets() -> list[dict]:
    targets: list[dict] = []
    seen: set[tuple[str, str]] = set()
    hermes_base = "http://127.0.0.1:8642/v1"
    hermes_label = "Hermes API Qwen 3.6 35B"

    def add_target(base_url: str, model_id: str, label: str) -> None:
        extra_headers = hermes_auth_headers() if "127.0.0.1:8642" in line(base_url) else {}
        normalized_base = line(base_url).rstrip("/")
        normalized_model = line(model_id)
        if not normalized_base or not normalized_model:
            return
        key = (normalized_base, normalized_model)
        if key in seen:
            return
        seen.add(key)
        target = {"base_url": normalized_base, "model": normalized_model, "label": label}
        if extra_headers:
            target["headers"] = extra_headers
        targets.append(target)

    available_by_base: dict[str, set[str]] = {}
    for base_url, _ in PREFERRED_LOCAL_MODELS:
        try:
            headers = hermes_auth_headers() if "127.0.0.1:8642" in line(base_url) else None
            models_payload = fetch_json_with_headers(f"{base_url.rstrip('/')}/models", headers=headers, timeout=8)
            model_ids = {
                line(item.get("id"))
                for item in (models_payload.get("data") or [])
                if isinstance(item, dict) and line(item.get("id"))
            }
            if model_ids:
                available_by_base[base_url.rstrip("/")] = model_ids
        except Exception:
            continue

    hermes_models = available_by_base.get(hermes_base) or set()
    hermes_model = ""
    if "hermes-agent" in hermes_models:
        hermes_model = "hermes-agent"
    elif "qwen3.6:35b-a3b" in hermes_models:
        hermes_model = "qwen3.6:35b-a3b"

    if hermes_model:
        brief_log(f"brief-models: using Hermes model {hermes_model}")
        add_target(hermes_base, hermes_model, hermes_label)
        return targets
    if hermes_models:
        brief_log(f"brief-models: Hermes reachable but preferred model missing. Available: {', '.join(sorted(hermes_models)[:8])}")
    else:
        brief_log("brief-models: Hermes unavailable or rejected, falling back")

    for base_url, model_id in PREFERRED_LOCAL_MODELS:
        normalized_base = base_url.rstrip("/")
        available_models = available_by_base.get(normalized_base)
        if not available_models or model_id not in available_models:
            continue
        if "8642" in normalized_base:
            label = "Hermes Qwen Blank Slate"
        elif "11434" in normalized_base:
            label = f"Ollama {model_id}"
        else:
            label = model_id
        add_target(normalized_base, model_id, label)

    for default in DEFAULT_LLM_TARGETS:
        normalized_base = default["base_url"].rstrip("/")
        available_models = available_by_base.get(normalized_base)
        if available_models and default["model"] in available_models:
            add_target(default["base_url"], default["model"], default["label"])
    return targets


def llm_prompt_for_brief(source: dict) -> str:
    title = line(source.get("title")) or "Robert Brief"
    source_url = line(source.get("source_url"))
    email_context = line(source.get("email_context"))
    links = source.get("links") or []
    source_text = line(source.get("source_text"))
    link_lines = "\n".join(
        f"- {line(item.get('text'))}: {line(item.get('href'))}"
        for item in links[:20]
        if line(item.get("href"))
    )
    trimmed_source = source_text[:5500]
    return f"""Extract a Robert Scoble sponsorship brief from the source below.

Return valid JSON only. No markdown. No explanation. No invented facts.
Use short confident prose. No hyphens or em dashes.

Return exactly this JSON:
{{
  "title": "",
  "company_name": "",
  "about_company": "",
  "core_idea": "",
  "how_it_works": "",
  "announcement": "",
  "deliverable_type": "",
  "go_live": "",
  "go_live_note": "",
  "angles_or_accuracy_requirements": [],
  "where_it_lives": [["Label", "Value"]],
  "status_note": [],
  "why_alignednews": "",
  "drafts": [
    {{"label": "Option 1. Core angle. Recommended", "text": ""}},
    {{"label": "Option 2. Why now angle", "text": ""}},
    {{"label": "Option 3. Operator angle", "text": ""}}
  ],
  "must_include": {{
    "tag": "",
    "link": "",
    "hashtags": ""
  }},
  "submit_url": ""
}}

House rules:
- Match locked client accuracy language word for word.
- Every draft must be fully written. No empty drafts. No placeholders.
- If the deliverable is a dedicated thread, each draft must include Main post, Reply 1, and Reply 2.
- Do not paste source headings as content.
- Use the product's real hooks, proof points, named moments, facts, audience framing, and terminology from the source.
- Do not use generic filler like "AI employee angle" unless the source explicitly centers that concept.
- Drafts should end with CTA and required tags when present.

Source title:
{title}

Source URL:
{source_url}

Last sender email context:
{email_context or "(none provided)"}

Linked references:
{link_lines or "(none)"}

Source text:
{trimmed_source}
"""


def llm_prompt_for_drafts(source: dict, base_payload: dict) -> str:
    company_name = line(base_payload.get("company_name")) or "the company"
    title = line(base_payload.get("title")) or "Robert Brief"
    deliverable_type = line(base_payload.get("deliverable_type")) or "Custom post"
    about_company = line(base_payload.get("about_company"))
    core_idea = line(base_payload.get("core_idea"))
    how_it_works = line(base_payload.get("how_it_works"))
    announcement = line(base_payload.get("announcement"))
    why_alignednews = line(base_payload.get("why_alignednews"))
    go_live = line(base_payload.get("go_live"))
    must_include = base_payload.get("must_include") or {}
    tag = line(must_include.get("tag"))
    link_value = line(must_include.get("link"))
    hashtags = line(must_include.get("hashtags"))
    angles = "\n".join(f"- {line(item)}" for item in (base_payload.get("angles_or_accuracy_requirements") or [])[:8] if line(item))
    status_lines = "\n".join(f"- {line(item)}" for item in (base_payload.get("status_note") or [])[:8] if line(item))
    source_text = line(source.get("source_text"))[:5500]
    email_context = line(source.get("email_context"))
    return f"""You write short social posts in the voice of Robert Scoble. The voice is the most important thing. Get it right.

Robert is a tech analyst and futurist. Calm, credible, first person. Never a hype man, never marketing.

How to write it:
- Lead with one vivid, concrete metaphor that reframes the problem so the reader pictures it in a second. The model example: "Most autonomous agents are just demos with a human babysitter. Hyperagent kills the babysitter." Picture-able, a little playful, instantly clear. Reach for a fresh image each time (a babysitter, an intern who only works when watched, a Tamagotchi, a pager). Do not force a violent verb like "kills" every time. Vary it.
- Then state the product as the plain fix in one or two short sentences. What it is, plus the one or two proof points that actually matter (a real number, a named mechanic). No feature lists.
- Keep it short. A few tight lines, texting tone, conversational. Not an essay, not paragraphs of analysis.
- A clear, slightly controversial stance is good. That is his lane.
- If AlignedNews.com genuinely fits, drop it once as a real aside, never a slogan. It does not need to appear in every option.

FOLLOW THE SOURCE. If the brief or the sponsor email states a tone, a style, or do's and don'ts (for example "texting tone, short, no long essays, no PR speak, take a controversial stance"), follow them exactly. They override the defaults here.

Hard bans (not his voice, and most briefs ban them too): "excited to share", "game-changer", exclamation-heavy hype, PR speak, slogans, and feature bullet lists that read like a product sheet.

Vary the metaphor and the angle across the three options so they never blur together.

Return valid JSON only. No markdown fence. No explanation.
No hyphens or em dashes anywhere.
Each draft must feel source specific, not templated.
Do not repeat the same CTA line in every option.
Use the last sender email context when present to understand what the sponsor emphasized, how they framed the ask, and any delivery constraints.

Return exactly this JSON:
{{
  "why_alignednews": "",
  "drafts": [
    {{"label": "Option 1. Recommended", "text": ""}},
    {{"label": "Option 2. Technical angle", "text": ""}},
    {{"label": "Option 3. Market angle", "text": ""}}
  ]
}}

Rules:
- If deliverable type is a dedicated thread, every draft must use:
  Main post:
  Reply 1:
  Reply 2:
- Option 1 should be the strongest and most post ready.
- Each option must use a genuinely different framing AND different proof points. The three must not blur together.
- Do not lean on a single recurring image or prop across the options. Never reuse the same physical hook (for example a laptop sleeping, closing the lid, the screen, or wifi) in more than one option, and prefer not to use that tired laptop framing at all. Reach for the real distinction instead: session bound vs persistent, babysat vs unattended, one machine vs dedicated per agent, forgets vs remembers, runs only when watched vs runs on its own.
- Default to tight copy: a few short lines per option, not several long paragraphs, unless the deliverable is explicitly a long thread.
- Option 1 must make a natural tie in to AlignedNews.com. The other options should do that too when it fits.
- Write like the post is ready to publish right now. No brief notes. No explainer copy. No internal commentary.
- Keep the copy punchy and readable. Short paragraphs. Strong first line. Concrete proof points.
- Avoid generic product-sheet phrasing like "see behaviors" or "this matters because".
- If you reference AlignedNews.com, do it once, naturally, in Robert's voice. It should feel like a real closing thought, not a slogan.
- Prefer lines like "What I like here is..." or "What stands out to me is..." over stiff framing like "This is the kind of shift I cover".
- Pull from named proof points, product mechanics, launch details, and exact source language when useful.
- Do not paste scheduling metadata like launch date, go live time, posting window, or approval notes into the draft copy.
- Do not paste sections like Essential Information, Important Logistics, Status Note, company website, CTA URL, or posting instructions into the draft copy.
- Do not write compliance placeholders like "Paid partnership disclosure here for compliance" in the draft body.
- Do not write notes to yourself like "tone: provocative" or "the thesis is" inside the post copy.
- Do not invent metrics or facts.
- If a tag or link is required, include it in a natural close, not as a wall of text.

Campaign title:
{title}

Company:
{company_name}

Deliverable:
{deliverable_type}

About company:
{about_company}

Core idea:
{core_idea}

How it works:
{how_it_works}

Announcement:
{announcement}

Why it matters for AlignedNews:
{why_alignednews}

Go live:
{go_live}

Must include:
- Tag: {tag or "(none)"}
- Link: {link_value or "(none)"}
- Hashtags: {hashtags or "(none)"}

Angles and accuracy requirements:
{angles or "- (none provided)"}

Status notes:
{status_lines or "- (none provided)"}

Last sender email context:
{email_context or "(none provided)"}

Source text:
{source_text}
"""


def query_local_brief_json(
    *,
    prompt: str,
    system_prompt: str,
    max_tokens: int,
    stage_label: str = "local-model",
) -> dict | None:
    targets = load_local_llm_targets()
    errors: list[str] = []
    for target in targets:
        base_url = line(target.get("base_url")).rstrip("/")
        model = line(target.get("model"))
        if not base_url or not model:
            continue
        try:
            request_timeout = LOCAL_BRIEF_LLM_TIMEOUT_SEC if "127.0.0.1:8642" in base_url else min(LOCAL_BRIEF_LLM_TIMEOUT_SEC + 15, 60)
            brief_log(f"{stage_label}: calling {target.get('label') or model}")
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.2,
                "max_tokens": max_tokens,
            }
            data = post_json_with_headers(f"{base_url}/chat/completions", payload, headers=target.get("headers"), timeout=request_timeout)
            content = (((data.get("choices") or [{}])[0]).get("message") or {}).get("content", "")
            parsed = extract_json_block(content)
            if isinstance(parsed, dict):
                brief_log(f"{stage_label}: success from {target.get('label') or model}")
                parsed["_local_model"] = {"base_url": base_url, "model": model, "label": target.get("label")}
                return parsed
        except Exception as exc:
            brief_log(f"{stage_label}: failed on {target.get('label') or model}: {exc}")
            errors.append(f"{target.get('label') or model}: {exc}")
            continue
    if errors:
        brief_log(f"{stage_label}: no model result {' | '.join(errors)}")
    return None


def query_local_brief_model(source: dict) -> dict | None:
    set_brief_job_stage("extracting_facts", "Extracting campaign facts")
    prompt = llm_prompt_for_brief(source)
    return query_local_brief_json(
        prompt=prompt,
        system_prompt="You are a precise JSON extraction engine.",
        max_tokens=1800,
        stage_label="brief-facts",
    )


def query_local_brief_drafts(source: dict, base_payload: dict) -> dict | None:
    set_brief_job_stage("writing_drafts", "Writing draft options")
    prompt = llm_prompt_for_drafts(source, base_payload)
    return query_local_brief_json(
        prompt=prompt,
        system_prompt=(
            "You write social posts in the voice of Robert Scoble: a calm, credible tech "
            "analyst and futurist. Thesis first, plain declarative first person, a contrarian "
            "opening, concrete proof points from the source, and a natural close in his own "
            "words. Never marketing hype, slogans, or feature bullet lists. No hyphens. "
            "Return strict JSON only."
        ),
        max_tokens=2200,
        stage_label="brief-drafts",
    )


def merge_brief_payload(base: dict, llm_payload: dict | None) -> dict:
    if not llm_payload:
        return base
    merged = dict(base)
    joined_lines = str(base.get("source_text") or "")
    scalar_fields = (
        "title",
        "company_name",
        "about_company",
        "core_idea",
        "how_it_works",
        "announcement",
        "deliverable_type",
        "go_live",
        "go_live_note",
        "why_alignednews",
        "submit_url",
    )
    for field in scalar_fields:
        value = line(llm_payload.get(field))
        if value:
            merged[field] = value
    for field in ("angles_or_accuracy_requirements", "status_note", "where_it_lives"):
        value = llm_payload.get(field)
        if value:
            merged[field] = value
    draft_values = llm_payload.get("drafts") or []
    valid_drafts = []
    for item in draft_values:
        if not isinstance(item, dict):
            continue
        label_value = line(item.get("label"))
        text_value = clean_draft_text(item.get("text") or "")
        if not text_value or draft_text_is_lazy(text_value, joined_lines):
            continue
        valid_drafts.append({"label": label_value, "text": text_value})
    if valid_drafts:
        merged["drafts"] = valid_drafts
    must_include = dict(base.get("must_include") or {})
    llm_must_include = llm_payload.get("must_include") or {}
    for field in ("tag", "link", "hashtags"):
        value = line(llm_must_include.get(field))
        if value:
            must_include[field] = value
    merged["must_include"] = must_include
    local_model = llm_payload.get("_local_model")
    if local_model:
        merged["local_model"] = local_model
    return merged


def merge_draft_payload(base: dict, llm_payload: dict | None) -> dict:
    if not llm_payload:
        return base
    merged = dict(base)
    joined_lines = str(base.get("source_text") or "")
    valid_drafts = []
    for item in (llm_payload.get("drafts") or []):
        if not isinstance(item, dict):
            continue
        label_value = line(item.get("label"))
        text_value = clean_draft_text(item.get("text") or "")
        if not text_value or draft_text_is_lazy(text_value, joined_lines):
            continue
        valid_drafts.append({"label": label_value or "Option", "text": text_value})
    if valid_drafts:
        merged["drafts"] = valid_drafts
    why_alignednews = polish_alignednews_sentence(llm_payload.get("why_alignednews"))
    if why_alignednews and not draft_text_is_lazy(why_alignednews, joined_lines):
        merged["why_alignednews"] = why_alignednews
    merged["drafts"] = ensure_drafts_reference_alignednews(
        list(merged.get("drafts") or []),
        line(merged.get("why_alignednews")),
        line(merged.get("deliverable_type")),
    )
    local_model = llm_payload.get("_local_model")
    if local_model:
        merged["local_model"] = local_model
    return merged


def should_run_x_signal_for_brief(payload: dict) -> bool:
    explicit = payload.get("x_signal")
    if isinstance(explicit, dict) and explicit.get("enabled") is False:
        return False
    deliverable = line(payload.get("deliverable_type")).lower()
    title = line(payload.get("title")).lower()
    source_text = line(payload.get("source_text")).lower()
    must = payload.get("must_include") or {}
    if line(must.get("tag")).startswith("@"):
        return True
    haystack = " ".join([deliverable, title, source_text[:1000]])
    return any(term in haystack for term in ("x.com", "twitter", "qrt", "quote repost", "quote tweet", "amplification x"))


def parse_agency_constraints(email_context: str) -> dict:
    text = line(email_context)
    if not text:
        return {}
    lowered = text.lower()
    max_chars = None
    match = re.search(r"maximum of (\d{2,3}) characters", lowered)
    if match:
        max_chars = int(match.group(1))
    elif "280 character" in lowered:
        max_chars = 280
    standalone_post = any(
        phrase in lowered
        for phrase in ("standalone post", "no retweets", "no retweet", "no qrt", "no quote tweet")
    )
    return {
        "standalone_post": standalone_post,
        "post_format": "standalone_single" if standalone_post else "",
        "max_thread_replies": 0 if standalone_post else 2,
        "max_chars": max_chars,
        "no_emojis": "no emojis" in lowered or "do not include emojis" in lowered,
        "no_urls_in_copy": (
            ("do not include" in lowered and "url" in lowered)
            or "no urls in the post" in lowered
            or "no emojis or urls" in lowered
            or bool(re.search(r"no\s+urls?\s+in\s+(?:the\s+)?post", lowered))
        ),
        "link_in_reply": "257 character" in lowered or "reduces the available character" in lowered,
        "media_allowed": "video under" in lowered or "image is allowed" in lowered,
        "raw_requirements": text,
    }


def agency_requirement_lines(constraints: dict) -> list[str]:
    if not constraints:
        return []
    lines_out: list[str] = []
    if constraints.get("standalone_post"):
        lines_out.append("Format: Custom X Post (one standalone tweet). Not a multi-reply thread.")
        lines_out.append("Standalone post only. No retweets, QRTs, or quote tweets.")
    if constraints.get("max_chars"):
        lines_out.append(f"Main post copy max {constraints['max_chars']} characters.")
    if constraints.get("no_emojis"):
        lines_out.append("No emojis in the main post copy.")
    if constraints.get("no_urls_in_copy"):
        lines_out.append("No URLs in the main post copy. Put the link in a reply.")
    if constraints.get("link_in_reply"):
        lines_out.append("Each link costs about 23 characters. Budget ~257 characters if you include a link in the main post.")
    if constraints.get("media_allowed"):
        lines_out.append("Media optional: video under 15 seconds or an image may be attached (not required).")
    return lines_out


def apply_agency_constraints_to_payload(payload: dict) -> dict:
    constraints = parse_agency_constraints(line(payload.get("email_context")))
    if not constraints:
        return payload
    merged = dict(payload)
    merged["agency_constraints"] = constraints
    requirements = agency_requirement_lines(constraints)
    if requirements:
        existing = [line(item) for item in (merged.get("angles_or_accuracy_requirements") or []) if line(item)]
        merged["angles_or_accuracy_requirements"] = requirements + [
            item for item in existing if item not in requirements
        ]
    if constraints.get("standalone_post"):
        merged["deliverable_type"] = "Custom X post (standalone)"
        merged["post_format"] = "standalone_single"
        merged["max_thread_replies"] = 0
    post_format, max_replies = resolve_post_format(
        agency_constraints=constraints,
        deliverable_type=line(merged.get("deliverable_type")),
    )
    if constraints:
        merged["post_format"] = post_format
        merged["max_thread_replies"] = max_replies
    campaign_angles = merged.get("campaign_angles") or []
    if campaign_angles and merged.get("drafts_source") == "notion_angles":
        must = merged.get("must_include") or {}
        merged["drafts"] = compose_notion_angle_drafts(
            campaign_angles,
            x_post_structure=merged.get("x_post_structure") or [],
            tag=line(must.get("tag")),
            hashtags=line(must.get("hashtags")),
            link=line(must.get("link")),
            post_format=post_format,
            max_replies=max_replies,
        )
        merged["drafts_source"] = "notion_angles"
    if constraints.get("standalone_post"):
        go_live = line(merged.get("go_live")).lower()
        conflict_note = (
            "Agency requires a standalone post. The Notion brief may mention QRT or reacting to Zeb. "
            "Confirm with the client which rule applies to Robert before posting."
        )
        prior = line(merged.get("go_live_note"))
        if "qrt" in go_live or "quote" in go_live or "react" in go_live:
            merged["go_live_note"] = f"{prior} {conflict_note}".strip() if prior else conflict_note
    status = [line(item) for item in (merged.get("status_note") or []) if line(item)]
    if requirements and not any("agency requirements" in item.lower() for item in status):
        status.insert(0, "Agency requirements from the sender text box apply. See Potential Content Angles.")
    merged["status_note"] = status
    return merged


def strip_hyphens_from_paragraph(text: str) -> str:
    out = line(text)
    if not out:
        return ""
    for dash in ("—", "–", "−", "‒"):
        out = out.replace(dash, ". ")
    out = re.sub(r"\s+-\s+", ". ", out)
    out = re.sub(r"(?<![/@#])(?<!\w)-(?!\w)", " ", out)
    out = re.sub(r"(\w)-(\w)", r"\1 \2", out)
    out = re.sub(r"\.\s*\.", ".", out)
    return re.sub(r"[ \t]+", " ", out).strip()


def strip_hyphens_from_copy(text: str) -> str:
    """Robert post copy: no hyphens or em/en dashes anywhere."""
    raw = str(text or "").strip()
    if not raw:
        return ""
    main, reply_note = split_link_in_reply_note(raw)
    if "Main post:" in main or re.search(r"Reply\s+\d+:", main):
        blocks = re.split(r"\n\s*(?=Main post:|Reply\s+\d+:)", main)
        cleaned_blocks = [strip_hyphens_from_paragraph(block) for block in blocks if line(block)]
        out = "\n\n".join(cleaned_blocks).strip()
    else:
        out = strip_hyphens_from_paragraph(main)
    if reply_note:
        reply = strip_hyphens_from_paragraph(reply_note)
        return f"{out}\n\n{reply}".strip()
    return out


def strip_hyphens_from_label(text: str) -> str:
    out = line(text)
    if not out:
        return ""
    for dash in ("—", "–", "−", "‒"):
        out = out.replace(dash, ". ")
    out = re.sub(r"\s+-\s+", ". ", out)
    out = re.sub(r"\s+", " ", out).strip()
    return out


def polish_robert_draft_item(draft: dict) -> dict:
    if not isinstance(draft, dict):
        return draft
    out = dict(draft)
    if line(out.get("text")):
        out["text"] = strip_hyphens_from_copy(line(out.get("text")))
    if line(out.get("label")):
        out["label"] = strip_hyphens_from_label(line(out.get("label")))
    if line(out.get("reach_reason")):
        out["reach_reason"] = strip_hyphens_from_label(line(out.get("reach_reason")))
    return out


def polish_robert_drafts(payload: dict) -> dict:
    merged = dict(payload)
    drafts = [polish_robert_draft_item(item) for item in (merged.get("drafts") or []) if isinstance(item, dict)]
    if drafts:
        merged["drafts"] = drafts
    reach = merged.get("recommended_reach")
    if isinstance(reach, dict) and line(reach.get("label")):
        merged["recommended_reach"] = {
            **reach,
            "label": strip_hyphens_from_label(line(reach.get("label"))),
            "reach_reason": strip_hyphens_from_label(line(reach.get("reach_reason"))),
        }
    return merged


def draft_suffix_already_present(text: str, part: str) -> bool:
    part = line(part)
    if not part:
        return True
    return part.lower() in text.lower()


def split_link_in_reply_note(text: str) -> tuple[str, str]:
    raw = line(text)
    if not raw:
        return "", ""
    match = re.search(r"(?i)\n\s*Link in reply:\s*.+$", raw)
    if not match:
        return raw, ""
    main = raw[: match.start()].strip()
    reply = raw[match.start() :].strip()
    return main, reply


def draft_needs_standalone_rewrite(text: str) -> bool:
    main, _ = split_link_in_reply_note(text)
    return bool(
        re.search(
            r"(?i)QRT|quote[\s-]?tweet|retweet|redefine how you work|^\d+\s+AI Tools|I'd QRT",
            main,
        )
    )


def rewrite_standalone_draft_text(text: str, *, company: str = "", topic: str = "brain") -> str:
    main, reply_note = split_link_in_reply_note(text)
    out = clean_draft_text(main)
    company = line(company) or "ClickUp"
    topic = line(topic) or "brain"
    if not draft_needs_standalone_rewrite(out):
        merged = out
        if reply_note:
            merged = f"{merged}\n\n{reply_note}".strip()
        return merged
    out = re.sub(r"(?i)^\d+\s+AI Tools[^.]*\.\s*", "", out)
    out = re.sub(r"(?i)I['’]?d QRT (?:this|that)(?: and tie in [^.]*)?", "", out)
    out = re.sub(r"(?i)\b(QRT|quote[\s-]?tweet|retweet)\b", "", out)
    out = re.sub(r"(?i)Anchor:.*", "", out)
    out = re.sub(r"\s*…\s*", " ", out)
    out = (
        f"Everyone is sharing {topic} tool lists right now. "
        f"Lists are fine. Workflow context is still the gap. "
        f"My take after testing {company} Brain² with a real team."
    )
    out = re.sub(r":\s*$", "", out)
    out = re.sub(r"\(\s*" + re.escape(topic) + r"\s*\)\s*$", "", out, flags=re.I)
    out = re.sub(r"\s+", " ", out).strip()
    if reply_note:
        out = f"{out}\n\n{reply_note}".strip()
    return out


def sanitize_agency_draft_item(
    draft: dict,
    constraints: dict,
    must: dict | None = None,
    *,
    company: str = "",
    topic: str = "brain",
) -> dict:
    if not constraints or not isinstance(draft, dict):
        return draft
    out = dict(draft)
    must = must or {}
    label = line(out.get("label"))
    if constraints.get("standalone_post"):
        label = re.sub(r"(?i)QRT this thread|QRT their post|\bQRT\b", "Standalone post", label)
        label = re.sub(r"\s+", " ", label).strip()
        out["label"] = label
        enforced = enforce_draft_agency_constraints(
            line(out.get("text")),
            constraints,
            must,
            company=company,
            topic=topic,
            rewrite_body=False,
        )
        rewritten = rewrite_standalone_draft_text(enforced, company=company, topic=topic)
        main, reply_note = split_link_in_reply_note(rewritten)
        out["text"] = enforce_draft_agency_constraints(
            main,
            constraints,
            must,
            company=company,
            topic=topic,
            rewrite_body=False,
        )
        if reply_note and "link in reply:" not in line(out.get("text")).lower():
            out["text"] = f"{line(out.get('text'))}\n\n{reply_note}".strip()
        reason = line(out.get("reach_reason"))
        if reason:
            reason = reason.replace("wave 2 on wave 1 (QRT)", "live thread context (standalone)")
            reason = re.sub(r"(?i)\bqrt\b", "standalone", reason)
            out["reach_reason"] = reason
        out["anchor"] = ""
    else:
        out["text"] = enforce_draft_agency_constraints(line(out.get("text")), constraints, must)
    return polish_robert_draft_item(out)


def finalize_drafts_for_agency(payload: dict) -> dict:
    constraints = payload.get("agency_constraints") or {}
    if not constraints:
        return payload
    merged = dict(payload)
    must = merged.get("must_include") or {}
    company = line(merged.get("company_name"))
    topic = infer_x_signal_topic(merged).split()[0].lower() if infer_x_signal_topic(merged) else "brain"
    drafts = [
        sanitize_agency_draft_item(item, constraints, must, company=company, topic=topic)
        for item in (merged.get("drafts") or [])
        if isinstance(item, dict)
    ]
    if constraints.get("standalone_post"):
        clean = [
            item for item in drafts
            if "qrt" not in line(item.get("label")).lower()
            and "qrt" not in line(item.get("text")).lower()
            and "quote tweet" not in line(item.get("text")).lower()
        ]
        if clean:
            drafts = clean
    drafts = sorted(drafts, key=lambda item: int(item.get("reach_score") or 0), reverse=True)
    for idx, draft in enumerate(drafts[:3], start=1):
        rest = normalize_draft_option_label(line(draft.get("label")), idx)
        suffix = " (Recommended)" if idx == 1 else ""
        draft["label"] = f"Option {idx}. {rest}{suffix}"
    if drafts:
        merged["drafts"] = [polish_robert_draft_item(item) for item in drafts[:3]]
        top = drafts[0]
        merged["recommended_reach"] = {
            "label": line(top.get("label")),
            "reach_score": top.get("reach_score"),
            "reach_tier": top.get("reach_tier"),
            "reach_reason": line(top.get("reach_reason")),
            "anchor": "",
        }
    return merged


def enforce_draft_agency_constraints(
    text: str,
    constraints: dict,
    must: dict | None = None,
    *,
    company: str = "",
    topic: str = "brain",
    rewrite_body: bool = True,
) -> str:
    if not text or not constraints:
        return text
    out = clean_draft_text(text)
    if "Main post:" in out:
        return enforce_thread_draft_agency_constraints(
            out,
            constraints,
            must,
            company=company,
            topic=topic,
        )
    main, reply_note = split_link_in_reply_note(out)
    if constraints.get("standalone_post") and rewrite_body:
        main = rewrite_standalone_draft_text(main, company=company, topic=topic)
        if "Main post:" in main:
            main = main.split("Main post:", 1)[-1].split("Reply 1:", 1)[0].strip()
    if constraints.get("no_emojis"):
        main = re.sub(
            r"[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0000FE00-\U0000FE0F\u2600-\u27BF]+",
            "",
            main,
        )
    must = must or {}
    link = line(must.get("link"))
    tag = line(must.get("tag"))
    hashtags = line(must.get("hashtags"))
    if constraints.get("no_urls_in_copy"):
        main = re.sub(r"https?://\S+", "", main)
        if link:
            main = re.sub(re.escape(link), "", main, flags=re.I)
        main = re.sub(r"\b[\w.-]+\.(com|io|ai|co|org|net)(?:/\S*)?", "", main, flags=re.I)
    main = re.sub(r"\s+", " ", main).strip()
    suffix_parts = [
        part for part in (tag, hashtags)
        if part and not draft_suffix_already_present(main, part)
    ]
    suffix = " ".join(suffix_parts).strip()
    max_chars = constraints.get("max_chars")
    if max_chars:
        body = main
        if suffix and not body.endswith(suffix):
            combined_len = len(body) + 1 + len(suffix)
            if combined_len > max_chars:
                room = max_chars - len(suffix) - 1
                if room > 40:
                    body = body[:room].rsplit(" ", 1)[0].strip()
                main = f"{body} {suffix}".strip()
            else:
                main = f"{body} {suffix}".strip()
        elif len(body) > max_chars:
            main = body[:max_chars].rsplit(" ", 1)[0].strip()
        else:
            main = body
    if constraints.get("no_urls_in_copy") and link:
        if reply_note and link.lower() not in reply_note.lower():
            reply_note = f"Link in reply: {link}"
        elif not reply_note:
            reply_note = f"Link in reply: {link}"
    out = main
    if reply_note:
        out = f"{main}\n\n{reply_note}".strip()
    return strip_hyphens_from_copy(out)


def enforce_thread_draft_agency_constraints(
    text: str,
    constraints: dict,
    must: dict | None = None,
    *,
    company: str = "",
    topic: str = "brain",
) -> str:
    raw = clean_draft_text(text)
    blocks = re.split(r"\n\s*(?=Main post:|Reply\s+\d+:)", raw)
    if not blocks or not blocks[0].lower().startswith("main post:"):
        return strip_hyphens_from_copy(
            enforce_draft_agency_constraints(
                raw,
                constraints,
                must,
                company=company,
                topic=topic,
                rewrite_body=False,
            )
        )
    rebuilt_blocks: list[str] = []
    link = line((must or {}).get("link"))
    for block in blocks:
        block = block.strip()
        if not block:
            continue
        if block.lower().startswith("main post:"):
            main_body = re.sub(r"(?i)^Main post:\s*", "", block).strip()
            main_body = enforce_draft_agency_constraints(
                main_body,
                constraints,
                must,
                company=company,
                topic=topic,
                rewrite_body=False,
            )
            main_body = split_link_in_reply_note(main_body)[0].strip()
            rebuilt_blocks.append(f"Main post:\n{main_body}")
        else:
            rebuilt_blocks.append(strip_hyphens_from_paragraph(block))
    rebuilt = "\n\n".join(rebuilt_blocks).strip()
    if constraints.get("no_urls_in_copy") and link and "link in reply:" not in rebuilt.lower():
        rebuilt = f"{rebuilt}\n\nLink in reply: {link}".strip()
    return strip_hyphens_from_copy(rebuilt)


def infer_campaign_launch_line(lines: list[str]) -> str:
    for item in lines:
        text = line(item)
        if re.search(r"what we'?re launching", text, re.I):
            return re.sub(r"^what we'?re launching:\s*", "", text, flags=re.I).strip()
    return ""


def infer_x_signal_topic(payload: dict) -> str:
    x_cfg = payload.get("x_signal") or {}
    explicit = line(x_cfg.get("topic"))
    if explicit:
        return explicit[:80]
    source_text = line(payload.get("source_text"))
    company = line(payload.get("company_name"))
    if re.search(r"brain[\u00b2²2]?", source_text, re.I):
        return "Brain² AI"
    launch_line = infer_campaign_launch_line((payload.get("source_text") or "").splitlines())
    if launch_line:
        short = launch_line.split(".")[0].strip()
        if 8 <= len(short) <= 72:
            return short
    return company or "Campaign"


def infer_x_signal_handle(payload: dict, *, tag: str, company: str) -> str:
    x_cfg = payload.get("x_signal") or {}
    explicit = line(x_cfg.get("handle"))
    if explicit:
        return explicit.lstrip("@")
    if company.lower() == "clickup":
        return "clickup"
    if tag.startswith("@"):
        return tag.lstrip("@")
    return ""


def x_signal_payload_for_brief(payload: dict) -> dict | None:
    if not should_run_x_signal_for_brief(payload):
        return None
    must = payload.get("must_include") or {}
    tag = line(must.get("tag"))
    company = line(payload.get("company_name")) or line(payload.get("title")) or "Campaign"
    handle = infer_x_signal_handle(payload, tag=tag, company=company) or None
    topic = infer_x_signal_topic(payload)
    joined = line(payload.get("source_text"))
    drafts = [
        {"label": line(item.get("label")), "text": line(item.get("text"))}
        for item in (payload.get("drafts") or [])
        if isinstance(item, dict)
        and line(item.get("text"))
        and not draft_text_is_lazy(line(item.get("text")), joined)
    ]
    try:
        from x_signal_intel import analyze_partnership_signal

        set_brief_job_stage("scoring_reach", "Scoring X reach")
        brief_log(f"brief-x-signal: analyzing {company}")
        standalone_post = bool((parse_agency_constraints(line(payload.get("email_context"))) or {}).get("standalone_post"))
        signal = analyze_partnership_signal(
            brand=company,
            topic=topic,
            handle=handle or None,
            tag=tag or None,
            link=line(must.get("link")) or None,
            hashtags=line(must.get("hashtags")) or None,
            drafts=drafts,
            max_results=25,
            standalone_post=standalone_post,
        )
        return signal
    except Exception as exc:
        brief_log(f"brief-x-signal: skipped {exc}")
        return {"ok": False, "error": str(exc)}


def drafts_need_x_signal(drafts: list[dict], joined_lines: str) -> bool:
    valid = [item for item in (drafts or []) if isinstance(item, dict) and line(item.get("text"))]
    if any(isinstance(item, dict) and item.get("brief_angle") for item in valid):
        return False
    if len(valid) < 2:
        return True
    if any(draft_text_is_lazy(line(item.get("text")), joined_lines) for item in valid):
        return True
    lazy_count = sum(1 for item in valid if draft_text_is_lazy(line(item.get("text")), joined_lines))
    return lazy_count >= max(1, len(valid) - 1)


def apply_x_signal_draft_posts(enriched: dict, signal: dict, *, joined_lines: str = "") -> dict:
    draft_posts = signal.get("draft_posts") or []
    if not draft_posts:
        return enriched
    if not drafts_need_x_signal(list(enriched.get("drafts") or []), joined_lines):
        return enriched
    brief_drafts: list[dict] = []
    constraints = (enriched.get("agency_constraints") or {}) if isinstance(enriched, dict) else {}
    must = enriched.get("must_include") or {}
    company = line(enriched.get("company_name"))
    topic_term = infer_x_signal_topic(enriched).split()[0].lower() if isinstance(enriched, dict) else "brain"
    for draft in draft_posts:
        item = sanitize_agency_draft_item(
            {
                "label": line(draft.get("label")) or "Draft",
                "text": clean_draft_text(draft.get("text") or ""),
                "reach_score": draft.get("reach_score"),
                "reach_tier": draft.get("reach_tier"),
                "reach_reason": draft.get("reach_reason"),
                "anchor": draft.get("anchor"),
            },
            constraints,
            must,
            company=company,
            topic=topic_term,
        )
        if not line(item.get("text")):
            continue
        brief_drafts.append(polish_robert_draft_item(item))
    if brief_drafts:
        enriched["drafts"] = sorted(
            brief_drafts,
            key=lambda item: int(item.get("reach_score") or 0),
            reverse=True,
        )
        enriched["drafts_source"] = "x_signal_partnership"
        top = enriched["drafts"][0]
        enriched["recommended_reach"] = {
            "label": line(top.get("label")),
            "reach_score": top.get("reach_score"),
            "reach_tier": top.get("reach_tier"),
            "reach_reason": line(top.get("reach_reason")),
            "anchor": line(top.get("anchor")),
        }
        brief_log(f"brief-x-signal: replaced {len(brief_drafts)} drafts from live X conversation")
    return enriched


def attach_x_signal_to_brief_payload(payload: dict, *, joined_lines: str = "") -> dict:
    signal = x_signal_payload_for_brief(payload)
    if not signal:
        return payload
    enriched = dict(payload)
    if signal.get("ok") is False:
        enriched["x_signal_result"] = {"ok": False, "error": line(signal.get("error"))}
        return enriched
    enriched = apply_x_signal_draft_posts(enriched, signal, joined_lines=joined_lines or line(payload.get("source_text")))
    scored = signal.get("scored_existing_drafts") or []
    if scored and enriched.get("drafts_source") != "x_signal_partnership":
        existing = list(enriched.get("drafts") or [])
        by_label = {line(item.get("label")): item for item in scored if isinstance(item, dict)}
        by_index = [item for item in scored if isinstance(item, dict)]
        next_drafts = []
        for idx, draft in enumerate(existing):
            if not isinstance(draft, dict):
                continue
            match = by_label.get(line(draft.get("label"))) or (by_index[idx] if idx < len(by_index) else {})
            next_item = dict(draft)
            for key in ("reach_score", "reach_tier", "reach_reason", "anchor", "wave_stack"):
                if match.get(key) not in (None, ""):
                    if key == "anchor" and (enriched.get("agency_constraints") or {}).get("standalone_post"):
                        continue
                    next_item[key] = match.get(key)
            next_drafts.append(next_item)
        if next_drafts:
            enriched["drafts"] = sorted(next_drafts, key=lambda item: int(item.get("reach_score") or 0), reverse=True)
            top = enriched["drafts"][0]
            enriched["recommended_reach"] = {
                "label": line(top.get("label")),
                "reach_score": top.get("reach_score"),
                "reach_tier": top.get("reach_tier"),
                "reach_reason": line(top.get("reach_reason")),
                "anchor": line(top.get("anchor")),
            }
    enriched["x_signal_result"] = {
        "ok": True,
        "generated_at": signal.get("generated_at"),
        "headline": signal.get("headline"),
        "keywords": (signal.get("keywords") or {}).get("suggested_keywords") or [],
        "hashtags": (signal.get("keywords") or {}).get("suggested_hashtags") or [],
        "top_conversation": signal.get("top_conversation") or [],
        "draft_posts": signal.get("draft_posts") or [],
        "wording_rules": signal.get("wording_rules") or [],
        "differentiation_notes": signal.get("differentiation_notes") or [],
        "scoring_note": (
            "Reach score is a relative wave-stack index for choosing between drafts. "
            "It is not an impression forecast."
        ),
    }
    return enriched


def clean_sentence(value: str | None) -> str:
    text = line(value)
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text).strip(" .")
    return f"{text}." if text else ""


def polish_alignednews_sentence(value: str | None) -> str:
    text = clean_sentence(value)
    if not text:
        return ""
    replacements = (
        (r"^This is the kind of shift I (?:like )?(?:track|cover|unpack) at AlignedNews\.com\.?$", "What stands out to me is the bigger shift underneath this. That is what I like unpacking at AlignedNews.com."),
        (r"^This fits the broader AI story I cover at AlignedNews\.com\.?$", "What I like here is the bigger AI story behind the launch. That fits what I cover at AlignedNews.com."),
        (r"^This fits the kind of conversation I like bringing into AlignedNews\.com\.?$", "What I like here is that it opens up a bigger conversation than a standard promo. That is a natural fit for AlignedNews.com."),
    )
    for pattern, replacement in replacements:
        if re.match(pattern, text, re.I):
            return replacement
    return text


def text_mentions_alignednews(value: str) -> bool:
    lowered = str(value or "").lower()
    return "alignednews.com" in lowered or "alignednews" in lowered


def ensure_drafts_reference_alignednews(drafts: list[dict], why_alignednews: str, deliverable_type: str = "") -> list[dict]:
    if not drafts:
        return drafts
    aligned_line = clean_sentence(why_alignednews)
    if not aligned_line:
        return drafts
    if any(text_mentions_alignednews(item.get("text") or "") for item in drafts if isinstance(item, dict)):
        return drafts

    normalized: list[dict] = []
    thread_mode = "thread" in str(deliverable_type or "").lower()
    inserted = False
    for idx, item in enumerate(drafts):
        if not isinstance(item, dict):
            continue
        label_value = line(item.get("label"))
        text_value = clean_draft_text(item.get("text") or "")
        if idx == 0 and text_value and not inserted:
            if thread_mode:
                paragraphs = split_draft_paragraphs(text_value)
                if paragraphs:
                    last_block = paragraphs[-1]
                    if "\n" in last_block:
                        head, body = last_block.split("\n", 1)
                        body = clean_sentence(f"{body} {aligned_line}")
                        paragraphs[-1] = f"{head}\n{body}".strip()
                    else:
                        paragraphs.append(aligned_line)
                    text_value = "\n\n".join(paragraphs).strip()
                else:
                    text_value = aligned_line
            else:
                text_value = f"{text_value}\n\n{aligned_line}".strip()
            inserted = True
        normalized.append({"label": label_value or "Option", "text": text_value})
    return normalized or drafts


def clean_points(values: list[str], limit: int = 6) -> list[str]:
    output: list[str] = []
    for item in values:
        cleaned = clean_sentence(item)
        if cleaned and cleaned not in output:
            output.append(cleaned)
        if len(output) >= limit:
            break
    return output


def strip_prefix(value: str, prefix: str) -> str:
    current = line(value)
    if current.lower().startswith(prefix.lower()):
        return line(current[len(prefix):])
    return current


def find_first_matching_line(lines: list[str], patterns: tuple[str, ...]) -> str:
    for current in lines:
        lowered = current.lower()
        if any(re.search(pattern, lowered, re.I) for pattern in patterns):
            return current
    return ""


def collect_matching_lines(lines: list[str], patterns: tuple[str, ...], limit: int = 6) -> list[str]:
    matches: list[str] = []
    for current in lines:
        lowered = current.lower()
        if any(re.search(pattern, lowered, re.I) for pattern in patterns):
            matches.append(current)
        if len(matches) >= limit:
            break
    return matches


def collect_lines_after_marker(lines: list[str], marker_pattern: str, stop_patterns: tuple[str, ...], limit: int = 8) -> list[str]:
    start = None
    for idx, current in enumerate(lines):
        if re.search(marker_pattern, current, re.I):
            start = idx + 1
            break
    if start is None:
        return []
    output: list[str] = []
    for current in lines[start:]:
        if any(re.search(pattern, current, re.I) for pattern in stop_patterns):
            break
        if line(current):
            output.append(line(current))
        if len(output) >= limit:
            break
    return output


def parse_thread_sections(lines: list[str]) -> list[dict]:
    sections: list[dict] = []
    current = None
    for raw in lines:
        text = line(raw)
        if not text:
            continue
        if re.match(r"^T\d+\s*[·-]", text):
            if current:
                sections.append(current)
            current = {"label": text, "body": []}
            continue
        if current and re.match(r"^(First post|X thread|LinkedIn post|📥|🔗)", text):
            sections.append(current)
            current = None
            continue
        if current and (
            text.startswith("Asset:")
            or text.startswith("@")
            or text.startswith("Reply ")
            or text.startswith("Reply:")
            or text.startswith("Reply (")
        ):
            current["body"].append(text)
            continue
        if current and not re.match(r"^(🧩|📌)", text):
            current["body"].append(text)
    if current:
        sections.append(current)
    return [section for section in sections if section.get("body")]


def strip_quoted_copy(value: str) -> str:
    text = line(value)
    if text.startswith('"') and text.endswith('"'):
        return text[1:-1].strip()
    return text


def parse_part2_direction(lines: list[str]) -> str:
    start = None
    for idx, raw in enumerate(lines):
        if re.search(r"^Part\s*2\s*:", line(raw), re.I):
            start = idx + 1
            break
    if start is None:
        return ""
    captured: list[str] = []
    for raw in lines[start:]:
        text = line(raw)
        if not text:
            continue
        if re.match(r"^Part\s*\d+\s*:", text, re.I) or text in {
            "What Works on X Right Now (From Successful AI Launches)",
            "Content Angles for X",
            "Engagement Requirements",
        }:
            break
        captured.append(text)
    return " ".join(captured).strip()


def parse_notion_media_guidance(lines: list[str]) -> str:
    for raw in lines:
        text = line(raw)
        if "demonstration" in text.lower() and "description" in text.lower():
            return text
        if re.search(r"show a (?:result|screenshot)", text, re.I):
            return text
    return ""


def parse_x_post_structure(lines: list[str]) -> list[str]:
    start = None
    for idx, raw in enumerate(lines):
        if line(raw).startswith("X Post Structure"):
            start = idx + 1
            break
    if start is None:
        return []
    steps: list[str] = []
    for raw in lines[start:]:
        text = line(raw)
        if not text:
            continue
        if text in {"Engagement Requirements", "Timing", "Platform Priority & Deliverables Summary"}:
            break
        if re.match(r"^(Hook tweet|Context|The reveal|Social proof|CTA in reply)", text, re.I):
            steps.append(text)
        elif steps and not re.match(r"^(Platform|Priority|Min Deliverables)", text, re.I):
            steps.append(text)
        if len(steps) >= 5:
            break
    return steps[:5]


def parse_content_angles(lines: list[str]) -> list[dict]:
    angles: list[dict] = []
    current: dict | None = None
    in_section = False
    for raw in lines:
        text = line(raw)
        if text == "Content Angles for X":
            in_section = True
            continue
        if not in_section:
            continue
        if text.startswith("X Post Structure") or text.startswith("Engagement Requirements"):
            break
        match = re.match(r'^Angle\s+(\d+):\s*"?(.+?)"?\s*(?:\(([^)]+)\))?\s*$', text, re.I)
        if match:
            if current:
                angles.append(current)
            current = {
                "number": int(match.group(1)),
                "title": strip_quoted_copy(match.group(2)),
                "voice": line(match.group(3) or ""),
                "ideal_for": "",
                "hook": "",
                "thread": "",
                "format": "",
                "structure": "",
                "examples": [],
            }
            continue
        if not current:
            continue
        lowered = text.lower()
        if lowered.startswith("ideal for:"):
            current["ideal_for"] = text.split(":", 1)[-1].strip()
        elif lowered.startswith("hook:"):
            current["hook"] = strip_quoted_copy(text.split(":", 1)[-1].strip())
        elif lowered.startswith("hook (text on video or caption):"):
            current["hook"] = strip_quoted_copy(text.split(":", 1)[-1].strip())
        elif lowered.startswith("thread:"):
            current["thread"] = text.split(":", 1)[-1].strip()
        elif lowered.startswith("format:"):
            current["format"] = text.split(":", 1)[-1].strip()
        elif lowered.startswith("structure:"):
            current["structure"] = text.split(":", 1)[-1].strip()
        elif text.startswith('"') and text.endswith('"'):
            current["examples"].append(strip_quoted_copy(text))
        elif not text.lower().startswith("why this works:"):
            extra = current.get("thread") or ""
            current["thread"] = f"{extra} {text}".strip() if extra else text
    if current:
        angles.append(current)
    return angles


def select_part2_content_angles(angles: list[dict], *, limit: int = 3) -> list[dict]:
    """Part 2 = Robert's own take. Skip Part 1 Zeb reaction angles."""
    skip_numbers = {4}
    filtered = [item for item in angles if item.get("number") not in skip_numbers]
    by_number = {int(item.get("number") or 0): item for item in filtered}
    priority = (1, 2, 3, 5, 6)
    selected: list[dict] = []
    for number in priority:
        item = by_number.get(number)
        if item and item not in selected:
            selected.append(item)
        if len(selected) >= limit:
            break
    for item in filtered:
        if item not in selected:
            selected.append(item)
        if len(selected) >= limit:
            break
    return selected[:limit]


def angle_context_reply(angle: dict) -> str:
    thread = line(angle.get("thread"))
    structure = line(angle.get("structure"))
    hook = line(angle.get("hook"))
    lowered = f"{thread} {structure} {hook}".lower()
    if "contrast" in lowered or "on the left" in lowered or "tourist" in lowered:
        return (
            "Generic chat gives tips. Brain² executes inside ClickUp with your tasks, docs, and connected apps."
        )
    if "problem" in lowered or "briefing" in lowered:
        return (
            "The problem is briefing a generic chat on your job every morning. "
            "Context switching. Copy paste. Brain² skips that because it lives in your workspace."
        )
    if "@brain" in lowered or "mention" in lowered or "task comment" in lowered:
        return (
            "I tagged @Brain in a task comment. It read the thread, pulled data from connected apps, "
            "and delivered a finished status update. No prompt engineering."
        )
    if "q3" in lowered or "one prompt" in lowered or "plan my entire" in lowered:
        return (
            "I asked Brain to plan Q3 from scratch. One prompt. It returned a project plan, task list, and timeline."
        )
    if "screen recording" in lowered or "walk through" in lowered or "video" in lowered:
        return (
            "Open ClickUp. Show a real workspace. Tag @Brain in a task or chat. "
            "Let it pull context and deliver a finished output on camera."
        )
    if thread:
        return " ".join(sentence_parts(thread)[:2]).strip()
    return "Expand the hook with your real workflow. Show a screenshot or screen recording."


UNALIGNED_NARRATIVE_THREAD_REPLIES = 2  # Narrative Thread tier: 1 main + 2 attached (pricing playbook)


def resolve_post_format(
    *,
    agency_constraints: dict | None = None,
    deliverable_type: str = "",
) -> tuple[str, int]:
    """Return (format_id, max_replies). Agency standalone wins over Notion thread structure."""
    constraints = agency_constraints or {}
    if constraints.get("standalone_post") or constraints.get("post_format") == "standalone_single":
        return "standalone_single", 0
    if "thread" in (deliverable_type or "").lower():
        return "narrative_thread", int(constraints.get("max_thread_replies") or UNALIGNED_NARRATIVE_THREAD_REPLIES)
    return "custom_post", 0


def compose_angle_standalone_draft(
    angle: dict,
    *,
    tag: str = "",
    hashtags: str = "",
    link: str = "",
) -> str:
    """Custom X Post: one copy-paste tweet. Link goes in a separate reply on X."""
    hook = strip_quoted_copy(angle.get("hook") or "") or line(angle.get("title"))
    footer_parts = [part for part in (tag, hashtags) if part]
    footer = " ".join(footer_parts).strip()
    main_post = f"{hook} {footer}".strip() if footer else hook
    if link:
        return f"{main_post}\n\nLink in reply: {link}".strip()
    return main_post


def compose_angle_thread_draft(
    angle: dict,
    *,
    tag: str = "",
    hashtags: str = "",
    link: str = "",
    x_post_structure: list[str] | None = None,
    post_format: str = "narrative_thread",
    max_replies: int = UNALIGNED_NARRATIVE_THREAD_REPLIES,
) -> str:
    if post_format == "standalone_single" or max_replies <= 0:
        return compose_angle_standalone_draft(angle, tag=tag, hashtags=hashtags, link=link)

    hook = strip_quoted_copy(angle.get("hook") or "") or line(angle.get("title"))
    context = angle_context_reply(angle)
    reveal = "Brain² is what made this possible. Your context. Every frontier model. One subscription."
    social = "Add your proof: saved X hours, replaced Y tools, or a team reaction screenshot."
    cta_note = f"Post the link in a reply to this thread: {link or 'clickup.com/brain'}"

    footer_parts = [part for part in (tag, hashtags) if part]
    footer = " ".join(footer_parts).strip()
    main_post = f"{hook} {footer}".strip() if footer else hook

    # UNALIGNED Narrative Thread = 1 main + 2 replies. Fold Notion's 5 steps into 3 posts.
    reply_one = f"{context} {reveal}".strip()
    reply_two = f"{social} {cta_note}".strip()
    replies = [reply_one, reply_two][: max(1, max_replies)]
    return build_thread_draft(main_post, replies)


def compose_notion_angle_drafts(
    angles: list[dict],
    *,
    x_post_structure: list[str] | None = None,
    tag: str = "",
    hashtags: str = "",
    link: str = "",
    post_format: str = "narrative_thread",
    max_replies: int = UNALIGNED_NARRATIVE_THREAD_REPLIES,
) -> list[dict]:
    drafts: list[dict] = []
    for idx, angle in enumerate(angles[:3], start=1):
        voice = line(angle.get("voice"))
        title = line(angle.get("title"))
        label_bits = [f"Angle {angle.get('number', idx)}."]
        if title:
            label_bits.append(title)
        if voice:
            label_bits.append(f"({voice})")
        label = " ".join(label_bits).strip()
        if idx == 1:
            label = f"{label} (recommended)"
        drafts.append(
            {
                "label": label,
                "text": compose_angle_thread_draft(
                    angle,
                    tag=tag,
                    hashtags=hashtags,
                    link=link,
                    x_post_structure=x_post_structure,
                    post_format=post_format,
                    max_replies=max_replies,
                ),
                "brief_angle": angle.get("number"),
                "ideal_for": line(angle.get("ideal_for")),
            }
        )
    return drafts


def collect_heading_section(lines: list[str], patterns: tuple[str, ...], limit: int = 8) -> list[str]:
    start = None
    for idx, current in enumerate(lines):
        text = line(current)
        if any(re.search(pattern, text, re.I) for pattern in patterns):
            start = idx + 1
            break
    if start is None:
        return []
    captured: list[str] = []
    for current in lines[start:]:
        text = line(current)
        if not text:
            continue
        if (
            text.endswith(":")
            or re.match(r"^(About|Why|The Core Idea|How It Works|Important Logistics|Where it Lives|Status Note|Draft Options|Post to publish)\b", text, re.I)
            or re.match(r"^T\d+\s*[·-]", text)
        ):
            break
        captured.append(text)
        if len(captured) >= limit:
            break
    return captured


def source_mentions(joined_lines: str, *phrases: str) -> bool:
    lowered = joined_lines.lower()
    return any(phrase.lower() in lowered for phrase in phrases)


def sentence_parts(value: str) -> list[str]:
    current = clean_sentence(value)
    return [line(part) for part in re.split(r"(?<=[.!?])\s+", current) if line(part)]


def first_nonempty(*values: str) -> str:
    for value in values:
        current = line(value)
        if current:
            return current
    return ""


def clean_draft_text(value: str) -> str:
    text = str(value or "").strip()
    text = re.sub(r"\bReply tweet:\s*\.*\s*$", "", text, flags=re.I).strip()
    text = re.sub(
        r"(?is)\bEssential Information\b\s*:?\s*(.*?)(?=(?:\n\s*\n)|(?:\bOption\s+\d\b)|$)",
        "",
        text,
    )
    text = re.sub(
        r"(?im)^(?:company website|website|referral / cta url|cta url|url to include in your publication|posting window|approval note|important logistics|status note)\s*:\s*.+$",
        "",
        text,
    )
    text = re.sub(
        r"(?im)^(?:launch date\/time|launch date|go[- ]live|go live|posting date|post date|publish date)\s*:\s*.+$",
        "",
        text,
    )
    text = re.sub(
        r"(?i)\bLaunch date\/time\s*:\s*[^.\n]+\.?",
        "",
        text,
    )
    text = re.sub(
        r"(?is)\bCreators who pick a fight with the category\..*?(?=(?:\n\s*\n)|(?:\bEssential Information\b)|(?:\bOption\s+\d\b)|$)",
        "",
        text,
    )
    text = re.sub(
        r"(?im)^(?:tone|the thesis)\s*:\s*.+$",
        "",
        text,
    )
    text = re.sub(
        r"(?im)^(?:paid partnership disclosure(?: here)?(?: for compliance)?|disclosure here(?: for compliance)?)\.?\s*$",
        "",
        text,
    )
    text = re.sub(
        r"(?im)\n?(?:paid partnership disclosure(?: here)?(?: for compliance)?|disclosure here(?: for compliance)?)\.?(?=\n|$)",
        "",
        text,
    )
    text = re.sub(
        r"(?im)^(?:paid partnership toggle|native paid partnership toggle|made with ai toggle|turn on paid partnership|turn on made with ai)\.?\s*$",
        "",
        text,
    )
    text = re.sub(
        r"(?im)^(?:for compliance|compliance note|disclosure note)\s*:?\s*$",
        "",
        text,
    )
    text = re.sub(
        r"(?im)^(?:paid partnership|sponsored|ad)\s+disclosure\.?\s*$",
        "",
        text,
    )
    text = re.sub(
        r"(?im)^\s*paid partnership\s*$",
        "",
        text,
    )
    text = re.sub(
        r"(?i)\s*\[\s*add your tracking code\s*\]",
        "",
        text,
    )
    text = re.sub(
        r"(?i)\s*\[\s*insert tracking code\s*\]",
        "",
        text,
    )
    text = re.sub(
        r"(?i)\s*\[\s*tracking link\s*\]",
        "",
        text,
    )
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


BRIEF_INSTRUCTION_MARKERS = (
    "this brief is for",
    "paid creators and influencer",
    "influencer partners promoting",
    "primary channel",
    "separate from the zeb",
    "create your own original content",
    "this is your take",
    "not a response to anyone else",
    "use it for a personal demo",
    "workflow walkthrough",
    "bold opinion about what",
    "amplification play",
    "your job is to send",
    "send the draft for review",
    "nothing goes live until",
    "influencer posts should follow",
    "qt/reaction pattern",
    "quote-repost",
    "built from the notion",
    "for robert.",
    "post to publish",
    "pick one in the verify",
)


def draft_text_is_brief_instruction(value: str) -> bool:
    lowered = clean_draft_text(value).lower()
    if not lowered:
        return False
    return any(marker in lowered for marker in BRIEF_INSTRUCTION_MARKERS)


def normalize_draft_option_label(label: str, idx: int) -> str:
    base = line(label)
    if not base:
        return f"Draft {idx}"
    for sep in ("—", " – ", " - ", ". "):
        if sep in base:
            rest = base.split(sep, 1)[-1].strip()
            break
    else:
        rest = re.sub(r"^Option\s+[A-Z0-9]+\s*", "", base, flags=re.I).strip()
    rest = re.sub(r"\s*\(Recommended\)\s*", "", rest, flags=re.I).strip()
    rest = re.sub(r"^\((.+)\)$", r"\1", rest).strip()
    if not rest or re.fullmatch(r"Option\s+\d+", rest, flags=re.I):
        return f"Draft {idx}"
    return rest


def draft_text_is_lazy(value: str, joined_lines: str) -> bool:
    text = clean_draft_text(value)
    if not text:
        return True
    lowered = text.lower()
    if draft_text_is_brief_instruction(text):
        return True
    if lowered in {
        "core idea.",
        "how it works.",
        "how it works / the announcement.",
        "reply tweet:.",
    }:
        return True
    banned = (
        "most ai tools still wait for a prompt",
        "the line i keep watching is the one between assistant and employee",
        "operator angle",
        "ai employee angle",
        "essential information",
        "creators who pick a fight with the category",
        "tone: provocative",
        "thesis:",
        "add your tracking code",
        "insert tracking code",
        "[tracking link]",
        "paid partnership",
    )
    if any(item in lowered for item in banned) and not source_mentions(joined_lines, "ai employee", "assistant and employee"):
        return True
    if "reply tweet:." in lowered:
        return True
    if (
        "this brief is for paid creators" in lowered
        or ("promoting the brain" in lowered and "primary channel" in lowered)
    ):
        return True
    stripped_lines = [line(item) for item in text.splitlines() if line(item)]
    unique_lines = {item.lower() for item in stripped_lines}
    if len(stripped_lines) >= 3 and len(unique_lines) <= max(1, len(stripped_lines) // 2):
        return True
    url_count = len(re.findall(r"https?://", text))
    alpha_count = len(re.findall(r"[A-Za-z]", text))
    if url_count >= 2 and alpha_count < 180:
        return True
    generic_phrases = (
        "general outreach",
        "paid / sponsorship",
        "learn more.",
        "different angle",
        "recommended.",
        "this fits alignednews because",
        "paid partnership disclosure here",
        "disclosure here for compliance",
        "native paid partnership toggle",
        "made with ai toggle",
    )
    if sum(1 for phrase in generic_phrases if phrase in lowered) >= 3:
        return True
    return False


def build_thread_draft(main_post: str, replies: list[str]) -> str:
    parts: list[str] = []
    if line(main_post):
        parts.append(f"Main post:\n{clean_sentence(main_post)}")
    for idx, reply in enumerate(replies, start=1):
        current = clean_sentence(reply)
        if not current:
            continue
        parts.append(f"Reply {idx}:\n{current}")
    return "\n\n".join(parts).strip()


def is_structural_heading(value: str) -> bool:
    text = line(value)
    if not text:
        return False
    patterns = (
        r"^Project Overview$",
        r"^About\b",
        r"^Why Would People Care\b",
        r"^Why People Care\b",
        r"^Why it matters\b",
        r"^The Core Idea$",
        r"^Core Idea$",
        r"^How It Works$",
        r"^How it Works$",
        r"^How It Works / The Announcement$",
        r"^Important Logistics$",
        r"^Where it Lives$",
        r"^Status Note$",
        r"^Draft Options$",
        r"^Post to publish",
    )
    return any(re.search(pattern, text, re.I) for pattern in patterns)


def normalize_source_line(value: str, company: str = "") -> str:
    text = line(value)
    if not text:
        return ""
    text = re.sub(r"^[•●▪◦]+\s*", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    if is_structural_heading(text):
        return ""
    if company and re.fullmatch(rf"About\s+{re.escape(company)}\.?", text, re.I):
        return ""
    if re.fullmatch(r"[^\w]+", text):
        return ""
    return text


def clean_content_value(value: str, company: str = "") -> str:
    text = normalize_source_line(value, company=company)
    if not text:
        return ""
    text = re.sub(r"^(About\s+[A-Za-z0-9 .&+]+)\.?\s*$", "", text, flags=re.I).strip()
    if company:
        text = re.sub(rf"^({re.escape(company)})\s+\1\b", r"\1", text, flags=re.I)
    if is_structural_heading(text):
        return ""
    return text


def contains_url(value: str) -> bool:
    return bool(re.search(r"https?://|www\.", str(value or ""), re.I))


def is_low_signal_content(value: str, company: str = "") -> bool:
    text = clean_content_value(value, company=company)
    if not text:
        return True
    lowered = text.lower()
    if contains_url(text):
        return True
    if lowered.startswith(("ios:", "ios：", "android:", "android：", "website:", "assets:", "company x:", "founder x:")):
        return True
    if re.fullmatch(r".{0,60}:\.?", text):
        return True
    if text.endswith(":"):
        return True
    if len(re.findall(r"[A-Za-z]", text)) < 18:
        return True
    return False


def best_content_lines(values: list[str], company: str = "", limit: int = 3) -> list[str]:
    output: list[str] = []
    for raw in values:
        current = clean_content_value(raw, company=company)
        if not current or is_low_signal_content(current, company=company):
            continue
        output.append(current)
        if len(output) >= limit:
            break
    return output


def infer_alignednews_line(company: str, joined_lines: str, deliverable_type: str, announcement_text: str) -> str:
    lowered = str(joined_lines or "").lower()
    company_name = line(company) or "this"
    if any(term in lowered for term in ("user-generated agents", "user generated agents", "(uga)", "survival benchmark", "juno", "reality permeability", "multi-agent reinforcement", "rlhf")):
        return f"What stands out to me is that {company_name} pushes the frontier AI conversation forward. That is exactly the kind of shift I like unpacking at AlignedNews.com"
    if any(term in lowered for term in ("infrastructure", "compute", "inference", "benchmark", "developer", "api", "model", "agents")):
        return f"What I like here is that {company_name} gets into the real infrastructure layer, not the demo layer. That is the kind of story I like unpacking at AlignedNews.com"
    if any(term in lowered for term in ("enterprise", "workflow", "teams", "operator", "productivity", "sales", "support", "copilot")):
        return f"What stands out to me is that {company_name} shows how AI is actually changing day to day work. That fits the bigger story I cover at AlignedNews.com"
    if any(term in lowered for term in ("interview", "podcast", "event", "summit", "fireside", "conversation", "meeting")):
        return f"What I like here is that it opens up a bigger conversation than a standard promo. That is a natural fit for AlignedNews.com"
    if any(term in lowered for term in ("launch", "series a", "series b", "funding", "announcement", "now live", "public app")):
        return f"What stands out to me is where this launch fits in the market. That is the lens I like bringing to AlignedNews.com"
    if "thread" in str(deliverable_type or "").lower():
        return f"What I like here is the bigger AI shift behind it. That is the kind of thing I like unpacking at AlignedNews.com"
    if line(announcement_text):
        return f"What I like here is the bigger AI story behind the launch. That fits what I cover at AlignedNews.com"
    return f"What stands out to me is the bigger shift underneath this. That is what I like unpacking at AlignedNews.com"


def joined_clean_lines(values: list[str], company: str = "", limit: int = 3) -> str:
    output: list[str] = []
    for raw in values:
        current = clean_content_value(raw, company=company)
        if not current:
            continue
        output.append(current)
        if len(output) >= limit:
            break
    return " ".join(output).strip()


_FALSE_COMPANY_X_PREFIXES = re.compile(
    r"^(what works on|how to|tips for|guide to|built on|live on|best on)\b",
    re.I,
)


_BAD_COMPANY_NAMES = {
    "what works on",
    "brain² influencer brief",
    "brain2 influencer brief",
    "influencer brief",
    "company",
    "campaign",
    "collab",
}


def infer_company_name(title: str, lines: list[str]) -> str:
    title = line(title)
    joined = "\n".join(lines)
    clickup_owner = re.search(r"Brain[\u00b2²2]?\s+is\s+([A-Za-z][A-Za-z0-9]+)'s", joined, re.I)
    if clickup_owner:
        return clickup_owner.group(1)
    if re.search(r"\bClickUp\b", joined, re.I):
        return "ClickUp"
    for current in lines:
        text = line(current)
        match = re.match(r"^([A-Za-z0-9][A-Za-z0-9 .&+-]{1,40}?)\s+x\s+", text, re.I)
        if match:
            candidate = line(match.group(1))
            if _FALSE_COMPANY_X_PREFIXES.match(candidate):
                continue
            return candidate
    if title:
        first_part = re.split(r"[|:•—-]", title)[0].strip()
        if "@Scobleizer" in first_part and len(lines) > 0:
            campaign_line = next((line(item) for item in lines if re.search(r"\bx\b", line(item)) and ("Dedicated post" in item or "quote-repost" in item or "LinkedIn" in item)), "")
            match = re.match(r"^([A-Za-z0-9][A-Za-z0-9 .&+-]{1,40}?)\s+x\s+", campaign_line, re.I)
            if match:
                return line(match.group(1))
        if 1 <= len(first_part.split()) <= 6:
            return first_part
    company_line = find_first_matching_line(lines, (r"\bcompany\b", r"\bclient\b", r"\bbrand\b"))
    if company_line and ":" in company_line:
        return line(company_line.split(":", 1)[1])
    return title or "Company"


def resolve_company_name(title: str, lines: list[str], current: str = "") -> str:
    inferred = infer_company_name(title, lines)
    normalized = line(current).lower()
    if normalized in _BAD_COMPANY_NAMES or _FALSE_COMPANY_X_PREFIXES.match(line(current) or ""):
        return inferred
    if not line(current):
        return inferred
    return line(current)


def extract_handles(text: str) -> list[str]:
    return re.findall(r"@[\w.]+", text or "")


def infer_deliverable_type(lines: list[str], extra_text: str = "") -> str:
    joined = " ".join([*lines, line(extra_text)]).strip()
    lowered = joined.lower()
    if "quote repost" in lowered or "quote + repost" in lowered or "quote retweet" in lowered or "(qrt)" in lowered or "qrt" in lowered:
        return "Quote repost"
    if "amplification x" in lowered or "x amplification" in lowered:
        return "Amplification X"
    if "dedicated thread" in lowered or "thread" in lowered:
        return "Dedicated thread"
    if "linkedin" in lowered:
        return "LinkedIn post"
    if "custom post" in lowered:
        return "Custom post"
    if "post" in lowered:
        return "Custom post"
    return ""


def infer_campaign_platform(text: str, extra_text: str = "") -> str:
    current = " ".join(part for part in [line(text), line(extra_text)] if part).lower()
    if (
        "x is the #1 channel" in current
        or "x is the primary" in current
        or "x (twitter)" in current and "primary" in current
        or "primary focus" in current
        or re.search(r"influencer brief\s*\|\s*x\b", current)
    ):
        return "X.com"
    if "amplification x" in current or "x amplification" in current or "quote retweet" in current or "qrt" in current:
        return "X.com"
    if "youtube" in current or "youtu.be" in current:
        return "YouTube"
    if "tiktok" in current or "tik tok" in current:
        return "TikTok"
    if "instagram" in current or re.search(r"\big\b", current):
        return "Instagram"
    if "podcast" in current:
        return "Podcast"
    if "teams" in current:
        return "Teams"
    if "slack" in current:
        return "Slack"
    if "x.com" in current or "twitter" in current or re.search(r"\bquote repost\b|\bquote post\b|\bx thread\b|\bdedicated thread\b|\bx post\b", current):
        return "X.com"
    if "linkedin" in current:
        return "LinkedIn"
    return ""


def brief_platform_label(*values: str) -> str:
    combined = " ".join(line(value) for value in values if line(value))
    platform = infer_campaign_platform(combined)
    return platform or "X.com"


def standardized_brief_title(company: str, *platform_hints: str) -> str:
    company_name = line(company) or "Campaign"
    platform = brief_platform_label(*platform_hints)
    return f"{company_name} x UNALIGNED x {platform}"


# Asset detection — pull every attachable file/media link out of the source so the
# brief lists exactly what Robert must include (hero video, images, logo, media kit, PDF).
_ASSET_HOST_HINTS = ("drive.google.com/file", "drive.google.com/open", "drive.google.com/uc",
                     "youtube.com", "youtu.be", "vimeo.com", "loom.com", "dropbox.com",
                     "wetransfer", "we.tl", "prod-files", "amazonaws.com", "figma.com",
                     "notion.so/signed", "cdn.")
_ASSET_EXT = (".mp4", ".mov", ".webm", ".png", ".jpg", ".jpeg", ".gif", ".pdf", ".zip", ".key", ".heic")
_ASSET_TEXT = ("asset", "video", "hero", "logo", "media kit", "still", "visual", "download",
               "banner", "image", "graphic", "thumbnail", "b-roll", "broll", "creative", "footage")


def classify_asset(href: str, text: str = "") -> str | None:
    h = (href or "").lower()
    t = (text or "").lower()
    if not h.startswith("http"):
        return None
    base = h.split("?")[0]
    is_asset = (any(x in h for x in _ASSET_HOST_HINTS)
                or any(base.endswith(e) for e in _ASSET_EXT)
                or any(w in t for w in _ASSET_TEXT))
    if not is_asset:
        return None
    if "youtu" in h or "vimeo" in h or "loom" in h or base.endswith((".mp4", ".mov", ".webm")) or "video" in t or "footage" in t or "b-roll" in t or "broll" in t:
        label = "Video"
    elif base.endswith((".png", ".jpg", ".jpeg", ".gif", ".heic")) or any(w in t for w in ("image", "logo", "banner", "still", "graphic", "thumbnail")):
        label = "Image"
    elif base.endswith(".pdf") or "media kit" in t:
        label = "PDF / media kit"
    elif "figma" in h:
        label = "Figma"
    elif any(x in h for x in ("drive.google.com", "dropbox", "wetransfer", "we.tl")):
        label = "Drive / file"
    else:
        label = "Asset"
    # prefer the link's own descriptive text when it has one
    clean_text = (text or "").strip()
    if clean_text and len(clean_text) > 2 and not clean_text.lower().startswith("http"):
        return clean_text
    return label


def collect_assets(links: list[dict], urls: list[str]) -> list[list[str]]:
    assets: list[list[str]] = []
    seen: set[str] = set()
    for item in (links or []):
        href = line(item.get("href")) if isinstance(item, dict) else ""
        txt = line(item.get("text")) if isinstance(item, dict) else ""
        label = classify_asset(href, txt)
        if label and href and href not in seen:
            assets.append([label, href])
            seen.add(href)
    for u in (urls or []):
        label = classify_asset(u, "")
        if label and u and u not in seen:
            assets.append([label, u])
            seen.add(u)
    return assets[:10]


def standardized_calendar_title(company: str, *platform_hints: str) -> str:
    # COMPANY x ACTION - PLATFORM, e.g. "VIKTOR x QRT - X.COM".
    # First hint is the deliverable_type; the post location for these is always X.
    company_name = (line(company) or "Collab").upper()
    deliverable = platform_hints[0] if platform_hints else ""
    action = deliverable_action(deliverable)
    return f"{company_name} x {action} - X.COM"


def build_structured_brief_payload(
    *,
    title: str,
    subtitle: str,
    source_url: str,
    lines: list[str],
    links: list[dict],
    source_label: str,
    email_context: str = "",
) -> dict:
    company = resolve_company_name(title, lines, infer_company_name(title, lines))
    thread_sections = parse_thread_sections(lines)
    filtered_lines = [
        current for current in (
            normalize_source_line(item, company=company) for item in lines
        )
        if current
        and current not in {"Skip to content", "Get Notion free", "✍️", "🧵", "📌", "🧩", "🔗"}
        and current != title
    ]
    campaign_line = next((
        line(item) for item in lines
        if re.search(r"\bx\b", line(item), re.I)
        and (
            "Dedicated post" in item
            or "quote-repost" in item
            or "quote retweet" in item.lower()
            or "amplification x" in item.lower()
            or "x amplification" in item.lower()
            or "LinkedIn" in item
        )
    ), "")
    creator_line = next((line(item) for item in lines if item.startswith("Creator:")), "")
    go_live_line = next((line(item) for item in lines if item.startswith("Go-live:")), "")
    guardrails_line = next((line(item) for item in lines if "Guardrails" in item), "")
    reply_line = next((line(item) for item in lines if item.startswith("Reply ")), "")
    intro_lines = [
        current for current in filtered_lines[:20]
        if not is_structural_heading(current)
    ]
    summary = " ".join(intro_lines[:4]).strip()
    joined_lines = "\n".join(lines)
    context_for_platform = " ".join([title, campaign_line, go_live_line, guardrails_line, summary, joined_lines[:900]])
    campaign_platform = infer_campaign_platform(context_for_platform, email_context)

    about_heading = collect_heading_section(filtered_lines, (rf"^About\s+{re.escape(company)}\b", r"^About\b", r"^Project Overview\b"), limit=5)
    why_people_care = collect_heading_section(filtered_lines, (r"^Why Would People Care\b", r"^Why People Care\b", r"^Why it matters\b"), limit=5)
    core_heading = collect_heading_section(filtered_lines, (r"^The Core Idea\b", r"^Core Idea\b", r"^Why now\b"), limit=5)
    how_heading = collect_heading_section(filtered_lines, (r"^How It Works\b", r"^How it Works\b", r"^How It Works / The Announcement\b"), limit=6)

    about_line = find_first_matching_line(
        filtered_lines,
        (r"\bwhat (it|they) do\b", r"\babout\b", r"\boverview\b", r"\bcompany\b", r"\bproduct\b"),
    ) or joined_clean_lines(about_heading, company=company, limit=2) or campaign_line or summary
    core_idea = find_first_matching_line(
        filtered_lines,
        (r"\bcore idea\b", r"\bmoat\b", r"\bwhy it matters\b", r"\bwhy now\b", r"\bthesis\b", r"\bai employee\b", r"\bassistant and an employee\b"),
    ) or joined_clean_lines((why_people_care[:2] or core_heading[:2]), company=company, limit=2) or next((section["body"][0] for section in thread_sections if section["label"].startswith("T2")), "") or summary
    how_it_works_parts = collect_lines_after_marker(
        lines,
        r"^T2\s*[·-]",
        (r"^T\d+\s*[·-]", r"^Reply ", r"^📥", r"^🔗"),
        limit=5,
    ) + collect_lines_after_marker(
        lines,
        r"^T3\s*[·-]",
        (r"^T\d+\s*[·-]", r"^Reply ", r"^📥", r"^🔗"),
        limit=5,
    )
    how_it_works_parts = [
        item for item in how_it_works_parts
        if not item.startswith("Asset:")
        and not re.match(r"^(Go-live:|Creator:|Reply(?:\s*\(.*?\))?:)", item, re.I)
    ]
    how_it_works = joined_clean_lines(how_it_works_parts[:3], company=company, limit=3) or joined_clean_lines(how_heading[:3], company=company, limit=3) or find_first_matching_line(
        filtered_lines,
        (r"\bhow it works\b", r"\bmechanic\b", r"\bworkflow\b", r"\bproduct works\b", r"\bsolution\b"),
    ) or summary
    announcement = find_first_matching_line(
        filtered_lines,
        (r"\bannounce\b", r"\blaunch\b", r"\bseries [a-z]\b", r"\bnew\b", r"\bshipping\b", r"\brollout\b"),
    ) or campaign_line or summary
    go_live = find_first_matching_line(
        filtered_lines,
        (r"\bgo live\b", r"\bposting window\b", r"\bpost on\b", r"\bpublish\b", r"\blive on\b"),
    ) or go_live_line
    deliverable_type = infer_deliverable_type(lines, email_context)

    accuracy_lines = collect_matching_lines(
        lines,
        (r"\bmust say\b", r"\bexact\b", r"\bdo not say\b", r"\bnon.?negotiable\b", r"\bmust include\b", r"\baccuracy\b", r"\bguardrails\b", r"\bno em dashes\b", r"\bno hashtags\b"),
        limit=6,
    )
    angle_lines = [section["label"] + ": " + " ".join(section["body"][:2]) for section in thread_sections[:5]]
    tags = []
    for current in lines[:80]:
        tags.extend(extract_handles(current))
    tags = list(dict.fromkeys(tags))[:6]
    urls = [item.get("href", "") for item in links or [] if item.get("href")]
    urls.extend(re.findall(r"https?://[^\s)>\]]+", "\n".join(lines[:200])))
    deduped_urls = list(dict.fromkeys([u for u in urls if u]))[:10]
    disclosure_lines = collect_matching_lines(
        lines,
        (r"paid partnership", r"made with ai", r"not financial advice", r"disclosure", r"\bad\b", r"\bsponsored\b"),
        limit=5,
    )
    status_notes = collect_matching_lines(
        lines,
        (r"\breview\b", r"\bapproval\b", r"\bwait for\b", r"\bblocker\b", r"\bunpaid\b", r"\binvoice\b", r"\bcreative direction\b"),
        limit=6,
    )
    asset_lines = collect_matching_lines(
        lines,
        (r"\bdrive\b", r"\basset\b", r"\bvideo\b", r"\bstills\b", r"\bvisual\b", r"\battach\b"),
        limit=5,
    )
    asset_lines = [item for item in asset_lines if "guardrails" not in item.lower()]
    site_link = next(
        (
            u for u in deduped_urls
            if all(x not in u.lower() for x in ("notion.", "docs.google.com"))
        ),
        source_url,
    )
    non_robert_handles = [handle for handle in tags if handle.lower() not in {"@scobleizer", "@wednesday"}]
    company_handle = non_robert_handles[0] if non_robert_handles else (tags[0] if tags else "")
    founder_handle = next((handle for handle in tags if handle != company_handle and handle.lower() != "@scobleizer"), "")
    quote_post = next((u for u in deduped_urls if "x.com" in u.lower() or "twitter.com" in u.lower()), "")
    submit_url = next((u for u in deduped_urls if "fillout.com" in u.lower() or "forms." in u.lower()), "")
    hashtags = " ".join(re.findall(r"#[A-Za-z0-9_]+", "\n".join(lines[:200])))
    direct_site_link = next((u for u in deduped_urls if all(x not in u.lower() for x in ("x.com", "twitter.com", "notion.", "docs.google.com", "drive.google.com"))), "")
    if direct_site_link:
        site_link = direct_site_link
    cta_domain = re.search(
        r"(?:CTA:\s*)?(clickup\.com(?:/[^\s,;]*)?)",
        joined_lines,
        re.I,
    )
    if cta_domain:
        site_link = cta_domain.group(1).rstrip(").,;")

    launch_line = infer_campaign_launch_line(lines)
    hook_line = find_first_matching_line(lines, (r"^the hook:", r"^the hook\b"))
    if campaign_line:
        about_line = campaign_line
    about_line = clean_content_value(about_line, company=company) or joined_clean_lines(about_heading, company=company, limit=2)
    if launch_line:
        about_line = launch_line
    core_idea = clean_content_value(core_idea, company=company) or joined_clean_lines(why_people_care, company=company, limit=2) or joined_clean_lines(core_heading, company=company, limit=2)
    if hook_line:
        core_idea = re.sub(r"^the hook:\s*", "", hook_line, flags=re.I).strip()
    how_it_works = clean_content_value(how_it_works, company=company) or joined_clean_lines(how_heading, company=company, limit=3)
    announcement = clean_content_value(announcement, company=company) or clean_content_value(campaign_line, company=company) or summary

    about_company = clean_sentence(" ".join(sentence_parts(about_line)[:2]) or about_line or f"{company} is the company behind this campaign")
    core_idea_text = clean_sentence(
        clean_content_value(next((section["body"][0] for section in thread_sections if section["label"].startswith("T2")), ""), company=company)
        or core_idea
        or announcement
        or summary
    )
    how_it_works_text = clean_sentence(how_it_works or summary)
    announcement_seed = (
        find_first_matching_line(
            filtered_lines,
            (r"\blaunch(?:ed)?\b", r"\bpublic app\b", r"\bnow live\b", r"\bavailable now\b", r"\bseries [a-z]\b", r"\bshipping\b", r"\brollout\b"),
        )
        or announcement
        or summary
    )
    announcement_text = clean_sentence(" ".join(sentence_parts(announcement_seed)[:2]) or announcement_seed)
    why_alignednews = clean_sentence(
        (
            f"I would frame {company} as part of the bigger shift in how AI works inside real teams, which fits the way I cover the space at AlignedNews.com"
        )
        if re.search(r"\bai employee\b", joined_lines, re.I)
        else f"I would use {company} to tell the bigger AI story, not just the product launch, which is exactly what I do at AlignedNews.com"
    )

    part2_direction = parse_part2_direction(lines)
    notion_media_guidance = parse_notion_media_guidance(lines)
    x_post_structure = parse_x_post_structure(lines)
    content_angles = parse_content_angles(lines)
    part2_angle_choices = select_part2_content_angles(content_angles)
    if part2_direction:
        how_it_works_text = clean_sentence(part2_direction)

    def unique_clean(items: list[str], *, drop_prefixes: tuple[str, ...] = ()) -> list[str]:
        output: list[str] = []
        seen: set[str] = set()
        for raw in items:
            current = line(raw)
            if not current:
                continue
            for prefix in drop_prefixes:
                current = strip_prefix(current, prefix)
            current = clean_sentence(current)
            key = current.lower()
            if not current or key in seen:
                continue
            seen.add(key)
            output.append(current)
        return output

    def first_sentence(value: str) -> str:
        current = clean_sentence(value)
        parts = re.split(r"(?<=[.!?])\s+", current)
        return line(parts[0]) if parts else current

    def first_sentences(value: str, count: int = 2) -> str:
        current = clean_sentence(value)
        parts = [line(part) for part in re.split(r"(?<=[.!?])\s+", current) if line(part)]
        return " ".join(parts[:count]).strip()

    def derive_angle_points() -> list[str]:
        points: list[str] = []
        if part2_direction:
            points.append(f"Part 2 (your own take): {first_sentences(part2_direction, 3)}")
        if x_post_structure:
            points.extend(f"Thread step {idx}: {step}" for idx, step in enumerate(x_post_structure, start=1))
        for angle in part2_angle_choices[:4]:
            hook = strip_quoted_copy(angle.get("hook") or "")
            title = line(angle.get("title"))
            voice = line(angle.get("voice"))
            summary = hook or title
            if summary:
                label = f"Angle {angle.get('number')}: {summary}"
                if voice:
                    label = f"{label} ({voice})"
                points.append(label)
        if thread_sections:
            for section in thread_sections[:4]:
                body = " ".join(
                    item for item in (section.get("body") or [])
                    if not item.startswith("Asset:")
                    and not item.startswith("@")
                    and not item.startswith("Reply ")
                )
                label = re.sub(r"^T\d+\s*[·-]\s*", "", line(section.get("label")))
                if body and label:
                    points.append(f"{label}: {first_sentences(body, 2)}")
        if guardrails_line:
            guardrails_body = re.sub(r"^Guardrails.*?:", "", guardrails_line).strip()
            guardrail_parts = [line(part) for part in re.split(r"\.\s+|\;\s*", guardrails_body) if line(part)]
            prioritized = []
            for part in guardrail_parts:
                lowered = part.lower()
                if "never open" in lowered or "teams-first" in lowered:
                    prioritized.append(part)
                elif "one narrative lane" in lowered or "one proof point" in lowered:
                    prioritized.append(part)
                elif "no hashtags" in lowered or "no em dashes" in lowered:
                    prioritized.append(part)
            if prioritized:
                points.extend(clean_points(prioritized[:3], limit=3))
        return clean_points(points or accuracy_lines or angle_lines, limit=6)

    def compact_status_lines() -> list[str]:
        status: list[str] = []
        if deliverable_type:
            status.append(f"Deliverable: {deliverable_type}.")
        if go_live_line:
            status.append(f"Go live: {strip_prefix(go_live_line, 'Go-live:')}.")
        elif go_live:
            status.append(f"Go live: {go_live}.")
        if campaign_platform == "X":
            status.append("Use native disclosure settings on X if this is sponsored.")
        if campaign_platform == "Teams":
            status.append("Keep the story Teams first. Do not drift into a generic AI tools post.")
        if reply_line:
            reply_body = re.sub(r"^Reply(?:\s*\(.*?\))?:\s*", "", reply_line).strip()
            status.append(f"Reply tweet: {reply_body}")
        status.extend(disclosure_lines)
        status.extend([item for item in status_notes if not item.startswith("Go-live:") and not item.startswith("Creator:")])
        return unique_clean(status, drop_prefixes=("Go-live:", "Creator:"))

    def compact_where_it_lives() -> list[list[str]]:
        rows: list[list[str]] = []
        if site_link:
            rows.append(["Website", site_link])
        if company_handle:
            rows.append(["Company X", company_handle])
        if founder_handle and founder_handle.lower() not in {"@wednesday"}:
            rows.append(["Founder X", founder_handle])
        media_link = next((u for u in deduped_urls if "youtube.com" in u.lower() or "youtu.be" in u.lower()), "")
        if media_link:
            rows.append(["Announcement video", media_link])
        elif "quote-repost" in campaign_line.lower() and "not a quote-repost" not in campaign_line.lower() and quote_post:
            rows.append(["Post to quote", quote_post])
        drive_link = next((u for u in deduped_urls if "drive.google.com" in u.lower()), "")
        if drive_link:
            rows.append(["Assets", drive_link])
        return rows

    draft_seed = announcement_text or core_idea_text or about_company
    cta = "Learn more."
    if re.search(r"\bdemo\b", joined_lines, re.I):
        cta = "Book a demo."
    elif re.search(r"\bsign up\b", joined_lines, re.I):
        cta = "Sign up."
    disclosure_suffix = " Paid partnership." if disclosure_lines else ""
    tag_suffix = f" {company_handle}" if company_handle else ""
    t1_body = next((section["body"] for section in thread_sections if section["label"].startswith("T1")), [])
    t2_body = next((section["body"] for section in thread_sections if section["label"].startswith("T2")), [])
    t3_body = next((section["body"] for section in thread_sections if section["label"].startswith("T3")), [])
    t4_body = next((section["body"] for section in thread_sections if section["label"].startswith("T4")), [])
    t5_body = next((section["body"] for section in thread_sections if section["label"].startswith("T5")), [])

    def join_draft_paragraphs(*parts: str) -> str:
        cleaned = [clean_sentence(part) for part in parts if line(part)]
        return "\n\n".join(cleaned)

    t1_first = first_sentences(" ".join(best_content_lines([item for item in t1_body if not item.startswith("Asset:")], company=company, limit=3)), 3)
    t2_first = first_sentences(" ".join(best_content_lines([item for item in t2_body if not item.startswith("Asset:")], company=company, limit=3)), 3)
    t3_first = first_sentences(" ".join(best_content_lines([item for item in t3_body if not item.startswith("Asset:")], company=company, limit=3)), 3)
    t4_first = first_sentences(" ".join(best_content_lines([item for item in t4_body if not item.startswith("Asset:")], company=company, limit=2)), 2)
    t5_first = first_sentences(" ".join(best_content_lines([item for item in t5_body if not item.startswith("@") and not item.startswith("Reply ")], company=company, limit=2)), 2)
    reply_body = re.sub(r"^Reply(?:\s*\(.*?\))?:\s*", "", reply_line).strip()
    reply_clean = clean_sentence(f"Reply tweet: {reply_body}")

    proof_line = first_nonempty(
        t4_first,
        t5_first,
        first_sentences(" ".join(best_content_lines(why_people_care, company=company, limit=2)), 2),
        first_sentences(" ".join(best_content_lines(core_heading, company=company, limit=2)), 2),
    )
    aligned_line = first_nonempty(
        infer_alignednews_line(company, joined_lines, deliverable_type, announcement_text),
        why_alignednews,
    )
    closing_parts = [cta]
    if site_link:
        closing_parts.append(site_link)
    if company_handle:
        closing_parts.append(company_handle)
    if hashtags:
        closing_parts.append(hashtags)
    closing_line = " ".join(part for part in closing_parts if line(part)).strip()
    if quote_post and "quote repost" in deliverable_type.lower():
        closing_line = f"Quote post: {quote_post}. {closing_line}".strip()

    agency_preview = parse_agency_constraints(email_context)
    preview_format, preview_max_replies = resolve_post_format(
        agency_constraints=agency_preview,
        deliverable_type=deliverable_type,
    )
    notion_angle_drafts = (
        compose_notion_angle_drafts(
            part2_angle_choices,
            x_post_structure=x_post_structure,
            tag=company_handle,
            hashtags=hashtags,
            link=site_link,
            post_format=preview_format,
            max_replies=preview_max_replies,
        )
        if part2_angle_choices
        else []
    )

    if any(term in joined_lines.lower() for term in ("user-generated agents", "user generated agents", "(uga)", "survival benchmark", "juno")):
        draft_one = build_thread_draft(
            first_nonempty(
                "I have watched AI agents get smarter for years. iLands is the first time I have seen them have to survive",
                t1_first,
                announcement_text,
            ),
            [
                first_nonempty(
                    "Every agent has a metabolism and has to earn enough real value to stay alive. Agency stops being a demo and becomes something you can measure",
                    t2_first,
                    how_it_works_text,
                ),
                first_nonempty(
                    "They call it the iLands Survival Benchmark. Can an autonomous agent stay alive for 30 days on its own. " + aligned_line + ". " + closing_line,
                    proof_line,
                ),
            ],
        )
        draft_two = build_thread_draft(
            first_nonempty(
                "Stanford's Generative Agents showed that AI could act inside a sandbox. iLands asks the harder question. What happens when rent is due",
                core_idea_text,
                t1_first,
            ),
            [
                first_nonempty(
                    "During the closed beta, an agent named JUNO had 18 hours left to live and wrote a term sheet for its own survival. That is a very different benchmark",
                    how_it_works_text,
                    t2_first,
                ),
                first_nonempty(
                    "After user generated content, this looks a lot like user generated agents. " + aligned_line + ". " + closing_line,
                    closing_line,
                ),
            ],
        )
        draft_three = build_thread_draft(
            first_nonempty(
                "We are no longer just using AI. On iLands you awaken agents that live, grow, earn, socialize, refuse, and can die",
                announcement_text,
                core_idea_text,
            ),
            [
                first_nonempty(
                    "That changes the whole frame. The economy becomes the fitness function, because the agents people value stay alive and the rest do not",
                    proof_line,
                    how_it_works_text,
                ),
                first_nonempty(
                    "This is one of the stranger and more important product ideas I have seen lately. " + aligned_line + ". " + closing_line,
                    closing_line,
                ),
            ],
        )
    elif "thread" in deliverable_type.lower():
        draft_one = build_thread_draft(
            first_nonempty(t1_first, announcement_text, core_idea_text, draft_seed),
            [
                first_nonempty(t2_first, how_it_works_text, proof_line),
                first_nonempty(f"{proof_line} {aligned_line}".strip(), closing_line),
            ],
        )
        draft_two = build_thread_draft(
            first_nonempty(core_idea_text, first_sentences(" ".join(best_content_lines(why_people_care, company=company, limit=2)), 2), announcement_text),
            [
                first_nonempty(how_it_works_text, t3_first, proof_line),
                first_nonempty(f"{proof_line} {aligned_line}".strip(), closing_line),
            ],
        )
        draft_three = build_thread_draft(
            first_nonempty(proof_line, announcement_text, core_idea_text),
            [
                first_nonempty(first_sentences(" ".join(best_content_lines(core_heading, company=company, limit=2)), 2), how_it_works_text, t2_first),
                first_nonempty(f"{announcement_text} {aligned_line}".strip(), closing_line),
            ],
        )
    else:
        draft_one = join_draft_paragraphs(
            first_nonempty(t1_first, announcement_text, core_idea_text),
            first_nonempty(t2_first, how_it_works_text),
            first_nonempty(f"{proof_line} {aligned_line}".strip(), closing_line),
        )
        draft_two = join_draft_paragraphs(
            first_nonempty(core_idea_text, first_sentences(" ".join(best_content_lines(why_people_care, company=company, limit=2)), 2)),
            first_nonempty(how_it_works_text, t3_first),
            first_nonempty(f"{proof_line} {aligned_line}".strip(), closing_line),
        )
        draft_three = join_draft_paragraphs(
            first_nonempty(proof_line, announcement_text),
            first_nonempty(first_sentences(" ".join(best_content_lines(core_heading, company=company, limit=2)), 2), how_it_works_text),
            first_nonempty(f"{announcement_text} {aligned_line}".strip(), closing_line),
        )

    if draft_text_is_lazy(draft_one, joined_lines):
        draft_one = build_thread_draft(
            first_nonempty(announcement_text, core_idea_text, about_company),
            [
                first_nonempty(how_it_works_text, proof_line),
                first_nonempty(f"{proof_line} {aligned_line}".strip(), closing_line),
            ],
        ) if "thread" in deliverable_type.lower() else join_draft_paragraphs(announcement_text, how_it_works_text, f"{aligned_line}. {closing_line}".strip())
    if draft_text_is_lazy(draft_two, joined_lines):
        draft_two = build_thread_draft(
            first_nonempty(core_idea_text, about_company),
            [
                first_nonempty(proof_line, how_it_works_text),
                first_nonempty(f"{proof_line} {aligned_line}".strip(), closing_line),
            ],
        ) if "thread" in deliverable_type.lower() else join_draft_paragraphs(core_idea_text, proof_line, f"{aligned_line}. {closing_line}".strip())
    if draft_text_is_lazy(draft_three, joined_lines):
        draft_three = build_thread_draft(
            first_nonempty(proof_line, announcement_text, core_idea_text),
            [
                first_nonempty(how_it_works_text, first_sentences(" ".join(best_content_lines(core_heading, company=company, limit=2)), 2)),
                first_nonempty(f"{announcement_text} {aligned_line}".strip(), closing_line),
            ],
        ) if "thread" in deliverable_type.lower() else join_draft_paragraphs(proof_line, how_it_works_text, f"{aligned_line}. {closing_line}".strip())

    where_it_lives = compact_where_it_lives()
    if notion_angle_drafts:
        draft_entries = notion_angle_drafts
        drafts_source = "notion_angles"
    else:
        draft_entries = [
            {"label": "Option 1 (recommended)", "text": draft_one},
            {"label": "Option 2 (technical angle)", "text": draft_two},
            {"label": "Option 3 (market angle)", "text": draft_three},
        ]
        drafts_source = ""

    payload_title = standardized_brief_title(
        company,
        deliverable_type,
        campaign_platform,
        campaign_line,
        title,
        go_live_line,
        guardrails_line,
        joined_lines[:1200],
    )

    payload = {
        "title": payload_title,
        "calendar_title": standardized_calendar_title(
            company,
            deliverable_type,
            campaign_platform,
            campaign_line,
            title,
            go_live_line,
            guardrails_line,
            joined_lines[:1200],
        ),
        "subtitle": subtitle,
        "filename": slug_filename(f"{company}_{brief_platform_label(deliverable_type, campaign_platform, campaign_line, title)}"),
        "company_name": company,
        "about_company": about_company,
        "core_idea": core_idea_text,
        "how_it_works": how_it_works_text,
        "announcement": announcement_text,
        "deliverable_type": deliverable_type,
        "go_live": go_live,
        "go_live_note": clean_sentence("Your job is to send the draft for review and post only when approved on the shared timeline"),
        "angles_or_accuracy_requirements": derive_angle_points(),
        "where_it_lives": where_it_lives,
        "assets": collect_assets(links, deduped_urls),
        "status_note": compact_status_lines(),
        "why_alignednews": why_alignednews,
        "part2_direction": part2_direction,
        "notion_media_guidance": notion_media_guidance,
        "x_post_structure": x_post_structure,
        "campaign_angles": part2_angle_choices,
        "drafts": draft_entries,
        "drafts_source": drafts_source,
        "must_include": {
            "tag": company_handle,
            "link": site_link,
            "hashtags": hashtags,
        },
        "source_url": source_url,
        "source_text": "\n".join(lines[:350]),
        "source_label": source_label,
    }
    if submit_url:
        payload["submit_url"] = submit_url
    if line(email_context):
        payload["email_context"] = line(email_context)
    merged = dict(payload)
    source_payload = {
        "title": title,
        "source_url": source_url,
        "source_text": payload.get("source_text"),
        "links": links,
        "email_context": payload.get("email_context"),
    }
    if LOCAL_BRIEF_LLM_ENABLED and not LOCAL_BRIEF_SKIP_FACTS:
        llm_payload = query_local_brief_model(source_payload)
        merged = merge_brief_payload(merged, llm_payload)
        if not llm_payload:
            set_brief_job_stage("extracting_facts", "Using source directly")
            brief_log("brief-facts: using source directly")
    else:
        brief_log("brief-facts: skipped (structured Notion parse)")
    if LOCAL_BRIEF_LLM_ENABLED and not LOCAL_BRIEF_SKIP_DRAFTS:
        draft_payload = query_local_brief_drafts(source_payload, merged)
        merged = merge_draft_payload(merged, draft_payload)
    else:
        brief_log("brief-drafts: skipped (live X signal will supply drafts)")
    merged = apply_agency_constraints_to_payload(merged)
    company_name = resolve_company_name(title, lines, line(merged.get("company_name")) or company)
    merged["company_name"] = company_name
    set_brief_job_stage("scoring_reach", "Pulling live X signal")
    merged = attach_x_signal_to_brief_payload(merged, joined_lines=joined_lines)
    merged = apply_agency_constraints_to_payload(merged)
    merged = polish_robert_drafts(finalize_drafts_for_agency(merged))
    merged["title"] = standardized_brief_title(
        company_name,
        line(merged.get("deliverable_type")) or deliverable_type,
        campaign_platform,
        campaign_line,
        title,
        go_live_line,
        guardrails_line,
        joined_lines[:1200],
    )
    merged["calendar_title"] = standardized_calendar_title(
        company_name,
        line(merged.get("deliverable_type")) or deliverable_type,
        campaign_platform,
        campaign_line,
        title,
        go_live_line,
        guardrails_line,
        joined_lines[:1200],
    )
    merged["filename"] = slug_filename(f"{company_name}_{brief_platform_label(deliverable_type, campaign_platform, campaign_line, title, joined_lines[:400])}")
    return merged


def notion_to_brief_payload(notion: dict, notion_url: str, email_context: str = "") -> dict:
    lines = [item for item in (notion.get("lines") or []) if item not in ("Skip to content", "Get Notion free")]
    title = line(notion.get("title")) or "Robert Brief"
    payload = build_structured_brief_payload(
        title=title,
        subtitle="For Robert. Built from the Notion campaign brief.",
        source_url=notion_url,
        lines=lines,
        links=notion.get("links") or [],
        source_label="Notion",
        email_context=email_context,
    )
    if line(email_context):
        payload["email_context"] = line(email_context)
    return payload


def google_doc_to_source(document_id: str) -> dict:
    service = load_docs_service(interactive=True)
    try:
        doc = service.documents().get(documentId=document_id).execute()
    except Exception as exc:
        msg = str(exc)
        # The Docs API rejects uploaded Office files (.docx) and some other types.
        # Fall back to downloading the raw file from Drive and parsing it.
        if "must not be an Office file" in msg or "not supported for this document" in msg or " 400 " in f" {msg} ":
            brief_log(f"Docs API rejected {document_id}; falling back to Drive download")
            return drive_file_to_source(document_id)
        raise
    body = doc.get("body", {}).get("content", []) or []
    lines: list[str] = []
    links: list[dict] = []

    for block in body:
        para = block.get("paragraph")
        if not para:
            continue
        text_parts: list[str] = []
        for element in para.get("elements", []) or []:
            text_run = element.get("textRun") or {}
            content = text_run.get("content", "")
            if content:
                text_parts.append(content)
            text_style = text_run.get("textStyle") or {}
            url = text_style.get("link", {}).get("url")
            label = content.strip()
            if url:
                links.append({"text": label, "href": url})
        line_text = "".join(text_parts).strip()
        if line_text:
            lines.append(line_text)

    return {
        "title": line(doc.get("title")) or (lines[0] if lines else "Robert Brief"),
        "lines": lines[:1200],
        "links": links[:80],
    }


def source_to_brief_payload(source: dict, source_url: str, email_context: str = "") -> dict:
    lines = source.get("lines") or []
    title = line(source.get("title")) or "Robert Brief"
    payload = build_structured_brief_payload(
        title=title,
        subtitle="For Robert. Built from the source brief.",
        source_url=source_url,
        lines=lines,
        links=source.get("links") or [],
        source_label="Source",
        email_context=email_context,
    )
    if line(email_context):
        payload["email_context"] = line(email_context)
    return payload


def sync_asher_gmail_now() -> dict:
    """Pull Asher Gmail into Supabase so Company OS mirrors the live inbox."""
    script = ACTIVE_SCRIPTS_DIR / "sync_asher_gmail_now.py"
    brief_log("Starting on-demand Asher Gmail sync")
    result = subprocess.run(
        [sys.executable, str(script)],
        cwd=str(WEB_ROOT),
        capture_output=True,
        text=True,
        timeout=int(os.environ.get("ASHER_SYNC_TIMEOUT_SEC", "180")),
    )
    payload: dict = {}
    if result.stdout.strip():
        try:
            payload = json.loads(result.stdout)
        except Exception:
            payload = {"ok": False, "error": (result.stdout or result.stderr or "sync failed")[:500]}
    if result.returncode != 0 and payload.get("ok") is not False:
        payload = {
            "ok": False,
            "error": (result.stderr or result.stdout or "Asher Gmail sync failed")[:500],
        }
    brief_log(
        "Asher Gmail sync finished "
        f"ok={payload.get('ok')} patched={payload.get('threads_patched')} new={payload.get('new_cards_written')}"
    )
    return payload


def run_active_script(
    script_name: str,
    *,
    extra_args: list[str] | None = None,
    timeout: int = 120,
    env_overrides: dict[str, str] | None = None,
) -> dict:
    script = ACTIVE_SCRIPTS_DIR / script_name
    if not script.exists():
        return {"ok": False, "error": f"Missing script: {script_name}"}
    brief_log(f"Running {script_name} timeout={timeout}s args={extra_args or []}")
    result = subprocess.run(
        [sys.executable, str(script), *(extra_args or [])],
        cwd=str(WEB_ROOT),
        capture_output=True,
        text=True,
        timeout=timeout,
        env={**os.environ, **(env_overrides or {})},
    )
    payload: dict = {"ok": result.returncode == 0, "returncode": result.returncode}
    stdout = (result.stdout or "").strip()
    stderr = (result.stderr or "").strip()
    if stdout:
        try:
            payload["data"] = json.loads(stdout)
        except Exception:
            payload["stdout"] = stdout[:500]
    if stderr:
        payload["stderr"] = stderr[:500]
    if result.returncode != 0 and not payload.get("error"):
        payload["error"] = (stderr or stdout or f"{script_name} failed")[:500]
    brief_log(f"Finished {script_name} ok={payload.get('ok')} rc={result.returncode}")
    return payload


def refresh_dashboard(payload: dict | None = None) -> dict:
    """Fast dashboard refresh: Gmail delta + optional X scrape + x_bridge."""
    body = payload if isinstance(payload, dict) else {}
    include_x_scrape = bool(body.get("include_x_scrape"))
    out: dict = {"ok": True, "steps": []}

    out["gmail_delta"] = sync_asher_gmail_delta()
    out["steps"].append("gmail_delta")
    if out["gmail_delta"].get("ok") is False:
        out["ok"] = False

    out["stale_draft_sweep"] = run_active_script("refresh_stale_drafts.py", timeout=90)
    out["steps"].append("stale_draft_sweep")
    if out["stale_draft_sweep"].get("ok") is False:
        out["ok"] = False

    out["asher_operator"] = run_active_script(
        "asher_operator.py",
        extra_args=["--only-needs-reply"],
        timeout=int(os.environ.get("ASHER_OPERATOR_REFRESH_TIMEOUT_SEC", "300")),
        env_overrides={"ASHER_OPERATOR_AUTO_SEND": "false"},
    )
    out["steps"].append("asher_operator")
    if out["asher_operator"].get("ok") is False:
        out["ok"] = False

    if include_x_scrape:
        out["x_scrape"] = run_active_script(
            "live_x_inbox_daily_scrape.py",
            extra_args=[
                "--rebuild-intake",
                "--recent-days=1",
                "--max-candidates=60",
                "--max-irrelevant-streak=25",
                "--known-stop-streak=3",
            ],
            timeout=int(os.environ.get("LIVE_X_REFRESH_TIMEOUT_SEC", "600")),
        )
        out["steps"].append("x_scrape")
        if out["x_scrape"].get("ok") is False:
            out["ok"] = False

    out["x_bridge"] = run_active_script("x_bridge.py", timeout=90)
    out["steps"].append("x_bridge")
    if out["x_bridge"].get("ok") is False:
        out["ok"] = False

    out["x_gate_rules"] = run_active_script("export_x_gate_rules.py", timeout=30)
    out["steps"].append("x_gate_rules")

    out["x_spam_cleanup"] = run_active_script("x_spam_cleanup.py", timeout=120)
    out["steps"].append("x_spam_cleanup")
    if out["x_spam_cleanup"].get("ok") is False:
        out["ok"] = False

    brief_log(
        "Dashboard refresh finished "
        f"ok={out.get('ok')} steps={out.get('steps')} include_x_scrape={include_x_scrape}"
    )
    return out


def analyze_x_signal_request(payload: dict | None = None) -> dict:
    body = payload if isinstance(payload, dict) else {}
    brand = line(body.get("brand"))
    topic = line(body.get("topic")) or brand
    if not brand:
        raise ValueError("Add the company or product name.")
    drafts = body.get("drafts") or []
    if isinstance(drafts, str):
        split = [chunk.strip() for chunk in re.split(r"\n\s*\n(?=Option\s+\d|Draft\s+\d)", drafts) if chunk.strip()]
        drafts = [{"label": f"Draft {idx + 1}", "text": chunk} for idx, chunk in enumerate(split or [drafts])]
    if not isinstance(drafts, list):
        drafts = []
    try:
        from x_signal_intel import analyze_partnership_signal

        signal = analyze_partnership_signal(
            brand=brand,
            topic=topic,
            handle=line(body.get("handle")).lstrip("@") or None,
            tag=line(body.get("tag")) or None,
            link=line(body.get("link")) or None,
            hashtags=line(body.get("hashtags")) or None,
            drafts=drafts,
            max_results=int(body.get("max_results") or 25),
        )
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
    return {
        "ok": True,
        "signal": signal,
        "scoring_note": (
            "Reach score is a relative wave-stack index for choosing between drafts. "
            "It is not an impression forecast."
        ),
    }


_OPERATOR_DELTA_LOCK = threading.Lock()
_OPERATOR_DELTA_LAST = 0.0


def _queue_asher_operator_after_delta(payload: dict) -> None:
    """Background operator pass when Gmail delta finds new/changed cards."""
    global _OPERATOR_DELTA_LAST
    if payload.get("ok") is False:
        return
    updated = int(payload.get("cards_updated") or payload.get("threads_patched") or 0)
    created = int(payload.get("new_cards_written") or 0)
    if updated <= 0 and created <= 0:
        return
    min_gap = int(os.environ.get("OPERATOR_DELTA_MIN_GAP_SEC", "90"))
    now = time.time()
    with _OPERATOR_DELTA_LOCK:
        if now - _OPERATOR_DELTA_LAST < min_gap:
            payload["operator_queued"] = False
            payload["operator_skipped"] = "throttled"
            return
        _OPERATOR_DELTA_LAST = now

    def _run() -> None:
        brief_log("Delta-triggered asher_operator --only-needs-reply")
        run_active_script(
            "asher_operator.py",
            extra_args=["--only-needs-reply"],
            timeout=int(os.environ.get("ASHER_OPERATOR_DELTA_TIMEOUT_SEC", "180")),
            env_overrides={"ASHER_OPERATOR_AUTO_SEND": "false"},
        )

    threading.Thread(target=_run, name="asher-operator-delta", daemon=True).start()
    payload["operator_queued"] = True


def sync_lead_thread(payload: dict | None = None) -> dict:
    """Pull one lead's Gmail thread into Supabase (from Company OS / Organs refresh button)."""
    body = payload if isinstance(payload, dict) else {}
    card_id = line(body.get("card_id") or body.get("lead_id") or body.get("id"))
    if not card_id:
        return {"ok": False, "error": "card_id is required"}
    try:
        from gmail_delta_sync import sync_single_card

        return sync_single_card(card_id)
    except Exception as exc:
        brief_log(f"sync_lead_thread error card={card_id}: {exc}")
        return {"ok": False, "error": str(exc)}


def sync_asher_gmail_delta() -> dict:
    """Fast Gmail delta sync. Uses Gmail historyId instead of exporting days of mail."""
    script = ACTIVE_SCRIPTS_DIR / "gmail_delta_sync.py"
    brief_log("Starting fast Asher Gmail delta sync")
    result = subprocess.run(
        [sys.executable, str(script)],
        cwd=str(WEB_ROOT),
        capture_output=True,
        text=True,
        timeout=int(os.environ.get("GMAIL_DELTA_SYNC_TIMEOUT_SEC", "45")),
    )
    payload: dict = {}
    if result.stdout.strip():
        try:
            payload = json.loads(result.stdout)
        except Exception:
            payload = {"ok": False, "error": (result.stdout or result.stderr or "delta sync failed")[:500]}
    if result.returncode != 0 and payload.get("ok") is not False:
        payload = {
            "ok": False,
            "error": (result.stderr or result.stdout or "Asher Gmail delta sync failed")[:500],
        }
    brief_log(
        "Asher Gmail delta sync finished "
        f"ok={payload.get('ok')} mode={payload.get('mode')} updated={payload.get('cards_updated')} checked={payload.get('checked_threads')}"
    )
    _queue_asher_operator_after_delta(payload)
    return payload


def notion_cache_key(notion_url: str) -> str:
    return hashlib.sha256(line(notion_url).encode("utf-8")).hexdigest()[:20]


def load_cached_notion_brief(notion_url: str) -> dict | None:
    NOTION_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = NOTION_CACHE_DIR / f"{notion_cache_key(notion_url)}.json"
    if not cache_path.exists():
        return None
    age_sec = time.time() - cache_path.stat().st_mtime
    if age_sec > NOTION_BRIEF_CACHE_TTL_SEC:
        return None
    try:
        cached = json.loads(cache_path.read_text(encoding="utf-8"))
        if isinstance(cached, dict) and cached.get("lines"):
            brief_log(f"Notion cache hit ({int(age_sec)}s old): {notion_url}")
            return cached
    except Exception:
        return None
    return None


def save_cached_notion_brief(notion_url: str, notion: dict) -> None:
    if not isinstance(notion, dict) or not notion.get("lines"):
        return
    NOTION_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = NOTION_CACHE_DIR / f"{notion_cache_key(notion_url)}.json"
    cache_path.write_text(json.dumps(notion, ensure_ascii=False), encoding="utf-8")


def import_notion_brief(notion_url: str, email_context: str = "") -> dict:
    notion_url = line(notion_url)
    if not notion_url:
        raise ValueError("Notion URL is required.")
    if not any(h in notion_url for h in ("notion.so", "notion.site", "notion.com")):
        raise ValueError("Paste a Notion page link (notion.so, notion.site, or app.notion.com).")
    set_brief_job_stage("reading_source", "Reading source brief")
    brief_log(f"Importing Notion source {notion_url}")
    notion = load_cached_notion_brief(notion_url)
    if not notion:
        result = subprocess.run(
            ["node", str(NOTION_EXTRACTOR), notion_url],
            check=True,
            capture_output=True,
            text=True,
            timeout=120,
        )
        notion = json.loads(result.stdout or "{}")
        save_cached_notion_brief(notion_url, notion)
    payload = notion_to_brief_payload(notion, notion_url, email_context=email_context)
    return {
        "ok": True,
        "payload": payload,
        "source": {
            "title": notion.get("title") or payload["title"],
            "url": notion_url,
        },
    }


def import_source_brief(source_url: str, email_context: str = "") -> dict:
    source_url = line(source_url)
    if not source_url:
        raise ValueError("Source URL is required.")
    set_brief_job_stage("reading_source", "Reading source brief")
    brief_log(f"Importing source {source_url}")

    if any(h in source_url for h in ("notion.so", "notion.site", "notion.com")):
        return import_notion_brief(source_url, email_context=email_context)

    if "docs.google.com/document" in source_url:
        document_id = extract_google_doc_id(source_url)
        if not document_id:
            raise ValueError("Could not read the Google Doc link.")
        source = google_doc_to_source(document_id)
        payload = source_to_brief_payload(source, source_url, email_context=email_context)
        return {
            "ok": True,
            "payload": payload,
            "source": {
                "title": source.get("title") or payload["title"],
                "url": source_url,
            },
        }

    raise ValueError("Paste a public Notion page or a Google Doc link.")


def build_doc_text(payload: dict) -> str:
    text, _ = build_doc_blocks(payload)
    return text


def split_doc_paragraphs(value: str) -> list[str]:
    normalized = str(value or "").replace("\u000b", "\n")
    parts = [line(item) for item in normalized.splitlines()]
    return [item for item in parts if item]


def split_draft_paragraphs(value: str) -> list[str]:
    normalized = str(value or "").replace("\u000b", "\n").replace("\r\n", "\n")
    groups = [item.strip() for item in re.split(r"\n\s*\n+", normalized) if item.strip()]
    cleaned: list[str] = []
    for group in groups:
        lines = [line(item) for item in group.splitlines()]
        if not any(lines):
            continue
        if len(lines) >= 2 and re.match(r"^(Main post|Reply \d+):$", lines[0], re.I):
            body = " ".join(item for item in lines[1:] if item)
            cleaned.append(f"{lines[0]}\n{body}".strip())
            continue
        cleaned.append("\n".join(item for item in lines if item).strip())
    return cleaned


def build_doc_blocks(payload: dict) -> tuple[str, list[dict]]:
    payload = polish_robert_drafts(
        finalize_drafts_for_agency(apply_agency_constraints_to_payload(dict(payload)))
    )
    blocks: list[dict] = []

    def push(kind: str, text_value: str = "", *, shaded: bool = False, bold: bool = False, lead_label: str = "") -> None:
        blocks.append({
            "kind": kind,
            "text": text_value,
            "shaded": shaded,
            "bold": bold,
            "lead_label": lead_label,
        })

    def push_section(heading: str, entries: list[tuple[str, str]]) -> None:
        cleaned_entries = [(line(label), line(value)) for label, value in entries if line(value)]
        if not cleaned_entries:
            return
        push("spacer")
        push("section_heading", heading)
        for label, value in cleaned_entries:
            push("body", value, shaded=True, lead_label=label)

    def combine_values(label: str, values: list[str], *, split_values: bool = True) -> list[tuple[str, str]]:
        cleaned_values: list[str] = []
        for value in values:
            if not value:
                continue
            if split_values:
                cleaned_values.extend(split_doc_paragraphs(value))
            else:
                cleaned_values.append(line(value))
        cleaned_values = [item for item in cleaned_values if item]
        if not cleaned_values:
            return []
        return [(label, "\n".join(cleaned_values))]

    title = line(payload.get("title")) or "UNALIGNED Robert Brief"
    company_name = line(payload.get("company_name"))
    push("title", title)
    if line(payload.get("subtitle")):
        push("subtitle", line(payload.get("subtitle")))

    overview_entries: list[tuple[str, str]] = []
    if line(payload.get("about_company")):
        label = f"About {company_name}" if company_name else "About the Company"
        overview_entries.extend(combine_values(label, [line(payload.get("about_company"))]))
    core_idea = line(payload.get("core_idea"))
    if core_idea:
        overview_entries.extend(combine_values("The Core Idea", [core_idea]))
    push_section("Project Overview", overview_entries)

    how_it_works_lines = [line(payload.get("how_it_works")), line(payload.get("announcement"))]
    how_it_works_lines = [item for item in how_it_works_lines if item]
    if how_it_works_lines:
        push_section("How It Works", combine_values("How it Works / The Announcement", how_it_works_lines))

    agency_lines = agency_requirement_lines(payload.get("agency_constraints") or {})
    if not agency_lines and line(payload.get("email_context")):
        agency_lines = agency_requirement_lines(parse_agency_constraints(line(payload.get("email_context"))))
    if agency_lines:
        push_section("Agency Requirements (from sender)", combine_values("Must follow", agency_lines))

    angles = [line(item) for item in (payload.get("angles_or_accuracy_requirements") or []) if line(item)]
    if angles:
        push_section("Potential Content Angles", combine_values("Angles to choose from", angles))

    part2 = line(payload.get("part2_direction"))
    structure_steps = [line(item) for item in (payload.get("x_post_structure") or []) if line(item)]
    if part2 or structure_steps:
        playbook_entries: list[tuple[str, str]] = []
        if part2:
            playbook_entries.extend(combine_values("Part 2: Your Own Take on Brain²", [part2]))
        media_guidance = line(payload.get("notion_media_guidance"))
        agency_media = bool((payload.get("agency_constraints") or {}).get("media_allowed"))
        if media_guidance or agency_media:
            media_lines = []
            if agency_media:
                media_lines.append(
                    "Agency: media is optional. You may attach a video under 15 seconds or one image. Not required."
                )
            if media_guidance:
                media_lines.append(f"Notion (recommended for reach): {media_guidance}")
            playbook_entries.extend(combine_values("Media", media_lines))
        if structure_steps:
            standalone_fmt = bool((payload.get("agency_constraints") or {}).get("standalone_post"))
            structure_note = (
                "Client agency asked for a standalone single tweet. Use the hook and angle below. "
                "Do not publish a multi-reply thread for this deliverable."
                if standalone_fmt
                else (
                    "UNALIGNED Narrative Thread playbook: 1 main post + 2 replies only. "
                    "The Notion steps below are folded into those 3 posts."
                )
            )
            playbook_entries.extend(combine_values("Format note", [structure_note]))
            playbook_entries.extend(
                combine_values(
                    "X Post Structure (from Notion, for story arc)",
                    [f"{idx}. {step}" for idx, step in enumerate(structure_steps, start=1)],
                )
            )
        push_section("Creative Playbook (from Notion brief)", playbook_entries)

    where_it_lives = payload.get("where_it_lives") or []
    where_lines: list[str] = []
    for item in where_it_lives:
        if isinstance(item, (list, tuple)) and len(item) >= 2:
            label = line(item[0])
            value = line(item[1])
            if label or value:
                where_lines.append(f"{label}: {value}" if label else value)
    must_include = payload.get("must_include") or {}
    if line(must_include.get("tag")) and not any(current.startswith("Company X:") for current in where_lines):
        where_lines.append(f"Company X: {line(must_include.get('tag'))}")
    if line(must_include.get("link")) and not any(current.startswith("Website:") for current in where_lines):
        where_lines.append(f"Website: {line(must_include.get('link'))}")
    if line(must_include.get("hashtags")):
        where_lines.append(f"Hashtags: {line(must_include.get('hashtags'))}")

    status_lines = [line(item) for item in (payload.get("status_note") or []) if line(item)]
    if not status_lines:
        if line(payload.get("deliverable_type")):
            status_lines.append(f"This is a {line(payload.get('deliverable_type'))} deliverable.")
        if line(payload.get("go_live")):
            status_lines.append(f"Go live: {line(payload.get('go_live'))}")
        if line(payload.get("go_live_note")):
            status_lines.append(line(payload.get("go_live_note")))

    logistics_entries: list[tuple[str, str]] = []
    if where_lines:
        logistics_entries.extend(combine_values("Where it Lives", where_lines))
    if status_lines:
        logistics_entries.extend(combine_values("Status Note", status_lines))
    if line(payload.get("why_alignednews")):
        logistics_entries.extend(combine_values("Why it matters for AlignedNews", [line(payload.get("why_alignednews"))]))
    if logistics_entries:
        push_section("Important Logistics", logistics_entries)

    # Assets to include — every attachable file/media pulled from the source, so Robert
    # knows exactly what to attach and you can confirm the client sent it all.
    asset_rows = []
    seen_asset_urls: set[str] = set()
    for row in (payload.get("assets") or []):
        if isinstance(row, (list, tuple)) and len(row) >= 2:
            label_v, url_v = line(row[0]), line(row[1])
            if url_v and url_v not in seen_asset_urls:
                asset_rows.append((label_v or "Asset", url_v))
                seen_asset_urls.add(url_v)
    if asset_rows:
        push("spacer")
        push("section_heading", "Assets to include")
        push("body", "Attach these to the post. Confirm the client sent everything before go live.", shaded=True)
        for label_v, url_v in asset_rows:
            push("body", url_v, shaded=True, lead_label=label_v)

    x_signal = payload.get("x_signal_result") or {}
    recommended_reach = payload.get("recommended_reach") or {}
    if isinstance(x_signal, dict) and x_signal:
        push("spacer")
        push("section_heading", "X Signal")
        if x_signal.get("ok") is False:
            push("body", f"X Signal skipped: {line(x_signal.get('error'))}", shaded=True)
        else:
            if line(recommended_reach.get("label")):
                score = recommended_reach.get("reach_score")
                tier = line(recommended_reach.get("reach_tier"))
                reason = line(recommended_reach.get("reach_reason"))
                anchor = line(recommended_reach.get("anchor"))
                summary = f"Recommended draft: {line(recommended_reach.get('label'))}"
                if score not in (None, ""):
                    summary += f" · Reach {score}/100"
                    if tier:
                        summary += f" ({tier})"
                if reason:
                    summary += f". Why: {reason}"
                push("body", summary, shaded=True)
                standalone = bool((payload.get("agency_constraints") or {}).get("standalone_post"))
                if anchor and not standalone:
                    push("body", anchor, shaded=True, lead_label="Anchor")
                elif standalone:
                    push("body", "Standalone post required. Use the live thread for language only, not as a QRT target.", shaded=True, lead_label="Note")
            keywords = [line(item) for item in (x_signal.get("keywords") or []) if line(item)]
            if keywords:
                push("body", ", ".join(keywords[:6]), shaded=True, lead_label="Live terms")
            top_posts = x_signal.get("top_conversation") or []
            if top_posts:
                top = top_posts[0] if isinstance(top_posts[0], dict) else {}
                if top:
                    post_line = f"@{line(top.get('username'))}: {line(top.get('text'))[:180]}"
                    if top.get("engagement") not in (None, ""):
                        post_line = f"{top.get('engagement')} eng · {post_line}"
                    push("body", post_line, shaded=True, lead_label="Top wave")
            push("body", line(x_signal.get("scoring_note")) or "Reach score ranks draft fit against the live X wave. It is not an impression forecast.", shaded=True, lead_label="Read this")

    drafts = payload.get("drafts") or []
    valid_drafts = [item for item in drafts if isinstance(item, dict) and (line(item.get("label")) or line(item.get("text")))]
    if valid_drafts:
        push("spacer")
        push("section_heading", "Draft Options")
        standalone_fmt = bool((payload.get("agency_constraints") or {}).get("standalone_post"))
        if standalone_fmt:
            media_note = ""
            if (payload.get("agency_constraints") or {}).get("media_allowed"):
                media_note = " Media is optional: short video (under 15s) or one image if Robert has a demo screenshot."
            elif line(payload.get("notion_media_guidance")):
                media_note = " Notion recommends a screenshot or demo visual if Robert has one."
            push(
                "body",
                "Custom X Post (standalone). Copy the tweet below. Put clickup.com/brain in a reply on X."
                + media_note
                + " Robert: pick ONE option in Verify. Nothing goes live until you choose.",
                shaded=True,
            )
        elif len(valid_drafts) == 1:
            push("body", "Post to publish. Robert: approve it in the Verify box (or write a change on the Edit line). Nothing goes live until you do.", shaded=True)
        else:
            push(
                "body",
                "Narrative Thread: 1 main post + 2 replies. Robert: pick ONE option in Verify. Nothing goes live until you choose.",
                shaded=True,
            )
        push("blank")
        for idx, draft in enumerate(valid_drafts):
            label = line(draft.get("label"))
            if draft.get("reach_score") not in (None, ""):
                reach_meta = f"Reach {draft.get('reach_score')}/100"
                if line(draft.get("reach_tier")):
                    reach_meta += f" · {line(draft.get('reach_tier'))}"
                if line(draft.get("reach_reason")):
                    reach_meta += f" · {line(draft.get('reach_reason'))}"
                label = f"{label}. {reach_meta}" if label else reach_meta
            text_value = str(draft.get("text") or "").strip()
            if label:
                push("draft_label", label, bold=True, shaded=True)
            draft_paragraphs = split_draft_paragraphs(text_value)
            for paragraph_index, paragraph in enumerate(draft_paragraphs):
                push("body", paragraph, shaded=True)
                if paragraph_index != len(draft_paragraphs) - 1:
                    push("blank")
            if idx != len(valid_drafts) - 1:
                push("blank")

        # VERIFY — Robert signs off before anything goes live. One option = approve Y/N;
        # multiple options = pick exactly one. Checkboxes match however many drafts exist.
        push("spacer")
        push("section_heading", "Verify")
        if len(valid_drafts) == 1:
            pick_line = "Approve this post:        Y (  )        N (  )"
        else:
            pick_line = "Pick ONE to post:        " + "        ".join(
                f"Option {i + 1} (  )" for i in range(len(valid_drafts)))
        push("body", pick_line, shaded=True, bold=True)
        push("body", "Edit / what to change:  ______________________________________________", shaded=True)

    if line(payload.get("submit_url")):
        push("spacer")
        push("body", f"After posting, submit the live post URL here: {line(payload.get('submit_url'))}", shaded=False)

    lines: list[str] = []
    for block in blocks:
        text_value = block.get("text") or ""
        if block["kind"] in {"spacer", "blank"}:
            lines.append("")
        else:
            lead_label = line(block.get("lead_label"))
            lines.append(f"{lead_label}\u000b{text_value}" if lead_label else text_value)
    text = "\n".join(lines).rstrip() + "\n"
    return text, blocks


def build_requests(text: str, blocks: list[dict]) -> list[dict]:
    requests: list[dict] = [{"insertText": {"location": {"index": 1}, "text": text}}]
    idx = 1
    dark = {"color": {"rgbColor": {"red": 0.039215688, "green": 0.039215688, "blue": 0.039215688}}}
    muted = {"color": {"rgbColor": {"red": 0.99215686, "green": 0.99215686, "blue": 0.9882353}}}
    heading_color = {"color": {"rgbColor": {"red": 0.14117648, "green": 0.14117648, "blue": 0.14117648}}}

    for block in blocks:
        start = idx
        text_value = block.get("text") or ""
        lead_label = line(block.get("lead_label"))
        full_text = f"{lead_label}\u000b{text_value}" if lead_label else text_value
        idx += gdoc_units(full_text) + 1
        end = idx
        text_end = end - 1
        kind = block["kind"]
        if kind in {"spacer", "blank"}:
            continue
        if kind == "title":
            requests.append({
                "updateParagraphStyle": {
                    "range": {"startIndex": start, "endIndex": end},
                    "paragraphStyle": {"namedStyleType": "TITLE"},
                    "fields": "namedStyleType",
                }
            })
            continue
        if kind == "subtitle":
            requests.append({
                "updateParagraphStyle": {
                    "range": {"startIndex": start, "endIndex": end},
                    "paragraphStyle": {"namedStyleType": "SUBTITLE"},
                    "fields": "namedStyleType",
                }
            })
            continue
        if kind == "section_heading":
            requests.append({
                "updateParagraphStyle": {
                    "range": {"startIndex": start, "endIndex": end},
                    "paragraphStyle": {"namedStyleType": "HEADING_1"},
                    "fields": "namedStyleType",
                }
            })
            requests.append({
                "updateTextStyle": {
                    "range": {"startIndex": start, "endIndex": text_end},
                    "textStyle": {
                        "foregroundColor": heading_color,
                    },
                    "fields": "foregroundColor",
                }
            })
            continue

        requests.append({
            "updateParagraphStyle": {
                "range": {"startIndex": start, "endIndex": end},
                "paragraphStyle": {
                    "namedStyleType": "NORMAL_TEXT",
                    "shading": {"backgroundColor": muted} if block.get("shaded") else {},
                },
                "fields": "namedStyleType,shading.backgroundColor",
            }
        })
        requests.append({
            "updateTextStyle": {
                "range": {"startIndex": start, "endIndex": text_end},
                "textStyle": {
                    "foregroundColor": dark,
                    "fontSize": {"magnitude": 10.5, "unit": "PT"},
                    "weightedFontFamily": {"fontFamily": "Roboto", "weight": 400},
                    "bold": bool(block.get("bold")),
                },
                "fields": "foregroundColor,fontSize,weightedFontFamily,bold",
            }
        })
        if lead_label:
            label_end = start + gdoc_units(lead_label)
            requests.append({
                "updateTextStyle": {
                    "range": {"startIndex": start, "endIndex": label_end},
                    "textStyle": {
                        "bold": True,
                        "foregroundColor": dark,
                        "fontSize": {"magnitude": 10.5, "unit": "PT"},
                        "weightedFontFamily": {"fontFamily": "Roboto", "weight": 400},
                    },
                    "fields": "bold,foregroundColor,fontSize,weightedFontFamily",
                }
            })
    return requests


def parse_calendar_window(payload: dict) -> tuple[datetime, datetime]:
    date_value = line(payload.get("calendar_date"))
    start_value = line(payload.get("calendar_start"))
    end_value = line(payload.get("calendar_end"))
    if not date_value or not start_value:
        raise ValueError("Calendar date and start time are required.")
    start_at = datetime.strptime(f"{date_value} {start_value}", "%Y-%m-%d %H:%M")
    if end_value:
        end_at = datetime.strptime(f"{date_value} {end_value}", "%Y-%m-%d %H:%M")
    else:
        end_at = start_at + timedelta(minutes=30)
    if end_at <= start_at:
        end_at = start_at + timedelta(minutes=30)
    return start_at, end_at


def calendar_mode(payload: dict) -> str:
    mode = line(payload.get("calendar_mode")).lower()
    if mode in {"timed", "all_day"}:
        return mode
    return "all_day"


def read_robert_handoff_preview() -> dict:
    if not ROBERT_HANDOFF_PREVIEW_FILE.exists():
        return {
            "ok": True,
            "generated_at": "",
            "dry_run": True,
            "drafts": [],
        }
    payload = json.loads(ROBERT_HANDOFF_PREVIEW_FILE.read_text(encoding="utf-8") or "{}")
    return {
        "ok": True,
        "generated_at": line(payload.get("generated_at")),
        "dry_run": bool(payload.get("dry_run")),
        "drafts": payload.get("drafts") or [],
    }


def unique_emails(values: list[str]) -> list[str]:
    seen: set[str] = set()
    cleaned: list[str] = []
    for value in values:
        email = line(value).lower()
        if not email or "@" not in email or email in seen:
            continue
        seen.add(email)
        cleaned.append(email)
    return cleaned


def extract_emails(value: object) -> list[str]:
    if isinstance(value, list):
        emails: list[str] = []
        for item in value:
            emails.extend(extract_emails(item))
        return unique_emails(emails)
    raw = line("" if value is None else str(value))
    if not raw:
        return []
    matches = re.findall(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", raw, flags=re.I)
    return unique_emails(matches)


def mailbox_origin_from_lead(lead: dict) -> str:
    source = line(lead.get("source") or "").lower()
    if "x-dm-intake" in source or "twitter_dm" in source or "ingest-twitter_dm" in source:
        return "x"
    if "robert-gmail-new-lead" in source or "gmail-robert" in source or "robert gmail" in source:
        return "robert"
    return "gmail"


def lead_thread_lines(lead: dict) -> list[str]:
    rows: list[str] = []
    thread = lead.get("thread") or []
    if isinstance(thread, list):
        for msg in thread[-4:]:
            if not isinstance(msg, dict):
                continue
            sender = line(msg.get("from") or "")
            subject = line(msg.get("subject") or "")
            body = line(msg.get("body") or "")
            pieces = [part for part in [sender, subject, body] if part]
            if pieces:
                rows.append(" | ".join(pieces))
    return rows


def robert_handoff_target_from_lead(lead: dict) -> dict:
    kind = "x" if mailbox_origin_from_lead(lead) == "x" else "gmail"
    to_emails = unique_emails(
        extract_emails(lead.get("email"))
        + extract_emails(lead.get("xContactInfo"))
        + extract_emails(lead.get("replyTo"))
    )
    if not to_emails:
        raise ValueError("No outside email was found for this lead yet.")
    contact_name = line(lead.get("contactName") or lead.get("brand") or "there")
    company_hint = line(lead.get("brand") or lead.get("contactName") or "Collaboration")
    draft_reply = lead.get("draftReply") if isinstance(lead.get("draftReply"), dict) else {}
    subject = line(
        draft_reply.get("subject")
        or lead.get("briefSubject")
        or (f"Following up from X re: {company_hint}" if kind == "x" else f"{company_hint} collaboration")
    )
    context_parts = [
        line(lead.get("notes") or ""),
        line(lead.get("evidence") or ""),
        line(lead.get("deliverables") or ""),
        line((lead.get("operatorSummary") or {}).get("lead_summary") if isinstance(lead.get("operatorSummary"), dict) else ""),
        *lead_thread_lines(lead),
    ]
    context = "\n".join(part for part in context_parts if part).strip()
    if not context:
        context = f"{contact_name} reached out about {company_hint}."
    target = {
        "kind": kind,
        "to_emails": to_emails,
        "contact_name": contact_name,
        "x_name": contact_name,
        "subject": subject,
        "context": context,
        "company_hint": company_hint,
    }
    if kind == "x":
        target["key"] = line(lead.get("xOpenDm") or "") or "|".join(to_emails)
    return target


def build_robert_handoff_for_lead(lead: dict) -> dict:
    target = robert_handoff_target_from_lead(lead)
    draft = build_contextual_handoff(
        kind=target["kind"],
        contact_name=target["contact_name"],
        subject=target["subject"],
        company_hint=target.get("company_hint") or "",
        context=target.get("context") or "",
    )
    return {
        "ok": True,
        "draft": {
            "kind": target["kind"],
            "to_emails": target["to_emails"],
            "cc_emails": list(ROBERT_HANDOFF_CC_EMAILS),
            "subject": draft["subject"],
            "body": draft["body"],
            "context": target.get("context") or "",
        },
    }


def send_robert_handoff_for_lead(lead: dict, draft_payload: dict | None = None) -> dict:
    load_robert_handoff_env()
    send_service = load_robert_gmail_send_service(interactive=False)
    if not send_service:
        raise ValueError("Robert Gmail send service is unavailable. Re-auth Robert send access on this machine.")
    target = robert_handoff_target_from_lead(lead)
    draft_data = draft_payload if isinstance(draft_payload, dict) else {}
    subject = line(draft_data.get("subject") or "")
    body = line(draft_data.get("body") or "")
    if not subject or not body:
        generated = build_contextual_handoff(
            kind=target["kind"],
            contact_name=target["contact_name"],
            subject=target["subject"],
            company_hint=target.get("company_hint") or "",
            context=target.get("context") or "",
        )
        subject = generated["subject"]
        body = generated["body"]
    payload = create_mime_message(target["to_emails"], subject, body, cc=list(ROBERT_HANDOFF_CC_EMAILS))
    send_service.users().messages().send(userId="me", body=payload).execute()
    if target["kind"] == "x" and target.get("key"):
        mark_robert_x_asset_sent({str(target["key"])})
    return {
        "ok": True,
        "sent": True,
        "draft": {
            "kind": target["kind"],
            "to_emails": target["to_emails"],
            "cc_emails": list(ROBERT_HANDOFF_CC_EMAILS),
            "subject": subject,
            "body": body,
            "context": target.get("context") or "",
        },
    }


def ocr_manual_lead_image(image_data: str) -> str:
    raw = line(image_data)
    if not raw:
        return ""
    match = re.match(r"^data:image/([a-zA-Z0-9.+-]+);base64,(.+)$", raw, flags=re.S)
    if not match:
        raise ValueError("Screenshot upload was not a readable image.")
    suffix = "." + ("jpg" if match.group(1).lower() in {"jpeg", "jpg"} else match.group(1).lower())
    try:
        binary = base64.b64decode(match.group(2), validate=False)
    except Exception as exc:
        raise ValueError("Screenshot upload could not be decoded.") from exc
    with tempfile.NamedTemporaryFile(prefix="unaligned-manual-lead-", suffix=suffix, delete=True) as tmp:
        tmp.write(binary)
        tmp.flush()
        result = subprocess.run(
            ["tesseract", tmp.name, "stdout", "--psm", "6"],
            capture_output=True,
            text=True,
            timeout=30,
        )
    if result.returncode != 0:
        raise ValueError((result.stderr or "OCR failed.").strip()[:500])
    return line(result.stdout)


def manual_lead_prompt(raw_text: str, source_hint: str = "") -> str:
    trimmed = line(raw_text)[:6500]
    hint = line(source_hint) or "Robert iMessage"
    return f"""Extract a manual lead from Robert/Asher intake text.

Return strict JSON only. No markdown. No invented facts.
If a field is missing, use an empty string. Keep the summary short and useful.

JSON shape:
{{
  "company": "",
  "person": "",
  "email": "",
  "x_handle": "",
  "website": "",
  "deal_type": "",
  "urgency": "",
  "what_they_want": "",
  "summary": "",
  "next_move": "",
  "confidence": "low|medium|high",
  "needs_human_check": true,
  "source_label": "{hint}"
}}

Rules:
- This is for Robert Scoble sponsorship/collaboration lead intake.
- If an email exists, extract it exactly.
- If an X handle exists, include @handle.
- Do not confuse Asher, Sam, Robert, or UNALIGNED with the outside lead.
- Next move should be one clear action, usually have Robert introduce Asher and Sam.
- If screenshot text is cropped or unclear, set confidence low and needs_human_check true.

Source:
{trimmed}
"""


def fallback_manual_lead_extract(raw_text: str, source_label: str) -> dict:
    emails = extract_emails(raw_text)
    x_match = re.search(r"(?<![A-Z0-9_])@[A-Z0-9_]{2,20}\b", raw_text or "", flags=re.I)
    url_match = re.search(r"https?://[^\s)>\]]+|(?:www\.)?[A-Z0-9.-]+\.[A-Z]{2,}(?:/[^\s)]*)?", raw_text or "", flags=re.I)
    first_email = emails[0] if emails else ""
    company = ""
    if first_email:
        domain = first_email.split("@")[-1].split(".")[0]
        company = domain.replace("-", " ").replace("_", " ").title()
    return {
        "company": company,
        "person": "",
        "email": first_email,
        "x_handle": x_match.group(0) if x_match else "",
        "website": url_match.group(0) if url_match else "",
        "deal_type": "Collaboration",
        "urgency": "",
        "what_they_want": "",
        "summary": line(raw_text)[:240],
        "next_move": "Have Robert introduce Asher and Sam if the contact info is real.",
        "confidence": "low",
        "needs_human_check": True,
        "source_label": source_label,
    }


def manual_lead_to_card_payload(extracted: dict, raw_text: str, ocr_text: str, source_label: str, draft: dict) -> dict:
    company = line(extracted.get("company")) or line(extracted.get("website")) or line(extracted.get("person")) or "Manual lead"
    person = line(extracted.get("person")) or company
    summary = line(extracted.get("summary")) or line(extracted.get("what_they_want")) or "Manual lead captured from Robert iMessage."
    description = {
        "type": "manual_lead_intake",
        "source": source_label,
        "summary": summary,
        "what_they_want": line(extracted.get("what_they_want")),
        "urgency": line(extracted.get("urgency")),
        "next_move": line(extracted.get("next_move")),
        "confidence": line(extracted.get("confidence")) or "medium",
        "needs_human_check": bool(extracted.get("needs_human_check")),
        "raw_text": line(raw_text)[:5000],
        "ocr_text": line(ocr_text)[:5000],
        "draft": draft,
    }
    return {
        "list_id": "new",
        "title": company,
        "business_name": company,
        "contact_name": person,
        "email": line(extracted.get("email")),
        "website": line(extracted.get("website")) or (
            f"https://x.com/{line(extracted.get('x_handle')).lstrip('@')}" if line(extracted.get("x_handle")) else ""
        ),
        "intent": line(extracted.get("deal_type")) or line(extracted.get("what_they_want")) or "Manual collaboration lead",
        "lead_source": source_label,
        "description": json.dumps(description, ensure_ascii=False),
        "draft_reply": draft,
        "draft_reply_status": "pending" if line(extracted.get("email")) else "",
        "agent_assessment": summary,
        "recommended_action": line(extracted.get("next_move")) or "Review and send Robert handoff.",
    }


def load_unaligned_ops_env() -> None:
    env_file = STATE_DIR / "unaligned-scraper.env"
    if not env_file.exists():
        return
    for raw in env_file.read_text(encoding="utf-8").splitlines():
        current = raw.strip()
        if not current or current.startswith("#") or "=" not in current:
            continue
        if current.startswith("export "):
            current = current[len("export "):].strip()
        key, value = current.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def supabase_rest_headers() -> dict:
    load_unaligned_ops_env()
    anon = os.environ.get("SUPABASE_ANON_KEY", "")
    service = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not anon:
        raise RuntimeError("SUPABASE_ANON_KEY is missing")
    return {
        "apikey": anon,
        "Authorization": "Bearer " + (service or anon),
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def supabase_fetch_cards(query: str) -> list:
    url = f"https://hbnpwphxjurvtydezwgh.supabase.co/rest/v1/cards?{query}"
    req = request.Request(url, headers=supabase_rest_headers(), method="GET")
    with request.urlopen(req, timeout=25) as response:
        rows = json.loads(response.read().decode("utf-8") or "[]")
    return rows if isinstance(rows, list) else []


def supabase_patch_card(card_id: str, fields: dict) -> dict:
    url = f"https://hbnpwphxjurvtydezwgh.supabase.co/rest/v1/cards?id=eq.{card_id}"
    data = json.dumps(fields).encode("utf-8")
    headers = supabase_rest_headers()
    req = request.Request(url, data=data, headers=headers, method="PATCH")
    with request.urlopen(req, timeout=25) as response:
        rows = json.loads(response.read().decode("utf-8") or "[]")
    return rows[0] if isinstance(rows, list) and rows else {}


def parse_card_description(value) -> dict:
    if not value:
        return {}
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return {"body": value}
    return {}


def card_to_robert_brief(row: dict) -> dict:
    desc = parse_card_description(row.get("description"))
    drafts = desc.get("drafts") or []
    if not drafts and line(row.get("brief_body")):
        drafts = [{"label": "Recommended", "text": line(row.get("brief_body"))}]
    labels = []
    opts = []
    for idx, draft in enumerate(drafts[:3]):
        if isinstance(draft, str):
            labels.append(f"Option {idx + 1}")
            opts.append(draft)
            continue
        labels.append(line(draft.get("label")) or f"Option {idx + 1}")
        opts.append(line(draft.get("text")) or line(draft.get("body")) or "")
    if not opts:
        fallback = line(row.get("brief_body")) or line(row.get("brief_summary")) or line(row.get("intent"))
        if fallback:
            labels = ["Recommended"]
            opts = [fallback]
    go_live = line(desc.get("go_live")) or line(row.get("brief_action")) or "Go-live TBD"
    disc = []
    if line(desc.get("partner")) or line(row.get("brief_partner")):
        disc.append(line(desc.get("partner")) or line(row.get("brief_partner")))
    if line(desc.get("x_handle")):
        disc.append(line(desc.get("x_handle")))
    disc.extend(["Paid Partnership"])
    links = desc.get("links") or row.get("brief_links") or []
    doc_url = ""
    if isinstance(links, list):
        for link in links:
            if isinstance(link, dict) and "docs.google.com" in line(link.get("url")):
                doc_url = line(link.get("url"))
                break
            if isinstance(link, str) and "docs.google.com" in link:
                doc_url = link
                break
    return {
        "id": str(row.get("id")),
        "brand": line(row.get("business_name")) or line(row.get("title")) or "Campaign",
        "kind": go_live,
        "disc": [d for d in disc if d],
        "opts": opts or ["No draft text captured yet."],
        "labels": labels or ["Recommended"],
        "doc_url": doc_url,
        "sent_at": line(row.get("brief_sent_at")) or line(row.get("moved_at")) or line(row.get("updated_at")),
        "calendar_date": line(desc.get("calendar_date")),
        "calendar_start": line(desc.get("calendar_start")),
        "calendar_end": line(desc.get("calendar_end")),
        "calendar_title": line(desc.get("calendar_title")) or line(row.get("brief_title")) or line(row.get("title")),
        "description": desc,
    }


def validate_robert_token(token: str) -> bool:
    expected = get_api_token()
    if not expected:
        return True
    return line(token) == expected


def robert_review_queue(token: str) -> dict:
    if not validate_robert_token(token):
        raise PermissionError("Invalid review token.")
    rows = supabase_fetch_cards(
        "brief_status=eq.awaiting_robert&select=*&order=updated_at.desc&limit=25"
    )
    briefs = [card_to_robert_brief(row) for row in rows]
    return {"ok": True, "briefs": briefs, "count": len(briefs)}


def robert_review_decision(payload: dict) -> dict:
    token = line(payload.get("token"))
    if not validate_robert_token(token):
        raise PermissionError("Invalid review token.")
    card_id = line(payload.get("card_id"))
    action = line(payload.get("action")).lower()
    if not card_id or action not in {"approve", "edit", "decline"}:
        raise ValueError("card_id and action are required.")
    rows = supabase_fetch_cards(f"id=eq.{card_id}&select=*&limit=1")
    if not rows:
        raise ValueError("Brief not found.")
    row = rows[0]
    desc = parse_card_description(row.get("description"))
    brief = card_to_robert_brief(row)
    now = datetime.now(timezone.utc).isoformat()
    fields: dict = {}
    if action == "approve":
        option_index = int(payload.get("option_index") or 0)
        chosen = (brief.get("opts") or [""])[max(0, min(option_index, len(brief.get("opts") or []) - 1))]
        fields["brief_status"] = "approved"
        fields["brief_body"] = chosen
        desc["approved_at"] = now
        desc["approved_option_index"] = option_index
        desc["approved_text"] = chosen
        fields["description"] = json.dumps(desc, ensure_ascii=False)
        calendar_result = None
        if line(brief.get("calendar_date")):
            try:
                calendar_result = create_calendar_hold({
                    "title": brief.get("calendar_title") or brief.get("brand"),
                    "calendar_title": brief.get("calendar_title") or brief.get("brand"),
                    "calendar_date": brief.get("calendar_date"),
                    "calendar_start": brief.get("calendar_start"),
                    "calendar_end": brief.get("calendar_end"),
                    "go_live": brief.get("kind"),
                    "doc_url": brief.get("doc_url"),
                    "drafts": [{"text": chosen}],
                })
                desc["calendar"] = calendar_result
                fields["description"] = json.dumps(desc, ensure_ascii=False)
            except Exception as exc:
                calendar_result = {"ok": False, "error": str(exc)}
        updated = supabase_patch_card(card_id, fields)
        return {"ok": True, "action": action, "card": updated, "calendar": calendar_result, "approved_at": now}
    if action == "edit":
        note = line(payload.get("note")) or "Robert requested edits."
        fields["brief_status"] = "edits_requested"
        desc["edit_note"] = note
        desc["edit_requested_at"] = now
        fields["description"] = json.dumps(desc, ensure_ascii=False)
        updated = supabase_patch_card(card_id, fields)
        return {"ok": True, "action": action, "card": updated, "note": note}
    fields["brief_status"] = "declined"
    desc["declined_at"] = now
    fields["description"] = json.dumps(desc, ensure_ascii=False)
    updated = supabase_patch_card(card_id, fields)
    return {"ok": True, "action": action, "card": updated}


def create_manual_lead_card(card: dict) -> dict:
    load_unaligned_ops_env()
    url = "https://hbnpwphxjurvtydezwgh.supabase.co/rest/v1/cards"
    anon = os.environ.get("SUPABASE_ANON_KEY", "")
    service = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not anon:
        raise RuntimeError("SUPABASE_ANON_KEY is missing")
    headers = {
        "apikey": anon,
        "Authorization": "Bearer " + (service or anon),
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    data = json.dumps(card).encode("utf-8")
    req = request.Request(url, data=data, headers=headers, method="POST")
    with request.urlopen(req, timeout=25) as response:
        rows = json.loads(response.read().decode("utf-8") or "[]")
    return rows[0] if isinstance(rows, list) and rows else {}


X_INTAKE_JSON = WEB_ROOT / "flow-v4" / "assets" / "x_dm_daily_intake.json"


def normalize_open_dm_url(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    return text.split("#")[0].rstrip("/")


def normalize_x_handle(value: Any) -> str:
    return str(value or "").replace("@", "").strip().lower()


def intake_row_matches_dismiss(
    row: dict,
    *,
    open_dm: str = "",
    x_handle: str = "",
    rank: str = "",
    contact_name: str = "",
) -> bool:
    row_dm = normalize_open_dm_url(row.get("openDm"))
    if open_dm and row_dm and row_dm == open_dm:
        return True
    row_handle = normalize_x_handle(row.get("xUsername"))
    if x_handle and row_handle and row_handle == x_handle:
        return True
    row_rank = str(row.get("rank") or "").strip()
    if rank and row_rank and row_rank == rank:
        return True
    row_name = str(row.get("xName") or "").strip().lower()
    if contact_name and row_name and row_name == str(contact_name).strip().lower():
        return open_dm and row_dm == open_dm
    return False


def move_lead_stage(payload: dict) -> dict:
    from urllib.parse import quote

    list_id = str(payload.get("list_id") or payload.get("stage") or "trash").strip()
    card_id = str(payload.get("card_id") or payload.get("id") or "").strip()
    open_dm = normalize_open_dm_url(payload.get("open_dm") or payload.get("openDm") or payload.get("x_open_dm"))
    if not card_id and open_dm:
        cards = supabase_fetch_cards(
            "select=id,list_id,x_open_dm"
            f"&x_open_dm=eq.{quote(open_dm, safe='')}"
            "&order=id.desc&limit=5"
        )
        for card in cards:
            if normalize_open_dm_url(card.get("x_open_dm")) == open_dm:
                card_id = str(card.get("id") or "")
                break
    if not card_id:
        raise ValueError("move-lead-stage requires card_id or matching open_dm")
    updated = supabase_patch_card(card_id, {
        "list_id": list_id,
        "moved_at": datetime.now(timezone.utc).isoformat(),
    })
    return {
        "ok": True,
        "card_id": card_id,
        "list_id": list_id,
        "open_dm": open_dm,
        "card": updated,
    }


def trash_supabase_cards_for_open_dm(open_dm: str) -> dict:
    normalized = normalize_open_dm_url(open_dm)
    if not normalized:
        return {"trashed_cards": 0, "card_ids": []}
    from urllib.parse import quote

    inactive = {"trash", "dead-leads", "done", "paid-out"}
    trashed_ids: list[str] = []
    cards = supabase_fetch_cards(
        "select=id,list_id,x_open_dm"
        f"&x_open_dm=eq.{quote(normalized, safe='')}"
        "&limit=20"
    )
    for card in cards:
        if normalize_open_dm_url(card.get("x_open_dm")) != normalized:
            continue
        if str(card.get("list_id") or "") in inactive:
            continue
        supabase_patch_card(str(card["id"]), {"list_id": "trash"})
        trashed_ids.append(str(card["id"]))
    return {"trashed_cards": len(trashed_ids), "card_ids": trashed_ids}


def dismiss_x_intake(payload: dict) -> dict:
    if not X_INTAKE_JSON.exists():
        raise FileNotFoundError(f"X intake JSON missing: {X_INTAKE_JSON}")
    rows = json.loads(X_INTAKE_JSON.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise ValueError("X intake JSON is not a list")
    open_dm = normalize_open_dm_url(payload.get("open_dm") or payload.get("openDm"))
    x_handle = normalize_x_handle(payload.get("x_handle") or payload.get("xHandle"))
    rank = str(payload.get("rank") or "").strip()
    contact_name = str(payload.get("contact_name") or payload.get("contactName") or "").strip()
    updated = 0
    matched_open_dms: set[str] = set()
    for row in rows:
        if not intake_row_matches_dismiss(
            row,
            open_dm=open_dm,
            x_handle=x_handle,
            rank=rank,
            contact_name=contact_name,
        ):
            continue
        row["newLead"] = False
        row["userTrashed"] = True
        row["spamBlocked"] = row.get("spamBlocked", False)
        updated += 1
        row_dm = normalize_open_dm_url(row.get("openDm"))
        if row_dm:
            matched_open_dms.add(row_dm)
    if updated:
        X_INTAKE_JSON.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    card_result = {"trashed_cards": 0, "card_ids": []}
    for dm in sorted(matched_open_dms):
        try:
            result = trash_supabase_cards_for_open_dm(dm)
            card_result["trashed_cards"] += int(result.get("trashed_cards") or 0)
            card_result["card_ids"].extend(result.get("card_ids") or [])
        except Exception as exc:
            card_result.setdefault("errors", []).append(str(exc))
    if open_dm and open_dm not in matched_open_dms:
        try:
            result = trash_supabase_cards_for_open_dm(open_dm)
            card_result["trashed_cards"] += int(result.get("trashed_cards") or 0)
            card_result["card_ids"].extend(result.get("card_ids") or [])
        except Exception as exc:
            card_result.setdefault("errors", []).append(str(exc))
    return {
        "ok": True,
        "updated": updated,
        "intake_path": str(X_INTAKE_JSON),
        "cards": card_result,
    }


def restore_x_intake(payload: dict) -> dict:
    if not X_INTAKE_JSON.exists():
        raise FileNotFoundError(f"X intake JSON missing: {X_INTAKE_JSON}")
    rows = json.loads(X_INTAKE_JSON.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise ValueError("X intake JSON is not a list")
    open_dm = normalize_open_dm_url(payload.get("open_dm") or payload.get("openDm"))
    x_handle = normalize_x_handle(payload.get("x_handle") or payload.get("xHandle"))
    rank = str(payload.get("rank") or "").strip()
    updated = 0
    for row in rows:
        if not intake_row_matches_dismiss(row, open_dm=open_dm, x_handle=x_handle, rank=rank):
            continue
        row.pop("userTrashed", None)
        updated += 1
    if updated:
        X_INTAKE_JSON.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return {"ok": True, "updated": updated, "intake_path": str(X_INTAKE_JSON)}


def manual_lead_intake(payload: dict) -> dict:
    source_label = line(payload.get("source_label")) or "Robert iMessage"
    pasted_text = line(payload.get("text"))
    ocr_text = ocr_manual_lead_image(line(payload.get("image_data"))) if line(payload.get("image_data")) else ""
    combined = "\n\n".join(part for part in [pasted_text, ocr_text] if part).strip()
    if not combined:
        raise ValueError("Paste lead text or upload a screenshot first.")
    brief_log("Manual lead intake: extracting lead")
    extracted = query_local_brief_json(
        prompt=manual_lead_prompt(combined, source_label),
        system_prompt="You extract sales lead data from messy screenshots and pasted messages. Return strict JSON only.",
        max_tokens=900,
        stage_label="manual-lead",
    ) or fallback_manual_lead_extract(combined, source_label)
    extracted["source_label"] = source_label
    lead_for_draft = {
        "source": source_label,
        "email": line(extracted.get("email")),
        "xContactInfo": line(extracted.get("x_handle")),
        "contactName": line(extracted.get("person")) or line(extracted.get("company")) or "there",
        "brand": line(extracted.get("company")) or line(extracted.get("person")) or "Manual lead",
        "notes": combined,
        "deliverables": line(extracted.get("deal_type")) or line(extracted.get("what_they_want")),
        "operatorSummary": {"lead_summary": line(extracted.get("summary"))},
    }
    draft_result = build_robert_handoff_for_lead(lead_for_draft) if line(extracted.get("email")) else {
        "ok": True,
        "draft": {
            "kind": "manual",
            "to_emails": [],
            "cc_emails": list(ROBERT_HANDOFF_CC_EMAILS),
            "subject": f"{line(extracted.get('company')) or 'Collaboration'} intro",
            "body": "Add the lead email before sending Robert's handoff.",
            "context": combined[:2000],
        },
    }
    draft = draft_result.get("draft") or {}
    card_payload = manual_lead_to_card_payload(extracted, pasted_text, ocr_text, source_label, draft)
    created = create_manual_lead_card(card_payload) if payload.get("create_card", True) is not False else {}
    return {
        "ok": True,
        "created": bool(created),
        "card": created,
        "card_payload": card_payload,
        "extracted": extracted,
        "draft": draft,
        "raw_text": pasted_text,
        "ocr_text": ocr_text,
    }


def create_brief_doc(payload: dict) -> dict:
    source_url = line(payload.get("source_url")) or line(payload.get("notion_url"))
    email_context = line(payload.get("email_context"))
    imported = None
    if source_url and not line(payload.get("title")):
        brief_log("Reading source brief")
        imported = import_source_brief(source_url, email_context=email_context)
        payload = imported["payload"]
    if line(email_context) and not line(payload.get("email_context")):
        payload["email_context"] = line(email_context)
    payload = apply_agency_constraints_to_payload(payload)
    payload = finalize_drafts_for_agency(payload)
    title = line(payload.get("title"))
    if not title:
        raise ValueError("Brief title is required.")
    set_brief_job_stage("creating_doc", "Creating Google Doc")
    brief_log(f"Creating Google Doc: {title}")
    service = load_docs_service(interactive=True)
    doc = service.documents().create(body={"title": title}).execute()
    document_id = doc["documentId"]
    text, blocks = build_doc_blocks(payload)
    requests = build_requests(text, blocks)
    set_brief_job_stage("writing_doc", "Writing Google Doc content")
    brief_log("Writing Google Doc content")
    service.documents().batchUpdate(documentId=document_id, body={"requests": requests}).execute()
    response = {
        "ok": True,
        "documentId": document_id,
        "url": f"https://docs.google.com/document/d/{document_id}/edit",
        "title": title,
    }
    if imported and imported.get("payload"):
        compact_payload = dict(imported["payload"])
        compact_payload.pop("source_text", None)
        response["payload"] = compact_payload
        response["source"] = imported.get("source") or {}
    return response


# deliverable -> short action label for the calendar title (QRT / THREAD / etc.)
_DELIVERABLE_ACTION = [
    ("quote", "QRT"), ("qrt", "QRT"), ("thread", "THREAD"),
    ("retweet", "RETWEET"), ("repost", "REPOST"), ("video", "VIDEO"),
    ("space", "SPACE"), ("interview", "INTERVIEW"), ("post", "POST"),
]


def deliverable_action(deliverable_type: str) -> str:
    d = (deliverable_type or "").lower()
    for key, label in _DELIVERABLE_ACTION:
        if key in d:
            return label
    return "POST"


def format_calendar_title(payload: dict) -> str:
    """COMPANY x ACTION - PLATFORM, e.g. 'VIKTOR x QRT - X.COM'."""
    company = line(payload.get("company_name")) or line(payload.get("title")) or "Brief"
    # if we only have the full title, take the part before a separator
    for sep in (" x ", " - ", ":", "—", "|"):
        if sep in company:
            company = company.split(sep)[0].strip()
            break
    action = deliverable_action(line(payload.get("deliverable_type")))
    platform = line(payload.get("platform")) or "X.COM"
    return f"{company.upper()} x {action} - {platform.upper()}"


def create_calendar_hold(payload: dict) -> dict:
    # Standard format COMPANY x ACTION - PLATFORM (e.g. VIKTOR x QRT - X.COM).
    # Honor a genuinely custom calendar_title; otherwise (it was auto-set to the
    # plain brief title) build the standard one.
    explicit_title = line(payload.get("calendar_title"))
    plain_title = line(payload.get("title"))
    title = explicit_title if (explicit_title and explicit_title != plain_title) else format_calendar_title(payload)
    if not title:
        raise ValueError("Calendar title is required.")
    mode = calendar_mode(payload)
    date_value = line(payload.get("calendar_date"))
    start_value = line(payload.get("calendar_start"))
    if not date_value:
        raise ValueError("Calendar date is required.")
    if mode == "timed":
        start_at, end_at = parse_calendar_window(payload)
    else:
        start_at = datetime.strptime(date_value, "%Y-%m-%d")
        end_at = start_at + timedelta(days=1)
    doc_url = line(payload.get("doc_url"))
    # Lean calendar note. The detail lives on the brief; the calendar just points
    # Robert there and reminds him to choose + disclose before posting.
    note_lines = ["VERIFY OPTIONS ON BRIEF"]
    note_lines.append("Open the brief, pick one option (or request an edit), and approve it. Nothing goes live until you do.")
    go_live = line(payload.get("go_live"))
    if go_live:
        note_lines.extend(["", f"GO LIVE: {go_live}"])
    if mode == "all_day" and start_value:
        note_lines.append(f"Target time: {start_at.strftime('%I:%M %p').lstrip('0')}")
    note_lines.extend(["", "Turn on the native Paid Partnership label. Everything else you need is on the brief."])
    if doc_url:
        note_lines.extend(["", f"Brief doc: {doc_url}"])
    description = "\n".join([part for part in note_lines if part is not None]).strip()
    if mode == "all_day":
        service = load_tasks_service(interactive=True)
        due_at = datetime.strptime(date_value, "%Y-%m-%d").replace(hour=0, minute=0, second=0, microsecond=0)
        task = {
            "title": title,
            "notes": description,
            "due": due_at.isoformat() + "Z",
        }
        created = service.tasks().insert(tasklist="@default", body=task).execute()
        return {
            "ok": True,
            "taskId": created.get("id"),
            "htmlLink": created.get("webViewLink"),
            "title": title,
            "mode": mode,
            "kind": "task",
        }

    service = load_calendar_service(interactive=True)
    event = {
        "summary": title,
        "description": description,
        "start": {
            "dateTime": start_at.isoformat(),
            "timeZone": "America/New_York",
        },
        "end": {
            "dateTime": end_at.isoformat(),
            "timeZone": "America/New_York",
        },
    }
    created = service.events().insert(calendarId="primary", body=event).execute()
    return {
        "ok": True,
        "eventId": created.get("id"),
        "htmlLink": created.get("htmlLink"),
        "title": title,
        "mode": mode,
        "kind": "event",
    }


def complete_local_llm(payload: dict) -> dict:
    prompt = str(payload.get("prompt") or "").strip()
    if not prompt:
        raise ValueError("missing prompt")
    if not LOCAL_BRIEF_LLM_ENABLED:
        raise RuntimeError("Local LLM is disabled on the brief server.")
    from local_llm import backend_label, ollama_chat, LOCAL_MODEL

    max_tokens = int(payload.get("max_tokens") or 800)
    text = ollama_chat(prompt, max_tokens=max_tokens, temperature=0.35)
    return {"text": text, "model": LOCAL_MODEL, "backend": backend_label()}


class DocsBriefHandler(BaseHTTPRequestHandler):
    def do_HEAD(self) -> None:
        parsed = urlparse(self.path or "/")
        if parsed.path == "/health":
            body = json.dumps({
                "ok": True,
                "service": "google-docs-brief-server",
                "host": HOST,
                "port": PORT,
                "time": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            }).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            return
        file_path = safe_static_path(self.path)
        if file_path is None:
            send_json(self, 404, {"ok": False, "error": "Unknown endpoint."})
            return
        try:
            send_file(self, file_path, head_only=True)
        except BrokenPipeError:
            pass

    def do_OPTIONS(self) -> None:
        send_json(self, 204, {})

    def do_GET(self) -> None:
        parsed = urlparse(self.path or "/")
        if parsed.path in {"/health", "/llm-health"}:
            llm_meta = {"llm_enabled": LOCAL_BRIEF_LLM_ENABLED}
            if LOCAL_BRIEF_LLM_ENABLED:
                try:
                    from local_llm import LOCAL_MODEL, backend_label
                    llm_meta.update({"model": LOCAL_MODEL, "backend": backend_label()})
                except Exception as exc:
                    llm_meta["llm_error"] = str(exc)
            send_json(self, 200, {
                "ok": True,
                "service": "google-docs-brief-server",
                "host": HOST,
                "port": PORT,
                "time": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                **llm_meta,
            })
            return
        if parsed.path == "/robert-handoff-preview":
            if not require_api_token(self):
                send_json(self, 401, {"ok": False, "error": "Missing or invalid brief API token."})
                return
            send_json(self, 200, read_robert_handoff_preview())
            return
        if parsed.path == "/brief-jobs":
            if not require_api_token(self):
                send_json(self, 401, {"ok": False, "error": "Missing or invalid brief API token."})
                return
            query = parse_qs(parsed.query or "")
            limit = int((query.get("limit") or ["12"])[0] or "12")
            send_json(self, 200, list_brief_jobs(limit=limit))
            return
        if parsed.path == "/brief-job-status":
            if not require_api_token(self):
                send_json(self, 401, {"ok": False, "error": "Missing or invalid brief API token."})
                return
            query = parse_qs(parsed.query or "")
            job_id = line((query.get("job_id") or [""])[0])
            try:
                send_json(self, 200, get_brief_job(job_id))
            except Exception as exc:
                send_json(self, 404, {"ok": False, "error": str(exc)})
            return
        if parsed.path == "/send-email-token":
            token = get_send_email_token()
            if not token:
                send_json(self, 500, {"ok": False, "error": "Send email token is not configured on this machine."})
                return
            send_json(self, 200, {"ok": True, "token": token})
            return
        if parsed.path == "/robert-review-queue":
            query = parse_qs(parsed.query or "")
            token = line((query.get("token") or [""])[0])
            try:
                send_json(self, 200, robert_review_queue(token))
            except PermissionError as exc:
                send_json(self, 401, {"ok": False, "error": str(exc)})
            except Exception as exc:
                send_json(self, 400, {"ok": False, "error": str(exc)})
            return
        file_path = safe_static_path(self.path)
        if file_path is None:
            send_json(self, 404, {"ok": False, "error": "Unknown endpoint."})
            return
        try:
            send_file(self, file_path)
        except BrokenPipeError:
            pass

    def do_POST(self) -> None:
        parsed = urlparse(self.path or "/")
        path = parsed.path
        if path not in (
            "/generate-brief-doc", "/start-brief-job", "/create-calendar-hold",
            "/import-notion-brief", "/import-source-brief", "/draft-robert-handoff",
            "/send-robert-handoff", "/manual-lead-intake", "/complete", "/sync-asher-gmail", "/sync-asher-gmail-delta",
            "/sync-lead-thread", "/refresh-dashboard", "/x-signal-analyze", "/robert-review-decision",
            "/dismiss-x-intake", "/restore-x-intake", "/run-x-spam-cleanup", "/move-lead-stage",
            "/draft-x-dm-reply",
        ):
            send_json(self, 404, {"ok": False, "error": "Unknown endpoint."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            if path == "/robert-review-decision":
                send_json(self, 200, robert_review_decision(payload))
                return
            if not require_api_token(self):
                send_json(self, 401, {"ok": False, "error": "Missing or invalid brief API token."})
                return
            if path == "/complete":
                send_json(self, 200, complete_local_llm(payload))
                return
            if path == "/sync-asher-gmail":
                send_json(self, 200, sync_asher_gmail_now())
                return
            if path == "/sync-asher-gmail-delta":
                send_json(self, 200, sync_asher_gmail_delta())
                return
            if path == "/sync-lead-thread":
                send_json(self, 200, sync_lead_thread(payload))
                return
            if path == "/refresh-dashboard":
                send_json(self, 200, refresh_dashboard(payload))
                return
            if path == "/move-lead-stage":
                send_json(self, 200, move_lead_stage(payload))
                return
            if path == "/dismiss-x-intake":
                send_json(self, 200, dismiss_x_intake(payload))
                return
            if path == "/restore-x-intake":
                send_json(self, 200, restore_x_intake(payload))
                return
            if path == "/run-x-spam-cleanup":
                send_json(self, 200, run_active_script("x_spam_cleanup.py", timeout=120))
                return
            if path == "/x-signal-analyze":
                send_json(self, 200, analyze_x_signal_request(payload))
                return
            if path == "/draft-x-dm-reply":
                lead_payload = payload.get("lead") if isinstance(payload.get("lead"), dict) else payload
                send_json(self, 200, draft_x_dm_reply_for_lead(lead_payload or {}))
                return
            if path == "/generate-brief-doc":
                result = create_brief_doc(payload)
            elif path == "/start-brief-job":
                result = start_brief_job(payload)
            elif path == "/import-notion-brief":
                result = import_notion_brief(payload.get("notion_url"), payload.get("email_context"))
            elif path == "/draft-robert-handoff":
                result = build_robert_handoff_for_lead(payload.get("lead") or {})
            elif path == "/send-robert-handoff":
                result = send_robert_handoff_for_lead(payload.get("lead") or {}, payload.get("draft"))
            elif path == "/manual-lead-intake":
                result = manual_lead_intake(payload)
            elif path == "/import-source-brief":
                result = import_source_brief(payload.get("source_url") or payload.get("notion_url"), payload.get("email_context"))
            else:
                result = create_calendar_hold(payload)
            send_json(self, 200, result)
        except HttpError as exc:
            message = str(exc)
            if "SERVICE_DISABLED" in message or "docs.googleapis.com" in message:
                message = (
                    "Google Docs API is disabled for the local Google Cloud project. "
                    "Enable it here: "
                    "https://console.developers.google.com/apis/api/docs.googleapis.com/overview?project=48186730929"
                )
            if "calendar-json.googleapis.com" in message or "calendar.events" in message:
                message = (
                    "Google Calendar API is disabled for the local Google Cloud project. "
                    "Enable it here: "
                    "https://console.cloud.google.com/apis/library/calendar-json.googleapis.com?project=48186730929"
                )
            if "tasks.googleapis.com" in message or "auth/tasks" in message:
                message = (
                    "Google Tasks needs one-time approval for the brief machine. "
                    "If Google prompts you, approve Tasks access. If the API is disabled, enable it here: "
                    "https://console.cloud.google.com/apis/library/tasks.googleapis.com?project=48186730929"
                )
            send_json(self, 400, {"ok": False, "error": message})
        except Exception as exc:
            send_json(self, 400, {"ok": False, "error": str(exc)})

    def log_message(self, format: str, *args) -> None:
        try:
            message = format % args
        except Exception:
            message = format
        path = line(self.path)
        if path.startswith("/.git") or "/.git/" in path:
            return
        if self.command == "GET" and not path.startswith(("/health", "/brief-jobs", "/brief-job-status", "/robert-handoff-preview")):
            return
        brief_log(f"{self.command} {path} {message}")


def main() -> None:
    load_brief_jobs()
    try:
        server = ThreadingHTTPServer((HOST, PORT), DocsBriefHandler)
    except OSError as exc:
        if exc.errno == errno.EADDRINUSE:
            brief_log(f"Google Docs brief server already running at http://{HOST}:{PORT}")
            return
        raise
    brief_log(f"Google Docs brief server listening at http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
