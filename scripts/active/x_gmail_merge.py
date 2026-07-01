#!/usr/bin/env python3
"""
Shared X <-> Gmail card merge helpers.

Used by x_bridge.py (after X intake sync) and gmail_delta_sync.py (email match priority).
"""
from __future__ import annotations

import email.utils
import json
import re
from typing import Any

TEAM_EMAILS = {
    "scobleizer@gmail.com",
    "asherunaligned@gmail.com",
    "unalignedx@gmail.com",
    "samlevin@mac.com",
}

INACTIVE_STAGES = {"done", "paid-out", "trash", "dead-leads"}

GMAIL_SOURCES = {
    "gmail",
    "gmail-codex",
    "asher-gmail-candidate",
    "robert-gmail-new-lead",
}


def normalize_email(raw: Any) -> str:
    text = str(raw or "").strip().lower()
    if not text or "@" not in text:
        return ""
    _name, addr = email.utils.parseaddr(text)
    if addr and "@" in addr:
        return addr.lower().strip()
    match = re.search(r"[\w.+%-]+@[\w.-]+\.[A-Za-z]{2,}", text)
    return match.group(0).lower() if match else ""


def first_external_email(raw: Any) -> str:
    for addr in parse_email_list(raw):
        if addr not in TEAM_EMAILS:
            return addr
    return ""


def parse_email_list(raw: Any) -> list[str]:
    out: list[str] = []
    for _name, addr in email.utils.getaddresses([str(raw or "")]):
        norm = normalize_email(addr)
        if norm and norm not in out:
            out.append(norm)
    if not out:
        norm = normalize_email(raw)
        if norm:
            out.append(norm)
    return out


def priority_of(score: Any) -> str:
    try:
        s = float(score)
    except (TypeError, ValueError):
        return "cold"
    return "hot" if s >= 80 else "warm" if s >= 50 else "cold"


def intent_of(lead_type: Any) -> str:
    lt = str(lead_type or "").lower()
    for key, value in [
        ("sponsor", "sponsorship"),
        ("partner", "partnership"),
        ("interview", "interview"),
        ("collab", "collaboration"),
        ("intro", "intro"),
    ]:
        if key in lt:
            return value
    return "other"


def _replied_via_x(lead: dict[str, Any]) -> bool:
    if lead.get("repliedViaX") is True:
        return True
    sender = str(lead.get("lastSender") or "").strip().lower()
    if sender == "robert":
        return True
    status = str(lead.get("currentStatus") or "").lower()
    return "robert was last" in status


def context_blob(lead: dict[str, Any]) -> str:
    last_robert = str(lead.get("lastRobertMessage") or "").strip()
    if not last_robert:
        summary = str(lead.get("summaryForTeam") or "")
        match = re.search(
            r"Robert['’]s latest position:\s*(.+?)(?:\s+Contact captured:|$)",
            summary,
            flags=re.I,
        )
        if match:
            last_robert = match.group(1).strip()
    return json.dumps(
        {
            "x_summary": lead.get("summaryForTeam"),
            "last_message": lead.get("lastLeadMessage"),
            "last_robert_message": last_robert,
            "last_sender": lead.get("lastSender"),
            "replied_via_x": _replied_via_x(lead),
            "x_current_status": lead.get("currentStatus"),
            "best_next_step": lead.get("bestNextStep"),
            "lead_score": lead.get("leadScore"),
            "x_username": lead.get("xUsername"),
            "open_dm": lead.get("openDm"),
        },
        ensure_ascii=False,
    )


def refresh_fields(lead: dict[str, Any]) -> dict[str, Any]:
    email_addr = first_external_email(lead.get("contactEmails"))
    phone = str(lead.get("contactPhones") or "").strip()
    name = str(lead.get("xName") or "").strip()
    username = str(lead.get("xUsername") or "").strip()
    patch: dict[str, Any] = {
        "description": context_blob(lead),
        "priority": priority_of(lead.get("leadScore")),
    }
    if email_addr:
        patch["email"] = email_addr
    if phone:
        patch["phone"] = phone
    if name:
        patch["contact_name"] = name
        if not username:
            patch["business_name"] = name
    if username:
        patch["title"] = f"X DM · {name or username}".strip()
    return patch


def insert_fields(lead: dict[str, Any]) -> dict[str, Any]:
    odm = str(lead.get("openDm") or "").strip()
    name = str(lead.get("xName") or "").strip()
    username = str(lead.get("xUsername") or "").strip()
    email_addr = first_external_email(lead.get("contactEmails"))
    phone = str(lead.get("contactPhones") or "").strip()
    return {
        "x_open_dm": odm,
        "lead_source": "X",
        "list_id": "new",
        "business_name": name or username or "X lead",
        "contact_name": name,
        "title": f"X DM · {name or username}".strip(),
        "intent": intent_of(lead.get("leadType")),
        "priority": priority_of(lead.get("leadScore")),
        "email": email_addr,
        "phone": phone,
        "description": context_blob(lead),
    }


