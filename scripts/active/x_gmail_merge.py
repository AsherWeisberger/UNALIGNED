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


def message_contact_set(msg: dict[str, Any]) -> set[str]:
    contacts: set[str] = set()
    for field in ("email", "from", "to", "cc", "reply_to", "replyTo"):
        raw = msg.get(field)
        if isinstance(raw, list):
            for item in raw:
                norm = normalize_email(item)
                if norm:
                    contacts.add(norm)
        else:
            for addr in parse_email_list(raw):
                if addr:
                    contacts.add(addr)
    return contacts


def slice_thread_for_contact(thread: Any, contact_email: str) -> list[dict[str, Any]]:
    contact = normalize_email(contact_email)
    if not contact or not isinstance(thread, list) or len(thread) < 2:
        return list(thread) if isinstance(thread, list) else []
    sliced = [msg for msg in thread if isinstance(msg, dict) and contact in message_contact_set(msg)]
    return sliced or list(thread)


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
    if sender in {"robert", "you"}:
        return True
    status = str(lead.get("currentStatus") or "").lower()
    return "robert was last" in status


def is_team_dm_sender(sender: str) -> bool:
    raw = str(sender or "").strip()
    if not raw:
        return False
    lower = raw.lower()
    if lower == "lead":
        return False
    if lower in {"robert", "you"}:
        return True
    return any(
        marker in lower
        for marker in ("robert", "scoble", "asher", "unaligned", "sam levin", "sammy")
    )


def derive_dm_thread_state(messages: list[dict[str, Any]]) -> dict[str, Any]:
    """Read actual scraped DM text — never AI draft placeholders."""
    cleaned: list[dict[str, str]] = []
    for msg in messages:
        if not isinstance(msg, dict):
            continue
        text = str(msg.get("text") or "").strip()
        if not text:
            continue
        cleaned.append({
            "sender": str(msg.get("sender") or "").strip() or "Lead",
            "text": text,
        })
    if not cleaned:
        return {}

    last_lead = ""
    last_team = ""
    for msg in cleaned:
        if is_team_dm_sender(msg["sender"]):
            last_team = msg["text"]
        else:
            last_lead = msg["text"]

    team_sent_last = is_team_dm_sender(cleaned[-1]["sender"])
    return {
        "lastLeadMessage": last_lead,
        "lastRobertMessage": last_team,
        "lastSender": "Robert" if team_sent_last else "Lead",
        "currentStatus": "WAIT - Robert was last" if team_sent_last else "SEND - Lead waiting",
        "repliedViaX": team_sent_last,
    }


def patch_summary_robert_position(summary: str, robert_text: str) -> str:
    compact = re.sub(r"\s+", " ", robert_text).strip()
    if len(compact) > 180:
        compact = compact[:179].rstrip() + "…"
    if not compact:
        return summary
    if re.search(r"Robert['’]s latest position:", summary, flags=re.I):
        return re.sub(
            r"Robert['’]s latest position:\s*.+?(?=\s+Contact captured:|$)",
            f"Robert's latest position: {compact}",
            summary,
            flags=re.I,
        )
    base = summary.rstrip()
    suffix = f" Robert's latest position: {compact}"
    return f"{base}{suffix}" if base else suffix.strip()


def apply_live_dm_truth(lead: dict[str, Any]) -> dict[str, Any]:
    """Prefer scraped DM thread text over CSV/AI placeholders on every X sync."""
    messages = lead.get("dmMessages") or lead.get("dm_messages") or []
    if not isinstance(messages, list) or not messages:
        return lead
    state = derive_dm_thread_state(messages)
    if not state:
        return lead

    updated = dict(lead)
    if state.get("lastLeadMessage"):
        updated["lastLeadMessage"] = state["lastLeadMessage"]
    if state.get("lastRobertMessage"):
        updated["lastRobertMessage"] = state["lastRobertMessage"]
        updated["summaryForTeam"] = patch_summary_robert_position(
            str(updated.get("summaryForTeam") or ""),
            state["lastRobertMessage"],
        )
    if state.get("lastSender"):
        updated["lastSender"] = state["lastSender"]
    if state.get("currentStatus"):
        updated["currentStatus"] = state["currentStatus"]
    updated["repliedViaX"] = bool(state.get("repliedViaX"))
    return updated


