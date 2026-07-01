"""
Python mirror of critical dashboard invariants (stage normalization + Organs gates).

Keep in sync with flow-v4/app-bundle.jsx:
  V3NormalizeStage, V3IsTeamParticipant, V4TeamRepliedLast, V4AprComputeGates (replies gate)
"""
from __future__ import annotations

import json
import re
from copy import deepcopy
from pathlib import Path
from typing import Any

ACTIVE_STAGE_IDS = (
    "new",
    "first-touch",
    "engaged",
    "rates-sent",
    "negotiating",
    "invoice-sent",
    "done",
    "paid-out",
)
TRASH_STAGE_IDS = ("trash", "dead-leads")
STAGE_MAP = {
    "discovery": "new",
    "build": "engaged",
    "posted": "done",
    "paid": "paid-out",
    "anything-else": "dead-leads",
    "dead": "dead-leads",
}

TEAM_MARKERS = (
    "scobleizer@gmail.com",
    "asherunaligned@gmail.com",
    "unalignedx@gmail.com",
    "samlevin@mac.com",
    "sam levin",
    "robert scoble",
    "asher weisberger",
    "unaligned",
)

TEAM_BODY_MARKERS = re.compile(
    r"\b(all the best,\s*asher|best,\s*asher|thanks robert for looping me in|"
    r"robert has looped me in|i handle the business side)\b",
    re.I,
)


def normalize_stage(list_id: str | None) -> str:
    s = str(list_id or "new").lower()
    if s in ACTIVE_STAGE_IDS:
        return s
    if s in TRASH_STAGE_IDS:
        return s
    return STAGE_MAP.get(s, "new")


def is_team_participant(value: Any) -> bool:
    text = str(value or "").lower()
    return any(marker in text for marker in TEAM_MARKERS)


def team_replied_last(thread: list[dict[str, Any]] | None) -> bool:
    if not thread:
        return False
    latest = thread[-1] or {}
    if is_team_participant(latest.get("from")):
        return True
    body = str(latest.get("body") or latest.get("snippet") or "").lower()
    return bool(TEAM_BODY_MARKERS.search(body))


def parse_draft_reply(raw: Any) -> dict[str, Any] | None:
    if not raw:
        return None
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {"subject": "", "body": raw}
    return None


def card_thread(card: dict[str, Any]) -> list[dict[str, Any]]:
    thread = card.get("email_thread") or card.get("original_email") or []
    if isinstance(thread, str):
        try:
            thread = json.loads(thread)
        except json.JSONDecodeError:
            thread = []
    return list(thread) if isinstance(thread, list) else []


def card_to_lead(card: dict[str, Any]) -> dict[str, Any]:
    draft = parse_draft_reply(card.get("draft_reply"))
    return {
        "id": str(card.get("id")),
        "brand": card.get("business_name") or card.get("title") or "",
        "contactName": card.get("contact_name") or "",
        "stage": normalize_stage(card.get("list_id")),
        "draftReply": draft,
        "draftReplyStatus": card.get("draft_reply_status") or "",
        "newReplyAt": card.get("new_reply_at") or None,
        "thread": card_thread(card),
    }


def should_show_in_replies_gate(lead: dict[str, Any]) -> bool:
    stage = str(lead.get("stage") or "").lower()
    if stage in {"trash", "dead-leads"}:
        return False
    status = str(lead.get("draftReplyStatus") or "").lower()
    if status != "pending":
        return False
    draft = lead.get("draftReply") or {}
    body = str(draft.get("body") or "").strip()
    if not body:
        return False
    if team_replied_last(lead.get("thread")):
        return False
    if lead.get("newReplyAt"):
        return False
    return True


def replies_gate_ids(leads: list[dict[str, Any]]) -> list[str]:
    return [str(l.get("id")) for l in leads if should_show_in_replies_gate(l)]


def load_fixture(name: str) -> dict[str, Any]:
    path = Path(__file__).resolve().parents[1] / "fixtures" / "cards" / name
    return json.loads(path.read_text(encoding="utf-8"))


def apply_bug_state(card: dict[str, Any], *, pending_draft: dict[str, str] | None = None) -> dict[str, Any]:
    out = deepcopy(card)
    if pending_draft is not None:
        out["draft_reply"] = pending_draft
        out["draft_reply_status"] = "pending"
    return out