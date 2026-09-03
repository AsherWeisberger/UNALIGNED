#!/usr/bin/env python3
"""
Detect when a pending draft_reply no longer matches the latest inbound message.

Used by daily_pipeline, gmail_delta_sync, and asher_operator so Organs never
surfaces a stale AI draft after the lead sends a new email.
"""
from __future__ import annotations

import json
import re
from typing import Any

TEAM_MARKERS = (
    "scobleizer@gmail.com",
    "asherunaligned@gmail.com",
    "unalignedx@gmail.com",
    "samlevin@mac.com",
    "robert scoble",
    "sam levin",
    "asher weisberger",
    "asher weisberger",
    "unaligned",
)

PAID_EXECUTION_RE = re.compile(
    r"\b(payment is done|payment has been|payment has been processed|payment processed|"
    r"payment is processed|paid|invoice paid|payment'?s already cleared|payment has cleared|"
    r"payment cleared|receipt tomorrow|send the receipt|should reach you|brief with more details|"
    r"launch is on|launch date|go live|posting window|already paid|live link|"
    r"wrong tag|correct tag|no worries, thanks for the post|pls kindly check|please check the attachment)\b",
    re.I,
)

PRICING_DRAFT_RE = re.compile(
    r"\b(rate|pricing|payment terms|send the invoice|send over the invoice|invoice info|"
    r"happy to move forward|quote|tier [1-5]|partnership packages)\b",
    re.I,
)

PAYMENT_CHASE_DRAFT_RE = re.compile(
    r"\b(not received payment|have not received payment|haven't received payment|"
    r"payment.*not.*received|invoice.*not.*paid|issues holding this up|holding this up)\b",
    re.I,
)

X_HANDOFF_DRAFT_RE = re.compile(
    r"\b(getting in touch via x|reached out via x|thanks for reaching out via x|via x)\b",
    re.I,
)

INITIAL_OUTREACH_DRAFT_RE = re.compile(
    r"\b(thanks for getting in touch|great to connect|look at your (product|company|app)|"
    r"ai story|demo|would love to learn more about)\b",
    re.I,
)

EXISTING_PACKAGE_RE = re.compile(
    r"\b(monthly package|package of four posts|four posts|4 posts|[1-4]\s*/\s*4|"
    r"not been completed|continue the collaboration|trial period|renew it|"
    r"originally part of the agreement|contract was signed|previous collaborations|"
    r"working together for so long|already paid|paid package)\b",
    re.I,
)


def parse_thread(card: dict[str, Any]) -> list[dict[str, Any]]:
    thread = card.get("email_thread") or card.get("original_email") or []
    if isinstance(thread, str):
        try:
            thread = json.loads(thread)
        except Exception:
            thread = []
    return list(thread) if isinstance(thread, list) else []


def plain_text(value: Any) -> str:
    text = str(value or "")
    text = re.sub(r"<[^>]+>", " ", text)
    text = (
        text.replace("&gt;", ">")
        .replace("&lt;", "<")
        .replace("&amp;", "&")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
    )
    return re.sub(r"\s+", " ", text).strip()


def participant_is_team(value: Any) -> bool:
    s = plain_text(value).lower()
    return any(marker in s for marker in TEAM_MARKERS)


def latest_message(thread: list[dict[str, Any]]) -> dict[str, Any] | None:
    return thread[-1] if thread else None


def team_replied_last(thread: list[dict[str, Any]]) -> bool:
    latest = latest_message(thread)
    if not latest:
        return False
    return participant_is_team(latest.get("from"))


def latest_inbound_message(thread: list[dict[str, Any]]) -> dict[str, Any] | None:
    for msg in reversed(thread):
        if not participant_is_team(msg.get("from")):
            return msg
    return None


def message_body(msg: dict[str, Any] | None) -> str:
    if not msg:
        return ""
    return plain_text(msg.get("body") or msg.get("snippet") or "")


def draft_text(card: dict[str, Any]) -> str:
    raw = card.get("draft_reply") or {}
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            return plain_text(raw)
    if isinstance(raw, dict):
        return plain_text(raw.get("body") or "") + " " + plain_text(raw.get("subject") or "")
    return ""


def thread_context_text(card: dict[str, Any], thread: list[dict[str, Any]], limit: int = 10) -> str:
    parts = [
        plain_text(card.get("title")),
        plain_text(card.get("intent")),
        plain_text(card.get("description")),
        plain_text(card.get("contact_name")),
    ]
    for msg in thread[-limit:]:
        parts.extend([plain_text(msg.get("subject")), message_body(msg)])
    return " ".join(parts).lower()


