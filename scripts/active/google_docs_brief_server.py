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
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from datetime import datetime, timedelta, timezone
from urllib import request, error
from urllib.parse import unquote, urlparse

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
NOTION_EXTRACTOR = Path("/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/scripts/active/extract_notion_brief.mjs")
WEB_ROOT = Path("/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES")
SCOPES = [
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/calendar.events",
]
OPENCODE_CONFIG_FILE = Path.home() / ".config" / "opencode" / "opencode.json"
DEFAULT_LLM_TARGETS = [
    {"base_url": "http://127.0.0.1:8000/v1", "model": "qwen3.5-9b-4bit", "label": "Rapid-MLX Qwen 3.5 9B"},
    {"base_url": "http://127.0.0.1:11434/v1", "model": "hermes-fast:latest", "label": "Ollama Hermes Fast"},
]
PREFERRED_LOCAL_MODELS = [
    ("http://127.0.0.1:8000/v1", "qwen3.5-9b-4bit"),
    ("http://127.0.0.1:11434/v1", "hermes-fast:latest"),
]
ALLOWED_ORIGINS = {
    "https://asherweisberger.github.io",
    "http://127.0.0.1:4174",
    "http://localhost:4174",
    "http://127.0.0.1:4173",
    "http://localhost:4173",
}

LOCAL_BRIEF_LLM_ENABLED = str(os.environ.get("LOCAL_BRIEF_LLM_ENABLED") or "0").strip().lower() in {"1", "true", "yes", "on"}


def get_api_token() -> str:
    token = line(os.environ.get("BRIEF_API_TOKEN"))
    if token:
        return token
    if API_TOKEN_FILE.exists():
        return line(API_TOKEN_FILE.read_text(encoding="utf-8"))
    return ""


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
    resolved = (WEB_ROOT / candidate).resolve()
    try:
        resolved.relative_to(WEB_ROOT.resolve())
    except ValueError:
        return None
    if not resolved.is_file():
        return None
    return resolved


def send_file(handler: BaseHTTPRequestHandler, file_path: Path) -> None:
    mime_type, _ = mimetypes.guess_type(str(file_path))
    body = file_path.read_bytes()
    handler.send_response(200)
    handler.send_header("Content-Type", mime_type or "application/octet-stream")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def require_api_token(handler: BaseHTTPRequestHandler) -> bool:
    origin = line(handler.headers.get("Origin")).lower()
    client_host = line((handler.client_address or ("",))[0]).lower()
    host = line(handler.headers.get("Host")).lower()
    if origin == "https://asherweisberger.github.io" and host.startswith("mac-studio.tail50d3a2.ts.net"):
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

    def add_target(base_url: str, model_id: str, label: str) -> None:
        normalized_base = line(base_url).rstrip("/")
        normalized_model = line(model_id)
        if not normalized_base or not normalized_model:
            return
        key = (normalized_base, normalized_model)
        if key in seen:
            return
        seen.add(key)
        targets.append({"base_url": normalized_base, "model": normalized_model, "label": label})

    available_by_base: dict[str, set[str]] = {}
    for base_url, _ in PREFERRED_LOCAL_MODELS:
        try:
            models_payload = fetch_json(f"{base_url.rstrip('/')}/models", timeout=8)
            model_ids = {
                line(item.get("id"))
                for item in (models_payload.get("data") or [])
                if isinstance(item, dict) and line(item.get("id"))
            }
            if model_ids:
                available_by_base[base_url.rstrip("/")] = model_ids
        except Exception:
            continue

    for base_url, model_id in PREFERRED_LOCAL_MODELS:
        normalized_base = base_url.rstrip("/")
        available_models = available_by_base.get(normalized_base)
        if available_models and model_id in available_models:
            label = "Rapid-MLX Qwen 3.5 9B" if "8000" in normalized_base else f"Ollama {model_id}"
            add_target(normalized_base, model_id, label)

    if OPENCODE_CONFIG_FILE.exists():
        try:
            config = json.loads(OPENCODE_CONFIG_FILE.read_text(encoding="utf-8") or "{}")
            providers = config.get("provider") or {}
            rapid = providers.get("rapidmlx") or {}
            ollama = providers.get("ollama") or {}
            rapid_base = line((rapid.get("options") or {}).get("baseURL"))
            ollama_base = line((ollama.get("options") or {}).get("baseURL"))
            rapid_available = available_by_base.get(rapid_base.rstrip("/")) if rapid_base else None
            ollama_available = available_by_base.get(ollama_base.rstrip("/")) if ollama_base else None
            if rapid_base and rapid_available:
                for model_id in (rapid.get("models") or {}).keys():
                    if model_id in rapid_available:
                        add_target(rapid_base, model_id, f"Rapid-MLX {model_id}")
            if ollama_base and ollama_available:
                for model_id in (ollama.get("models") or {}).keys():
                    if model_id in ollama_available:
                        add_target(ollama_base, model_id, f"Ollama {model_id}")
        except Exception:
            pass
    for default in DEFAULT_LLM_TARGETS:
        available_models = available_by_base.get(default["base_url"].rstrip("/"))
        if available_models and default["model"] in available_models:
            add_target(default["base_url"], default["model"], default["label"])
    return targets


