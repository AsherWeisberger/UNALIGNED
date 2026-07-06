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

AM_HANDOFF_MARKERS = (
    "please take some time to review",
    "review it carefully",
    "review carefully",
    "talking points",
    "ways to angle",
    "way to angle",
    "creator brief",
    "attached brief",
    "sharing the brief",
    "here is the brief",
    "here's the brief",
    "let me know if you have any questions",
    "when you get a chance",
    "for your review",
    "take a look at",
    "wanted to share",
    "please find attached",
    "brief for robert",
    "build the brief",
    "build a brief",
    "forwarding this",
    "passing along",
    "see attached",
)

DEMO_STORY_MARKERS = (
    "heatwave",
    "heat wave",
    "one prompt",
    "built within minutes",
    "the thread will be about",
    "we created as the example",
    "example for the posting",
    "i built ",
    "i ran one prompt",
    "the demo that",
    "zip code",
    "launch page",
    "finished page",
)


ROBERT_TEMPLATE_OPENERS = (
    "being at the launch of",
    "the guy who started",
    "everyone is sharing",
    "i hate myself for saying this",
    "i tested ",
    "one prompt. minutes later",
)


def infer_negotiation_stage(text: str) -> bool:
    """Price/rates thread with interest but no confirmed deliverable format yet."""
    lowered = _line(text).lower()
    if not lowered:
        return False
    has_price_signal = any(
        phrase in lowered
        for phrase in (
            "pricing",
            "rates",
            "rate card",
            "how much",
            "price",
            "budget",
            "move forward",
            "move foward",
            "would like to move",
            "interested",
            "process payment",
            "send an invoice",
            "payment cleared",
        )
    )
    has_deliverable = bool(_infer_deliverable_hint_from_email(text))
    has_campaign_brief = any(
        phrase in lowered
        for phrase in (
            "creator brief",
            "suggested angles",
            "looking for a qrt",
            "qrt + comment",
            "quote tweet",
            "dedicated thread",
            "we need a",
            "we're looking for",
            "we are looking for",
            "post on wednesday",
            "viral quote post",
        )
    )
    return has_price_signal and not has_deliverable and not has_campaign_brief


def robert_eyewitness_allowed(payload: dict[str, Any]) -> bool:
    if sender_demo_story(payload):
        return True
    haystack = " ".join(
        [
            _line(payload.get("source_text")),
            _line(payload.get("email_context")),
            _line((payload.get("sender_intelligence") or {}).get("demo_story")),
        ]
    ).lower()
    proof_markers = (
        "i tested",
        "i built",
        "robert tested",
        "robert built",
        "was at the launch",
        "attended the launch",
        "sat in the",
        "watched the demo",
        "field test",
        "one prompt. minutes later",
    )
    return any(marker in haystack for marker in proof_markers)


def robert_name_drop_allowed(payload: dict[str, Any]) -> bool:
    haystack = " ".join(
        [
            _line(payload.get("source_text")),
            _line(payload.get("email_context")),
        ]
    ).lower()
    return any(
        marker in haystack
        for marker in (
            "founder",
            "co-founder",
            "started it",
            "he worked on",
            "she worked on",
            "the guy who",
            "the team behind",
        )
    )


def draft_uses_robert_template(text: str) -> bool:
    lowered = _line(text).lower()
    if not lowered:
        return False
    return any(marker in lowered for marker in ROBERT_TEMPLATE_OPENERS)


