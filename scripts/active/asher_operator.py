#!/usr/bin/env python3
"""
asher_operator.py

Autonomous Gmail deal-operator foundation for UNALIGNED.

What it does:
1. Reads active Gmail-backed lead cards from Supabase
2. Builds/updates per-thread memory
3. Classifies the current deal stage and next action
4. Drafts an Asher-style reply when a response is needed
5. Optionally auto-sends only low-risk reply types
6. Writes memory + draft state back to Supabase/local state

This is intentionally conservative:
- auto-send is OFF by default
- escalation is explicit
- hard rules override model output
"""

from __future__ import annotations

import base64
import email.utils
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

import httpx
import google.auth.transport.requests
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError


ROOT = Path("/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES")
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from local_llm import OPERATOR_FRAMEWORK, backend_label, llm_json, no_dashes, resolve_tone  # noqa: E402

POLICY_FILE = ROOT / "scripts" / "active" / "asher_operator_policy.json"
STATE_DIR = Path.home() / ".config" / "google-credentials"
MEMORY_FILE = STATE_DIR / "asher_operator_memory.json"
LOG_FILE = STATE_DIR / "asher_operator.log"

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://hbnpwphxjurvtydezwgh.supabase.co")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
CLIENT_SECRET_FILE = Path(os.environ.get("GOOGLE_CLIENT_SECRET_FILE", str(STATE_DIR / "client_secret.json")))
GMAIL_TOKEN_FILE = Path(os.environ.get("GMAIL_TOKEN_FILE", str(STATE_DIR / "asher-gmail-token.json")))
GMAIL_SEND_TOKEN_FILE = Path(os.environ.get("GMAIL_SEND_TOKEN_FILE", str(STATE_DIR / "asher-gmail-send-token.json")))

READONLY_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
SEND_SCOPES = ["https://www.googleapis.com/auth/gmail.send"]

DRY_RUN = "--dry-run" in sys.argv
LIMIT = None
AUTO_SEND = os.environ.get("ASHER_OPERATOR_AUTO_SEND", "").strip().lower() in {"1", "true", "yes"}
ONLY_NEEDS_REPLY = "--only-needs-reply" in sys.argv
FOLLOW_UP_AFTER_DAYS = int(os.environ.get("ASHER_OPERATOR_FOLLOW_UP_DAYS", "2"))

for arg in sys.argv[1:]:
    if arg.startswith("--limit="):
        LIMIT = int(arg.split("=", 1)[1])


def log(msg: str) -> None:
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"{stamp} {msg}"
    print(line)
    try:
      STATE_DIR.mkdir(parents=True, exist_ok=True)
      with LOG_FILE.open("a", encoding="utf-8") as fh:
          fh.write(line + "\n")
    except Exception:
      pass


def read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def policy() -> dict[str, Any]:
    return read_json(POLICY_FILE, {})


def supabase_headers(prefer: str = "return=minimal") -> dict[str, str]:
    return {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY}",
        "Content-Type": "application/json",
        "Prefer": prefer,
    }


def supabase_get(path: str) -> Any:
    url = f"{SUPABASE_URL}{path}"
    resp = httpx.get(url, headers=supabase_headers(), timeout=30)
    resp.raise_for_status()
    return resp.json()


def supabase_patch(card_id: str | int, payload: dict[str, Any]) -> None:
    if DRY_RUN:
        return
    url = f"{SUPABASE_URL}/rest/v1/cards?id=eq.{card_id}"
    resp = httpx.patch(url, headers=supabase_headers(), json=payload, timeout=30)
    resp.raise_for_status()


def load_cards() -> list[dict[str, Any]]:
    wanted = (
        "id,title,contact_name,business_name,email,list_id,estimated_value,intent,description,"
        "original_email,gmail_thread_id,draft_reply,draft_reply_status,new_reply_at,created_at,"
        "updated_at,moved_at,lead_source"
    )
    cards: list[dict[str, Any]] = []
    offset = 0
    blocked = '"trash","dead-leads","paid-out"'
    while True:
        path = (
            f"/rest/v1/cards?select={wanted}"
            f"&limit=1000&offset={offset}"
            f"&email=not.is.null"
            f"&list_id=not.in.({blocked})"
        )
        batch = supabase_get(path)
        if not isinstance(batch, list) or not batch:
            break
        cards.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    if ONLY_NEEDS_REPLY:
        cards = [c for c in cards if c.get("new_reply_at") or follow_up_due(c, canonical_thread(c), str(c.get("list_id") or "new"))]
    cards.sort(key=lambda c: c.get("updated_at") or c.get("moved_at") or c.get("created_at") or "", reverse=True)
    if LIMIT:
        cards = cards[:LIMIT]
    return cards


