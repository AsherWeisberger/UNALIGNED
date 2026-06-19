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
import re
import subprocess
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
NOTION_EXTRACTOR = Path("/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/scripts/active/extract_notion_brief.mjs")
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


def slug_filename(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", str(value or "")).strip("_")
    return cleaned or "Robert_Brief"


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


def notion_to_brief_payload(notion: dict, notion_url: str) -> dict:
    lines = notion.get("lines") or []
    title = line(notion.get("title")) or "Robert Brief"
    intro = []
    for current in lines:
        if current == title or current == "Skip to content" or current == "Get Notion free":
            continue
        intro.append(current)
        if len(intro) >= 3:
            break
    summary = " ".join(intro).strip()
    launch_lines = extract_section(lines, "Campaign Timeline")
    focus_lines = extract_section(lines, "Campaign Focus")
    customer_lines = extract_section(lines, "Notable Poly AI Customers")
    problem_lines = extract_section(lines, "The Problem:")
    solution_lines = extract_section(lines, "The Solution:")
    structure_lines = extract_section(lines, "Recommended Post Structure")
    viral_lines = extract_section(lines, "How to Write Viral Posts")

    launch_period = ""
    for current in launch_lines:
        if "launch period" in current.lower():
            launch_period = current.replace("📅", "").strip()
            break
    if not launch_period:
        for current in lines:
            if "launch period" in current.lower():
                launch_period = current.replace("📅", "").strip()
                break

    customer_sample = ", ".join([item for item in customer_lines if item][:5])
    goal_lines = [item for item in focus_lines if item and "Primary goal" not in item][:4]
    goals = [item for item in goal_lines if not item.lower().startswith(("drive demo bookings", "for this launch"))]

    what_to_do = [
        "Read the imported Notion brief and keep the strongest launch angle intact.",
        "Lead with the strongest customer pain point and how the product solves it.",
        "Keep the post tight, clear, and native to Robert's voice on the target platform.",
        "Send the draft back for approval before posting live.",
    ]
    if structure_lines:
        what_to_do = [item for item in structure_lines[:5] if len(item.split()) <= 18] or what_to_do

    key_facts = []
    if summary:
        key_facts.append(["Campaign summary", summary[:220]])
    if goals:
        key_facts.append(["Launch focus", " ".join(goals)[:220]])
    if customer_sample:
        key_facts.append(["Social proof", customer_sample[:220]])
    if problem_lines:
        key_facts.append(["Problem", " ".join(problem_lines[:3])[:220]])
    if solution_lines:
        key_facts.append(["Solution", " ".join(solution_lines[:3])[:220]])

    urls = [item.get("href", "") for item in notion.get("links") or [] if item.get("href")]
    site_link = ""
    for current in urls:
        if "notion." not in current and "linkedin.com" not in current and "x.com" not in current:
            site_link = current
            break
    if not site_link:
        site_link = notion_url

    draft_seed = goals[0] if goals else summary or title
    draft_cta = "Book a demo" if re.search(r"\bdemo\b", " ".join(lines), re.I) else "Learn more"
    draft_one = (
        f"{draft_seed}. PolyAI is pushing voice agents into something much more usable for real businesses. "
        f"If this launch lands, expect more companies to replace clunky support flows with AI that actually sounds human. "
        f"{draft_cta}."
    ).strip()
    draft_two = (
        f"Most customer service AI still feels robotic. PolyAI is betting that better voice agents win when they sound real, move fast, and plug into the stack teams already use. "
        f"{draft_cta}."
    ).strip()
    draft_three = (
        f"The interesting part of this launch is not hype. It is whether voice agents can lower support costs and still feel natural to the customer. "
        f"That is the bar PolyAI is trying to clear. {draft_cta}."
    ).strip()

    payload = {
        "title": title,
        "subtitle": "For Robert. Built from the Notion campaign brief.",
        "filename": slug_filename(title),
        "go_live": launch_period,
        "go_live_note": "Confirm the exact posting window before going live.",
        "what_to_do": what_to_do,
        "key_facts": key_facts[:5],
        "must_include": {"link": site_link},
        "drafts": [
            {"label": "Option 1. Launch angle. Recommended", "text": draft_one},
            {"label": "Option 2. Customer pain angle", "text": draft_two},
            {"label": "Option 3. Operator angle", "text": draft_three},
        ],
        "source_url": notion_url,
        "source_text": "\n".join(lines[:220]),
    }
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


def source_to_brief_payload(source: dict, source_url: str) -> dict:
    lines = source.get("lines") or []
    title = line(source.get("title")) or "Robert Brief"

    intro = []
    for current in lines:
        if current == title:
            continue
        intro.append(current)
        if len(intro) >= 4:
            break
    summary = " ".join(intro).strip()

    launch_line = next((item for item in lines if re.search(r"\b(go live|launch|posting window|post on|publish)\b", item, re.I)), "")
    submit_line = next((item for item in lines if "fillout.com" in item.lower() or "forms." in item.lower()), "")
    tag_line = next((item for item in lines if "@" in item and re.search(r"\b(tag|handle|account)\b", item, re.I)), "")
    hashtag_line = next((item for item in lines if "#" in item), "")

    action_lines = [
        item for item in lines
        if re.search(r"\b(post|use|mention|include|lead with|send|attach|publish|draft)\b", item, re.I)
    ][:5]
    if not action_lines:
        action_lines = [
            "Read the source brief and keep the strongest campaign angle intact.",
            "Lead with the sharpest fact and the clearest business takeaway.",
            "Keep the copy native to Robert's voice and platform.",
            "Send the draft back for approval before posting live.",
        ]

    fact_lines = [
        item for item in lines
        if len(item.split()) >= 3 and not re.search(r"\b(post|mention|include|draft|send|publish)\b", item, re.I)
    ][:8]
    key_facts = []
    for item in fact_lines:
        if "|" in item:
            left, right = item.split("|", 1)
            key_facts.append([line(left), line(right)])
        elif ":" in item and len(item.split(":", 1)[0].split()) <= 6:
            left, right = item.split(":", 1)
            key_facts.append([line(left), line(right)])
        else:
            key_facts.append(["Key fact", item])
    if summary and not key_facts:
        key_facts.append(["Campaign summary", summary[:220]])

    urls = [item.get("href", "") for item in source.get("links") or [] if item.get("href")]
    primary_link = next((u for u in urls if all(x not in u.lower() for x in ("notion.", "docs.google.com", "drive.google.com", "x.com", "linkedin.com"))), "")
    if not primary_link:
        primary_link = source_url

    tag_match = re.search(r"@[\w.]+", tag_line or "")
    hashtags = " ".join(re.findall(r"#[A-Za-z0-9_]+", hashtag_line or ""))

    draft_seed = next((pair[1] for pair in key_facts if pair[1]), summary or title)
    draft_cta = "Learn more"
    if re.search(r"\bdemo\b", " ".join(lines), re.I):
        draft_cta = "Book a demo"
    elif re.search(r"\bsign up\b", " ".join(lines), re.I):
        draft_cta = "Sign up"

    draft_one = f"{draft_seed}. This is the kind of launch that matters when the company is solving a real bottleneck instead of chasing AI theater. {draft_cta}."
    draft_two = f"The strongest angle here is not hype. It is the business case, what changes for the customer, why now, and why this company has a shot to win. {draft_cta}."
    draft_three = f"What stands out is the operating leverage. If this works as pitched, teams get a cleaner workflow, faster output, and less friction where it used to bog down. {draft_cta}."

    payload = {
        "title": title,
        "subtitle": "For Robert. Built from the source brief.",
        "filename": slug_filename(title),
        "go_live": launch_line,
        "go_live_note": "Confirm the exact posting window before going live.",
        "what_to_do": action_lines,
        "key_facts": key_facts[:6],
        "must_include": {
            "link": primary_link,
        },
        "drafts": [
            {"label": "Option 1. Core angle. Recommended", "text": draft_one},
            {"label": "Option 2. Business case angle", "text": draft_two},
            {"label": "Option 3. Operator angle", "text": draft_three},
        ],
        "source_url": source_url,
        "source_text": "\n".join(lines[:220]),
    }
    if submit_line:
        payload["submit_url"] = pick_first_url(submit_line) or submit_line
    if tag_match:
        payload["must_include"]["tag"] = tag_match.group(0)
    if hashtags:
        payload["must_include"]["hashtags"] = hashtags
    return payload


def import_notion_brief(notion_url: str) -> dict:
    notion_url = line(notion_url)
    if not notion_url:
        raise ValueError("Notion URL is required.")
    if "notion.so" not in notion_url and "notion.site" not in notion_url:
        raise ValueError("Paste a public Notion link.")
    result = subprocess.run(
        ["node", str(NOTION_EXTRACTOR), notion_url],
        check=True,
        capture_output=True,
        text=True,
        timeout=120,
    )
    notion = json.loads(result.stdout or "{}")
    payload = notion_to_brief_payload(notion, notion_url)
    return {
        "ok": True,
        "payload": payload,
        "source": {
            "title": notion.get("title") or payload["title"],
            "url": notion_url,
        },
    }


def import_source_brief(source_url: str) -> dict:
    source_url = line(source_url)
    if not source_url:
        raise ValueError("Source URL is required.")

    if "notion.so" in source_url or "notion.site" in source_url:
        return import_notion_brief(source_url)

    if "docs.google.com/document" in source_url:
        document_id = extract_google_doc_id(source_url)
        if not document_id:
            raise ValueError("Could not read the Google Doc link.")
        source = google_doc_to_source(document_id)
        payload = source_to_brief_payload(source, source_url)
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
    source_url = line(payload.get("source_url")) or line(payload.get("notion_url"))
    if source_url and not line(payload.get("title")):
        imported = import_source_brief(source_url)
        payload = imported["payload"]
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
        if self.path not in ("/generate-brief-doc", "/create-calendar-hold", "/import-notion-brief", "/import-source-brief"):
            send_json(self, 404, {"ok": False, "error": "Unknown endpoint."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            if self.path == "/generate-brief-doc":
                result = create_brief_doc(payload)
            elif self.path == "/import-notion-brief":
                result = import_notion_brief(payload.get("notion_url"))
            elif self.path == "/import-source-brief":
                result = import_source_brief(payload.get("source_url") or payload.get("notion_url"))
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