def extract_first_name(value: str) -> str:
    text = plain_text(value)
    if "@" in text:
        local = text.split("@", 1)[0]
        local = re.sub(r"[^a-zA-Z]+", " ", local).strip()
        return (local.split() or [""])[0].lower()
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"[^a-zA-Z\s]+", " ", text).strip()
    return (text.split() or [""])[0].lower()


def draft_addresses_wrong_person(card: dict[str, Any], thread: list[dict[str, Any]], draft: str) -> str | None:
    contact = extract_first_name(str(card.get("contact_name") or ""))
    inbound = latest_inbound_message(thread)
    inbound_from = extract_first_name(str((inbound or {}).get("from") or ""))
    expected = contact or inbound_from
    if not expected or len(expected) < 2:
        return None
    salutation = re.search(r"\b(?:hi|hello|hey|dear)\s+([a-z][a-z'-]{1,24})\b", draft, re.I)
    if not salutation:
        return None
    draft_name = salutation.group(1).lower()
    allowed = {expected, inbound_from, contact}
    allowed.discard("")
    if draft_name not in allowed:
        return f"draft greets {draft_name} but contact is {expected or inbound_from}"
    return None


INACTIVE_STAGES = {"done", "paid-out", "trash", "dead-leads"}


def draft_staleness_reason(card: dict[str, Any], thread: list[dict[str, Any]] | None = None) -> str | None:
    status = str(card.get("draft_reply_status") or "").lower()
    if status != "pending" or not card.get("draft_reply"):
        return None

    stage = str(card.get("list_id") or card.get("stage") or "").lower()
    if stage in INACTIVE_STAGES:
        return f"inactive stage ({stage}); pending draft should not queue"

    thread = thread if thread is not None else parse_thread(card)
    draft = draft_text(card).lower()
    if not draft:
        return None

    if team_replied_last(thread):
        return "team already sent the last message; pending draft is orphan"

    if card.get("new_reply_at"):
        return "new inbound flagged (new_reply_at)"

    inbound = latest_inbound_message(thread)
    inbound_body = message_body(inbound).lower()
    context = thread_context_text(card, thread)

    wrong_person = draft_addresses_wrong_person(card, thread, draft)
    if wrong_person:
        return wrong_person

    if PAID_EXECUTION_RE.search(inbound_body) or PAID_EXECUTION_RE.search(context):
        if PRICING_DRAFT_RE.search(draft):
            return "inbound confirms payment but draft still discusses pricing"
        if PAYMENT_CHASE_DRAFT_RE.search(draft):
            return "inbound confirms payment but draft still chases payment"
        if X_HANDOFF_DRAFT_RE.search(draft) or INITIAL_OUTREACH_DRAFT_RE.search(draft):
            return "inbound confirms payment but draft is generic outreach"

    if EXISTING_PACKAGE_RE.search(context) and PRICING_DRAFT_RE.search(draft):
        return "existing package execution but draft asks for fresh pricing"

    if inbound_body and INITIAL_OUTREACH_DRAFT_RE.search(draft):
        topic_words = set(re.findall(r"[a-z]{5,}", inbound_body))
        draft_words = set(re.findall(r"[a-z]{5,}", draft))
        overlap = topic_words & draft_words
        if len(overlap) < 2 and PAID_EXECUTION_RE.search(inbound_body):
            return "draft topic does not match latest inbound (payment confirmation)"

    return None


def should_regenerate_draft(card: dict[str, Any], thread: list[dict[str, Any]] | None = None) -> tuple[bool, str]:
    reason = draft_staleness_reason(card, thread)
    return (bool(reason), reason or "")


def stale_draft_clear_patch(card: dict[str, Any], thread: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    stale, reason = should_regenerate_draft(card, thread)
    if not stale:
        return {}
    return {
        "draft_reply": None,
        "draft_reply_status": "",
        "new_reply_at": None,
        "_stale_draft_reason": reason,
    }


def inbound_needs_payment_ack(card: dict[str, Any], thread: list[dict[str, Any]] | None = None) -> bool:
    thread = thread if thread is not None else parse_thread(card)
    inbound = latest_inbound_message(thread)
    body = message_body(inbound).lower()
    return bool(PAID_EXECUTION_RE.search(body))