def compose_campaign_angle_standalone_drafts(payload: dict[str, Any]) -> list[dict[str, str]]:
    """Prefer creator-brief angles over generic Robert voice templates."""
    angles = payload.get("campaign_angles") or []
    if not angles:
        return []
    must = payload.get("must_include") or {}
    tag = _line(must.get("tag"))
    hashtags = _line(must.get("hashtags"))
    link = _line(must.get("link"))
    footer = " ".join(part for part in (tag, hashtags, link) if part).strip()
    labels = [
        "Option 1. Recommended",
        "Option 2. Technical angle",
        "Option 3. Market angle",
    ]
    out: list[dict[str, str]] = []
    for idx, angle in enumerate(angles[:3]):
        if not isinstance(angle, dict):
            continue
        hook = _line(angle.get("hook")) or _line(angle.get("title"))
        examples = [ _line(item) for item in (angle.get("examples") or []) if _line(item) ]
        body = hook
        for example in examples:
            if len(example) >= 40 and not draft_looks_instructional(example):
                body = example
                break
        if not body or draft_looks_instructional(body):
            continue
        if footer and footer.lower() not in body.lower():
            body = f"{body} {footer}".strip()
        voice = score_robert_authenticity(body)
        out.append(
            {
                "label": labels[idx] if idx < len(labels) else f"Option {idx + 1}",
                "text": strip_non_robert_phrases(clean_draft_text(body)),
                "brief_angle": angle.get("number"),
                "robert_voice_score": voice.get("score"),
                "robert_voice_tier": voice.get("tier"),
                "robert_tonality": voice.get("tonality"),
            }
        )
    return out


def _infer_deliverable_hint_from_email(text: str) -> str:
    lowered = _line(text).lower()
    if not lowered:
        return ""
    if re.search(r"quote[\s\-]?tweet|quote[\s\-]?repost|\bqrt\b", lowered):
        return "Quote repost"
    if re.search(r"\bretweet\b", lowered) and not re.search(r"no retweets?", lowered):
        return "Retweet"
    if re.search(r"\brepost\b", lowered) and not re.search(r"no reposts?", lowered):
        return "Quote repost"
    if "narrative thread" in lowered or "dedicated thread" in lowered:
        return "Dedicated thread"
    if re.search(r"\bthread\b", lowered) and "no thread" not in lowered:
        return "Dedicated thread"
    if "custom x post" in lowered or "custom post" in lowered:
        return "Custom post"
    if "linkedin" in lowered:
        return "LinkedIn post"
    if "founder video" in lowered:
        return "Founder Video Post"
    if "x space" in lowered:
        return "X Space (live)"
    if re.search(r"\binterview\b", lowered):
        return "Interview"
    return ""


def _email_sentence_is_meta(sentence: str) -> bool:
    lowered = _line(sentence).lower()
    if not lowered:
        return True
    return any(marker in lowered for marker in AM_HANDOFF_MARKERS)


