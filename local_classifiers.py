#!/usr/bin/env python3
"""
Local Qwen classifiers for UNALIGNED pipeline integration.

Heartbeat: intake (new conversations) — scam/tone/routing
Deliverable Tracker: fulfillment (active deals) — did we deliver what we sold?

Enabled when USE_LOCAL_CLASSIFIER=1. Requires Ollama with qwen3.6:35b-a3b.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

_DIR = Path(__file__).resolve().parent
if str(_DIR) not in sys.path:
    sys.path.insert(0, str(_DIR))

from heartbeat_qwen import classify as heartbeat_classify  # noqa: E402
from deliverable_tracker_qwen import track as deliverable_track  # noqa: E402

ACTIVE_DEAL_STAGES = {
    "engaged",
    "rates-sent",
    "negotiating",
    "invoice-sent",
    "done",
}


def enabled() -> bool:
    return os.environ.get("USE_LOCAL_CLASSIFIER", "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _latest_email_text(card: dict) -> str:
    thread = card.get("email_thread") or []
    if isinstance(thread, str):
        try:
            thread = json.loads(thread)
        except json.JSONDecodeError:
            return thread
    if not thread:
        return card.get("description") or ""
    last = thread[-1] if isinstance(thread, list) else thread
    if isinstance(last, dict):
        body = last.get("body") or last.get("content") or last.get("snippet") or ""
        sender = last.get("from") or last.get("sender") or ""
        subject = last.get("subject") or ""
        return f"From: {sender}\nSubject: {subject}\n\n{body}".strip()
    return str(last)


def _thread_history(card: dict) -> str:
    thread = card.get("email_thread") or []
    if isinstance(thread, str):
        try:
            thread = json.loads(thread)
        except json.JSONDecodeError:
            return ""
    if not isinstance(thread, list) or len(thread) <= 1:
        return ""
    parts = []
    for msg in thread[:-1][-3:]:
        if not isinstance(msg, dict):
            continue
        sender = msg.get("from") or msg.get("sender") or "?"
        body = (msg.get("body") or msg.get("content") or msg.get("snippet") or "")[:500]
        parts.append(f"From {sender}: {body}")
    return "\n---\n".join(parts)


def _deal_spec(card: dict) -> dict:
    labels = card.get("labels") or []
    label_text = " ".join(labels) if isinstance(labels, list) else str(labels)
    deliverable = "QRT"
    upper = label_text.upper()
    if "RT" in upper and "QRT" not in upper:
        deliverable = "RT"
    elif "AMPLIFICATION" in upper:
        deliverable = "amplification"
    return {
        "client": card.get("business_name") or card.get("contact_name") or "unknown",
        "deliverable": deliverable,
        "own_commentary_required": deliverable == "QRT",
        "tags": [],
        "disclosure_required": True,
        "paid": (card.get("list_id") or "") in {"invoice-sent", "done", "paid-out"},
        "status": "posted" if (card.get("list_id") or "") == "done" else "booked",
    }


def classify_card(card: dict) -> dict[str, Any] | None:
    """Run local classifier on a card. Returns JSON verdict or None on failure."""
    if not enabled():
        return None
    email_text = _latest_email_text(card)
    if not email_text.strip():
        return None
    stage = (card.get("list_id") or "new").strip()
    try:
        if stage in ACTIVE_DEAL_STAGES:
            return {
                "classifier": "deliverable_tracker",
                "result": deliverable_track(email_text, _deal_spec(card)),
            }
        return {
            "classifier": "heartbeat",
            "result": heartbeat_classify(email_text, _thread_history(card)),
        }
    except Exception as exc:
        return {"classifier": "error", "error": str(exc)}


def enrich_analysis(card: dict, analysis: dict) -> dict:
    """Merge local classifier output into pipeline stage analysis."""
    verdict = classify_card(card)
    if not verdict or verdict.get("classifier") == "error":
        return analysis

    result = verdict.get("result") or {}
    analysis = dict(analysis)
    analysis["local_classifier"] = verdict["classifier"]
    analysis["local_verdict"] = result

    if verdict["classifier"] == "heartbeat":
        action = result.get("recommended_action")
        if action == "do-not-engage":
            analysis["stage"] = "dead-leads"
            analysis["reason"] = f"Local Heartbeat: scam ({result.get('reasoning', '')[:120]})"
            analysis["needs_reply"] = False
        elif action == "draft-and-flag":
            analysis["needs_reply"] = True
            opening = result.get("suggested_opening_line") or ""
            if opening:
                analysis["local_suggested_opening"] = opening
        elif action == "auto-draft" and result.get("suggested_opening_line"):
            analysis["local_suggested_opening"] = result["suggested_opening_line"]

    elif verdict["classifier"] == "deliverable_tracker":
        if result.get("recommended_action") == "fix-deliverable":
            analysis["needs_reply"] = True
            analysis["reply_type"] = "fulfillment-fix"
            holding = result.get("holding_reply_to_client") or ""
            if holding:
                analysis["local_holding_reply"] = holding
            robert_action = result.get("action_for_robert") or ""
            if robert_action:
                analysis["local_robert_action"] = robert_action

    return analysis