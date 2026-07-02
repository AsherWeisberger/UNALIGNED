#!/usr/bin/env python3
"""Local LLM drafts for Robert's X DM replies (Company OS)."""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from local_llm import backend_label, no_dashes, ollama_chat, LOCAL_MODEL, LLM_BACKEND  # noqa: E402


def _line(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def _compact(text: str, limit: int = 1200) -> str:
    cleaned = _line(text)
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 3].rstrip() + "..."


def _first_name(contact_name: str) -> str:
    cleaned = (contact_name or "").strip()
    if not cleaned:
        return ""
    return re.split(r"\s+|[|/@.]", cleaned)[0].strip(",")


def _format_dm_thread(messages: list[Any]) -> str:
    lines: list[str] = []
    for msg in messages or []:
        if not isinstance(msg, dict):
            continue
        sender = _line(msg.get("sender") or msg.get("from") or "Lead")
        text = _compact(msg.get("text") or msg.get("body") or "", 500)
        if not text:
            continue
        who = "Robert" if sender.lower() in {"robert", "robert scoble"} or "scoble" in sender.lower() else "Lead"
        lines.append(f"{who}: {text}")
    return "\n".join(lines[-12:])


def _needs_email_handoff(lead: dict) -> bool:
    blob = " ".join(
        _line(lead.get(key))
        for key in (
            "notes",
            "xBestNextStep",
            "deliverables",
            "evidence",
            "xLastLeadMessage",
            "templateDraft",
        )
    ).lower()
    if any(
        phrase in blob
        for phrase in (
            "move them to email",
            "move the deal off x",
            "reply in x once",
            "sponsor",
            "sponsorship",
            "paid collab",
            "brand deal",
            "partnership",
            "your rate",
            "budget",
            "deliverable",
        )
    ):
        return True
    return False


def build_x_dm_prompt(lead: dict, template_draft: str = "") -> str:
    contact = _line(lead.get("contactName") or lead.get("xName") or "")
    handle = _line(lead.get("xHandle") or lead.get("xUsername") or "")
    first = _first_name(contact) or _first_name(handle.lstrip("@"))
    thread = _format_dm_thread(lead.get("xDmMessages") or [])
    latest_lead = _compact(lead.get("evidence") or lead.get("xLastLeadMessage") or "")
    latest_robert = _compact(lead.get("xLastRobertMessage") or "")
    summary = _compact(lead.get("notes") or lead.get("summaryForTeam") or "")
    next_step = _compact(lead.get("xBestNextStep") or "")
    handoff = _needs_email_handoff(lead)
    template = _compact(template_draft, 900)

    return f"""You write X (Twitter) DM replies as Robert Scoble, host of UNALIGNED.

CRITICAL RULES:
- NEVER repeat or echo the lead's question back to them. Answer it, defer honestly, or redirect.
- If they ask for a list, link, or fact you do not have, say you do not have it handy in DMs. Point them to the right official channel when obvious (e.g. @hf0 for HF0 updates).
- Sound human, warm, and specific. This is X DM, not a formal email.
- No em dashes, en dashes, or hyphenated compound phrases. Use periods or commas instead.
- Do not invent pricing, dates, deliverables, or commitments Robert has not made.
- Under 110 words total.
- Output ONLY the DM text Robert should paste into X. No quotes, no labels, no JSON, no markdown.

{"EMAIL HANDOFF REQUIRED: After a natural reply to their latest message, move them to email with Scobleizer@gmail.com and CC AsherUnaligned@gmail.com. Say Asher handles client business at UNALIGNED. End with one short line on what to send (scope, timing, budget, or what they are looking for)." if handoff else "NO EMAIL HANDOFF: This is casual or informational. Reply on X only. Do not push them to email unless they asked for it."}

Lead first name (for greeting): {first or "unknown"}
X handle: {handle or "unknown"}
Best next step from ops: {next_step or "Reply naturally on X"}
Summary: {summary or "n/a"}
Latest lead message: {latest_lead or "n/a"}
Robert's last message: {latest_robert or "n/a"}

DM thread (oldest to newest):
{thread or "n/a"}

Template fallback (structure only, do not copy blindly if it echoes their question):
{template or "n/a"}

Write Robert's reply now. Start with a short greeting using their first name when known."""


def _clean_model_output(text: str) -> str:
    raw = str(text or "").strip()
    if raw.startswith("```"):
        for part in raw.split("```"):
            part = part.strip()
            if part.lower().startswith("json"):
                part = part[4:].strip()
            if part and not part.lower().startswith("json"):
                raw = part
                break
    raw = raw.strip().strip('"').strip("'")
    return no_dashes(raw)


def draft_x_dm_reply_for_lead(lead: dict) -> dict:
    template = _line(lead.get("templateDraft") or "")
    if not template:
        template = "Thanks for reaching out on X."

    if LLM_BACKEND != "local":
        return {
            "ok": True,
            "draft": template,
            "source": "template",
            "backend": backend_label(),
        }

    try:
        prompt = build_x_dm_prompt(lead, template)
        text = ollama_chat(prompt, max_tokens=320, temperature=0.35, num_ctx=8192)
        draft = _clean_model_output(text)
        if len(draft) < 18:
            raise ValueError("model returned empty draft")
        return {
            "ok": True,
            "draft": draft,
            "source": "local",
            "model": LOCAL_MODEL,
            "backend": backend_label(),
        }
    except Exception as exc:
        return {
            "ok": True,
            "draft": template,
            "source": "template_fallback",
            "model": LOCAL_MODEL,
            "backend": backend_label(),
            "error": str(exc),
        }