def parse_sender_email_intelligence(text: str) -> dict[str, Any]:
    """Extract brief-building signals from client AM emails addressed to Ash."""
    raw = clean_draft_text(text)
    if not raw:
        return {}

    lowered = raw.lower()
    urls = re.findall(r"https?://[^\s)>\]]+", raw)
    anchor_post = next(
        (url for url in urls if "x.com" in url.lower() or "twitter.com" in url.lower()),
        "",
    )
    site_link = next(
        (
            url
            for url in urls
            if "x.com" not in url.lower()
            and "twitter.com" not in url.lower()
            and "notion" not in url.lower()
            and "docs.google.com" not in url.lower()
        ),
        "",
    )

    go_live = ""
    for pattern in (
        r"(?i)(?:go[\s-]?live|posting window|post on|publish(?:ing)?|live on|scheduled for|launch(?:ing)? on)[:\s]+([^\n.]{4,100})",
        r"(?i)(?:target date|post date)[:\s]+([^\n.]{4,100})",
    ):
        match = re.search(pattern, raw)
        if match:
            go_live = _line(match.group(1))
            break

    angles: list[str] = []
    if any(marker in lowered for marker in AM_HANDOFF_MARKERS):
        angles = []
    elif "talking points" in lowered:
        tail = re.split(r"(?i)talking points[:\s]*", raw, maxsplit=1)
        if len(tail) > 1:
            section = re.split(r"(?i)(?:let me know|best,|thanks,|regards,|cheers,)", tail[1])[0]
            for row in section.splitlines():
                cleaned = re.sub(r"^[\s\-•*]+", "", row).strip()
                cleaned = re.sub(r"^\d+[\).\]]\s*", "", cleaned).strip()
                if cleaned and len(cleaned) > 12 and not _email_sentence_is_meta(cleaned):
                    angles.append(cleaned)
    if "ways to angle" in lowered or "way to angle" in lowered:
        tail = re.split(r"(?i)ways?\s+to\s+angle[^:]*:?", raw, maxsplit=1)
        if len(tail) > 1:
            section = re.split(r"(?i)(?:let me know|best,|thanks,|regards,)", tail[1])[0]
            for row in section.splitlines():
                cleaned = re.sub(r"^[\s\-•*]+", "", row).strip()
                if cleaned and len(cleaned) > 12 and not _email_sentence_is_meta(cleaned):
                    angles.append(cleaned)

    demo_story = ""
    if any(marker in lowered for marker in DEMO_STORY_MARKERS):
        thread_match = re.search(r"(?i)the thread will be about\s+(.+?)(?:\.|$)", raw)
        if thread_match:
            demo_story = _line(thread_match.group(1))
        if not demo_story:
            for sentence in re.split(r"(?<=[.!?])\s+", raw):
                sentence_lower = sentence.lower()
                if any(marker in sentence_lower for marker in DEMO_STORY_MARKERS) and not _email_sentence_is_meta(sentence):
                    demo_story = _line(sentence)
                    break

    tone_notes: list[str] = []
    for pattern in (
        r"(?i)(?:tone|style|voice)[:\s]+([^\n.]{8,140})",
        r"(?i)(?:keep it|write it|should feel)\s+([^\n.]{8,140})",
    ):
        match = re.search(pattern, raw)
        if match:
            note = _line(match.group(1))
            if note and not _email_sentence_is_meta(note):
                tone_notes.append(note)

    deduped_angles: list[str] = []
    seen_angles: set[str] = set()
    for angle in angles:
        key = angle.lower()
        if key in seen_angles:
            continue
        seen_angles.add(key)
        deduped_angles.append(angle)

    if "suggested angles" in lowered or "creator brief" in lowered:
        for row in raw.splitlines():
            cleaned = re.sub(r"^[\s\-•*]+", "", row).strip()
            if cleaned and len(cleaned) > 12 and not _email_sentence_is_meta(cleaned):
                if cleaned.lower() not in {angle.lower() for angle in deduped_angles}:
                    deduped_angles.append(cleaned)

    return {
        "is_am_handoff": any(marker in lowered for marker in AM_HANDOFF_MARKERS),
        "demo_story": demo_story,
        "angles": deduped_angles[:6],
        "anchor_post": anchor_post,
        "site_link": site_link,
        "go_live": go_live,
        "deliverable_hint": _infer_deliverable_hint_from_email(raw),
        "negotiation_stage": infer_negotiation_stage(raw),
        "doc_has_suggested_angles": "suggested angles" in lowered or "creator brief" in lowered,
        "tone_notes": tone_notes[:4],
    }