def load_memory() -> dict[str, Any]:
    memory = read_json(MEMORY_FILE, {"threads": {}})
    if "threads" not in memory or not isinstance(memory["threads"], dict):
        memory = {"threads": {}}
    return memory


def save_memory(memory: dict[str, Any]) -> None:
    if not DRY_RUN:
        write_json(MEMORY_FILE, memory)


def load_gmail_service(token_file: Path, scopes: list[str], interactive: bool) -> Any | None:
    creds = None
    if token_file.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(token_file), scopes)
        except Exception:
            creds = None
    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(google.auth.transport.requests.Request())
            token_file.write_text(creds.to_json(), encoding="utf-8")
        except Exception:
            creds = None
    if not creds and interactive:
        flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRET_FILE), scopes)
        creds = flow.run_local_server(port=0)
        token_file.write_text(creds.to_json(), encoding="utf-8")
    if not creds:
        return None
    return build("gmail", "v1", credentials=creds)


def canonical_thread(card: dict[str, Any]) -> list[dict[str, Any]]:
    raw = card.get("original_email") or []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            raw = []
    if isinstance(raw, dict):
        raw = [raw]
    if not isinstance(raw, list):
        return []
    thread = [m for m in raw if isinstance(m, dict)]
    thread.sort(key=lambda m: parse_dt(m.get("date") or m.get("date_iso") or "").timestamp() if parse_dt(m.get("date") or m.get("date_iso") or "") else 0)
    return thread


def parse_dt(value: str) -> datetime | None:
    if not value:
        return None
    try:
        if value.endswith("Z"):
            value = value[:-1] + "+00:00"
        return datetime.fromisoformat(value)
    except Exception:
        try:
            return email.utils.parsedate_to_datetime(value)
        except Exception:
            return None


