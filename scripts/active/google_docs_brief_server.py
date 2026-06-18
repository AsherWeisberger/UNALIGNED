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
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from datetime import datetime, timedelta

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
SCOPES = [
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/calendar.events",
]


def send_json(handler: BaseHTTPRequestHandler, status: int, payload: dict) -> None:
    body = json.dumps(payload).encode("utf-8")
    try:
        handler.send_response(status)
        handler.send_header("Content-Type", "application/json")
        handler.send_header("Access-Control-Allow-Origin", "*")
        handler.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        handler.send_header("Access-Control-Allow-Headers", "Content-Type")
        handler.send_header("Content-Length", str(len(body)))
        handler.end_headers()
        handler.wfile.write(body)
    except BrokenPipeError:
        pass


def load_docs_service(interactive: bool = True):
    creds = None
    if TOKEN_FILE.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
        except Exception:
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


def line(value: str | None) -> str:
    return str(value or "").strip()


def build_doc_text(payload: dict) -> str:
    sections: list[str] = []
    sections.append(line(payload.get("title")) or "UNALIGNED Robert Brief")
    if line(payload.get("subtitle")):
        sections.append(line(payload.get("subtitle")))

    if line(payload.get("go_live")) or line(payload.get("go_live_note")):
        sections.extend([
            "",
            "GO LIVE",
            line(payload.get("go_live")),
            line(payload.get("go_live_note")),
        ])

    what_to_do = payload.get("what_to_do") or []
    if what_to_do:
        sections.extend(["", "WHAT TO DO"])
        for item in what_to_do:
            item = line(item)
            if item:
                sections.append(f"- {item}")

    key_facts = payload.get("key_facts") or []
    if key_facts:
        sections.extend(["", "KEY FACTS TO WORK IN"])
        for pair in key_facts:
            if isinstance(pair, (list, tuple)) and len(pair) >= 2:
                left = line(pair[0])
                right = line(" | ".join(str(x) for x in pair[1:]))
                if left or right:
                    sections.append(f"{left}: {right}" if left else right)

    must_include = payload.get("must_include") or {}
    if must_include:
        sections.extend(["", "MUST INCLUDE IN YOUR POST"])
        if line(must_include.get("tag")):
            sections.append(f"Tag: {line(must_include.get('tag'))}")
        if line(must_include.get("link")):
            sections.append(f"Link: {line(must_include.get('link'))}")
        if line(must_include.get("hashtags")):
            sections.append(f"Hashtags: {line(must_include.get('hashtags'))}")

    drafts = payload.get("drafts") or []
    if drafts:
        sections.extend(["", "DRAFT POST OPTIONS"])
        for draft in drafts:
            if not isinstance(draft, dict):
                continue
            label = line(draft.get("label"))
            text = line(draft.get("text"))
            if label:
                sections.append(label)
            if text:
                sections.append(text)
            sections.append("")

    if line(payload.get("submit_url")):
        sections.extend(["", f"After posting, submit the live post URL here: {line(payload.get('submit_url'))}"])

    text = "\n".join(sections).strip() + "\n"
    return text


def build_requests(text: str) -> list[dict]:
    # Minimal structure for now: title and key section labels bolded with heading styles.
    requests: list[dict] = [{"insertText": {"location": {"index": 1}, "text": text}}]
    idx = 1
    lines = text.splitlines(True)
    section_titles = {
        "GO LIVE",
        "WHAT TO DO",
        "KEY FACTS TO WORK IN",
        "MUST INCLUDE IN YOUR POST",
        "DRAFT POST OPTIONS",
    }
    for i, raw in enumerate(lines):
        start = idx
        idx += len(raw)
        stripped = raw.rstrip("\n")
        if i == 0:
            requests.append({
                "updateParagraphStyle": {
                    "range": {"startIndex": start, "endIndex": idx},
                    "paragraphStyle": {"namedStyleType": "TITLE"},
                    "fields": "namedStyleType",
                }
            })
        elif i == 1 and stripped:
            requests.append({
                "updateParagraphStyle": {
                    "range": {"startIndex": start, "endIndex": idx},
                    "paragraphStyle": {"namedStyleType": "SUBTITLE"},
                    "fields": "namedStyleType",
                }
            })
        elif stripped in section_titles:
            requests.append({
                "updateParagraphStyle": {
                    "range": {"startIndex": start, "endIndex": idx},
                    "paragraphStyle": {"namedStyleType": "HEADING_2"},
                    "fields": "namedStyleType",
                }
            })
        elif stripped.startswith("Option "):
            requests.append({
                "updateTextStyle": {
                    "range": {"startIndex": start, "endIndex": idx - 1 if raw.endswith("\n") else idx},
                    "textStyle": {"bold": True},
                    "fields": "bold",
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


def create_brief_doc(payload: dict) -> dict:
    title = line(payload.get("title"))
    if not title:
        raise ValueError("Brief title is required.")
    service = load_docs_service(interactive=True)
    doc = service.documents().create(body={"title": title}).execute()
    document_id = doc["documentId"]
    text = build_doc_text(payload)
    requests = build_requests(text)
    service.documents().batchUpdate(documentId=document_id, body={"requests": requests}).execute()
    return {
        "ok": True,
        "documentId": document_id,
        "url": f"https://docs.google.com/document/d/{document_id}/edit",
        "title": title,
    }


def create_calendar_hold(payload: dict) -> dict:
    title = line(payload.get("calendar_title")) or line(payload.get("title"))
    if not title:
        raise ValueError("Calendar title is required.")
    start_at, end_at = parse_calendar_window(payload)
    doc_url = line(payload.get("doc_url"))
    note_lines = [
        line(payload.get("subtitle")),
        "",
        "GO LIVE",
        line(payload.get("go_live")),
        line(payload.get("go_live_note")),
    ]
    if doc_url:
        note_lines.extend(["", f"Brief doc: {doc_url}"])
    description = "\n".join([part for part in note_lines if part is not None]).strip()
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
    }


class DocsBriefHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:
        send_json(self, 204, {})

    def do_POST(self) -> None:
        if self.path not in ("/generate-brief-doc", "/create-calendar-hold"):
            send_json(self, 404, {"ok": False, "error": "Unknown endpoint."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            if self.path == "/generate-brief-doc":
                result = create_brief_doc(payload)
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
            send_json(self, 400, {"ok": False, "error": message})
        except Exception as exc:
            send_json(self, 400, {"ok": False, "error": str(exc)})

    def log_message(self, format: str, *args) -> None:
        print(format % args)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), DocsBriefHandler)
    print(f"Google Docs brief server listening at http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
