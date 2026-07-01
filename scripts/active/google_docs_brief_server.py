#!/usr/bin/env python3
"""
Local Google Docs brief server for Company OS Brief Maker.

POST http://127.0.0.1:8767/generate-brief-doc
Body: brief config JSON

Creates a Google Doc using local OAuth credentials and returns the Doc URL so it
can be dropped directly into Robert's calendar.
"""

from __future__ import annotations

import json
import mimetypes
import os
import re
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
    if origin == "https://asherweisberger.github.io" and host.startswith("mac-studio.tail50d3a2.ts.net"):
        return True
    if origin == "https://mac-studio.tail50d3a2.ts.net" and host.startswith("mac-studio.tail50d3a2.ts.net"):
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
            request_timeout = 120 if "127.0.0.1:8642" in base_url else 90
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


def draft_text_is_lazy(value: str, joined_lines: str) -> bool:
    text = clean_draft_text(value)
    if not text:
        return True
    lowered = text.lower()
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
        "the thesis:",
        "add your tracking code",
        "insert tracking code",
        "[tracking link]",
        "paid partnership",
    )
    if any(item in lowered for item in banned) and not source_mentions(joined_lines, "ai employee", "assistant and employee"):
        return True
    if "reply tweet:." in lowered:
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


def infer_company_name(title: str, lines: list[str]) -> str:
    title = line(title)
    for current in lines:
        text = line(current)
        match = re.match(r"^([A-Za-z0-9][A-Za-z0-9 .&+-]{1,40}?)\s+x\s+", text, re.I)
        if match:
            return line(match.group(1))
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
    company = infer_company_name(title, lines)
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
    context_for_platform = " ".join([title, campaign_line, go_live_line, guardrails_line])
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

    if campaign_line:
        about_line = campaign_line
    about_line = clean_content_value(about_line, company=company) or joined_clean_lines(about_heading, company=company, limit=2)
    core_idea = clean_content_value(core_idea, company=company) or joined_clean_lines(why_people_care, company=company, limit=2) or joined_clean_lines(core_heading, company=company, limit=2)
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
        "drafts": [
            {"label": "Option 1 (recommended)", "text": draft_one},
            {"label": "Option 2 (technical angle)", "text": draft_two},
            {"label": "Option 3 (market angle)", "text": draft_three},
        ],
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
    if not LOCAL_BRIEF_LLM_ENABLED:
        return payload
    source_payload = {
        "title": title,
        "source_url": source_url,
        "source_text": payload.get("source_text"),
        "links": links,
        "email_context": payload.get("email_context"),
    }
    llm_payload = query_local_brief_model(source_payload)
    merged = merge_brief_payload(payload, llm_payload)
    if not llm_payload:
        set_brief_job_stage("extracting_facts", "Using source directly")
        brief_log("brief-facts: using source directly")
    draft_payload = query_local_brief_drafts(source_payload, merged)
    merged = merge_draft_payload(merged, draft_payload)
    merged["title"] = standardized_brief_title(
        line(merged.get("company_name")) or company,
        line(merged.get("deliverable_type")) or deliverable_type,
        campaign_platform,
        campaign_line,
        title,
        go_live_line,
        guardrails_line,
        joined_lines[:1200],
    )
    merged["calendar_title"] = standardized_calendar_title(
        line(merged.get("company_name")) or company,
        line(merged.get("deliverable_type")) or deliverable_type,
        campaign_platform,
        campaign_line,
        title,
        go_live_line,
        guardrails_line,
        joined_lines[:1200],
    )
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

    brief_log(
        "Dashboard refresh finished "
        f"ok={out.get('ok')} steps={out.get('steps')} include_x_scrape={include_x_scrape}"
    )
    return out


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
    return payload


def import_notion_brief(notion_url: str, email_context: str = "") -> dict:
    notion_url = line(notion_url)
    if not notion_url:
        raise ValueError("Notion URL is required.")
    if not any(h in notion_url for h in ("notion.so", "notion.site", "notion.com")):
        raise ValueError("Paste a Notion page link (notion.so, notion.site, or app.notion.com).")
    set_brief_job_stage("reading_source", "Reading source brief")
    brief_log(f"Importing Notion source {notion_url}")
    result = subprocess.run(
        ["node", str(NOTION_EXTRACTOR), notion_url],
        check=True,
        capture_output=True,
        text=True,
        timeout=120,
    )
    notion = json.loads(result.stdout or "{}")
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

    angles = [line(item) for item in (payload.get("angles_or_accuracy_requirements") or []) if line(item)]
    if angles:
        push_section("Potential Content Angles", combine_values("Angles to choose from", angles))

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

    drafts = payload.get("drafts") or []
    valid_drafts = [item for item in drafts if isinstance(item, dict) and (line(item.get("label")) or line(item.get("text")))]
    if valid_drafts:
        push("spacer")
        push("section_heading", "Draft Options")
        if len(valid_drafts) == 1:
            push("body", "Post to publish. Robert: approve it in the Verify box (or write a change on the Edit line). Nothing goes live until you do.", shaded=True)
        else:
            push("body", "Post to publish (draft options). Robert: read the options below, then pick ONE in the Verify box. Nothing goes live until you choose.", shaded=True)
        push("blank")
        for idx, draft in enumerate(valid_drafts):
            label = line(draft.get("label"))
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
            if not require_api_token(self):
                send_json(self, 401, {"ok": False, "error": "Missing or invalid brief API token."})
                return
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
            "/refresh-dashboard", "/robert-review-decision",
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
            if path == "/refresh-dashboard":
                send_json(self, 200, refresh_dashboard(payload))
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
