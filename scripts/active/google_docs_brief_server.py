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
SCOPES = [
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/tasks",
]
OPENCODE_CONFIG_FILE = Path.home() / ".config" / "opencode" / "opencode.json"
HERMES_ENV_FILE = Path.home() / ".hermes" / ".env"
DEFAULT_LLM_TARGETS = [
    {"base_url": "http://127.0.0.1:8642/v1", "model": "qwen3.6:35b-a3b", "label": "Hermes API Qwen 3.6 35B", "auth": "hermes"},
    {"base_url": "http://127.0.0.1:11434/v1", "model": "qwen3.6:35b-a3b", "label": "Ollama Qwen 3.6 35B"},
]
PREFERRED_LOCAL_MODELS = [
    ("http://127.0.0.1:8642/v1", "qwen3.6:35b-a3b"),
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
    hermes_available = "qwen3.6:35b-a3b" in hermes_models

    if hermes_available:
        add_target(hermes_base, "qwen3.6:35b-a3b", "Hermes API Qwen 3.6 35B")
        return targets

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
    return f"""You are writing Robert Scoble campaign copy.

Return valid JSON only. No markdown fence. No explanation.
No hyphens or em dashes anywhere.
Write like a sharp operator, not a marketing intern.
Each draft must feel source specific, not templated.
Do not repeat the same CTA line in every option.
Do not fill space with links. Use links only where they help the close.
Use AlignedNews.com naturally where it genuinely fits.
Use the last sender email context when present to understand what the sponsor emphasized, how they framed the ask, and any delivery constraints.

Return exactly this JSON:
{{
  "why_alignednews": "",
  "drafts": [
    {{"label": "Option 1. Recommended", "text": ""}},
    {{"label": "Option 2. Different angle", "text": ""}},
    {{"label": "Option 3. Different angle", "text": ""}}
  ]
}}

Rules:
- If deliverable type is a dedicated thread, every draft must use:
  Main post:
  Reply 1:
  Reply 2:
- Option 1 should be the strongest and most post ready.
- Each option must use a genuinely different framing.
- Option 1 must make a natural tie in to AlignedNews.com. The other options should do that too when it fits.
- Pull from named proof points, product mechanics, launch details, and exact source language when useful.
- Do not paste scheduling metadata like launch date, go live time, posting window, or approval notes into the draft copy.
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
            request_timeout = 75 if "127.0.0.1:8642" in base_url else 45
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
        max_tokens=1100,
        stage_label="brief-facts",
    )


def query_local_brief_drafts(source: dict, base_payload: dict) -> dict | None:
    set_brief_job_stage("writing_drafts", "Writing draft options")
    prompt = llm_prompt_for_drafts(source, base_payload)
    return query_local_brief_json(
        prompt=prompt,
        system_prompt="You write premium campaign copy and return strict JSON only.",
        max_tokens=1200,
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
    why_alignednews = clean_sentence(llm_payload.get("why_alignednews"))
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
        r"(?im)^(?:launch date\/time|launch date|go[- ]live|go live|posting date|post date|publish date)\s*:\s*.+$",
        "",
        text,
    )
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
        return "This is exactly the kind of frontier AI shift I like unpacking at AlignedNews.com"
    if any(term in lowered for term in ("infrastructure", "compute", "inference", "benchmark", "developer", "api", "model", "agents")):
        return "This is the kind of infrastructure shift that matters because it changes what AI teams can actually build, and that is the kind of story I like covering at AlignedNews.com"
    if any(term in lowered for term in ("enterprise", "workflow", "teams", "operator", "productivity", "sales", "support", "copilot")):
        return "This is the kind of enterprise AI shift I like covering at AlignedNews.com because it shows how work is actually changing"
    if any(term in lowered for term in ("interview", "podcast", "event", "summit", "fireside", "conversation", "meeting")):
        return "This fits the kind of conversation I like bringing into AlignedNews.com"
    if any(term in lowered for term in ("launch", "series a", "series b", "funding", "announcement", "now live", "public app")):
        return "This is the kind of launch I like using to show where the market is moving at AlignedNews.com"
    if "thread" in str(deliverable_type or "").lower():
        return "This is the kind of AI shift I like unpacking in public at AlignedNews.com"
    if line(announcement_text):
        return "This fits the broader AI story I cover at AlignedNews.com"
    return "This is the kind of shift I track at AlignedNews.com"


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


def standardized_calendar_title(company: str, *platform_hints: str) -> str:
    company_name = line(company) or "Collab"
    platform = brief_platform_label(*platform_hints)
    return f"{company_name} - {platform}"


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
            f"The idea of an AI employee that works inside a team's real workflow is exactly the kind of platform shift AlignedNews should cover. "
            f"It gives Robert a way to frame {company} as part of where work is going, not just as another product launch."
        )
        if re.search(r"\bai employee\b", joined_lines, re.I)
        else f"This fits AlignedNews because Robert can frame {company} through the broader AI shift, not just the product launch"
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
        "status_note": compact_status_lines(),
        "why_alignednews": why_alignednews,
        "drafts": [
            {"label": "Option 1 (recommended)", "text": draft_one},
            {"label": "Option 2 (operator angle)", "text": draft_two},
            {"label": "Option 3 (AI employee angle)", "text": draft_three},
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
    doc = service.documents().get(documentId=document_id).execute()
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


def import_notion_brief(notion_url: str, email_context: str = "") -> dict:
    notion_url = line(notion_url)
    if not notion_url:
        raise ValueError("Notion URL is required.")
    if "notion.so" not in notion_url and "notion.site" not in notion_url:
        raise ValueError("Paste a public Notion link.")
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

    if "notion.so" in source_url or "notion.site" in source_url:
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

    drafts = payload.get("drafts") or []
    valid_drafts = [item for item in drafts if isinstance(item, dict) and (line(item.get("label")) or line(item.get("text")))]
    if valid_drafts:
        push("spacer")
        push("section_heading", "Draft Options")
        push("body", "Post to publish (draft options)", shaded=True)
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


def create_calendar_hold(payload: dict) -> dict:
    title = line(payload.get("calendar_title")) or line(payload.get("title"))
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
    note_lines = [
        line(payload.get("subtitle")),
        "",
        "GO LIVE",
        line(payload.get("go_live")),
        line(payload.get("go_live_note")),
    ]
    if mode == "all_day" and start_value:
        note_lines.extend(["", f"Target time: {start_at.strftime('%I:%M %p').lstrip('0')}"])
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
        if parsed.path == "/health":
            send_json(self, 200, {
                "ok": True,
                "service": "google-docs-brief-server",
                "host": HOST,
                "port": PORT,
                "time": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
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
        file_path = safe_static_path(self.path)
        if file_path is None:
            send_json(self, 404, {"ok": False, "error": "Unknown endpoint."})
            return
        try:
            send_file(self, file_path)
        except BrokenPipeError:
            pass

    def do_POST(self) -> None:
        if self.path not in ("/generate-brief-doc", "/start-brief-job", "/create-calendar-hold", "/import-notion-brief", "/import-source-brief", "/draft-robert-handoff", "/send-robert-handoff"):
            send_json(self, 404, {"ok": False, "error": "Unknown endpoint."})
            return
        if not require_api_token(self):
            send_json(self, 401, {"ok": False, "error": "Missing or invalid brief API token."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            if self.path == "/generate-brief-doc":
                result = create_brief_doc(payload)
            elif self.path == "/start-brief-job":
                result = start_brief_job(payload)
            elif self.path == "/import-notion-brief":
                result = import_notion_brief(payload.get("notion_url"), payload.get("email_context"))
            elif self.path == "/draft-robert-handoff":
                result = build_robert_handoff_for_lead(payload.get("lead") or {})
            elif self.path == "/send-robert-handoff":
                result = send_robert_handoff_for_lead(payload.get("lead") or {}, payload.get("draft"))
            elif self.path == "/import-source-brief":
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
