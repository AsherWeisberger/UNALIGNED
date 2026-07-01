#!/usr/bin/env python3
"""Shared rules: X leads must be partnership, collab, or flippable product interest."""
from __future__ import annotations

import re
from typing import Any

QUALIFIED_CATEGORIES = {
    "paid / sponsorship",
    "product / demo",
}

PARTNERSHIP_SIGNALS = (
    "collab",
    "collaboration",
    "sponsor",
    "sponsorship",
    "partnership",
    "partner with",
    "paid post",
    "paid collab",
    "brand deal",
    "campaign",
    "ambassador",
    "affiliate",
    "rates",
    "pricing",
    "budget",
    "quote",
    "repost",
    "promote",
    "promotion package",
)

PRODUCT_SIGNALS = (
    "product",
    "platform",
    "startup",
    "demo",
    "launch",
    "tool",
    "agent",
    "robot",
    "framework",
    "software",
    "app",
    "saas",
    "api",
    "beta",
    "trial",
    "integrat",
    "use case",
    "customer",
    "pilot",
)

NOISE_SIGNALS = (
    "huge fan",
    "thanks for following",
    "good morning",
    "good night",
    "how are you",
    "any rts",
    "retweet",
    "impressions would be great",
    "quote tweet while tagging",
    "sent a post",
    "reacted ",
    "calendar invite",
    "linkedin",
    "podcast guest only",
    "just saying hi",
    "love your work",
    "big fan",
)

DISQUALIFYING_CATEGORIES = {
    "general outreach",
    "intro / network",
    "payment / admin",
}


def _blob(*parts: Any) -> str:
    return re.sub(r"\s+", " ", " ".join(str(p or "") for p in parts)).lower().strip()


def has_signal(text: str, signals: tuple[str, ...]) -> bool:
    return any(signal in text for signal in signals)


def is_qualified_x_text(*parts: Any) -> bool:
    text = _blob(*parts)
    if not text:
        return False
    if has_signal(text, NOISE_SIGNALS) and not (
        has_signal(text, PARTNERSHIP_SIGNALS) or has_signal(text, PRODUCT_SIGNALS)
    ):
        return False
    return has_signal(text, PARTNERSHIP_SIGNALS) or has_signal(text, PRODUCT_SIGNALS)


def is_qualified_x_category(category: Any) -> bool:
    return str(category or "").strip().lower() in QUALIFIED_CATEGORIES


def is_qualified_x_lead(
    *,
    category: Any = "",
    lead_type: Any = "",
    summary: Any = "",
    last_message: Any = "",
    intent: Any = "",
    description: Any = "",
    title: Any = "",
) -> bool:
    cat = str(category or lead_type or intent or "").strip()
    if str(cat).lower() in DISQUALIFYING_CATEGORIES:
        # Still allow if the message body is clearly partnership/product.
        if not is_qualified_x_text(summary, last_message, description, title):
            return False
    if is_qualified_x_category(cat):
        return True
    if str(cat).lower() == "event / media":
        return is_qualified_x_text(summary, last_message, description, title, cat)
    return is_qualified_x_text(summary, last_message, description, title, cat)


def is_qualified_intake_row(row: dict[str, Any]) -> bool:
    return is_qualified_x_lead(
        lead_type=row.get("leadType"),
        summary=row.get("summaryForTeam"),
        last_message=row.get("lastLeadMessage"),
    )


def is_qualified_master_row(row: dict[str, Any]) -> bool:
    return is_qualified_x_lead(
        category=row.get("Lead Type"),
        summary=row.get("Summary For Team"),
        last_message=row.get("Last Lead Message"),
    )


def is_qualified_card(card: dict[str, Any]) -> bool:
    desc = card.get("description")
    if isinstance(desc, dict):
        desc_text = " ".join(str(v) for v in desc.values())
    else:
        desc_text = str(desc or "")
    return is_qualified_x_lead(
        intent=card.get("intent"),
        summary=desc_text,
        last_message=desc_text,
        description=desc_text,
        title=card.get("title"),
    )