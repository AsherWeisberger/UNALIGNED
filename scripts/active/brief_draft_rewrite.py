"""Rewrite and polish brief drafts into copy-paste Robert posts."""

from __future__ import annotations

import re
from typing import Any

try:
    from robert_voice import robert_opener, score_robert_authenticity, strip_non_robert_phrases
except ImportError:
    from scripts.active.robert_voice import robert_opener, score_robert_authenticity, strip_non_robert_phrases


def _line(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def clean_draft_text(value: str) -> str:
    text = str(value or "").strip()
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def strip_hyphens_from_copy(value: str) -> str:
    return (
        str(value or "")
        .replace("—", ". ")
        .replace("–", ". ")
        .replace(" - ", ". ")
    )


CLIENT_BOILERPLATE_RE = re.compile(
    r"(?is)"
    r"(?:hi,?\s*welcome to try(?:\s+and\s+share)?[^.]*\.\s*)?"
    r"(?:we are now in private beta\.\s*)?"
    r"(?:please log in and use the beta code[^.]*\.\s*)?"
    r"(?:you will be among the first creators[^.]*\.\s*)?"
    r"(?:please keep everything confidential[^.]*\.\s*)?"
    r"(?:website:\s*https?://\S+\s*)?"
)


QUOTED_PROMPT_RE = re.compile(
    r'["\']?Create an AI product launch page for indie developers\.'
    r' The goal is to help users quickly understand the product value and apply for early access\.?["\']?',
    re.I,
)


def extract_demo_task_from_text(text: str) -> str:
    cleaned = clean_draft_text(text)
    if not cleaned:
        return ""
    match = re.search(
        r'(?is)example\s+prompt\s*:\s*["\']?(.+?)["\']?\s*$',
        cleaned,
    )
    if match:
        return _line(match.group(1)).strip(" \"'")
    if re.match(r"(?is)^example\s+prompt\b", cleaned):
        return re.sub(r'(?is)^example\s+prompt\s*:?\s*["\']?', "", cleaned).strip(" \"'")
    return ""


def sender_demo_story(payload: dict[str, Any]) -> str:
    """What Robert / Ash actually tested — Brief Maker dialogue box. Takes priority over Notion example prompts."""
    ctx = _line(payload.get("email_context"))
    if not ctx:
        return ""
    lowered = ctx.lower()
    if lowered.startswith("example prompt"):
        return ""
    if len(ctx) >= 24 and "example prompt" not in lowered:
        return ctx
    return ""


def sender_demo_lead(payload: dict[str, Any], *, variant: int = 0) -> str:
    """Turn sender-box notes into a Robert first line, not meta directions."""
    ctx = sender_demo_story(payload)
    if not ctx:
        return ""

    lowered = ctx.lower()
    # Heatwave / safety demo pattern from Brief Maker dialogue box.
    if "heatwave" in lowered or "heat wave" in lowered:
        leads = [
            "One prompt. Minutes later I had a heatwave safety app for my zip code. Full risk breakdown and how to stay safe in my area.",
            "I typed one sentence and got a finished heatwave guide for my zip code. Risks, context, and safety steps. Not a chatbot guessing.",
            "The demo that sold me was a heatwave app built in minutes. Drop in a zip code, get everything you need to understand risk and stay safe.",
        ]
        return leads[variant % len(leads)]

    # Strip meta framing ("the thread will be about", "we created as the example").
    cleaned = re.sub(r"(?i)^the thread will be about\s+", "", ctx)
    cleaned = re.sub(r"(?i)\s*that we created as the example for the posting\.?", "", cleaned)
    cleaned = re.sub(r"(?i)^we created\s+", "I built ", cleaned)
    cleaned = _line(cleaned)
    if not cleaned:
        return ""

    if "built within minutes" in lowered or "one prompt" in lowered:
        leads = [
            f"One prompt. Minutes later: {cleaned[0].lower() + cleaned[1:] if len(cleaned) > 1 else cleaned}",
            f"I ran one prompt and got a finished result. {cleaned}",
            f"What stood out in testing: {cleaned}",
        ]
        return leads[variant % len(leads)]

    first = cleaned.split(".")[0].strip()
    if first and not first.endswith("."):
        first = f"{first}."
    return first


def product_hook(payload: dict[str, Any]) -> str:
    for candidate in (
        _line(payload.get("core_idea")),
        _line(payload.get("about_company")),
        _line(payload.get("announcement")),
    ):
        if not candidate:
            continue
        short = candidate.split(".")[0].strip()
        if 20 <= len(short) <= 220 and not draft_looks_like_client_boilerplate(short):
            return short
    company = _line(payload.get("company_name")) or "This product"
    return f"{company} turns one prompt into a finished page you can ship."


def product_proof(payload: dict[str, Any]) -> str:
    how = _line(payload.get("how_it_works"))
    if how and not draft_looks_like_client_boilerplate(how):
        parts = [p.strip() for p in re.split(r"(?<=[.!?])\s+", how) if p.strip()]
        if parts:
            return parts[0] if parts[0].endswith(".") else f"{parts[0]}."
    core = _line(payload.get("core_idea"))
    if core:
        parts = [p.strip() for p in re.split(r"(?<=[.!?])\s+", core) if p.strip()]
        if len(parts) >= 2:
            return parts[1] if parts[1].endswith(".") else f"{parts[1]}."
    return ""


def draft_looks_like_client_boilerplate(text: str) -> bool:
    lowered = _line(text).lower()
    if not lowered:
        return False
    markers = (
        "hi, welcome to try",
        "welcome to try and share",
        "private beta",
        "beta code we provide",
        "early product ambassadors",
        "keep everything confidential",
        "please log in and use",
        "goal to team to result",
        "300+ design skills",
        "design agent team workspace. it is not just another prompt",
    )
    return any(marker in lowered for marker in markers)


def draft_looks_instructional(text: str) -> bool:
    lowered = clean_draft_text(text).lower()
    if not lowered:
        return True
    if "example prompt" in lowered:
        return True
    if QUOTED_PROMPT_RE.search(text):
        return True
    instruction_markers = (
        "workflow walkthrough",
        "expand the hook",
        "your real workflow",
        "show a screen recording",
        "add your proof",
        "pick one in the verify",
        "nothing goes live until",
    )
    return any(marker in lowered for marker in instruction_markers)


def draft_needs_quality_polish(text: str) -> bool:
    if not _line(text):
        return True
    if draft_looks_instructional(text):
        return True
    if draft_looks_like_client_boilerplate(text):
        return True
    if QUOTED_PROMPT_RE.search(text):
        return True
    if re.search(r'could\s+["\']?Create an AI product', text, re.I):
        return True
    if len(_line(text)) > 420:
        return True
    if text.lower().count("ojo is the first design agent") >= 2:
        return True
    if "reply 1:" in text.lower() and "main post:" in text.lower():
        # Inline reply labels = broken formatting
        if re.search(r"(?is)main post:.*reply\s+1:", text):
            return True
    return False


def strip_pollution(text: str) -> str:
    out = clean_draft_text(text)
    out = CLIENT_BOILERPLATE_RE.sub("", out)
    out = QUOTED_PROMPT_RE.sub("", out)
    out = re.sub(r'(?is)\bexample\s+prompt\s*:\s*', "", out)
    out = re.sub(r'["\']Create an AI product launch page[^"\']*["\']', "", out, flags=re.I)
    out = re.sub(r"\s+", " ", out).strip()
    out = re.sub(r"\.{2,}", ".", out)
    return out.strip()


def normalize_thread_sections_text(text: str) -> str:
    out = clean_draft_text(text)
    out = re.sub(r"(?im)\s*(Main post:|Reply\s+\d+:)\s*", r"\n\n\1\n", out)
    out = re.sub(r"\n{3,}", "\n\n", out).strip()
    return out


def parse_thread_sections(text: str) -> dict[str, str]:
    normalized = normalize_thread_sections_text(text)
    sections: dict[str, str] = {}
    current_key = "body"
    buffer: list[str] = []
    for raw in normalized.splitlines():
        row = raw.strip()
        if re.match(r"(?i)^Main post:\s*$", row):
            if buffer:
                sections[current_key] = " ".join(buffer).strip()
            current_key = "main"
            buffer = []
            continue
        match = re.match(r"(?i)^Reply\s+(\d+):\s*$", row)
        if match:
            if buffer:
                sections[current_key] = " ".join(buffer).strip()
            current_key = f"reply_{match.group(1)}"
            buffer = []
            continue
        inline_main = re.match(r"(?i)^Main post:\s*(.+)$", row)
        if inline_main:
            if buffer:
                sections[current_key] = " ".join(buffer).strip()
            current_key = "main"
            buffer = [inline_main.group(1).strip()]
            continue
        inline_reply = re.match(r"(?i)^Reply\s+(\d+):\s*(.+)$", row)
        if inline_reply:
            if buffer:
                sections[current_key] = " ".join(buffer).strip()
            current_key = f"reply_{inline_reply.group(1)}"
            buffer = [inline_reply.group(2).strip()]
            continue
        if row:
            buffer.append(row)
    if buffer:
        sections[current_key] = " ".join(buffer).strip()
    return sections


def format_thread_draft(main: str, reply_one: str, reply_two: str) -> str:
    parts: list[str] = []
    if _line(main):
        parts.append(f"Main post:\n{_line(main)}")
    if _line(reply_one):
        parts.append(f"Reply 1:\n{_line(reply_one)}")
    if _line(reply_two):
        parts.append(f"Reply 2:\n{_line(reply_two)}")
    return "\n\n".join(parts).strip()


def _draft_footer(payload: dict[str, Any], *, for_reply: bool = False) -> str:
    must = payload.get("must_include") or {}
    constraints = payload.get("agency_constraints") or {}
    tag = _line(must.get("tag"))
    link = _line(must.get("link"))
    hashtags = _line(must.get("hashtags"))
    if for_reply and link:
        return f"Link: {link}"
    parts = [part for part in (tag, hashtags) if part]
    footer = " ".join(parts).strip()
    if link and not constraints.get("no_urls_in_copy") and not for_reply:
        footer = f"{footer} {link}".strip() if footer else link
    return footer


def compose_strategic_thread(payload: dict[str, Any], *, variant: int = 0) -> str:
    company = _line(payload.get("company_name")) or "This tool"
    demo = sender_demo_story(payload)
    hook = product_hook(payload)
    proof = product_proof(payload)
    aligned = _line(payload.get("why_alignednews")) or (
        "That is the infrastructure story I keep unpacking at AlignedNews.com."
    )
    tag_footer = _draft_footer(payload)
    link = _line((payload.get("must_include") or {}).get("link"))

    demo_lead = sender_demo_lead(payload, variant=variant)
    if demo_lead:
        mains = [
            demo_lead,
            sender_demo_lead(payload, variant=(variant + 1) % 3),
            sender_demo_lead(payload, variant=(variant + 2) % 3),
        ]
        replies_one = [
            proof or hook,
            f"{company} is not another prompt to mockup tool. {proof or hook}",
            hook,
        ]
    else:
        short_topic = company or "AI"
        mains = [
            robert_opener(variant=variant, brand=company, topic=short_topic, artifact="launch page"),
            robert_opener(variant=variant + 1, brand=company, topic=short_topic, artifact="launch page"),
            robert_opener(variant=variant + 2, brand=company, topic=short_topic, artifact="demo page"),
        ]
        # Keep product-specific fallbacks when voice openers are too generic.
        mains = [
            m if len(m) >= 40 else (
                f"One prompt. Minutes later I had a finished launch page, not a chat thread I still had to stitch together. {company} ships the whole page."
                if idx == 0 else
                f"Most design AI stops at a screenshot. I asked {company} for a full launch page and got value prop, flow, and early access in one pass."
                if idx == 1 else
                f"{hook} I built the demo page myself in one sitting to see if the workflow is real."
            )
            for idx, m in enumerate(mains)
        ]
        replies_one = [
            proof or f"{company} runs as a design agent workspace on an infinite canvas, not a one shot image generator.",
            proof or hook,
            hook,
        ]

    replies_two = [
        f"{aligned} {tag_footer}".strip(),
        f"What I like here is the finished page, not the prompt. {aligned}",
        f"Try it: {link}" if link else aligned,
    ]

    main = strip_non_robert_phrases(strip_pollution(strip_hyphens_from_copy(mains[variant % len(mains)])))
    reply_one = strip_pollution(strip_hyphens_from_copy(replies_one[variant % len(replies_one)]))
    reply_two = strip_pollution(strip_hyphens_from_copy(replies_two[variant % len(replies_two)]))

    constraints = payload.get("agency_constraints") or {}
    if constraints.get("no_urls_in_copy") and link:
        reply_two = f"Link in reply: {link}"

    return format_thread_draft(main, reply_one, reply_two)


def compose_strategic_standalone(payload: dict[str, Any], *, variant: int = 0) -> str:
    thread = compose_strategic_thread(payload, variant=variant)
    sections = parse_thread_sections(thread)
    main = sections.get("main", "")
    footer = _draft_footer(payload)
    body = main
    if footer and footer.lower() not in body.lower():
        body = f"{body}\n\n{footer}".strip()
    return clean_draft_text(body)


def polish_draft_text(text: str, payload: dict[str, Any], *, variant: int = 0) -> str:
    deliverable = _line(payload.get("deliverable_type")).lower()
    is_thread = "thread" in deliverable or re.search(r"(?im)^Main post:\s*", text or "")

    if draft_needs_quality_polish(text):
        if is_thread:
            return compose_strategic_thread(payload, variant=variant)
        return compose_strategic_standalone(payload, variant=variant)

    sections = parse_thread_sections(text)
    if sections.get("main") or sections.get("reply_1"):
        main = strip_pollution(sections.get("main", ""))
        reply_one = strip_pollution(sections.get("reply_1", ""))
        reply_two = strip_pollution(sections.get("reply_2", ""))
        if lead := sender_demo_lead(payload, variant=variant):
            if draft_needs_quality_polish(main) or QUOTED_PROMPT_RE.search(main):
                main = lead
        if draft_looks_like_client_boilerplate(reply_one):
            reply_one = product_proof(payload) or product_hook(payload)
        if draft_looks_instructional(reply_two):
            reply_two = _line(payload.get("why_alignednews")) or _draft_footer(payload, for_reply=True)
        return format_thread_draft(main, reply_one, reply_two)

    out = strip_pollution(strip_hyphens_from_copy(text))
    if demo := sender_demo_story(payload):
        if draft_needs_quality_polish(out):
            return compose_strategic_standalone(payload, variant=variant)
    return clean_draft_text(out)


def build_fallback_robert_drafts(payload: dict[str, Any]) -> list[dict[str, str]]:
    deliverable = _line(payload.get("deliverable_type")).lower()
    is_thread = "thread" in deliverable
    labels = [
        "Option 1. Recommended",
        "Option 2. Technical angle",
        "Option 3. Market angle",
    ]
    out: list[dict[str, str]] = []
    for idx, label in enumerate(labels):
        text = (
            compose_strategic_thread(payload, variant=idx)
            if is_thread
            else compose_strategic_standalone(payload, variant=idx)
        )
        voice = score_robert_authenticity(text)
        out.append({
            "label": label,
            "text": strip_non_robert_phrases(text),
            "robert_voice_score": voice.get("score"),
            "robert_voice_tier": voice.get("tier"),
            "robert_tonality": voice.get("tonality"),
        })
    return out


def ensure_publishable_drafts(payload: dict[str, Any]) -> dict[str, Any]:
    merged = dict(payload)
    drafts = [item for item in (merged.get("drafts") or []) if isinstance(item, dict)]
    if not drafts:
        merged["drafts"] = build_fallback_robert_drafts(merged)
        merged["drafts_source"] = "strategic_rewrite"
        return merged

    polished: list[dict[str, str]] = []
    for idx, draft in enumerate(drafts[:3]):
        text = polish_draft_text(_line(draft.get("text")), merged, variant=idx)
        if not text:
            continue
        voice = score_robert_authenticity(text)
        polished.append(
            {
                "label": _line(draft.get("label")) or f"Option {idx + 1}",
                "text": strip_non_robert_phrases(text),
                "robert_voice_score": voice.get("score"),
                "robert_voice_tier": voice.get("tier"),
                "robert_tonality": voice.get("tonality"),
                **{
                    key: draft[key]
                    for key in ("reach_score", "reach_tier", "reach_reason", "anchor")
                    if draft.get(key) not in (None, "")
                },
            }
        )

    if len(polished) < 2:
        polished = build_fallback_robert_drafts(merged)

    merged["drafts"] = polished[:3]
    merged["drafts_source"] = "strategic_rewrite"
    return merged