def money(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(float(re.sub(r"[^0-9.]", "", str(value))))
    except Exception:
        return None


def compact_thread_text(thread: list[dict[str, Any]], limit: int = 8) -> str:
    parts = []
    for msg in thread[-limit:]:
        sender = str(msg.get("from") or msg.get("email") or "?").strip()
        date = str(msg.get("date") or msg.get("date_iso") or "").strip()
        subject = str(msg.get("subject") or "").strip()
        body = str(msg.get("body") or msg.get("snippet") or "").strip()
        body = re.sub(r"\s+", " ", body)[:1600]
        parts.append(f"FROM: {sender}\nDATE: {date}\nSUBJECT: {subject}\nBODY: {body}")
    return "\n\n---\n\n".join(parts)


def message_body(msg: dict[str, Any] | None) -> str:
    if not msg:
        return ""
    return str(msg.get("body") or msg.get("snippet") or "").strip()


def thread_stage_text(card: dict[str, Any], thread: list[dict[str, Any]], limit: int = 10) -> str:
    parts = [
        str(card.get("title") or ""),
        str(card.get("intent") or ""),
        str(card.get("description") or ""),
    ]
    for msg in thread[-limit:]:
        parts.extend([
            str(msg.get("subject") or ""),
            message_body(msg),
        ])
    return re.sub(r"\s+", " ", " ".join(parts)).lower()


def has_existing_package_signal(text: str) -> bool:
    return bool(re.search(
        r"\b(monthly package|package of four posts|four posts|4 posts|[1-4]\s*/\s*4|"
        r"not been completed|continue the collaboration|trial period|renew it|"
        r"originally part of the agreement|contract was signed|previous collaborations|"
        r"working together for so long|already paid|paid package)\b",
        text,
    ))


def has_execution_signal(text: str) -> bool:
    return bool(re.search(
        r"\b(brief|draft|copy|sponsor review|client review|video production|release date|"
        r"publish|go live|quote link|approved|revised copy|final edits|post|posts|collaboration)\b",
        text,
    ))


def latest_inbound_wait_signal(thread: list[dict[str, Any]]) -> bool:
    latest = latest_message(thread)
    if not latest or participant_is_team(latest.get("from")):
        return False
    body = message_body(latest).lower()[:900]
    wait_signal = re.search(
        r"\b(thank you|thanks|plz wait|please wait|wait a moment|will get back|"
        r"shared .* sponsor|submit.*sponsor|sponsor.*review|sounds great)\b",
        body,
    )
    direct_ask = re.search(
        r"\b(can you|could you|please send|please provide|need the copy|looking forward to receiving|"
        r"what is|rate|pricing|invoice|payment|budget|question|issue|problem|revise|change)\b",
        body,
    )
    return bool(wait_signal and not direct_ask)


def participant_is_team(value: str) -> bool:
    s = str(value or "").lower()
    markers = [
        "asherunaligned@gmail.com",
        "scobleizer@gmail.com",
        "unalignedx@gmail.com",
        "samlevin@mac.com",
        "asher weisberger",
        "robert scoble",
        "sam levin",
        "unaligned"
    ]
    return any(m in s for m in markers)


def latest_message(thread: list[dict[str, Any]]) -> dict[str, Any] | None:
    return thread[-1] if thread else None


def latest_inbound(thread: list[dict[str, Any]]) -> dict[str, Any] | None:
    for msg in reversed(thread):
        if not participant_is_team(msg.get("from")):
            return msg
    return None


def latest_team_message(thread: list[dict[str, Any]]) -> dict[str, Any] | None:
    for msg in reversed(thread):
        if participant_is_team(msg.get("from")):
            return msg
    return None


def follow_up_due(card: dict[str, Any], thread: list[dict[str, Any]], stage: str) -> bool:
    if not thread:
        return False
    if stage in {"trash", "dead-leads", "paid-out"}:
        return False
    if card.get("new_reply_at"):
        return False
    if str(card.get("draft_reply_status") or "").lower() == "pending":
        return False
    last = latest_message(thread)
    if not last or not participant_is_team(last.get("from")):
        return False
    last_dt = parse_dt(str(last.get("date") or last.get("date_iso") or ""))
    if not last_dt:
        return False
    age_days = (datetime.now(timezone.utc) - last_dt.astimezone(timezone.utc)).total_seconds() / 86400
    return age_days >= FOLLOW_UP_AFTER_DAYS


def derive_reply_type(stage: str, lead: dict[str, Any]) -> str | None:
    if stage in {"new", "first-touch", "engaged"}:
        if lead.get("has_pricing_signal"):
            return "pricing-send"
        return "initial-scope"
    if stage == "rates-sent":
        return "follow-up"
    if stage == "negotiating":
        return "negotiate-response"
    if stage == "invoice-sent":
        return "payment-check"
    if stage == "done":
        return "brief-request"
    return None


def heuristic_stage(card: dict[str, Any], thread: list[dict[str, Any]]) -> tuple[str, str]:
    text = thread_stage_text(card, thread, limit=8)

    if has_existing_package_signal(text) and has_execution_signal(text):
        if latest_inbound_wait_signal(thread):
            return "done", "Existing paid package execution. Latest sponsor-side message is a wait/review note, so no pricing reply is needed."
        return "done", "Existing paid package execution, not a fresh pricing lead."
    if re.search(r"\bpaid|payment receipt|invoice attached|invoice sent|receipt when paid|processing the payment|cfo is currently processing\b", text):
        return "invoice-sent", "Payment, invoice, or contract appears to be the blocker."
    if re.search(r"\bhow about\b|\bbudget\b|\brate too high\b|\bprice too high\b|\bdiscount\b|\bquote price doubled\b|\bnet[- ]?\d+\b", text):
        return "negotiating", "The lead is pushing on price or terms."
    if re.search(r"\btier\b|\brate\b|\bpricing\b|\bpackage\b|\bquote repost\b|\bquote price\b", text):
        return "rates-sent", "Pricing or package details are already in the thread."
    if re.search(r"\bbrief\b|\bon calendar\b|\blive tomorrow\b|\bapproved from the client\b|\bpost has been approved\b", text):
        return "done", "The deal appears sold and is now in execution handling."
    if thread:
        return "engaged", "There is active back-and-forth but no locked commercial state yet."
    return "new", "Fresh lead with no usable thread history yet."


def deterministic_context_guard(card: dict[str, Any], thread: list[dict[str, Any]], summary: dict[str, Any], analysis: dict[str, Any]) -> dict[str, Any]:
    text = thread_stage_text(card, thread, limit=10)
    if has_existing_package_signal(text) and has_execution_signal(text):
        waiting = latest_inbound_wait_signal(thread)
        guarded = dict(analysis)
        guarded["stage"] = "done"
        guarded["safe_to_auto_send"] = False
        guarded["reply_type"] = None if waiting else "brief-request"
        guarded["needs_reply"] = False if waiting else bool(card.get("new_reply_at"))
        guarded["reason"] = (
            "Existing paid package execution. Latest sponsor-side note says to wait for review, so the system should watch instead of pricing it again."
            if waiting
            else "Existing paid package execution. Keep it in execution context instead of treating package language as a new rate request."
        )
        summary["brief_signal"] = True
        summary["pricing_signal"] = False
        summary["current_status"] = guarded["reason"]
        summary["next_action"] = "Watch for sponsor feedback." if waiting else "Handle the execution request from the latest message."
        return guarded
    return analysis


def stale_pending_draft_conflicts(card: dict[str, Any], thread: list[dict[str, Any]]) -> bool:
    status = str(card.get("draft_reply_status") or "").lower()
    if status != "pending" or not card.get("draft_reply"):
        return False
    text = thread_stage_text(card, thread, limit=10)
    draft_text = json.dumps(card.get("draft_reply") or {}, ensure_ascii=False).lower()
    pricing_draft = re.search(
        r"\b(rate|pricing|payment terms|send over the invoice|invoice info|happy to move forward|quote)\b",
        draft_text,
    )
    if has_existing_package_signal(text) and pricing_draft:
        return True
    if latest_inbound_wait_signal(thread) and pricing_draft:
        return True
    return False


def escalation_flags(card: dict[str, Any], stage: str, thread: list[dict[str, Any]], pol: dict[str, Any]) -> list[str]:
    flags = []
    value = money(card.get("estimated_value"))
    text = compact_thread_text(thread, limit=6).lower()
    if value and value > 7500:
        flags.append("high value deal over 7500")
    if re.search(r"\bcrypto\b|\btoken\b|\bcoin\b", text):
        flags.append("crypto or token request")
    if re.search(r"\bnet[- ]?(15|30|45|60)\b|\bpost-live payment\b", text):
        flags.append("payment terms exception")
    if re.search(r"\bcontract\b|\bagreement\b|\blegal\b|\bnda\b", text):
        flags.append("contract exception")
    if re.search(r"\bcustom package\b|\bcan you do .* instead\b", text):
        flags.append("custom pricing request")
    if re.search(r"\bnot moving forward\b|\btoo high\b|\bfrustrated\b|\bissue\b", text):
        flags.append("negative relationship signal")
    if stage == "done" and not re.search(r"\bcalendar\b|\blive\b|\bapproved\b|\bbrief\b", text):
        flags.append("brief / calendar uncertainty")
    allowed = set(pol.get("escalation_triggers") or [])
    return [f for f in flags if not allowed or f in allowed or f == "crypto or token request"]


def thread_summary_prompt(pol: dict[str, Any], card: dict[str, Any], thread_text: str) -> str:
    return f"""You are the operating memory engine for UNALIGNED.

Summarize this sponsorship / collaboration thread for the internal operator.

Return strict JSON with:
{{
  "lead_summary": "one compact paragraph",
  "company": "best company name",
  "contact_name": "best contact name",
  "asked_for": "what they want",
  "current_status": "what is happening right now",
  "launch_timing": "date/window or empty string",
  "quoted_rate": "numeric string or empty string",
  "payment_status": "short phrase",
  "next_action": "one sentence",
  "pricing_signal": true,
  "brief_signal": false
}}

Use these operating rules:
- Be concrete, not fluffy.
- Prefer what the latest messages say.
- If no exact rate appears, leave quoted_rate empty.
- If the lead is asking for sponsorship / pricing / repost / deliverables, pricing_signal should be true.
- If the deal is already in execution, brief_signal should be true.

CARD:
Title: {card.get("title") or ""}
Company: {card.get("business_name") or ""}
Contact: {card.get("contact_name") or ""}
Current stage: {card.get("list_id") or "new"}

THREAD:
{thread_text}
"""


def stage_prompt(pol: dict[str, Any], card: dict[str, Any], memory_summary: dict[str, Any], thread_text: str) -> str:
    stage_defs = json.dumps(pol.get("stage_definitions") or {}, indent=2)
    hard_rules = "\n".join(f"- {r}" for r in pol.get("hard_rules") or [])
    return f"""You are Asher's autonomous deal operator for UNALIGNED.

Classify the thread and decide whether an operator reply is needed.

Valid stages:
{stage_defs}

Hard rules:
{hard_rules}

Return strict JSON:
{{
  "stage": "new|first-touch|engaged|rates-sent|negotiating|invoice-sent|done|paid-out",
  "needs_reply": true,
  "reason": "one sentence",
  "reply_type": "initial-scope|pricing-send|follow-up|negotiate-response|payment-check|brief-request|null",
  "safe_to_auto_send": false
}}

Lead memory:
{json.dumps(memory_summary, ensure_ascii=False)}

Thread:
{thread_text}
"""


def draft_prompt(pol: dict[str, Any], card: dict[str, Any], analysis: dict[str, Any], memory_summary: dict[str, Any], thread_text: str) -> str:
    voice = ", ".join(pol.get("voice", {}).get("tone", []))
    likes = ", ".join(pol.get("voice", {}).get("phrases_to_like", []))
    avoids = ", ".join(pol.get("voice", {}).get("phrases_to_avoid", []))
    sig = pol.get("senders", {}).get("default", {}).get("signature", "")
    tone = resolve_tone(card)
    return f"""Write an email reply as Asher Weisberger for UNALIGNED.

{OPERATOR_FRAMEWORK}
TONE: {tone}

Voice:
- {voice}
- Natural, not robotic
- Short paragraphs
- Commercially clear
- Protect Robert's value

Things to like:
{likes}

Avoid:
{avoids}

Reply type: {analysis.get("reply_type") or "follow-up"}
Reason:
{analysis.get("reason") or ""}

Lead memory:
{json.dumps(memory_summary, ensure_ascii=False)}

Current thread:
{thread_text}

Rules:
- If pricing is already in-thread, do not ignore it.
- If the lead is below floor, hold the line politely.
- If details are missing, ask for them directly.
- Do not mention internal systems or AI.
- Do not hallucinate dates or deliverables.
- End with this exact signature:

{sig}

Return strict JSON:
{{
  "subject": "subject line",
  "body": "email body only"
}}
"""


def call_llm(prompt: str, max_tokens: int = 700) -> dict[str, Any] | None:
    try:
        parsed = llm_json(prompt, max_tokens=max_tokens)
        return parsed if isinstance(parsed, dict) else None
    except Exception as exc:
        log(f"Local LLM error: {exc}")
        return None


def build_memory_entry(card: dict[str, Any], thread: list[dict[str, Any]], pol: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    thread_id = str(card.get("gmail_thread_id") or card.get("id"))
    thread_text = compact_thread_text(thread)
    summary = call_llm(thread_summary_prompt(pol, card, thread_text), max_tokens=350)
    if not summary:
        stage_guess, reason = heuristic_stage(card, thread)
        summary = {
            "lead_summary": reason,
            "company": card.get("business_name") or "",
            "contact_name": card.get("contact_name") or "",
            "asked_for": card.get("intent") or "",
            "current_status": reason,
            "launch_timing": "",
            "quoted_rate": "",
            "payment_status": "",
            "next_action": "",
            "pricing_signal": stage_guess in {"rates-sent", "negotiating", "invoice-sent"},
            "brief_signal": stage_guess == "done",
        }
    stage_guess, reason = heuristic_stage(card, thread)
    analysis = call_llm(stage_prompt(pol, card, summary, thread_text), max_tokens=220)
    if not analysis:
        analysis = {
            "stage": stage_guess,
            "needs_reply": bool(card.get("new_reply_at")) or stage_guess in {"new", "first-touch"} or follow_up_due(card, thread, stage_guess),
            "reason": reason,
            "reply_type": derive_reply_type(stage_guess, {"has_pricing_signal": summary.get("pricing_signal")}),
            "safe_to_auto_send": False,
        }
    analysis = deterministic_context_guard(card, thread, summary, analysis)
    summary["pricing_signal"] = bool(summary.get("pricing_signal"))
    summary["brief_signal"] = bool(summary.get("brief_signal"))
    return {
        "thread_id": thread_id,
        "card_id": card.get("id"),
        "company": summary.get("company") or card.get("business_name") or "",
        "contact_name": summary.get("contact_name") or card.get("contact_name") or "",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "summary": summary,
        "analysis": analysis,
    }, summary, analysis


def should_escalate(flags: list[str]) -> bool:
    return bool(flags)


def draft_reply(card: dict[str, Any], analysis: dict[str, Any], summary: dict[str, Any], pol: dict[str, Any], thread: list[dict[str, Any]]) -> dict[str, Any] | None:
    thread_text = compact_thread_text(thread)
    draft = call_llm(draft_prompt(pol, card, analysis, summary, thread_text), max_tokens=650)
    if draft and draft.get("body"):
        body = no_dashes(str(draft["body"]).strip())
        return {
            "subject": draft.get("subject") or f"Re: {card.get('title') or card.get('business_name') or 'Collaboration'}",
            "body": body,
        }
    return None


def format_subject(card: dict[str, Any], thread: list[dict[str, Any]], fallback: str) -> str:
    for msg in reversed(thread):
        subject = str(msg.get("subject") or "").strip()
        if subject:
            return subject if subject.lower().startswith("re:") else f"Re: {subject}"
    return fallback


def create_mime_message(to_email: str, subject: str, body: str, cc: list[str] | None = None, reply_to_message_id: str | None = None) -> dict[str, str]:
    msg = MIMEText(body)
    msg["to"] = to_email
    msg["subject"] = subject
    if cc:
        msg["cc"] = ", ".join(cc)
    if reply_to_message_id:
        msg["In-Reply-To"] = reply_to_message_id
        msg["References"] = reply_to_message_id
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    return {"raw": raw}


def auto_send_if_allowed(send_service: Any, card: dict[str, Any], analysis: dict[str, Any], draft: dict[str, Any], pol: dict[str, Any], thread: list[dict[str, Any]]) -> tuple[bool, str]:
    if not AUTO_SEND:
        return False, "auto-send disabled"
    if not send_service:
        return False, "send service unavailable"
    reply_type = analysis.get("reply_type")
    safe_types = set(pol.get("safe_auto_send_reply_types") or [])
    if reply_type not in safe_types:
        return False, "reply type not in safe auto-send list"
    if not analysis.get("safe_to_auto_send"):
        return False, "analysis marked unsafe to auto-send"
    to_email = str(card.get("email") or "").strip()
    if not to_email:
        return False, "missing target email"
    latest = latest_inbound(thread) or latest_message(thread) or {}
    reply_message_id = latest.get("message_id")
    cc = []
    try:
        payload = create_mime_message(to_email, draft["subject"], draft["body"], cc=cc, reply_to_message_id=reply_message_id)
        if DRY_RUN:
            return True, "dry-run auto-send"
        send_service.users().messages().send(userId="me", body=payload).execute()
        return True, "sent"
    except HttpError as exc:
        return False, f"gmail send failed: {exc}"


def merge_operator_into_description(card: dict[str, Any], summary: dict[str, Any], analysis: dict[str, Any], escalation: list[str]) -> str:
    raw = card.get("description") or ""
    try:
        payload = json.loads(raw) if isinstance(raw, str) and raw.strip().startswith("{") else {}
    except Exception:
        payload = {"body": raw[:1200]} if raw else {}
    payload["operator_memory"] = {
        "summary": summary,
        "analysis": analysis,
        "escalation": escalation,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    return json.dumps(payload, ensure_ascii=False)


def main() -> None:
    pol = policy()
    if not SUPABASE_ANON_KEY:
        log("Missing SUPABASE_ANON_KEY")
        sys.exit(1)
    cards = load_cards()
    log(f"Asher operator starting — {len(cards)} cards | LLM: {backend_label()}")
    memory = load_memory()
    read_service = load_gmail_service(GMAIL_TOKEN_FILE, READONLY_SCOPES, interactive=False)
    send_service = load_gmail_service(GMAIL_SEND_TOKEN_FILE, SEND_SCOPES, interactive=False) if AUTO_SEND else None

    updated = 0
    drafted = 0
    sent = 0
    escalated = 0

    for idx, card in enumerate(cards, start=1):
        thread = canonical_thread(card)
        if not thread:
            continue
        latest = latest_message(thread)
        latest_from = str((latest or {}).get("from") or "")
        lead_summary = " ".join([str(card.get("contact_name") or ""), str(card.get("business_name") or "")]).strip()
        log(f"[{idx}/{len(cards)}] {lead_summary or card.get('id')} — latest from {latest_from or '?'}")

        entry, summary, analysis = build_memory_entry(card, thread, pol)
        reply_type = analysis.get("reply_type") or derive_reply_type(analysis.get("stage") or card.get("list_id") or "new", {"has_pricing_signal": summary.get("pricing_signal")})
        analysis["reply_type"] = reply_type
        flags = escalation_flags(card, analysis.get("stage") or "", thread, pol)
        entry["analysis"]["escalation"] = flags
        memory["threads"][str(entry["thread_id"])] = entry

        patch: dict[str, Any] = {}
        current_stage = str(card.get("list_id") or "new")
        next_stage = str(analysis.get("stage") or current_stage)
        if next_stage and next_stage != current_stage:
            patch["list_id"] = next_stage
            patch["moved_at"] = datetime.now(timezone.utc).isoformat()

        stale_follow_up = follow_up_due(card, thread, next_stage)
        needs_reply = bool(analysis.get("needs_reply"))
        if card.get("new_reply_at"):
            needs_reply = True
        if stale_follow_up:
            needs_reply = True
            if not analysis.get("reason"):
                analysis["reason"] = f"No movement for {FOLLOW_UP_AFTER_DAYS}+ days after our last message."

        draft = None
        auto_send_state = {"attempted": False, "sent": False, "reason": ""}
        existing_status = str(card.get("draft_reply_status") or "").lower()
        already_has_draft = existing_status == "pending" and card.get("draft_reply")
        clear_stale_pending = stale_pending_draft_conflicts(card, thread)
        if clear_stale_pending:
            needs_reply = False
            analysis["needs_reply"] = False
            analysis["safe_to_auto_send"] = False
            analysis["reply_type"] = None
            analysis["reason"] = "Cleared a stale pending pricing draft because this thread is existing package execution, not a new rate request."
            patch["draft_reply"] = None
            patch["draft_reply_status"] = ""
            patch["new_reply_at"] = None

        should_draft = needs_reply and not clear_stale_pending and not (already_has_draft and not card.get("new_reply_at"))
        if should_draft:
            draft = draft_reply(card, analysis, summary, pol, thread)
            if draft:
                draft["subject"] = format_subject(card, thread, draft.get("subject") or "Re: Collaboration")
                patch["draft_reply"] = draft
                patch["draft_reply_status"] = "escalated" if should_escalate(flags) else "pending"
                drafted += 1
                if not should_escalate(flags):
                    auto_send_state["attempted"] = True
                    ok, reason = auto_send_if_allowed(send_service, card, analysis, draft, pol, thread)
                    auto_send_state["sent"] = ok
                    auto_send_state["reason"] = reason
                    if ok:
                        sent += 1
                        patch["draft_reply_status"] = "sent"
                        patch["new_reply_at"] = None
        else:
            if not clear_stale_pending:
                patch["draft_reply_status"] = card.get("draft_reply_status") or ""

        if flags:
            escalated += 1

        patch["description"] = merge_operator_into_description(card, summary, analysis, flags)
        patch["updated_at"] = datetime.now(timezone.utc).isoformat()

        if patch:
            supabase_patch(card["id"], patch)
            updated += 1

        log(
            f"  stage={next_stage} reply={needs_reply} type={reply_type or '-'} "
            f"escalation={len(flags)} autosend={auto_send_state['reason'] or 'n/a'}"
        )

    save_memory(memory)
    log(f"Done — updated={updated} drafted={drafted} sent={sent} escalated={escalated}")


if __name__ == "__main__":
    main()
