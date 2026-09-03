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

# Product mention alone is not a sponsorship lead — need an explicit money/collab ask.
PRODUCT_COMMERCIAL_SIGNALS = (
    "paid promo",
    "paid collaboration",
    "paid partnership",
    "paid post",
    "paid collab",
    "your rate",
    "share your rate",
    "rate card",
    "how much do you charge",
    "what do you charge",
    "what would you charge",
    "compensation",
    "sponsorship fee",
    "promotion fee",
    "budget for",
    "budget range",
    "pricing structure",
    "all-in rate",
    "quote and",
    "rates and availability",
    "share your pricing",
    "share your quote",
    "paid creator",
    "paid partnership tag",
    "sponsored post",
)

# Common X DMs that mention tech/products but are not paid collab / sponsorship leads.
NON_LEAD_SIGNALS = (
    "product hunt",
    "upvote on product hunt",
    "support with an upvote",
    "quick interview",
    "minute interview",
    "10-15 minute interview",
    "15 minute interview",
    "10 minute interview",
    "would love to meet",
    "meet up at",
    "meet at ces",
    "swing past sf",
    "network with",
    "networking event",
    "tips please",
    "would love to read",
    "interested in new art",
    "pleasure items",
    "monitoring how your visitors",
    "you're doing lead gen",
    "doing lead gen",
    "share their product",
    "talk to you and share",
    "would love to talk to you and share",
    "schedule a call",
    "jump on a call",
    "podcast guest",
    "guest on our podcast",
    "pick your brain",
    "pick our brain",
    "beta tester",
    "try our product",
    "check out our product",
    "feedback on our",
    "thought this may be helpful",
    "may be helpful",
    "great point",
    "that's a great point",
    "socialfi",
    "would appreciate to get your support",
    "launched on product hunt",
    "promoting it on your page for your ma",
    "need your help promoting",
    "condensing",
    "conducting interviews",
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

# Mass-DM scams — never treat as sponsorship even if leadType says Paid / Sponsorship.
SPAM_SIGNALS = (
    "trading signal",
    "profit potential",
    "limited elite invitation",
    "last chance:",
    "exclusive pass",
    "confidential trading",
    "elite trades daily",
    "strategic trades daily",
    "exact entry and exit",
    "us/eu traders",
    "secure your elite status",
    "bet channel",
    "bet-channel",
    "insider advantage",
    "hidden trading",
    "free membership",
    "claim your elite",
    "unlock hidden trading",
    "unlock confidential trading",
    "only 150 spots",
    "first 150",
    "crypto signal",
    "forex signal",
    "binary option",
    "student妹",
    "学生妹",
    "约炮",
    "上门",
    "onlyfans",
    "only fans",
    "fansly",
    "fanvue",
    "manyvids",
    "chaturbate",
    "custom vid",
    "custom video",
    "filthiest fantasy",
    "talk dirty",
    "subscribe to my",
    "preview link",
    "nsfw",
    "cam girl",
    "camgirl",
    "adult content",
    "explicit content",
    "blowjob",
    "throbbing cock",
    "thick cum",
    "whatsapp",
    "contact me via whatsapp",
    "via whatsapp",
    "portfolio goals",
    "risk tolerance",
    "one-on-one guidance",
    "one on one guidance",
    "stock trading",
    "find stocks",
    "traders are chasing",
    "market is constantly changing",
    "click the link",
    "financial guidance",
    "investment guidance",
    "trading strategy",
    "crypto trading",
    "forex trading",
    "claim your prize",
    "maga team",
    "maga sponsorship",
    "your account was selected",
    "selected to participate",
    "randomly selected",
    "brand new tesla car",
    "send a dm now",
    "tesla/ maga",
    "prize of $",
    "won a prize",
    "you have won",
    "you've won",
    "lottery winner",
    "giveaway winner",
    "remote basis with regular pay",
    "convenient work schedule",
    "complete a short form",
    "funding of $50k",
    "funding of $100k",
    "sonance: calls",
    "room: wintrack",
    "install the app from the app store",
    "venture investment company and we'd love to offer you collaborate",
    "remote job opportunity",
    "daily remuneration",
    "remuneration: $",
    "tiktok cross-border",
    "cross-border e-commerce merchants",
    "positive review rates",
    "enhancing the reputation and positive review",
    "advertisement is sent by x ai",
    "remote work available via mobile",
    "official amazon brand",
    "exclusive community of reviewers",
    "brand product experience officers",
    "free product trials and meet",
    "click the link to join the group",
)

DISQUALIFYING_CATEGORIES = {
    "general outreach",
    "intro / network",
    "payment / admin",
}


def _blob(*parts: Any) -> str:
    return re.sub(r"\s+", " ", " ".join(str(p or "") for p in parts)).lower().strip()


_BOUNDARY_SIGNALS = {"app", "api", "paid", "tool", "demo", "agent", "robot", "beta", "trial", "pilot"}


def has_signal(text: str, signals: tuple[str, ...]) -> bool:
    for signal in signals:
        if signal in _BOUNDARY_SIGNALS:
            if re.search(rf"(?<![a-z]){re.escape(signal)}(?![a-z])", text):
                return True
        elif signal in text:
            return True
    return False


def is_x_spam_text(*parts: Any) -> bool:
    text = _blob(*parts)
    if not text:
        return False
    return has_signal(text, SPAM_SIGNALS)


def is_non_lead_text(*parts: Any) -> bool:
    text = _blob(*parts)
    if not text:
        return False
    return has_signal(text, NON_LEAD_SIGNALS)


def has_commercial_intent(*parts: Any) -> bool:
    text = _blob(*parts)
    if not text:
        return False
    return has_signal(text, PARTNERSHIP_SIGNALS) or has_signal(text, PRODUCT_COMMERCIAL_SIGNALS)


def is_qualified_x_text(*parts: Any) -> bool:
    text = _blob(*parts)
    if not text:
        return False
    if is_x_spam_text(text):
        return False
    if is_non_lead_text(text):
        return False
    if has_signal(text, NOISE_SIGNALS) and not has_commercial_intent(text):
        return False
    # Product/platform mentions alone are not leads — require paid/collab language.
    return has_commercial_intent(text)


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
    if is_x_spam_text(last_message, description, title, summary):
        return False
    cat = str(category or lead_type or intent or "").strip()
    # Qualify from the actual DM body — not the auto-summary boilerplate
    # ("X is pitching a paid collaboration or sponsorship...").
    body = _blob(last_message, description, title)
    if len(body) < 24:
        summary_clean = re.sub(
            r"(?i)is pitching a paid collaboration or sponsorship[^.]*\.?",
            "",
            _blob(summary),
        )
        body = summary_clean or body
    if not body:
        body = _blob(summary)
    if str(cat).lower() in DISQUALIFYING_CATEGORIES:
        if not is_qualified_x_text(body):
            return False
    if is_qualified_x_category(cat):
        return is_qualified_x_text(body)
    if str(cat).lower() == "event / media":
        return is_qualified_x_text(body, cat)
    return is_qualified_x_text(body, cat)


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