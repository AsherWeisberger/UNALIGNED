"""Shared denylist for leads that should never enter UNALIGNED lists."""

from __future__ import annotations

import re

BLOCKED_CONTACTS = frozenset({
    "boardy@boardy.ai",
})

BLOCKED_DOMAINS = frozenset({
    "boardy.ai",
})

# Whole-word / prefix brand matches (lowercase)
BLOCKED_IDENTITY_PATTERNS = (
    re.compile(r"^boardy\b", re.I),
    re.compile(r"\bboardy\s*ai\b", re.I),
    re.compile(r"\bboardy\s*boardman\b", re.I),
)

BLOCKED_X_USERNAMES = frozenset({
    "boardy",
    "boardyai",
    "boardy_ai",
})


def _norm_email(value: str) -> str:
    return str(value or "").strip().lower()


def _domain_for(email: str) -> str:
    email = _norm_email(email)
    return email.split("@", 1)[1] if "@" in email else ""


def is_blocked_email(email: str) -> bool:
    addr = _norm_email(email)
    if not addr:
        return False
    if addr in BLOCKED_CONTACTS:
        return True
    domain = _domain_for(addr)
    return domain in BLOCKED_DOMAINS or any(
        domain == blocked.split("@", 1)[1]
        for blocked in BLOCKED_CONTACTS
        if "@" in blocked
    )


def is_blocked_identity(*values: str) -> bool:
    for raw in values:
        text = str(raw or "").strip()
        if not text:
            continue
        if any(pat.search(text) for pat in BLOCKED_IDENTITY_PATTERNS):
            return True
        handle = text.lstrip("@").lower()
        if handle in BLOCKED_X_USERNAMES:
            return True
    return False


def is_blocked_lead(
    *,
    email: str = "",
    contact_name: str = "",
    business_name: str = "",
    title: str = "",
    brand: str = "",
    x_username: str = "",
    x_name: str = "",
    thread_text: str = "",
) -> bool:
    if is_blocked_email(email):
        return True
    if is_blocked_identity(contact_name, business_name, title, brand, x_name, x_username):
        return True
    lowered = str(thread_text or "").lower()
    if "boardy@boardy.ai" in lowered or "@boardy.ai" in lowered:
        return True
    return False


def is_blocked_card(card: dict) -> bool:
    if not isinstance(card, dict):
        return False
    thread = card.get("email_thread") or []
    if isinstance(thread, str):
        thread_text = thread
    elif isinstance(thread, list):
        parts = []
        for msg in thread:
            if isinstance(msg, dict):
                parts.extend([
                    str(msg.get("from") or ""),
                    str(msg.get("subject") or ""),
                    str(msg.get("body") or ""),
                ])
        thread_text = " ".join(parts)
    else:
        thread_text = ""

    return is_blocked_lead(
        email=str(card.get("email") or card.get("original_email") or ""),
        contact_name=str(card.get("contact_name") or ""),
        business_name=str(card.get("business_name") or ""),
        title=str(card.get("title") or ""),
        brand=str(card.get("business_name") or card.get("title") or ""),
        thread_text=thread_text,
    )