def parse_description_json(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if not raw:
        return {}
    try:
        parsed = json.loads(str(raw))
    except Exception:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _x_reply_is_placeholder(text: str) -> bool:
    compact = str(text or "").strip()
    return not compact or compact.lower() == "marked as replied on x."


def merge_preserve_manual_x_reply(
    existing_desc: dict[str, Any],
    blob: dict[str, Any],
) -> dict[str, Any]:
    """Keep manual 'Mark replied on X' state while refreshing live DM text."""
    marked_at = str(existing_desc.get("x_reply_marked_at") or "").strip()
    if not marked_at:
        return blob
    blob["x_reply_marked_at"] = marked_at
    blob["replied_via_x"] = True
    blob["x_current_status"] = (
        existing_desc.get("x_current_status") or "WAIT - Robert was last"
    )
    live_robert = str(blob.get("last_robert_message") or "").strip()
    exist_robert = str(existing_desc.get("last_robert_message") or "").strip()
    if _x_reply_is_placeholder(live_robert) and exist_robert and not _x_reply_is_placeholder(exist_robert):
        blob["last_robert_message"] = exist_robert
    elif not live_robert and exist_robert:
        blob["last_robert_message"] = exist_robert
    elif live_robert and not _x_reply_is_placeholder(live_robert):
        blob["last_robert_message"] = live_robert
    return blob


def context_blob(
    lead: dict[str, Any],
    existing_description: dict[str, Any] | None = None,
) -> str:
    lead = apply_live_dm_truth(lead)
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
    dm_messages = lead.get("dmMessages") or lead.get("dm_messages") or []
    if not isinstance(dm_messages, list):
        dm_messages = []
    blob = {
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
        "dm_messages": dm_messages[-12:],
    }
    if existing_description:
        blob = merge_preserve_manual_x_reply(existing_description, blob)
    return json.dumps(blob, ensure_ascii=False)


def _now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _lead_inbound_at(lead: dict[str, Any]) -> str:
    """Best-effort timestamp for the latest inbound X activity."""
    for key in ("newestDmDate", "newest_dm_date", "lastLeadMessageAt"):
        val = str(lead.get(key) or "").strip()
        if val:
            return val
    return _now_iso()


def _existing_last_message(existing_card: dict[str, Any] | None) -> str:
    if not existing_card:
        return ""
    desc = parse_description_json(existing_card.get("description"))
    return str(desc.get("last_message") or "").strip()


def _x_activity_is_new(
    lead: dict[str, Any],
    existing_card: dict[str, Any] | None,
) -> bool:
    """True when X intake shows activity the operator has not absorbed yet."""
    if lead.get("newLead") is True:
        return True
    if lead.get("changedSincePriorScrape") is True:
        return True
    last = str(lead.get("lastLeadMessage") or "").strip()
    if last and last != _existing_last_message(existing_card):
        # New lead message text vs what we last stored on the card.
        sender = str(lead.get("lastSender") or "").strip().lower()
        if sender and sender not in {"robert", "you", "scobleizer", "team"}:
            return True
        if not sender:
            return True
    return False


def refresh_fields(
    lead: dict[str, Any],
    existing_card: dict[str, Any] | None = None,
) -> dict[str, Any]:
    lead = apply_live_dm_truth(lead)
    existing_desc = parse_description_json((existing_card or {}).get("description"))
    email_addr = first_external_email(lead.get("contactEmails"))
    phone = str(lead.get("contactPhones") or "").strip()
    name = str(lead.get("xName") or "").strip()
    username = str(lead.get("xUsername") or "").strip()
    patch: dict[str, Any] = {
        "description": context_blob(lead, existing_desc),
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

    # Operator-unseen memory: flag dashboard unread when X has new inbound activity.
    # Do not clear unread here — only the dashboard mark-read / open path clears it.
    if _x_activity_is_new(lead, existing_card):
        inbound_at = _lead_inbound_at(lead)
        patch["new_reply_at"] = inbound_at
        patch["last_inbound_at"] = inbound_at
        patch["needs_reply"] = True
        patch["needs_human_read"] = True
    return patch


def insert_fields(lead: dict[str, Any]) -> dict[str, Any]:
    lead = apply_live_dm_truth(lead)
    odm = str(lead.get("openDm") or "").strip()
    name = str(lead.get("xName") or "").strip()
    username = str(lead.get("xUsername") or "").strip()
    email_addr = first_external_email(lead.get("contactEmails"))
    phone = str(lead.get("contactPhones") or "").strip()
    inbound_at = _lead_inbound_at(lead)
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
        # New X leads always start unread until Asher opens/marks them on the board.
        "new_reply_at": inbound_at,
        "last_inbound_at": inbound_at,
        "needs_reply": True,
        "needs_human_read": True,
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
    patch = refresh_fields(lead, gmail_card)
    patch["x_open_dm"] = str(lead.get("openDm") or "").strip()
    if not str(gmail_card.get("lead_source") or "").strip():
        patch["lead_source"] = "X"
    # Attaching a live X thread to a Gmail card is new operator surface area.
    if not gmail_card.get("x_open_dm"):
        inbound_at = _lead_inbound_at(lead)
        patch["new_reply_at"] = inbound_at
        patch["last_inbound_at"] = inbound_at
        patch["needs_reply"] = True
        patch["needs_human_read"] = True
    return patch