def lead_source_key(raw: Any) -> str:
    return str(raw or "").strip().lower()


def is_x_card(card: dict[str, Any]) -> bool:
    return bool(str(card.get("x_open_dm") or "").strip())


def is_gmail_only_card(card: dict[str, Any]) -> bool:
    if is_x_card(card):
        return False
    if card.get("gmail_thread_id"):
        return True
    source = lead_source_key(card.get("lead_source"))
    return source in GMAIL_SOURCES or "gmail" in source


def is_merge_candidate(card: dict[str, Any]) -> bool:
    if str(card.get("list_id") or "") in INACTIVE_STAGES:
        return False
    return is_gmail_only_card(card)


def pick_gmail_card_for_email(
    cards_by_email: dict[str, list[dict[str, Any]]],
    email_addr: str,
    *,
    exclude_ids: set[str] | None = None,
) -> dict[str, Any] | None:
    exclude_ids = exclude_ids or set()
    matches = [
        c
        for c in cards_by_email.get(email_addr, [])
        if str(c.get("id")) not in exclude_ids and is_merge_candidate(c)
    ]
    if not matches:
        return None
    with_thread = [c for c in matches if c.get("gmail_thread_id")]
    if with_thread:
        return sorted(with_thread, key=lambda c: str(c.get("updated_at") or ""), reverse=True)[0]
    return matches[0]


def pick_cards_for_email_match(cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not cards:
        return []
    x_cards = [c for c in cards if is_x_card(c)]
    if x_cards:
        return x_cards
    return cards


def parse_email_thread(card: dict[str, Any]) -> list[dict[str, Any]]:
    raw = card.get("email_thread") or card.get("original_email") or []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            raw = []
    if isinstance(raw, dict):
        return [raw]
    return list(raw) if isinstance(raw, list) else []


def merge_email_threads(keep: list[dict[str, Any]], extra: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}
    for msg in [*keep, *extra]:
        if not isinstance(msg, dict):
            continue
        key = "||".join(
            [
                str(msg.get("message_id") or ""),
                str(msg.get("gmail_thread_id") or ""),
                str(msg.get("date") or msg.get("date_iso") or ""),
                str(msg.get("from") or "").lower(),
                str(msg.get("subject") or "").lower(),
                str(msg.get("body") or "")[:300],
            ]
        )
        prev = merged.get(key)
        if not prev or len(str(msg.get("body") or "")) >= len(str(prev.get("body") or "")):
            merged[key] = dict(msg)
    out = list(merged.values())
    out.sort(key=lambda m: str(m.get("date") or m.get("date_iso") or ""))
    return out[-50:]


def absorb_gmail_patch(x_card: dict[str, Any], gmail_card: dict[str, Any]) -> dict[str, Any]:
    patch = refresh_fields_from_card_context(x_card)
    keep_thread = parse_email_thread(x_card)
    gmail_thread = parse_email_thread(gmail_card)
    merged_thread = merge_email_threads(keep_thread, gmail_thread)
    if merged_thread:
        patch["email_thread"] = merged_thread
        patch["original_email"] = merged_thread[:1]
    if not str(x_card.get("gmail_thread_id") or "").strip() and gmail_card.get("gmail_thread_id"):
        patch["gmail_thread_id"] = gmail_card["gmail_thread_id"]
    if not str(x_card.get("email") or "").strip() and gmail_card.get("email"):
        patch["email"] = gmail_card["email"]
    if not str(x_card.get("contact_name") or "").strip() and gmail_card.get("contact_name"):
        patch["contact_name"] = gmail_card["contact_name"]
    if not str(x_card.get("business_name") or "").strip() and gmail_card.get("business_name"):
        patch["business_name"] = gmail_card["business_name"]
    if gmail_card.get("new_reply_at") and not x_card.get("new_reply_at"):
        patch["new_reply_at"] = gmail_card["new_reply_at"]
    return patch


def refresh_fields_from_card_context(card: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in card.items() if k in {"description", "priority", "email", "phone", "contact_name", "business_name", "title"}}


def enrich_gmail_card_patch(gmail_card: dict[str, Any], lead: dict[str, Any]) -> dict[str, Any]:
    patch = refresh_fields(lead)
    patch["x_open_dm"] = str(lead.get("openDm") or "").strip()
    if not str(gmail_card.get("lead_source") or "").strip():
        patch["lead_source"] = "X"
    return patch