def format_sender_intel_for_prompt(intel: dict[str, Any]) -> str:
    if not intel:
        return ""
    lines: list[str] = []
    if intel.get("is_am_handoff"):
        lines.append(
            "This email is addressed to the account manager, not Robert. "
            "Use it for logistics, deliverable signals, anchor links, timing, and talking points. "
            "Never paste review requests or scheduling language into Robert's draft posts."
        )
    if intel.get("deliverable_hint"):
        lines.append(f"Deliverable signal: {intel['deliverable_hint']}")
    if intel.get("negotiation_stage"):
        lines.append(
            "Negotiation stage: client confirmed interest but deliverable format is not locked yet. "
            "Do not invent QRT/thread/standalone. Use creator-brief angles when present."
        )
    if intel.get("doc_has_suggested_angles"):
        lines.append("Creator brief includes suggested angles — lead drafts from those, not generic templates.")
    if intel.get("anchor_post"):
        lines.append(f"Anchor post to quote: {intel['anchor_post']}")
    if intel.get("go_live"):
        lines.append(f"Timing: {intel['go_live']}")
    if intel.get("demo_story"):
        lines.append(f"Robert demo story (lead drafts with this when real): {intel['demo_story']}")
    for angle in intel.get("angles") or []:
        lines.append(f"Talking point: {angle}")
    for note in intel.get("tone_notes") or []:
        lines.append(f"Tone note: {note}")
    return "\n".join(lines)


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
    """What Robert actually tested — only real demo narratives, never AM handoff boilerplate."""
    intel = payload.get("sender_intelligence") or {}
    demo = _line(intel.get("demo_story"))
    if demo:
        return demo

    ctx = _line(payload.get("email_context"))
    if not ctx:
        return ""

    parsed = parse_sender_email_intelligence(ctx)
    demo = _line(parsed.get("demo_story"))
    if demo:
        return demo

    lowered = ctx.lower()
    if lowered.startswith("example prompt"):
        return ""
    if parsed.get("is_am_handoff"):
        return ""
    if len(ctx) >= 24 and "example prompt" not in lowered and any(marker in lowered for marker in DEMO_STORY_MARKERS):
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
        "please take some time to review",
        "review it carefully",
        "review carefully",
        "especially the talking points",
        "talking points",
        "ways to angle",
        "way to angle",
        "creator brief",
        "attached brief",
        "let me know if you have any questions",
        "when you get a chance",
        "for your review",
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
        eyewitness = robert_eyewitness_allowed(payload)
        name_drop = robert_name_drop_allowed(payload)
        mains = [
            robert_opener(
                variant=variant,
                brand=company,
                topic=short_topic,
                artifact="launch page",
                allow_eyewitness=eyewitness,
                allow_name_drop=name_drop,
            ),
            robert_opener(
                variant=variant + 1,
                brand=company,
                topic=short_topic,
                artifact="launch page",
                allow_eyewitness=eyewitness,
                allow_name_drop=name_drop,
            ),
            robert_opener(
                variant=variant + 2,
                brand=company,
                topic=short_topic,
                artifact="demo page",
                allow_eyewitness=eyewitness,
                allow_name_drop=name_drop,
            ),
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


def _deliverable_is_thread(deliverable: str) -> bool:
    lowered = deliverable.lower()
    return "thread" in lowered and "quote" not in lowered and "retweet" not in lowered


def _deliverable_is_quote_repost(deliverable: str) -> bool:
    lowered = deliverable.lower()
    return "quote" in lowered or "qrt" in lowered


def _alignednews_closer(payload: dict[str, Any]) -> str:
    raw = _line(payload.get("why_alignednews"))
    if raw:
        raw = re.sub(r"AlignedNews\.com", "AlignedNews", raw, flags=re.I)
        raw = re.sub(r"alignednews\.com", "AlignedNews", raw, flags=re.I)
        if "alignednews" in raw.lower():
            return raw
    return "That is the bigger AI story I track at AlignedNews."


def _trim_qrt_copy(text: str, *, max_chars: int = 270) -> str:
    out = clean_draft_text(text)
    if len(out) <= max_chars:
        return out
    trimmed = out[:max_chars].rsplit(" ", 1)[0].strip()
    if trimmed and not trimmed.endswith((".", "!", "?")):
        trimmed += "."
    return trimmed


def compose_quote_repost_line(payload: dict[str, Any], *, variant: int = 0) -> str:
    """One short QRT reaction — not a narrative thread."""
    company = _line(payload.get("company_name")) or "This product"
    core = _line(payload.get("core_idea"))
    hook = product_hook(payload)
    proof = product_proof(payload)
    aligned = _alignednews_closer(payload)
    footer = _draft_footer(payload)
    bodies = [
        f"Team mode for AI agents is the shift. {company} makes that feel real in daily work. {aligned}",
        f"What caught my eye: agents hand work to each other instead of one long chat thread. {aligned}",
        f"The category move is assistant to team, not a bigger single prompt. {aligned}",
    ]
    body = strip_non_robert_phrases(
        strip_pollution(strip_hyphens_from_copy(bodies[variant % len(bodies)]))
    )
    tag = _line((payload.get("must_include") or {}).get("tag"))
    if tag and tag.lower() not in body.lower():
        body = f"{body} {tag}".strip()
    elif footer and footer.lower() not in body.lower():
        body = f"{body} {footer}".strip()
    return _trim_qrt_copy(body)


def compose_quote_repost_drafts(payload: dict[str, Any]) -> list[dict[str, str]]:
    labels = [
        "Option 1. Recommended",
        "Option 2. Technical angle",
        "Option 3. Market angle",
    ]
    out: list[dict[str, str]] = []
    for idx, label in enumerate(labels):
        text = compose_quote_repost_line(payload, variant=idx)
        voice = score_robert_authenticity(text)
        out.append({
            "label": label,
            "text": text,
            "robert_voice_score": voice.get("score"),
            "robert_voice_tier": voice.get("tier"),
            "robert_tonality": voice.get("tonality"),
        })
    return out


def compose_retweet_drafts(payload: dict[str, Any]) -> list[dict[str, str]]:
    intel = payload.get("sender_intelligence") or {}
    anchor = _line(intel.get("anchor_post"))
    where = payload.get("where_it_lives") or []
    if not anchor:
        for row in where:
            if isinstance(row, (list, tuple)) and len(row) >= 2:
                if re.search(r"quote|qrt|retweet|anchor|post to", _line(row[0]), re.I):
                    anchor = _line(row[1])
                    break
    anchor_note = f"Anchor: {anchor}" if anchor else "Use the anchor post listed in logistics."
    return [{
        "label": "Retweet instructions",
        "text": (
            "1. Open the anchor post in logistics.\n"
            "2. Retweet it (no quote commentary needed).\n"
            f"3. Confirm live: {anchor_note}"
        ).strip(),
    }]


def rebuild_drafts_for_deliverable(payload: dict[str, Any]) -> dict[str, Any]:
    merged = dict(payload)
    if merged.get("negotiation_stage"):
        angle_drafts = compose_campaign_angle_standalone_drafts(merged)
        if len(angle_drafts) >= 2:
            merged["drafts"] = angle_drafts
            merged["drafts_source"] = "campaign_angles"
            merged["post_format"] = "custom_post"
            merged["max_thread_replies"] = 0
            return merged
    deliverable = _line(merged.get("deliverable_type"))
    if not deliverable:
        angle_drafts = compose_campaign_angle_standalone_drafts(merged)
        if len(angle_drafts) >= 2:
            merged["drafts"] = angle_drafts
            merged["drafts_source"] = "campaign_angles"
            return merged
        return merged
    lowered = deliverable.lower()
    if _deliverable_is_quote_repost(lowered):
        merged["drafts"] = compose_quote_repost_drafts(merged)
        merged["post_format"] = "quote_repost"
        merged["max_thread_replies"] = 0
        merged["drafts_source"] = "deliverable_rebuild"
    elif "retweet" in lowered:
        merged["drafts"] = compose_retweet_drafts(merged)
        merged["post_format"] = "retweet"
        merged["max_thread_replies"] = 0
        merged["drafts_source"] = "deliverable_rebuild"
    elif _deliverable_is_thread(lowered):
        merged["drafts"] = build_fallback_robert_drafts(merged)
        merged["post_format"] = "narrative_thread"
        merged["drafts_source"] = "deliverable_rebuild"
    else:
        merged["drafts"] = build_fallback_robert_drafts(merged)
        merged["post_format"] = "custom_post"
        merged["max_thread_replies"] = 0
        merged["drafts_source"] = "deliverable_rebuild"
    return merged


def polish_draft_text(text: str, payload: dict[str, Any], *, variant: int = 0) -> str:
    deliverable = _line(payload.get("deliverable_type")).lower()
    is_thread = _deliverable_is_thread(deliverable)
    is_quote = _deliverable_is_quote_repost(deliverable)

    if draft_needs_quality_polish(text):
        if is_quote:
            return compose_quote_repost_line(payload, variant=variant)
        if is_thread:
            return compose_strategic_thread(payload, variant=variant)
        return compose_strategic_standalone(payload, variant=variant)

    sections = parse_thread_sections(text)
    if sections.get("main") or sections.get("reply_1"):
        if is_quote:
            return compose_quote_repost_line(payload, variant=variant)
        if not is_thread:
            return compose_strategic_standalone(payload, variant=variant)
        main = strip_pollution(sections.get("main", ""))
        reply_one = strip_pollution(sections.get("reply_1", ""))
        reply_two = strip_pollution(sections.get("reply_2", ""))
        if draft_needs_quality_polish(main) or QUOTED_PROMPT_RE.search(main):
            if lead := sender_demo_lead(payload, variant=variant):
                main = lead
            else:
                return compose_strategic_thread(payload, variant=variant)
        if draft_looks_like_client_boilerplate(reply_one):
            reply_one = product_proof(payload) or product_hook(payload)
        if draft_looks_instructional(reply_two):
            reply_two = _line(payload.get("why_alignednews")) or _draft_footer(payload, for_reply=True)
        return format_thread_draft(main, reply_one, reply_two)

    out = strip_pollution(strip_hyphens_from_copy(text))
    if draft_needs_quality_polish(out):
        if is_quote:
            return compose_quote_repost_line(payload, variant=variant)
        return compose_strategic_standalone(payload, variant=variant)
    return clean_draft_text(out)


def build_fallback_robert_drafts(payload: dict[str, Any]) -> list[dict[str, str]]:
    angle_drafts = compose_campaign_angle_standalone_drafts(payload)
    if len(angle_drafts) >= 2:
        return angle_drafts

    deliverable = _line(payload.get("deliverable_type")).lower()
    if _deliverable_is_quote_repost(deliverable):
        return compose_quote_repost_drafts(payload)
    if "retweet" in deliverable:
        return compose_retweet_drafts(payload)
    is_thread = _deliverable_is_thread(deliverable)
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
    deliverable = _line(merged.get("deliverable_type")).lower()
    drafts = [item for item in (merged.get("drafts") or []) if isinstance(item, dict)]

    def _drafts_look_like_wrong_format(items: list[dict]) -> bool:
        if _deliverable_is_quote_repost(deliverable) or "retweet" in deliverable:
            return any("main post:" in _line(item.get("text")).lower() for item in items)
        if _deliverable_is_thread(deliverable):
            return False
        return any("main post:" in _line(item.get("text")).lower() for item in items)

    if not drafts or _drafts_look_like_wrong_format(drafts):
        merged = rebuild_drafts_for_deliverable(merged)
        return merged

    if any(draft_uses_robert_template(_line(item.get("text"))) for item in drafts if isinstance(item, dict)):
        angle_drafts = compose_campaign_angle_standalone_drafts(merged)
        if len(angle_drafts) >= 2:
            merged["drafts"] = angle_drafts
            merged["drafts_source"] = "campaign_angles"
            return merged
        merged = rebuild_drafts_for_deliverable(merged)
        return merged

    polished: list[dict[str, str]] = []
    for idx, draft in enumerate(drafts[:3]):
        text = polish_draft_text(_line(draft.get("text")), merged, variant=idx)
        if not text or draft_looks_instructional(text):
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

    if len(polished) < 2 or _drafts_look_like_wrong_format(polished):
        merged = rebuild_drafts_for_deliverable(merged)
        return merged

    merged["drafts"] = polished[:3]
    merged["drafts_source"] = "strategic_rewrite"
    return merged