def llm_prompt_for_brief(source: dict) -> str:
    title = line(source.get("title")) or "Robert Brief"
    source_url = line(source.get("source_url"))
    links = source.get("links") or []
    source_text = line(source.get("source_text"))
    link_lines = "\n".join(
        f"- {line(item.get('text'))}: {line(item.get('href'))}"
        for item in links[:20]
        if line(item.get("href"))
    )
    trimmed_source = source_text[:3500]
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
- Drafts should end with CTA and required tags when present.

Source title:
{title}

Source URL:
{source_url}

Linked references:
{link_lines or "(none)"}

Source text:
{trimmed_source}
"""


def query_local_brief_model(source: dict) -> dict | None:
    prompt = llm_prompt_for_brief(source)
    targets = load_local_llm_targets()
    errors: list[str] = []
    for target in targets:
        base_url = line(target.get("base_url")).rstrip("/")
        model = line(target.get("model"))
        if not base_url or not model:
            continue
        try:
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": "You are a precise JSON extraction engine."},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.1,
                "max_tokens": 900,
            }
            data = post_json(f"{base_url}/chat/completions", payload, timeout=35)
            content = (((data.get("choices") or [{}])[0]).get("message") or {}).get("content", "")
            parsed = extract_json_block(content)
            if isinstance(parsed, dict):
                parsed["_local_model"] = {"base_url": base_url, "model": model, "label": target.get("label")}
                return parsed
        except Exception as exc:
            errors.append(f"{target.get('label') or model}: {exc}")
            continue
    if errors:
        print("Local brief extraction fallback:", " | ".join(errors))
    return None


def merge_brief_payload(base: dict, llm_payload: dict | None) -> dict:
    if not llm_payload:
        return base
    merged = dict(base)
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
    for field in ("angles_or_accuracy_requirements", "status_note", "drafts", "where_it_lives"):
        value = llm_payload.get(field)
        if value:
            merged[field] = value
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


def clean_sentence(value: str | None) -> str:
    text = line(value)
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text).strip(" .")
    return f"{text}." if text else ""


def clean_points(values: list[str], limit: int = 6) -> list[str]:
    output: list[str] = []
    for item in values:
        cleaned = clean_sentence(item)
        if cleaned and cleaned not in output:
            output.append(cleaned)
        if len(output) >= limit:
            break
    return output


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


def infer_company_name(title: str, lines: list[str]) -> str:
    title = line(title)
    if title:
        first_part = re.split(r"[|:•]", title)[0].strip()
        if 1 <= len(first_part.split()) <= 6:
            return first_part
    company_line = find_first_matching_line(lines, (r"\bcompany\b", r"\bclient\b", r"\bbrand\b"))
    if company_line and ":" in company_line:
        return line(company_line.split(":", 1)[1])
    return title or "Company"


def extract_handles(text: str) -> list[str]:
    return re.findall(r"@[\w.]+", text or "")


def infer_deliverable_type(lines: list[str]) -> str:
    joined = " ".join(lines)
    lowered = joined.lower()
    if "quote repost" in lowered or "quote + repost" in lowered:
        return "Quote repost"
    if "dedicated thread" in lowered or "thread" in lowered:
        return "Dedicated thread"
    if "linkedin" in lowered:
        return "LinkedIn post"
    if "custom post" in lowered:
        return "Custom post"
    if "post" in lowered:
        return "Custom post"
    return ""


def build_structured_brief_payload(
    *,
    title: str,
    subtitle: str,
    source_url: str,
    lines: list[str],
    links: list[dict],
    source_label: str,
) -> dict:
    company = infer_company_name(title, lines)
    intro_lines = [current for current in lines if current != title][:10]
    summary = " ".join(intro_lines[:4]).strip()

    about_line = find_first_matching_line(
        lines,
        (r"\bwhat (it|they) do\b", r"\babout\b", r"\boverview\b", r"\bcompany\b", r"\bproduct\b"),
    ) or summary
    core_idea = find_first_matching_line(
        lines,
        (r"\bcore idea\b", r"\bmoat\b", r"\bwhy it matters\b", r"\bwhy now\b", r"\bthesis\b"),
    ) or summary
    how_it_works = find_first_matching_line(
        lines,
        (r"\bhow it works\b", r"\bmechanic\b", r"\bworkflow\b", r"\bproduct works\b", r"\bsolution\b"),
    ) or summary
    announcement = find_first_matching_line(
        lines,
        (r"\bannounce\b", r"\blaunch\b", r"\bseries [a-z]\b", r"\bnew\b", r"\bshipping\b", r"\brollout\b"),
    ) or summary
    go_live = find_first_matching_line(
        lines,
        (r"\bgo live\b", r"\bposting window\b", r"\bpost on\b", r"\bpublish\b", r"\blive on\b"),
    )
    deliverable_type = infer_deliverable_type(lines)

    accuracy_lines = collect_matching_lines(
        lines,
        (r"\bmust say\b", r"\bexact\b", r"\bdo not say\b", r"\bnon.?negotiable\b", r"\bmust include\b", r"\baccuracy\b"),
        limit=6,
    )
    angle_lines = collect_matching_lines(
        lines,
        (r"\bangle\b", r"\bhook\b", r"\bpositioning\b", r"\bwhy it matters\b", r"\bcore idea\b"),
        limit=6,
    )
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
    site_link = next(
        (
            u for u in deduped_urls
            if all(x not in u.lower() for x in ("notion.", "docs.google.com"))
        ),
        source_url,
    )
    founder_handle = next((handle for handle in tags[1:]), "")
    company_handle = tags[0] if tags else ""
    quote_post = next((u for u in deduped_urls if "x.com" in u.lower() or "twitter.com" in u.lower()), "")
    submit_url = next((u for u in deduped_urls if "fillout.com" in u.lower() or "forms." in u.lower()), "")
    hashtags = " ".join(re.findall(r"#[A-Za-z0-9_]+", "\n".join(lines[:200])))

    about_company = clean_sentence(about_line or f"{company} is the company behind this campaign")
    core_idea_text = clean_sentence(core_idea or announcement or summary)
    how_it_works_text = clean_sentence(how_it_works or summary)
    announcement_text = clean_sentence(announcement or summary)
    why_alignednews = clean_sentence(
        f"This fits AlignedNews because Robert can frame {company} through the broader AI shift, not just the product launch"
    )

    draft_seed = announcement_text or core_idea_text or about_company
    cta = "Learn more."
    if re.search(r"\bdemo\b", "\n".join(lines), re.I):
        cta = "Book a demo."
    elif re.search(r"\bsign up\b", "\n".join(lines), re.I):
        cta = "Sign up."
    disclosure_suffix = " Paid partnership." if disclosure_lines else ""
    tag_suffix = f" {company_handle}" if company_handle else ""
    draft_one = clean_sentence(
        f"{draft_seed} The bigger point is that this shows where AI products get real when they solve an actual bottleneck. See more at {site_link}{tag_suffix}.{disclosure_suffix}"
    )
    draft_two = clean_sentence(
        f"{company} is interesting because the moat is in how the product works in practice, not just the pitch deck. This is the kind of thing I watch closely at AlignedNews. {cta}{tag_suffix}{disclosure_suffix}"
    )
    draft_three = clean_sentence(
        f"What stands out here is the operating leverage. If this lands, teams move faster with less friction and a cleaner workflow. {cta}{tag_suffix}{disclosure_suffix}"
    )

    where_it_lives = []
    if site_link:
        where_it_lives.append(["Website", site_link])
    if company_handle:
        where_it_lives.append(["Company X", company_handle])
    if founder_handle:
        where_it_lives.append(["Founder X", founder_handle])
    if quote_post:
        where_it_lives.append(["Post to quote", quote_post])
    for asset in asset_lines[:2]:
        where_it_lives.append(["Assets", asset])

    payload = {
        "title": f"{company} x UNALIGNED x ROBERT SCOBLE",
        "subtitle": subtitle,
        "filename": slug_filename(company or title),
        "company_name": company,
        "about_company": about_company,
        "core_idea": core_idea_text,
        "how_it_works": how_it_works_text,
        "announcement": announcement_text,
        "deliverable_type": deliverable_type,
        "go_live": go_live,
        "go_live_note": clean_sentence("Confirm the exact posting window before going live"),
        "angles_or_accuracy_requirements": clean_points(accuracy_lines or angle_lines, limit=6),
        "where_it_lives": where_it_lives,
        "status_note": clean_points(
            [go_live, *disclosure_lines, *status_notes, *asset_lines],
            limit=8,
        ),
        "why_alignednews": why_alignednews,
        "drafts": [
            {"label": "Option 1. Core angle. Recommended", "text": draft_one},
            {"label": "Option 2. Why now angle", "text": draft_two},
            {"label": "Option 3. Operator angle", "text": draft_three},
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
    llm_payload = query_local_brief_model({
        "title": title,
        "source_url": source_url,
        "source_text": payload.get("source_text"),
        "links": links,
    })
    return merge_brief_payload(payload, llm_payload)


def notion_to_brief_payload(notion: dict, notion_url: str) -> dict:
    lines = [item for item in (notion.get("lines") or []) if item not in ("Skip to content", "Get Notion free")]
    title = line(notion.get("title")) or "Robert Brief"
    return build_structured_brief_payload(
        title=title,
        subtitle="For Robert. Built from the Notion campaign brief.",
        source_url=notion_url,
        lines=lines,
        links=notion.get("links") or [],
        source_label="Notion",
    )


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
    return build_structured_brief_payload(
        title=title,
        subtitle="For Robert. Built from the source brief.",
        source_url=source_url,
        lines=lines,
        links=source.get("links") or [],
        source_label="Source",
    )


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
    text, _ = build_doc_blocks(payload)
    return text


def split_doc_paragraphs(value: str) -> list[str]:
    normalized = str(value or "").replace("\u000b", "\n")
    parts = [line(item) for item in normalized.splitlines()]
    return [item for item in parts if item]


def build_doc_blocks(payload: dict) -> tuple[str, list[dict]]:
    blocks: list[dict] = []

    def push(kind: str, text_value: str = "", *, shaded: bool = False, bold: bool = False) -> None:
        blocks.append({
            "kind": kind,
            "text": text_value,
            "shaded": shaded,
            "bold": bold,
        })

    def push_section(heading: str, values: list[str], *, split_values: bool = True) -> None:
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
            return
        push("spacer")
        push("section_heading", heading)
        for item in cleaned_values:
            push("body", item, shaded=True)

    title = line(payload.get("title")) or "UNALIGNED Robert Brief"
    company_name = line(payload.get("company_name"))
    push("title", title)
    if line(payload.get("subtitle")):
        push("subtitle", line(payload.get("subtitle")))

    if line(payload.get("about_company")):
        heading = f"About {company_name}" if company_name else "About the Company"
        push_section(heading, [line(payload.get("about_company"))])

    core_idea = line(payload.get("core_idea"))
    if core_idea:
        push_section("The Core Idea", [core_idea])

    how_it_works_lines = [line(payload.get("how_it_works")), line(payload.get("announcement"))]
    how_it_works_lines = [item for item in how_it_works_lines if item]
    if how_it_works_lines:
        push_section("How it Works / The Story", how_it_works_lines)

    angles = [line(item) for item in (payload.get("angles_or_accuracy_requirements") or []) if line(item)]
    if angles:
        push_section("Hard Accuracy Requirements", angles)

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
    if where_lines:
        push_section("Where it Lives", where_lines)

    status_lines: list[str] = []
    if line(payload.get("deliverable_type")):
        status_lines.append(f"This is a {line(payload.get('deliverable_type'))} deliverable.")
    if line(payload.get("go_live")):
        status_lines.append(f"Go live: {line(payload.get('go_live'))}")
    if line(payload.get("go_live_note")):
        status_lines.append(line(payload.get("go_live_note")))
    status_lines.extend([line(item) for item in (payload.get("status_note") or []) if line(item)])
    if status_lines:
        push_section("Status Note", status_lines)

    if line(payload.get("why_alignednews")):
        push_section("Why it matters for AlignedNews", [line(payload.get("why_alignednews"))])

    drafts = payload.get("drafts") or []
    valid_drafts = [item for item in drafts if isinstance(item, dict) and (line(item.get("label")) or line(item.get("text")))]
    if valid_drafts:
        push("spacer")
        push("section_heading", "Post to publish")
        push("blank")
        for idx, draft in enumerate(valid_drafts):
            label = line(draft.get("label"))
            text_value = line(draft.get("text"))
            if label:
                push("draft_label", label, bold=True)
            for paragraph in split_doc_paragraphs(text_value):
                push("body", paragraph, shaded=True)
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
            lines.append(text_value)
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
        idx += gdoc_units(text_value) + 1
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
    text, blocks = build_doc_blocks(payload)
    requests = build_requests(text, blocks)
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

    def do_GET(self) -> None:
        if self.path == "/health":
            send_json(self, 200, {
                "ok": True,
                "service": "google-docs-brief-server",
                "host": HOST,
                "port": PORT,
                "time": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            })
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
        if self.path not in ("/generate-brief-doc", "/create-calendar-hold", "/import-notion-brief", "/import-source-brief"):
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
