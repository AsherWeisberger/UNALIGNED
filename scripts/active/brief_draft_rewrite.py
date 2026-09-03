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


def strip_non_robert_preserve_format(value: str) -> str:
    lines: list[str] = []
    for raw in str(value or "").splitlines():
        if not raw.strip():
            lines.append("")
            continue
        lines.append(strip_non_robert_phrases(raw))
    return clean_draft_text("\n".join(lines))


def strip_hyphens_from_copy(value: str) -> str:
    """Remove every hyphen and dash from post copy — including compound words
    ("high-value" -> "high value"), ranges ("50-70%" -> "50 to 70%"), and em/en
    dashes. Hyphens inside URLs are preserved. The no-hyphens rule is absolute."""
    text = str(value or "")
    # Stash URLs so their slug hyphens survive untouched.
    stash: list[str] = []

    def _keep(match: "re.Match") -> str:
        stash.append(match.group(0))
        return f"\x00{len(stash) - 1}\x00"

    text = re.sub(r"https?://\S+", _keep, text)
    text = text.replace("—", ", ").replace("–", ", ")
    text = text.replace(" - ", ", ")
    text = re.sub(r"(?<=\d)\s*-\s*(?=\d)", " to ", text)   # 50-70 -> 50 to 70
    text = re.sub(r"(?<=\w)-(?=\w)", " ", text)             # compound words -> space
    text = text.replace("-", " ")                          # any stragglers
    text = re.sub(r"\s+,", ",", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\x00(\d+)\x00", lambda m: stash[int(m.group(1))], text)
    return text.strip()


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

OPERATOR_MEDIA_QUOTE_MARKERS = (
    "founder video",
    "if you would like robert on camera",
    "if you mean embedding",
    "thread rate already covers",
    "content core",
    "production add-on",
    "robert's team demo",
    "unaligned does not produce",
    "below content core",
    "we do not produce",
    "does not produce demo",
    "drive/loom links",
    "drive or loom",
)

CLIENT_EMBED_PATTERNS: tuple[str, ...] = (
    r"embed(?:ding)?\s+(?:our|their|your|the\s+client'?s?|my)\s+(?:own\s+)?demo",
    r"client\s+embed(?:ding)?",
    r"include(?:s)?\s+(?:the\s+)?client\s+embed",
    r"(?:our|we(?:'ll| will))\s+(?:provide|send|supply|share)\s+(?:the\s+)?(?:demo|clip|video|media)",
    r"(?:client|brand)\s+(?:will\s+)?(?:supply|provide|send)\s+",
    r"embedding\s+your\s+own\s+demo",
    r"client(?:'s)?\s+own\s+demo\s+clip",
    r"embed(?:ding)?\s+(?:a\s+)?demo\s+clip",
)

INTERNAL_X_PROFILE_HANDLES = frozenset({
    "unalignedx",
    "unaligned",
    "scobleizer",
    "samlevin",
    "samlevinmac",
    "asherunaligned",
    "wednesday",
})

MEDIA_REQUIREMENT_PATTERNS: tuple[tuple[str, str], ...] = (
    (r"demo clips?", "Demo clips"),
    (r"demo video(?:s)?", "Demo video"),
    (r"product demo", "Product demo"),
    (r"screen record(?:ing)?", "Screen recording"),
    (r"walk[\s-]?through", "Product walkthrough"),
    (r"attach(?:ed)? (?:a )?video", "Video attachment"),
    (r"include (?:a )?video", "Video in post"),
    (r"b-?roll", "B-roll footage"),
    (r"screenshots?", "Screenshot"),
    (r"show (?:a )?(?:result|screenshot)", "Show product on screen"),
    (r"hero video", "Hero video"),
    (r"media kit", "Media kit"),
    (r"footage", "Video footage"),
    (r"loom\.com|loom link", "Video link"),
)


def is_internal_x_profile_url(url: str) -> bool:
    raw = _line(url).lower().rstrip("/")
    if not raw or ("x.com" not in raw and "twitter.com" not in raw):
        return False
    match = re.search(r"(?:x\.com|twitter\.com)/([^/?#]+)/?$", raw)
    if match and match.group(1).lower() in INTERNAL_X_PROFILE_HANDLES:
        return True
    return False


def is_valid_quote_anchor_url(url: str) -> bool:
    """True only for a real post URL — not a team profile link from an email signature."""
    raw = _line(url)
    if not raw or is_internal_x_profile_url(raw):
        return False
    lowered = raw.lower()
    if "/status/" in lowered or "/i/web/status/" in lowered:
        return True
    if "t.co/" in lowered:
        return True
    return False


def deliverable_needs_quote_anchor(deliverable_type: str) -> bool:
    lowered = _line(deliverable_type).lower()
    return bool(lowered) and (
        "quote" in lowered
        or "qrt" in lowered
        or "amplification" in lowered
    )


def pick_anchor_post_from_urls(urls: list[str]) -> str:
    for url in urls:
        if is_valid_quote_anchor_url(url):
            return _line(url)
    return ""


def is_operator_media_quote(sentence: str) -> bool:
    lowered = _line(sentence).lower()
    if not lowered:
        return True
    if any(marker in lowered for marker in OPERATOR_MEDIA_QUOTE_MARKERS):
        return True
    if re.search(r"\$\s*[\d,]+", lowered) and any(
        word in lowered for word in ("founder", "content core", "add-on", "addon", "upgrade", "tier")
    ):
        return True
    return False


def client_will_embed_own_media(text: str) -> bool:
    lowered = _line(text).lower()
    if not lowered:
        return False
    return any(re.search(pattern, lowered, re.I) for pattern in CLIENT_EMBED_PATTERNS)


def filter_client_media_quotes(quotes: list[str] | None) -> list[str]:
    out: list[str] = []
    for quote in quotes or []:
        current = _line(quote)
        if current and not is_operator_media_quote(current):
            out.append(current)
    return out


def parse_media_requirements_from_text(text: str) -> dict[str, Any]:
    """Detect when client expects demo clips, screen recordings, or other media."""
    raw = clean_draft_text(text)
    lowered = _line(raw).lower()
    if not lowered:
        return {}
    requirements: list[str] = []
    for pattern, label in MEDIA_REQUIREMENT_PATTERNS:
        if re.search(pattern, lowered, re.I) and label not in requirements:
            requirements.append(label)
    client_quotes: list[str] = []
    media_terms = (
        "demo clip",
        "screen record",
        "walkthrough",
        "attach",
        "video",
        "screenshot",
        "footage",
        "media kit",
        "b-roll",
        "broll",
        "show a result",
    )
    for sentence in re.split(r"(?<=[.!?])\s+", raw):
        sentence_clean = _line(sentence)
        if not sentence_clean or _email_sentence_is_meta(sentence_clean):
            continue
        sentence_lower = sentence_clean.lower()
        if any(term in sentence_lower for term in media_terms):
            if len(sentence_clean) >= 12:
                client_quotes.append(sentence_clean)
    no_on_camera = bool(
        re.search(
            r"no[\s-]?camera|not on camera|does not need to be on camera|"
            r"doesn't need to be on camera|screen only|voiceover only|no video of robert|"
            r"robert (?:does not|doesn't|won't) appear|without (?:being on )?camera",
            lowered,
            re.I,
        )
    )
    client_quotes = filter_client_media_quotes(client_quotes)[:3]
    client_embeds = client_will_embed_own_media(raw)
    return {
        "requirements": requirements,
        "client_quotes": client_quotes,
        "no_on_camera": no_on_camera,
        "client_embeds_own_media": client_embeds,
        "required": bool(requirements) or no_on_camera,
    }


MEDIA_PRODUCTION_MIN_PRICE = 3495
PRODUCTION_ADDON_PRICE = 500
PRODUCTION_ADDON_NAME = "Robert's Team Demo & Media"
PRODUCTION_ADDON_SHORT = "PROD"


def production_addon_client_offer() -> str:
    return (
        f"Add {PRODUCTION_ADDON_NAME} (+${PRODUCTION_ADDON_PRICE}): "
        "Robert's team produces demo clips and screen media for the post."
    )


def production_upgrade_option_lines() -> list[str]:
    return [
        production_addon_client_offer(),
        f"Or upgrade to Content Core (${MEDIA_PRODUCTION_MIN_PRICE:,}), where media production is included.",
    ]
MEDIA_PRODUCTION_TIER_NAMES = (
    "content core",
    "growth bundle",
    "maximum impact",
    "tier 5",
    "tier 6",
    "tier 7",
)
MEDIA_PRODUCTION_DELIVERABLES = (
    "founder video",
    "interview",
    "x space",
)
_MEDIA_URL_RE = re.compile(r"https?://[^\s)>\]]+", re.I)


def infer_deal_price_from_context(*texts: str, explicit: Any = None) -> int | None:
    if explicit not in (None, ""):
        try:
            parsed = int(float(str(explicit).replace(",", "").replace("$", "").strip()))
            if 500 <= parsed <= 100_000:
                return parsed
        except (TypeError, ValueError):
            pass
    for raw in texts:
        current = _line(raw)
        if not current:
            continue
        for match in re.finditer(r"\$\s*([\d,]+(?:\.\d{2})?)", current):
            try:
                parsed = int(float(match.group(1).replace(",", "")))
            except ValueError:
                continue
            if 500 <= parsed <= 100_000:
                return parsed
    return None


def media_production_in_scope(
    *,
    deal_price: int | None,
    deliverable_type: str = "",
    tier_name: str = "",
    agent_tier: str = "",
) -> bool:
    deliverable = _line(deliverable_type).lower()
    if any(marker in deliverable for marker in MEDIA_PRODUCTION_DELIVERABLES):
        return True
    tier_blob = " ".join(part for part in (_line(tier_name), _line(agent_tier)) if part).lower()
    if any(marker in tier_blob for marker in MEDIA_PRODUCTION_TIER_NAMES):
        return True
    if deal_price and deal_price >= MEDIA_PRODUCTION_MIN_PRICE:
        return True
    return False


def thread_has_linked_media_files(text: str) -> bool:
    lowered = _line(text).lower()
    if not lowered:
        return False
    for url in _MEDIA_URL_RE.findall(text):
        u = url.lower()
        if any(
            marker in u
            for marker in (
                "drive.google",
                "loom.com",
                "youtube.com",
                "youtu.be",
                "vimeo.com",
                "dropbox.com",
                "wetransfer",
                "we.tl",
                ".mp4",
                ".mov",
            )
        ):
            return True
    return False


def build_media_supply_reply_guidance(
    *,
    thread_text: str = "",
    deal_value: Any = None,
    deliverable_type: str = "",
    tier_name: str = "",
    agent_tier: str = "",
) -> dict[str, Any]:
    """Operator / draft-reply hints when client must supply media (standard tiers)."""
    parsed = parse_media_requirements_from_text(thread_text)
    if not parsed.get("required"):
        return {"active": False}
    deal_price = infer_deal_price_from_context(thread_text, explicit=deal_value)
    production_in_scope = media_production_in_scope(
        deal_price=deal_price,
        deliverable_type=deliverable_type,
        tier_name=tier_name,
        agent_tier=agent_tier,
    )
    client_must_supply = not production_in_scope
    if not client_must_supply:
        return {"active": False}
    client_embeds = bool(parsed.get("client_embeds_own_media"))
    files_linked = thread_has_linked_media_files(thread_text)
    price_txt = f"${deal_price:,}" if deal_price else "this tier"
    requirements = parsed.get("requirements") or []
    req_txt = ", ".join(requirements) if requirements else "demo clips / visuals"
    lines = [
        "MEDIA POLICY (follow in this reply):",
        f"- Deal is at {price_txt}, below Content Core (${MEDIA_PRODUCTION_MIN_PRICE:,}). "
        "UNALIGNED does not produce demo clips or video at this tier.",
    ]
    if client_embeds:
        lines.append(
            f"- Client is embedding their own clips in the thread — confirm that is in scope, "
            f"then collect links or files for every clip ({req_txt}) before publish."
        )
    else:
        lines.append(
            f"- Client must supply all media ({req_txt}) — send links or attach files."
        )
    if not files_linked:
        if client_embeds:
            lines.extend([
                "- No media is in the thread yet. Ask for their demo clips and media kit (links or files).",
                "- Do not promise Robert will record on camera unless they buy Founder Video ($4,495).",
                f"- If they want UNALIGNED to produce clips (not just embed theirs): {production_addon_client_offer()}",
            ])
        else:
            lines.extend([
                "- No media links are in the thread yet. Ask them to send every clip and visual they want attached.",
                "- Do not promise Robert will record, film, or create media.",
                f"- If they want us to produce media: {production_addon_client_offer()}",
                f"- Or upgrade to Content Core (${MEDIA_PRODUCTION_MIN_PRICE:,}), where production is included.",
            ])
    else:
        lines.append(
            "- Some links exist. Confirm you have everything needed before moving Robert's brief forward."
        )
    if parsed.get("no_on_camera"):
        lines.append("- Robert does not appear on camera. Client-supplied screen clips only.")
    upsell = production_upgrade_option_lines()
    return {
        "active": True,
        "client_must_supply": True,
        "hold_brief": not files_linked and not client_embeds,
        "client_embeds_own_media": client_embeds,
        "deal_price": deal_price,
        "requirements": requirements,
        "production_addon_price": PRODUCTION_ADDON_PRICE,
        "production_addon_name": PRODUCTION_ADDON_NAME,
        "production_upsell_lines": upsell,
        "prompt_block": "\n".join(lines),
        "suggested_ask": (
            f"Before we finalize Robert's thread draft, please send links or files for all "
            f"{req_txt} you want attached. At {price_txt}, we need the brand to supply the media. "
            f"If you would rather have Robert's team produce the clips, we can add "
            f"{PRODUCTION_ADDON_NAME} for ${PRODUCTION_ADDON_PRICE}."
        ),
    }


ROBERT_TEMPLATE_OPENERS = (
    "being at the launch of",
    "the guy who started",
    "everyone is sharing",
    "i hate myself for saying this",
    "i tested ",
    "one prompt. minutes later",
    "why isn't",
    "operating with at least ai assistance",
    "amongst the people collecting the data",
    "lists are fine. workflow context is still the gap",
    "from one of silicon valley's best vcs",
    # Formula catchphrases that made every brief sound the same.
    "the interesting part of",
    "the interesting part is",
    "the bigger signal in",
    "the bigger signal is",
    "the bigger story is",
    "the bigger story in",
)


DELIVERABLE_PROFILES: dict[str, dict[str, Any]] = {
    "quote_repost": {
        "label": "Quote Repost",
        "post_format": "quote_repost",
        "output_heading": "Draft",
        "output_instruction": "Quote the launch post with this original reaction. Copy ready.",
        "min_words": 28,
        "max_words": 110,
        "required_fact_hits": 1,
    },
    "retweet": {
        "label": "Retweet",
        "post_format": "retweet",
        "output_heading": "Retweet Instructions",
        "output_instruction": "Retweet the supplied post without adding commentary.",
        "min_words": 0,
        "max_words": 0,
        "required_fact_hits": 0,
    },
    "custom_x": {
        "label": "Custom X Post",
        "post_format": "custom_post",
        "output_heading": "Draft",
        "output_instruction": "Finished standalone X post. Copy ready.",
        "min_words": 55,
        "max_words": 165,
        "required_fact_hits": 2,
    },
    "narrative_thread": {
        "label": "Narrative Thread",
        "post_format": "narrative_thread",
        "output_heading": "Draft",
        "output_instruction": "",
        "min_words": 60,
        "max_words": 320,
        "required_fact_hits": 2,
    },
    "linkedin": {
        "label": "LinkedIn Post",
        "post_format": "linkedin_post",
        "output_heading": "Draft",
        "output_instruction": "Finished LinkedIn post. Copy ready.",
        "min_words": 90,
        "max_words": 260,
        "required_fact_hits": 2,
    },
    "amplification_x": {
        "label": "Amplification X",
        "post_format": "amplification_x",
        "output_heading": "Draft",
        "output_instruction": "Amplify the launch post with this original take. Copy ready.",
        "min_words": 28,
        "max_words": 105,
        "required_fact_hits": 1,
    },
    "founder_video": {
        "label": "Founder Video Post",
        "post_format": "founder_video",
        "output_heading": "Draft",
        "output_instruction": "On camera direction: spoken hook, talking points, close, and caption.",
        "min_words": 70,
        "max_words": 230,
        "required_fact_hits": 2,
    },
    "x_space": {
        "label": "X Space",
        "post_format": "x_space",
        "output_heading": "Draft",
        "output_instruction": "Host notes for the X Space. Not social post copy.",
        "min_words": 90,
        "max_words": 360,
        "required_fact_hits": 2,
    },
    "interview": {
        "label": "Interview",
        "post_format": "interview",
        "output_heading": "Draft",
        "output_instruction": "Interview run of show. Host notes, not social post copy.",
        "min_words": 110,
        "max_words": 420,
        "required_fact_hits": 2,
    },
    "unknown": {
        "label": "Unknown",
        "post_format": "unknown",
        "output_heading": "Draft",
        "output_instruction": "Choose the correct deliverable before generating.",
        "min_words": 0,
        "max_words": 0,
        "required_fact_hits": 0,
    },
}


def deliverable_profile_key(deliverable_type: str) -> str:
    lowered = _line(deliverable_type).lower()
    if not lowered:
        return "unknown"
    if "amplification" in lowered:
        return "amplification_x"
    if "founder video" in lowered:
        return "founder_video"
    if "x space" in lowered or "space (live)" in lowered:
        return "x_space"
    if "interview" in lowered:
        return "interview"
    if "linkedin" in lowered:
        return "linkedin"
    if "retweet" in lowered and "quote" not in lowered:
        return "retweet"
    if "thread" in lowered and "quote" not in lowered:
        return "narrative_thread"
    if "quote" in lowered or "qrt" in lowered or "repost" in lowered:
        return "quote_repost"
    if "custom" in lowered or "post" in lowered:
        return "custom_x"
    return "unknown"


def deliverable_profile(deliverable_type: str) -> dict[str, Any]:
    key = deliverable_profile_key(deliverable_type)
    return {"key": key, **DELIVERABLE_PROFILES[key]}


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
    if payload.get("creator_experience_confirmed") is True:
        return True
    intel = payload.get("sender_intelligence") or {}
    if intel.get("creator_experience_confirmed") is True:
        return True
    haystack = " ".join(
        [
            _line(payload.get("email_context")),
        ]
    ).lower()
    proof_markers = (
        "robert tested",
        "robert built",
        "robert tried",
        "robert used",
        "robert attended",
        "robert was at the launch",
        "robert watched the demo",
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
    # Client "thread" in email beats Notion QRT noise — UNALIGNED thread = 1 main + 2 replies.
    if re.search(
        r"narrative thread|dedicated thread|thread draft|draft (?:of )?(?:the )?thread",
        lowered,
    ):
        return "Dedicated thread"
    if re.search(
        r"(?:3[\s-]?(?:part|piece)|three[\s-]?(?:part|piece))[\s-]?thread",
        lowered,
    ):
        return "Dedicated thread"
    if re.search(r"\bthread\b", lowered) and "no thread" not in lowered:
        if not re.search(r"email thread|gmail thread|in this thread|this email thread", lowered):
            return "Dedicated thread"
    if re.search(r"quote[\s\-]?tweet|quote[\s\-]?repost|\bqrt\b", lowered):
        return "Quote repost"
    if re.search(r"\bretweet\b", lowered) and not re.search(r"no retweets?", lowered):
        return "Retweet"
    if re.search(r"\brepost\b", lowered) and not re.search(r"no reposts?", lowered):
        return "Quote repost"
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


def infer_deliverable_from_email(text: str) -> str:
    """Public alias — email-only deliverable inference (thread signals before QRT)."""
    return _infer_deliverable_hint_from_email(text)


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
    anchor_post = pick_anchor_post_from_urls(urls)
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

    media_intel = parse_media_requirements_from_text(raw)
    creator_experience_confirmed = bool(
        re.search(
            r"\brobert\s+(?:has\s+|already\s+|personally\s+)?"
            r"(?:tested|tried|used|built|attended|watched|ran)\b",
            lowered,
            re.I,
        )
    )

    return {
        "is_am_handoff": any(marker in lowered for marker in AM_HANDOFF_MARKERS),
        "demo_story": demo_story,
        "creator_experience_confirmed": creator_experience_confirmed,
        "media_requirements": media_intel.get("requirements") or [],
        "media_client_quotes": media_intel.get("client_quotes") or [],
        "no_on_camera": bool(media_intel.get("no_on_camera")),
        "media_required": bool(media_intel.get("required")),
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
    if intel.get("anchor_post") and is_valid_quote_anchor_url(intel.get("anchor_post")):
        lines.append(f"Anchor post to quote: {intel['anchor_post']}")
    if intel.get("go_live"):
        lines.append(f"Timing: {intel['go_live']}")
    if intel.get("demo_story"):
        lines.append(f"Robert demo story (lead drafts with this when real): {intel['demo_story']}")
    if intel.get("media_requirements"):
        lines.append(f"Client media requirements: {', '.join(intel['media_requirements'])}")
    if intel.get("no_on_camera"):
        lines.append("Robert does not appear on camera. Screen recording or client clips only.")
    for quote in intel.get("media_client_quotes") or []:
        lines.append(f"Client media note: {quote}")
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
    if not robert_eyewitness_allowed(payload):
        return ""
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


def payload_has_creator_content_pack(payload: dict[str, Any]) -> bool:
    haystack = " ".join(
        [
            _line(payload.get("title")),
            _line(payload.get("subtitle")),
            _line(payload.get("source_text"))[:2400],
        ]
    ).lower()
    if "creator content pack" in haystack:
        return True
    sections = payload.get("thread_sections") or []
    return any(
        isinstance(section, dict)
        and re.match(r"^[TD]\d+\b", _line(section.get("label") or ""), re.I)
        for section in sections
    )


def draft_looks_like_scheduling_metadata(text: str) -> bool:
    lowered = _line(text).lower()
    if not lowered:
        return False
    markers = (
        "silicon valley time",
        "per the series brief",
        "pdt)",
        "pst)",
        "est)",
        "embargo:",
        "go-live:",
        "go live:",
        "posting window",
        "10:00 a.m.",
        "launch: wednesday",
        "launch: monday",
        "launch: tuesday",
        "launch: thursday",
        "launch: friday",
    )
    return any(marker in lowered for marker in markers)


def _pack_section_copy_lines(section: dict[str, Any]) -> list[str]:
    lines: list[str] = []
    seen: set[str] = set()
    structured = bool(section.get("technical") or section.get("attach") or section.get("hooks"))
    keys = ("hooks", "technical", "attach", "body") if not structured else ("hooks", "technical", "attach")
    for key in keys:
        for item in (section.get(key) or []):
            text = _line(item)
            if (
                not text
                or text in seen
                or text.lower().startswith("use when:")
                or draft_looks_like_pack_header(text)
                or draft_looks_instructional(text)
                or draft_looks_like_scheduling_metadata(text)
            ):
                continue
            if len(text) < 24:
                continue
            seen.add(text)
            lines.append(text)
    return lines


def extract_d_angle_parts(payload: dict[str, Any], *, variant: int = 0) -> dict[str, str]:
    sections = [
        section for section in (payload.get("thread_sections") or [])
        if isinstance(section, dict)
        and re.match(r"^D\d+\b", _line(section.get("label") or ""), re.I)
    ]
    if not sections:
        return {"t1": "", "t2": "", "t3": ""}
    lines = _pack_section_copy_lines(sections[variant % len(sections)])
    return {
        "t1": lines[0] if len(lines) >= 1 else "",
        "t2": lines[1] if len(lines) >= 2 else "",
        "t3": lines[2] if len(lines) >= 3 else "",
    }


def extract_thread_section_parts(payload: dict[str, Any]) -> dict[str, str]:
    """T1/T2/T3 bodies from Hockey Stick-style CREATOR CONTENT PACKs."""
    sections = payload.get("thread_sections") or []
    out = {"t1": "", "t2": "", "t3": ""}
    for section in sections:
        if not isinstance(section, dict):
            continue
        label = _line(section.get("label") or "").lower()
        body = _pack_section_copy_lines(section)
        text = body[0] if len(body) == 1 else " ".join(body[:2]).strip()
        if not text or draft_looks_like_pack_header(text):
            continue
        if re.match(r"^t1\b", label):
            out["t1"] = text
        elif re.match(r"^t2\b", label):
            out["t2"] = text
        elif re.match(r"^t3\b", label):
            out["t3"] = text
    return out


def pack_uses_d_angle_sections(payload: dict[str, Any]) -> bool:
    return any(
        isinstance(section, dict)
        and re.match(r"^D\d+\b", _line(section.get("label") or ""), re.I)
        for section in (payload.get("thread_sections") or [])
    )


def _pack_section_label(payload: dict[str, Any], *, variant: int = 0) -> str:
    sections = [
        section for section in (payload.get("thread_sections") or [])
        if isinstance(section, dict)
        and re.match(r"^D\d+\b", _line(section.get("label") or ""), re.I)
    ]
    if not sections:
        return ""
    return _line(sections[variant % len(sections)].get("label"))


def _d_angle_theme(label: str) -> str:
    lowered = _line(label).lower()
    if "durability" in lowered or "drift" in lowered or "resolution" in lowered:
        return "durability"
    if "distillation" in lowered or "self-rollout" in lowered or "dmd" in lowered:
        return "distillation"
    if "moba" in lowered or "bidirectional" in lowered or "regularizer" in lowered:
        return "architecture"
    if "harness" in lowered or "cerebellum" in lowered or "agentic" in lowered:
        return "agentic"
    if "interface" in lowered or "action space" in lowered or "wasd" in lowered:
        return "interface"
    if "deployment" in lowered or "real-time" in lowered or "14b" in lowered:
        return "deployment"
    if "limitation" in lowered or "honest" in lowered:
        return "honest"
    if "comparison" in lowered or "table" in lowered:
        return "comparison"
    if "open-source" in lowered or "open source" in lowered:
        return "opensource"
    if "living world" in lowered or "access" in lowered:
        return "access"
    return "world_model"


PAPER_VOICE_PREFIXES = (
    "the headline property is",
    "the paper frames",
    "post-training combines",
    "pre-training uses",
    "the key choice:",
    "effect:",
    "the failure mode it fixes:",
    "mechanism credited:",
    "technical claims",
)


def draft_reads_like_paper_copy(text: str) -> bool:
    lowered = _line(text).lower()
    if not lowered:
        return False
    if any(marker in lowered for marker in PAPER_VOICE_PREFIXES):
        return True
    if "distribution matching distillation" in lowered:
        return True
    if lowered.startswith("prior causal world models"):
        return True
    if re.search(r"\bthe paper\b", lowered):
        return True
    return False


ROBERT_PACK_MAIN_BY_THEME: dict[str, list[str]] = {
    "durability": [
        "Most world models still smear after a few minutes. {company} is pushing durability, not another resolution headline.",
        "Everyone talks pretty frames. I keep watching whether the world still holds an hour later.",
    ],
    "distillation": [
        "The move I keep watching is distillation over long rollouts, not another bigger checkpoint.",
        "Training the student on its own predictions is the detail most world-model demos skip.",
    ],
    "architecture": [
        "Mixing bidirectional attention with causal video is a subtle bet. It matters when rollouts get long.",
        "The architecture story here is how they stop the model from overfitting to clean teacher frames.",
    ],
    "agentic": [
        "A world model gets interesting when a brain can seed new events inside it, not just render prettier clips.",
        "The agent harness is the part that turns a video model into something you can actually steer.",
    ],
    "interface": [
        "What I care about is what you can do inside the world, not another passive demo reel.",
        "WASD plus hotkey event proposals is the kind of interface that makes a world model feel real.",
    ],
    "deployment": [
        "Real time on consumer hardware is the unsexy detail that decides whether builders actually use this.",
        "A 14B model with a 1.3B deployable sibling is a practical stack, not just a leaderboard entry.",
    ],
    "honest": [
        "I like teams that say where the model still breaks instead of pretending world models are solved.",
        "No long-term memory and some style drift are worth saying out loud. That is how you earn trust.",
    ],
    "comparison": [
        "The table is worth reading because duration and interaction are finally on the same row.",
        "Hour-scale generation with open weights is a different category than another closed demo.",
    ],
    "opensource": [
        "Open weights matter here because the artifact is the point, not another lab dunk.",
        "When the model ships open, builders can actually test the claims instead of watching a trailer.",
    ],
    "access": [
        "Access is the story when a world model moves from lab reel to something people can try online.",
        "I care less about the launch video and more about whether anyone can run the world today.",
    ],
    "world_model": [
        "Most world-model talk still sounds like a demo reel. {company} is trying to make the world stay coherent.",
        "I keep coming back to one question with world models: does the world still make sense minutes later?",
    ],
}


def _strip_paper_voice(text: str) -> str:
    out = _line(strip_hyphens_from_copy(text))
    for prefix in PAPER_VOICE_PREFIXES:
        if out.lower().startswith(prefix):
            out = out[len(prefix):].strip(" :,-.")
    out = re.sub(r"(?i)^the paper frames\s+", "", out)
    out = re.sub(r"(?i)^effect:\s*", "", out)
    out = re.sub(r"(?i)^the key choice:\s*", "", out)
    return _line(out)


def _short_claim_sentences(text: str, *, limit: int = 2, max_chars: int = 240) -> str:
    cleaned = _strip_paper_voice(text)
    if not cleaned:
        return ""
    sentences = [
        _line(item)
        for item in re.split(r"(?<=[.!?])\s+", cleaned)
        if _line(item) and len(_line(item)) >= 20
    ]
    if not sentences:
        return cleaned[:max_chars].rsplit(" ", 1)[0].strip() + ("." if cleaned else "")
    picked = " ".join(sentences[:limit]).strip()
    if len(picked) > max_chars:
        picked = picked[:max_chars].rsplit(" ", 1)[0].strip()
        if picked and not picked.endswith((".", "!", "?")):
            picked += "."
    return picked


ROBERT_PACK_REPLY_BY_THEME: dict[str, list[str]] = {
    "durability": [
        "They ran one uninterrupted 60-minute session across twenty scenarios. No visible decay.",
        "Most causal world models smear in minutes. This one held for an hour in their stress test.",
    ],
    "distillation": [
        "The student learns from its own rollouts, not just teacher-forced frames.",
        "That is how they try to stop drift from compounding during long autoregressive runs.",
    ],
    "architecture": [
        "The bidirectional block keeps the model from leaning too hard on clean context.",
        "Without that regularizer, long rollouts overfit and the world starts to smear.",
    ],
    "agentic": [
        "A VLM brain proposes events and the video model renders them in the loop.",
        "That is what makes this feel less like a clip generator and more like a world you can steer.",
    ],
    "interface": [
        "WASD movement plus hotkey event proposals is the kind of control surface builders can actually use.",
        "You are not just watching a world. You are poking it.",
    ],
    "deployment": [
        "A 1.3B deployable sibling on one consumer GPU is the practical half of the story.",
        "Real time matters more than another leaderboard screenshot.",
    ],
    "honest": [
        "No true long-term memory yet, and style can drift on very long runs. Worth saying plainly.",
        "I like teams that name the limits instead of pretending world models are solved.",
    ],
    "comparison": [
        "In their own table, this is the only row that reaches hour-scale duration in a general domain.",
        "Minutes for the prior models. Hour-scale here, and open weights.",
    ],
    "opensource": [
        "The artifact ships open, so builders can test the claims instead of watching a trailer.",
        "Open weights change the conversation from demo to something people can run.",
    ],
    "access": [
        "You can try the world online, which is the part that actually matters to builders.",
        "Access beats another launch reel when the claim is an interactive world model.",
    ],
    "world_model": [
        "The question is whether the world still makes sense after minutes, not seconds.",
        "Coherence over time is the bar I watch on world models.",
    ],
}


def _capitalize_first(text: str) -> str:
    out = _line(text)
    if not out:
        return ""
    return out[0].upper() + out[1:] if len(out) > 1 else out.upper()


def robertize_pack_reply_one(raw: str, *, theme: str, variant: int = 0) -> str:
    themed = ROBERT_PACK_REPLY_BY_THEME.get(theme) or ROBERT_PACK_REPLY_BY_THEME["world_model"]
    reply = themed[variant % len(themed)]
    lowered_raw = _line(raw).lower()
    if theme == "durability" and not any(token in lowered_raw for token in ("hour", "minute", "drift", "decay")):
        reply = _short_claim_sentences(raw, limit=1, max_chars=220)
    elif theme == "distillation" and "distillation" not in lowered_raw and "rollout" not in lowered_raw:
        reply = _short_claim_sentences(raw, limit=1, max_chars=220)
    if reply and len(reply) > 260:
        reply = _short_claim_sentences(reply, limit=1, max_chars=220)
    return _capitalize_first(strip_non_robert_phrases(strip_pollution(reply)))


def robertize_pack_thread(
    parts: dict[str, str],
    payload: dict[str, Any],
    *,
    variant: int = 0,
    link: str = "",
    tag: str = "",
    reply_footer: str = "",
) -> tuple[str, str, str]:
    company = _line(payload.get("company_name")) or "This product"
    theme = _d_angle_theme(_pack_section_label(payload, variant=variant))
    templates = ROBERT_PACK_MAIN_BY_THEME.get(theme) or ROBERT_PACK_MAIN_BY_THEME["world_model"]
    main = templates[variant % len(templates)].format(company=company)
    reply_one = robertize_pack_reply_one(parts.get("t2") or parts.get("t1") or "", theme=theme, variant=variant)
    if not reply_one:
        reply_one = robertize_pack_reply_one(parts.get("t1") or "", theme=theme, variant=variant)
    if link:
        reply_two = f"Try it: {link}"
    elif reply_footer:
        reply_two = reply_footer
    else:
        reply_two = _short_claim_sentences(parts.get("t3") or "", limit=1, max_chars=200)
    if tag and tag.lower() not in main.lower():
        main = f"{main} {tag}".strip()
    return (
        strip_non_robert_phrases(strip_pollution(main)),
        strip_non_robert_phrases(strip_pollution(reply_one)),
        strip_non_robert_phrases(strip_pollution(reply_two)),
    )


def drafts_use_generic_voice_templates(drafts: list[dict[str, Any]]) -> bool:
    for item in drafts:
        if not isinstance(item, dict):
            continue
        text = _line(item.get("text"))
        if not text:
            continue
        if draft_uses_robert_template(text):
            return True
        lowered = text.lower()
        if "lists are fine. workflow context is still the gap" in lowered:
            return True
        if "amongst the people collecting the data" in lowered:
            return True
        if draft_looks_like_scheduling_metadata(text):
            return True
    return False


def compose_thread_from_pack_sections(payload: dict[str, Any], *, variant: int = 0) -> str:
    """One narrative thread from T1/T2/T3 or D1/D2/D3 creator-pack sections."""
    parts = extract_d_angle_parts(payload, variant=variant)
    if not any(parts.values()):
        parts = extract_thread_section_parts(payload)
    if not any(parts.values()):
        return ""
    company = _line(payload.get("company_name")) or "This product"
    proof = product_proof(payload)
    hook = product_hook(payload)
    link = _line((payload.get("must_include") or {}).get("link"))
    tag = _line((payload.get("must_include") or {}).get("tag"))
    reply_footer = _draft_footer(payload, for_reply=True)

    main_candidates: list[str] = []
    if parts["t1"]:
        main_candidates.append(parts["t1"])
    for field in ("core_idea", "how_it_works", "announcement"):
        value = _line(payload.get(field))
        if value and not draft_looks_like_pack_header(value) and value not in main_candidates:
            main_candidates.append(value)
    if not main_candidates:
        main_candidates = [hook] if hook else []
    if not main_candidates:
        return ""

    use_robert_pack_voice = pack_uses_d_angle_sections(payload) or any(
        draft_reads_like_paper_copy(_line(parts.get(key) or ""))
        for key in ("t1", "t2", "t3")
    )

    if use_robert_pack_voice:
        main, reply_one, reply_two = robertize_pack_thread(
            parts,
            payload,
            variant=variant,
            link=link,
            tag=tag,
            reply_footer=reply_footer,
        )
        if draft_needs_quality_polish(main):
            return ""
    else:
        main = strip_non_robert_phrases(
            strip_pollution(strip_hyphens_from_copy(main_candidates[variant % len(main_candidates)]))
        )
        if draft_needs_quality_polish(main):
            return ""

        reply_one = parts["t2"] or proof or hook
        reply_two = parts["t3"] or reply_footer or (f"Link: {link}" if link else "")
        if reply_two.lower().startswith("link:") and link and link not in reply_two:
            reply_two = f"Link: {link}"
        reply_one = strip_pollution(strip_hyphens_from_copy(reply_one))
        reply_two = strip_pollution(strip_hyphens_from_copy(reply_two))
        if (
            draft_looks_like_pack_header(reply_one)
            or draft_looks_like_scheduling_metadata(reply_one)
            or draft_uses_robert_template(reply_one)
        ):
            reply_one = strip_pollution(strip_hyphens_from_copy(proof or hook))
        if (
            draft_looks_like_pack_header(reply_two)
            or draft_looks_like_scheduling_metadata(reply_two)
        ):
            reply_two = reply_footer or (f"Link: {link}" if link else "")

        if tag and tag.lower() not in main.lower():
            main = f"{main} {tag}".strip()

    constraints = payload.get("agency_constraints") or {}
    if constraints.get("no_urls_in_copy") and link and "http" in reply_two.lower():
        reply_two = f"Link in reply: {link}"

    return format_thread_draft(main, reply_one, reply_two)


_FACT_STOPWORDS = frozenset({
    "about", "after", "again", "against", "being", "brief", "could", "every",
    "first", "from", "have", "into", "launch", "more", "other", "should",
    "their", "there", "these", "they", "this", "those", "through", "using",
    "what", "when", "where", "which", "while", "with", "would", "your",
})


def source_facts_for_drafting(payload: dict[str, Any], *, limit: int = 14) -> list[str]:
    """Return clean, source-grounded facts in priority order."""
    candidates: list[Any] = []
    candidates.extend(payload.get("source_facts") or [])
    for field in ("announcement", "core_idea", "how_it_works", "about_company"):
        candidates.append(payload.get(field))
    for angle in payload.get("campaign_angles") or []:
        if not isinstance(angle, dict):
            candidates.append(angle)
            continue
        candidates.extend([
            angle.get("hook"),
            angle.get("thread"),
            *(angle.get("examples") or []),
        ])
    for section in payload.get("thread_sections") or []:
        if isinstance(section, dict):
            candidates.extend(section.get("technical") or [])
            candidates.extend(section.get("body") or [])
    candidates.extend(payload.get("content_angle_points") or [])

    facts: list[str] = []
    seen: set[str] = set()
    for raw in candidates:
        value = raw.get("text") if isinstance(raw, dict) else raw
        current = clean_draft_text(str(value or ""))
        if not current:
            continue
        current = re.sub(r"^Angle\s+\d+\s*:\s*", "", current, flags=re.I)
        for sentence in re.split(r"(?<=[.!?])\s+|\n+", current):
            fact = _line(sentence).strip(" -*|\t")
            if len(fact) < 28 or len(fact) > 360:
                continue
            if draft_looks_instructional(fact):
                continue
            if draft_looks_like_pack_header(fact) or draft_looks_like_scheduling_metadata(fact):
                continue
            if re.search(r"\b(go live|posting window|send for review|pick one|option \d+)\b", fact, re.I):
                continue
            key = re.sub(r"[^a-z0-9]+", " ", fact.lower()).strip()
            if not key or key in seen:
                continue
            seen.add(key)
            facts.append(fact)
            if len(facts) >= 40:
                break
        if len(facts) >= 40:
            break

    def signal_score(fact: str) -> int:
        lowered = fact.lower()
        score = 0
        if re.search(r"\b\d+(?:\.\d+)?\b", fact):
            score += 3
        if any(term in lowered for term in ("instead", "rather than", "unlike", "not a", "opposite")):
            score += 5
        if any(term in lowered for term in (
            "tokenizer", "transformer", "mixture-of-experts", "architecture", "causal",
            "pretrain", "foundation model", "closed-loop", "latent space", "distillation",
        )):
            score += 4
        if any(term in lowered for term in ("reports", "result", "adapt", "transfer", "faster", "benchmark")):
            score += 2
        if re.search(r"\bis (?:an?|the) .{0,40}company\b", lowered):
            score -= 5
        if "dedicated post brief" in lowered or "creator content pack" in lowered:
            score -= 8
        return score

    ranked = sorted(facts, key=signal_score, reverse=True)
    distinct: list[str] = []
    distinct_tokens: list[set[str]] = []
    for fact in ranked:
        tokens = _fact_tokens(fact)
        if tokens and any(
            len(tokens.intersection(prior)) / max(1, min(len(tokens), len(prior))) >= 0.55
            for prior in distinct_tokens
            if prior
        ):
            continue
        distinct.append(fact)
        distinct_tokens.append(tokens)
        if len(distinct) >= limit:
            break
    return distinct


def _fact_tokens(value: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9]+", _line(value).lower())
        if (len(token) >= 5 or token.isdigit()) and token not in _FACT_STOPWORDS
    }


def source_fact_hit_count(text: str, payload: dict[str, Any]) -> int:
    draft_tokens = _fact_tokens(text)
    hits = 0
    for fact in source_facts_for_drafting(payload):
        tokens = _fact_tokens(fact)
        if not tokens:
            continue
        overlap = draft_tokens.intersection(tokens)
        numeric_overlap = any(token.isdigit() for token in overlap)
        if len(overlap) >= 2 or (numeric_overlap and overlap):
            hits += 1
    return hits


def _reduce_repeated_subject_mentions(text: str, payload: dict[str, Any], *, max_mentions: int = 2) -> str:
    body = clean_draft_text(text)
    product = _line(payload.get("product_name"))
    if not product or len(product) < 3:
        return body
    source_blob = " ".join(
        _line(payload.get(field))
        for field in ("about_company", "core_idea", "how_it_works", "announcement", "source_text")
    ).lower()
    replacement = "The model" if any(
        marker in source_blob
        for marker in ("foundation model", "research release", "parameters", "benchmark", "pretrain")
    ) else "The product"
    seen = 0

    def replace(match: re.Match[str]) -> str:
        nonlocal seen
        seen += 1
        return match.group(0) if seen <= max_mentions else replacement

    return re.sub(re.escape(product), replace, body, flags=re.I)


def format_draft_for_profile(text: str, payload: dict[str, Any]) -> str:
    body = clean_draft_text(text)
    key = deliverable_profile_key(_line(payload.get("deliverable_type")))
    if key not in {"custom_x", "quote_repost", "linkedin", "amplification_x"}:
        return body
    if "\n" in body:
        return body

    must = payload.get("must_include") or {}
    required_parts = [
        _line(must.get(field))
        for field in ("tag", "hashtags", "link")
        if _line(must.get(field))
    ]
    footer_start = len(body)
    for part in required_parts:
        position = body.lower().find(part.lower())
        if position >= 0:
            footer_start = min(footer_start, position)
    footer = body[footer_start:].strip() if footer_start < len(body) else ""
    prose = body[:footer_start].strip() if footer else body
    sentences = [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?])\s+", prose)
        if sentence.strip()
    ]
    if len(sentences) < 2:
        return body
    if key == "linkedin" and len(sentences) >= 4:
        paragraphs = [sentences[0], " ".join(sentences[1:3]), " ".join(sentences[3:])]
    else:
        paragraphs = sentences
    if footer:
        paragraphs.append(footer)
    return "\n\n".join(paragraphs)


def _tag_value_is_literal(value: str) -> bool:
    """True when a must_include tag is an actual @handle, not a prose instruction."""
    handle = str(value or "").strip().lstrip("@").rstrip(".,;:!?)")
    return bool(re.fullmatch(r"[A-Za-z0-9_]{1,15}", handle))


def _hashtag_value_is_literal(value: str) -> bool:
    """True when a must_include hashtags field is literal #tags, not a prose instruction."""
    tokens = [t for t in re.split(r"[,\s]+", str(value or "").strip()) if t]
    return bool(tokens) and all(re.fullmatch(r"#\w{1,50}", t) for t in tokens)


def _must_include_copy_value(field: str, value: str) -> str:
    """Return the value only when it is safe to paste into post copy.

    Prose instructions ("None required by contract. Do not add a tag wall.")
    are directions for Robert, not literal copy — keep them out of drafts.
    """
    if field == "tag" and not _tag_value_is_literal(value):
        return ""
    if field == "hashtags" and not _hashtag_value_is_literal(value):
        return ""
    return value


def _append_required_footer(text: str, payload: dict[str, Any]) -> str:
    body = clean_draft_text(text)
    body = _reduce_repeated_subject_mentions(body, payload)
    must = payload.get("must_include") or {}
    parts: list[str] = []
    for field in ("tag", "hashtags", "link"):
        value = _must_include_copy_value(field, _line(must.get(field)))
        if value and value.lower() not in body.lower():
            parts.append(value)
    if parts:
        body = f"{body}\n\n{' '.join(parts)}".strip()
    return body


def _rotated_facts(payload: dict[str, Any], variant: int, *, count: int = 4) -> list[str]:
    facts = source_facts_for_drafting(payload)
    if not facts:
        return []
    start = variant % len(facts)
    ordered = facts[start:] + facts[:start]
    return ordered[:count]


def source_grounded_openers(payload: dict[str, Any]) -> list[str]:
    """Three distinct first lines built from real source facts — never formula catchphrases."""
    company = (
        _line(payload.get("product_name"))
        or _line(payload.get("company_name"))
        or "This release"
    )
    facts = source_facts_for_drafting(payload)
    if not facts:
        hook = _line(payload.get("core_idea")) or _line(payload.get("announcement"))
        facts = [hook] if hook else []
    first = facts[0] if facts else f"{company} has a new release."
    second = facts[1] if len(facts) > 1 else first
    third = facts[2] if len(facts) > 2 else (facts[0] if facts else first)

    def _strip_leading_subject(fact: str) -> str:
        return re.sub(
            rf"^{re.escape(company)}\s+(?:is|are|has|have|turns|uses|builds|lets|helps)\s+",
            "",
            fact,
            count=1,
            flags=re.I,
        ).strip() or fact

    # Fact-first openers with light, non-templated framing. Quality gate rejects recycled
    # Robert templates; these stay specific to the document's facts.
    openers = [
        first,
        second if second.lower() != first.lower() else f"{company} is doing something more specific than the launch line suggests. {_strip_leading_subject(first)}",
        third if third.lower() not in {first.lower(), second.lower()} else f"The practical change: {_strip_leading_subject(first)}",
    ]
    return openers


def compose_source_grounded_standalone(payload: dict[str, Any], *, variant: int = 0) -> str:
    profile = deliverable_profile(_line(payload.get("deliverable_type")))
    min_words = int(profile.get("min_words") or 55)
    # Aim a bit above the gate floor so footer + polish still clear it.
    target_words = max(min_words + 8, 70)
    facts = _rotated_facts(payload, variant, count=12)
    openers = source_grounded_openers(payload)
    opener = openers[variant % len(openers)]
    body_parts = [opener]
    used_token_sets = [
        _fact_tokens(sentence)
        for sentence in re.split(r"(?<=[.!?])\s+|\n+", opener)
        if len(_fact_tokens(sentence)) >= 4
    ]
    for fact in facts:
        if fact.lower() in opener.lower() or opener.lower() in fact.lower():
            continue
        if any(fact.lower() in part.lower() or part.lower() in fact.lower() for part in body_parts):
            continue
        tokens = _fact_tokens(fact)
        if tokens and any(
            len(tokens.intersection(prior)) / max(1, min(len(tokens), len(prior))) >= 0.48
            for prior in used_token_sets
            if prior
        ):
            continue
        body_parts.append(fact)
        used_token_sets.append(tokens)
        words = len(re.findall(r"\b[\w']+\b", " ".join(body_parts)))
        if len(body_parts) >= 5 or words >= target_words:
            break
    # If still thin, append any remaining distinct facts until the floor is met.
    words = len(re.findall(r"\b[\w']+\b", " ".join(body_parts)))
    if words < min_words:
        for fact in facts:
            if any(fact.lower() in part.lower() or part.lower() in fact.lower() for part in body_parts):
                continue
            body_parts.append(fact)
            words = len(re.findall(r"\b[\w']+\b", " ".join(body_parts)))
            if words >= min_words:
                break
    return _append_required_footer("\n\n".join(body_parts), payload)


def compose_linkedin_drafts(payload: dict[str, Any]) -> list[dict[str, str]]:
    labels = [
        "Option 1. Recommended",
        "Option 2. Technical angle",
        "Option 3. Market angle",
    ]
    out: list[dict[str, str]] = []
    for idx, label in enumerate(labels):
        facts = _rotated_facts(payload, idx, count=5)
        opener = source_grounded_openers(payload)[idx]
        paragraphs = [opener]
        paragraphs.extend(fact for fact in facts if fact.lower() not in opener.lower())
        paragraphs.append("That combination is what makes this worth examining past the launch headline.")
        text = _append_required_footer("\n\n".join(paragraphs), payload)
        out.append({"label": label, "text": text})
    return out


def compose_amplification_drafts(payload: dict[str, Any]) -> list[dict[str, str]]:
    labels = [
        "Option 1. Recommended",
        "Option 2. Product angle",
        "Option 3. Category angle",
    ]
    out: list[dict[str, str]] = []
    for idx, label in enumerate(labels):
        facts = _rotated_facts(payload, idx, count=2)
        opener = source_grounded_openers(payload)[idx]
        parts = [opener]
        for fact in facts:
            if fact.lower() not in opener.lower() and opener.lower() not in fact.lower():
                parts.append(fact)
                break
        text = _append_required_footer("\n\n".join(parts), payload)
        out.append({"label": label, "text": text})
    return out


def compose_founder_video_drafts(payload: dict[str, Any]) -> list[dict[str, str]]:
    labels = [
        "Option 1. Product demonstration. Recommended",
        "Option 2. Technical explanation",
        "Option 3. Category shift",
    ]
    out: list[dict[str, str]] = []
    for idx, label in enumerate(labels):
        facts = _rotated_facts(payload, idx, count=4)
        while len(facts) < 4:
            facts.append(_line(payload.get("core_idea")) or _line(payload.get("announcement")) or "Keep the claim scoped to the source brief.")
        caption = _append_required_footer(f"{facts[0]} {facts[1]}", payload)
        text = (
            f"On camera hook:\n{facts[0]}\n\n"
            f"Talking points:\n1. {facts[1]}\n2. {facts[2]}\n3. {facts[3]}\n\n"
            f"Closing line:\nThe important part is what this changes in practice, not just the launch claim.\n\n"
            f"Caption:\n{caption}"
        )
        out.append({"label": label, "text": text})
    return out


def _conversation_run_of_show(payload: dict[str, Any], *, variant: int, interview: bool) -> str:
    company = _line(payload.get("company_name")) or "the company"
    facts = _rotated_facts(payload, variant, count=5)
    while len(facts) < 5:
        facts.append(_line(payload.get("core_idea")) or _line(payload.get("announcement")) or company)
    questions = [
        f"What problem were you trying to solve before {facts[0]}?",
        f"Walk us through the mechanism behind this claim: {facts[1]}",
        f"What should listeners understand about {facts[2]}?",
        f"Where are the limits or qualifications around {facts[3]}?",
        f"What does {facts[4]} change for users, builders, or the market?",
        "What should people watch next, and where can they learn more?",
    ]
    if interview:
        questions.insert(1, "What in the founder journey led you to this specific problem?")
        questions.insert(-1, "Which assumption about this category do you think the market still gets wrong?")
    question_text = "\n".join(f"{idx}. {question}" for idx, question in enumerate(questions, start=1))
    must = payload.get("must_include") or {}
    close_parts = [
        "Recap the strongest specific claim and the clearest qualification from the conversation.",
        _line(must.get("link")),
        _line(must.get("tag")),
    ]
    close = " ".join(part for part in close_parts if part)
    return (
        f"Opening:\n{facts[0]}\n\n"
        f"Question arc:\n{question_text}\n\n"
        f"Closing:\n{close}"
    )


def compose_x_space_drafts(payload: dict[str, Any]) -> list[dict[str, str]]:
    labels = [
        "Option 1. Product and market. Recommended",
        "Option 2. Technical deep dive",
        "Option 3. Adoption and future",
    ]
    return [
        {"label": label, "text": _conversation_run_of_show(payload, variant=idx, interview=False)}
        for idx, label in enumerate(labels)
    ]


def compose_interview_drafts(payload: dict[str, Any]) -> list[dict[str, str]]:
    labels = [
        "Option 1. Founder story and product. Recommended",
        "Option 2. Technical deep dive",
        "Option 3. Market thesis",
    ]
    return [
        {"label": label, "text": _conversation_run_of_show(payload, variant=idx, interview=True)}
        for idx, label in enumerate(labels)
    ]


def product_hook(payload: dict[str, Any]) -> str:
    pack = extract_thread_section_parts(payload)
    if pack.get("t1"):
        short = pack["t1"].split(".")[0].strip()
        if 20 <= len(short) <= 220:
            return short
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
    joined = _line(payload.get("source_text") or "").lower()
    if any(term in joined for term in ("world model", "robotics", "humanoid", "vla", "manipulation")):
        return f"{company} is pushing interactive world models past the demo stage."
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


def draft_looks_like_pack_header(text: str) -> bool:
    """Client CREATOR CONTENT PACK titles — metadata, not Robert copy."""
    lowered = _line(text).lower()
    if not lowered:
        return False
    if "creator content pack" in lowered:
        return True
    if re.search(r"launch:\s*(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)", lowered):
        return True
    if re.search(r"\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}\b", lowered):
        if any(token in lowered for token in ("launch", "go-live", "go live", "10:00", "a.m.", "p.m.")):
            return True
    if lowered.count("·") >= 2 and len(lowered) < 220:
        if any(token in lowered for token in ("launch", "infinity", "world model", "content pack", "vla", "v2.0", "2.0")):
            return True
    if re.search(r"^[\w\s.-]+\s+\d+\.0(?:\s*\([^)]+\))?\s*·", lowered):
        return True
    return False


def draft_looks_like_client_boilerplate(text: str) -> bool:
    lowered = _line(text).lower()
    if not lowered:
        return False
    if draft_looks_like_pack_header(text):
        return True
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
        "use when:",
    )
    return any(marker in lowered for marker in instruction_markers)


def draft_needs_quality_polish(text: str) -> bool:
    if not _line(text):
        return True
    if draft_looks_instructional(text):
        return True
    if draft_looks_like_client_boilerplate(text):
        return True
    if draft_looks_like_scheduling_metadata(text):
        return True
    if draft_uses_robert_template(text):
        return True
    if QUOTED_PROMPT_RE.search(text):
        return True
    if re.search(r'could\s+["\']?Create an AI product', text, re.I):
        return True
    if "main post:" in text.lower() and "reply 1:" in text.lower():
        sections = parse_thread_sections(text)
        for key in ("main", "reply_1", "reply_2"):
            section_text = _line(sections.get(key, ""))
            if section_text and len(section_text) > 900:
                return True
    elif len(_line(text)) > 1800:
        return True
    if text.lower().count("ojo is the first design agent") >= 2:
        return True
    if "reply 1:" in text.lower() and "main post:" in text.lower():
        # Collapsed on one line (Main post: ... Reply 1:) — not real thread formatting.
        if re.search(r"(?is)main post:[^\n]*reply\s+1:", text):
            return True
    return False


_UNVERIFIED_EXPERIENCE_RE = re.compile(
    r"\bI\s+(?:tried|tested|used|asked|built|ran|attended|met)\b",
    re.I,
)


def draft_quality_report(text: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Deterministic hard gate shared by every Brief Maker deliverable."""
    body = clean_draft_text(text)
    profile = deliverable_profile(_line(payload.get("deliverable_type")))
    key = profile["key"]
    failures: list[str] = []
    if not body:
        failures.append("empty draft")
    if key not in {"founder_video", "x_space", "interview"} and draft_looks_instructional(body):
        failures.append("contains internal instructions or source headings")
    if draft_looks_like_client_boilerplate(body):
        failures.append("reads like client boilerplate")
    if draft_uses_robert_template(body):
        failures.append("uses a recycled Robert opener template")
    if any(
        phrase in body.lower()
        for phrase in (
            "game changer",
            "revolutionary",
            "everyone is talking about",
            "must see",
            "the future is here",
        )
    ):
        failures.append("uses generic hype")
    first_sentence = re.split(r"[.!?\n]", body, maxsplit=1)[0].strip().lower()
    if key in {"custom_x", "quote_repost", "linkedin", "amplification_x"} and re.search(
        r"\bis (?:an?|the) .{0,50}company\b",
        first_sentence,
    ):
        failures.append("opens with company boilerplate instead of a thesis")
    if key in {"custom_x", "quote_repost", "linkedin", "amplification_x", "narrative_thread"}:
        sentence_tokens: list[set[str]] = []
        for sentence in re.split(r"(?<=[.!?])\s+|\n+", body):
            cleaned_sentence = re.sub(r"https?://\S+|@\w+|^(?:Main post|Reply \d+):\s*", "", sentence, flags=re.I).strip()
            tokens = _fact_tokens(cleaned_sentence)
            if len(tokens) < 4:
                continue
            if any(
                len(tokens.intersection(prior)) / max(1, min(len(tokens), len(prior))) >= 0.62
                for prior in sentence_tokens
            ):
                failures.append("repeats the same point in multiple sentences")
                break
            sentence_tokens.append(tokens)
    if _UNVERIFIED_EXPERIENCE_RE.search(body) and not robert_eyewitness_allowed(payload):
        failures.append("claims unverified first person product experience")

    must = payload.get("must_include") or {}
    constraints = payload.get("agency_constraints") or {}
    # Prose instructions in tag/hashtags are directions for Robert, not copy —
    # only literal @handles/#tags are required to appear in the draft text.
    required_values = {
        "required handle": _must_include_copy_value("tag", _line(must.get("tag"))),
        "required hashtags": _must_include_copy_value("hashtags", _line(must.get("hashtags"))),
    }
    if not constraints.get("no_urls_in_copy"):
        required_values["required link"] = _line(must.get("link"))
    if key != "retweet":
        for label, value in required_values.items():
            if value and value.lower() not in body.lower():
                failures.append(f"missing {label}")

    word_count = len(re.findall(r"\b[\w']+\b", body))
    min_words = int(profile.get("min_words") or 0)
    max_words = int(profile.get("max_words") or 0)
    if key != "retweet" and min_words and word_count < min_words:
        failures.append(f"too short for {profile['label']}")
    if max_words and word_count > max_words:
        failures.append(f"too long for {profile['label']}")

    lowered = body.lower()
    if key == "narrative_thread":
        numbered = bool(re.search(r"(?m)^1/\s*$", body)) and bool(re.search(r"(?m)^2/\s*$", body)) and bool(re.search(r"(?m)^3/\s*$", body))
        labeled = all(marker in lowered for marker in ("main post:", "reply 1:", "reply 2:"))
        if not numbered and not labeled:
            failures.append("thread must be 3 tweets (1/ 2/ 3/) or one main plus two replies")
    elif key in {"custom_x", "linkedin", "quote_repost", "amplification_x"}:
        if "main post:" in lowered or "reply 1:" in lowered:
            failures.append("wrong format for a standalone post")
    elif key == "founder_video":
        if not all(marker in lowered for marker in ("on camera hook:", "talking points:", "closing line:", "caption:")):
            failures.append("video option must include hook, talking points, close, and caption")
    elif key in {"x_space", "interview"}:
        if not all(marker in lowered for marker in ("opening:", "question arc:", "closing:")):
            failures.append("run of show must include opening, question arc, and closing")
    elif key == "retweet":
        if "retweet" not in lowered or "1." not in body:
            failures.append("retweet brief must contain the three action steps")

    company = _line(payload.get("company_name"))
    product = _line(payload.get("product_name"))
    for name in (company, product):
        if not name:
            continue
        for sentence in re.split(r"(?<=[.!?])\s+|\n+", body):
            clean_sentence = re.sub(r"https?://\S+|@\w+", "", sentence, flags=re.I)
            if clean_sentence.lower().count(name.lower()) > 1:
                failures.append("repeats the product or company name awkwardly")
                break
    if product and key in {"custom_x", "quote_repost", "linkedin", "amplification_x"}:
        product_mentions = body.lower().count(product.lower())
        if product_mentions > 2:
            failures.append("repeats the product name too often")

    fact_hits = source_fact_hit_count(body, payload)
    required_hits = int(profile.get("required_fact_hits") or 0)
    if required_hits and fact_hits < required_hits:
        failures.append(f"uses fewer than {required_hits} source facts")

    unique_failures = list(dict.fromkeys(failures))
    score = max(0, 100 - (18 * len(unique_failures)))
    return {
        "ok": not unique_failures,
        "score": score,
        "failures": unique_failures,
        "fact_hits": fact_hits,
        "word_count": word_count,
        "profile": key,
    }


def drafts_quality_report(payload: dict[str, Any]) -> list[dict[str, Any]]:
    reports: list[dict[str, Any]] = []
    for idx, item in enumerate(payload.get("drafts") or []):
        if not isinstance(item, dict):
            continue
        report = draft_quality_report(_line(item.get("text")), payload)
        reports.append({"index": idx, "label": _line(item.get("label")), **report})
    return reports


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
        numbered = re.match(r"^([123])/\s*$", row) or re.match(r"^([123])/\s+(.+)$", row)
        if numbered:
            if buffer:
                sections[current_key] = " ".join(buffer).strip()
            idx = numbered.group(1)
            current_key = "main" if idx == "1" else f"reply_{int(idx)-1}"
            buffer = []
            if numbered.lastindex and numbered.lastindex >= 2 and numbered.group(2):
                buffer = [numbered.group(2).strip()]
            continue
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
        parts.append(f"1/\n{_line(main)}")
    if _line(reply_one):
        parts.append(f"2/\n{_line(reply_one)}")
    if _line(reply_two):
        parts.append(f"3/\n{_line(reply_two)}")
    return "\n\n".join(parts).strip()


def _draft_footer(payload: dict[str, Any], *, for_reply: bool = False) -> str:
    must = payload.get("must_include") or {}
    constraints = payload.get("agency_constraints") or {}
    tag = _must_include_copy_value("tag", _line(must.get("tag")))
    link = _line(must.get("link"))
    hashtags = _must_include_copy_value("hashtags", _line(must.get("hashtags")))
    if for_reply and link:
        return f"Link: {link}"
    parts = [part for part in (tag, hashtags) if part]
    footer = " ".join(parts).strip()
    if link and not constraints.get("no_urls_in_copy") and not for_reply:
        footer = f"{footer} {link}".strip() if footer else link
    return footer


def _campaign_angle_main_text(angle: Any) -> str:
    if not isinstance(angle, dict):
        return _line(angle)
    examples = [_line(item) for item in (angle.get("examples") or []) if _line(item)]
    for example in examples:
        if len(example) >= 40 and not draft_looks_instructional(example):
            return example
    return _line(angle.get("hook")) or _line(angle.get("title"))


def _draft_signature(text: str) -> str:
    raw = _line(text).lower()
    match = re.search(r"(?is)main post:\s*(.+?)(?:\n\s*reply\s*1:|\Z)", raw)
    core = _line(match.group(1)) if match else raw
    return re.sub(r"\s+", " ", core)[:220]


def drafts_are_too_similar(drafts: list[dict[str, Any]]) -> bool:
    signatures: list[str] = []
    for item in drafts:
        sig = _draft_signature(_line(item.get("text")))
        if not sig:
            continue
        if any(sig == prior or sig[:140] == prior[:140] for prior in signatures):
            return True
        signatures.append(sig)
    return False


def compose_thread_from_campaign_angles(payload: dict[str, Any], *, variant: int = 0) -> str:
    """Build a 1 main + 2 reply thread from Notion creator angles."""
    pack_thread = compose_thread_from_pack_sections(payload, variant=variant)
    if pack_thread and not draft_needs_quality_polish(pack_thread):
        return pack_thread
    angles = [item for item in (payload.get("campaign_angles") or []) if item]
    if not angles:
        return compose_strategic_thread(payload, variant=variant)
    company = _line(payload.get("company_name")) or "This tool"
    hook = product_hook(payload)
    proof = product_proof(payload)
    reply_footer = _draft_footer(payload, for_reply=True)
    link = _line((payload.get("must_include") or {}).get("link"))
    count = len(angles)

    main = strip_non_robert_phrases(
        strip_pollution(
            strip_hyphens_from_copy(_campaign_angle_main_text(angles[variant % count]))
        )
    )
    if draft_needs_quality_polish(main):
        return compose_strategic_thread(payload, variant=variant)

    reply_one_candidates = [
        strip_pollution(strip_hyphens_from_copy(_campaign_angle_main_text(angles[(variant + 1) % count]))),
        strip_pollution(strip_hyphens_from_copy(proof or hook)),
        strip_pollution(
            strip_hyphens_from_copy(
                f"{company} is not another mockup generator. {proof or hook}"
            )
        ),
    ]
    pack_parts = extract_thread_section_parts(payload)
    if pack_parts.get("t2"):
        reply_one_candidates.insert(0, pack_parts["t2"])
    if pack_parts.get("t3") and variant == 0:
        pass  # t3 reserved for reply_two below

    reply_one = next(
        (
            candidate
            for candidate in reply_one_candidates
            if candidate
            and not draft_needs_quality_polish(candidate)
            and not draft_looks_like_pack_header(candidate)
            and len(candidate) <= 260
            and candidate.lower() != main.lower()
        ),
        strip_pollution(strip_hyphens_from_copy(proof or hook)),
    )

    reply_two_candidates = []
    if pack_parts.get("t3"):
        reply_two_candidates.append(pack_parts["t3"])
    reply_two_candidates.extend([
        reply_footer,
        f"Try it: {link}" if link else "",
        f"What I like here is the finished page, not the prompt. {link}".strip() if link else "",
        f"Link: {link}" if link else _draft_footer(payload),
    ])
    reply_two = strip_pollution(
        strip_hyphens_from_copy(reply_two_candidates[variant % len(reply_two_candidates)])
    )

    constraints = payload.get("agency_constraints") or {}
    if constraints.get("no_urls_in_copy") and link:
        reply_two = f"Link in reply: {link}"

    return format_thread_draft(main, reply_one, reply_two)


def compose_strategic_thread(payload: dict[str, Any], *, variant: int = 0) -> str:
    company = _line(payload.get("company_name")) or "This tool"
    hook = product_hook(payload)
    proof = product_proof(payload)
    tag_footer = _draft_footer(payload)
    reply_footer = _draft_footer(payload, for_reply=True)
    link = _line((payload.get("must_include") or {}).get("link"))
    grounded_facts = source_facts_for_drafting(payload)
    rotated = _rotated_facts(payload, variant, count=8)

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
        openers = source_grounded_openers(payload)
        # Main: thesis + one proof so the thread clears the word floor.
        mains = []
        for idx in range(3):
            lead = openers[idx % len(openers)]
            support = rotated[(idx + 1) % len(rotated)] if rotated else (proof or hook)
            if support and support.lower() not in lead.lower():
                mains.append(f"{lead} {support}".strip())
            else:
                mains.append(lead)
        replies_one = []
        for idx in range(3):
            a = rotated[(idx + 2) % len(rotated)] if rotated else (proof or hook)
            b = rotated[(idx + 3) % len(rotated)] if len(rotated) > 1 else ""
            if b and b.lower() not in a.lower():
                replies_one.append(f"{a} {b}".strip())
            else:
                replies_one.append(a)

    replies_two = []
    for idx in range(3):
        fact = rotated[(idx + 4) % len(rotated)] if rotated else (grounded_facts[(idx + 2) % len(grounded_facts)] if grounded_facts else "")
        footer = tag_footer or reply_footer or (f"Link: {link}" if link else "")
        replies_two.append(" ".join(part for part in (fact, footer) if part).strip())

    main = strip_non_robert_phrases(strip_pollution(strip_hyphens_from_copy(mains[variant % len(mains)])))
    reply_one = strip_pollution(strip_hyphens_from_copy(replies_one[variant % len(replies_one)]))
    reply_two = strip_pollution(strip_hyphens_from_copy(replies_two[variant % len(replies_two)]))

    constraints = payload.get("agency_constraints") or {}
    if constraints.get("no_urls_in_copy") and link:
        reply_two = f"Link in reply: {link}"

    return format_thread_draft(main, reply_one, reply_two)


def compose_strategic_standalone(payload: dict[str, Any], *, variant: int = 0) -> str:
    demo_lead = sender_demo_lead(payload, variant=variant)
    if not demo_lead:
        return compose_source_grounded_standalone(payload, variant=variant)
    facts = _rotated_facts(payload, variant, count=3)
    body_parts = [demo_lead]
    body_parts.extend(fact for fact in facts if fact.lower() not in demo_lead.lower())
    return _append_required_footer("\n\n".join(body_parts[:3]), payload)


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


def _trim_qrt_copy(text: str, *, max_chars: int = 700) -> str:
    out = clean_draft_text(text)
    if len(out) <= max_chars:
        return out
    trimmed = out[:max_chars].rsplit(" ", 1)[0].strip()
    if trimmed and not trimmed.endswith((".", "!", "?")):
        trimmed += "."
    return trimmed


def compose_quote_repost_line(payload: dict[str, Any], *, variant: int = 0) -> str:
    """One short QRT reaction — not a narrative thread."""
    facts = _rotated_facts(payload, variant, count=2)
    opener = source_grounded_openers(payload)[variant % 3]
    parts = [opener]
    for fact in facts:
        if fact.lower() not in opener.lower() and opener.lower() not in fact.lower():
            parts.append(fact)
            break
    body = _append_required_footer("\n\n".join(parts), payload)
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


def compose_special_format_drafts(payload: dict[str, Any]) -> list[dict[str, str]]:
    key = deliverable_profile_key(_line(payload.get("deliverable_type")))
    if key == "linkedin":
        return compose_linkedin_drafts(payload)
    if key == "amplification_x":
        return compose_amplification_drafts(payload)
    if key == "founder_video":
        return compose_founder_video_drafts(payload)
    if key == "x_space":
        return compose_x_space_drafts(payload)
    if key == "interview":
        return compose_interview_drafts(payload)
    return []


def rebuild_drafts_for_deliverable(payload: dict[str, Any]) -> dict[str, Any]:
    merged = dict(payload)
    deliverable = _line(merged.get("deliverable_type"))
    profile = deliverable_profile(deliverable)
    key = profile["key"]
    is_thread = key == "narrative_thread"
    merged["post_format"] = profile["post_format"]
    merged["draft_output_heading"] = profile["output_heading"]
    merged["draft_output_instruction"] = profile["output_instruction"]
    merged["max_thread_replies"] = 2 if is_thread else 0
    if merged.get("negotiation_stage") and not is_thread:
        angle_drafts = compose_campaign_angle_standalone_drafts(merged)
        if len(angle_drafts) >= 2:
            merged["drafts"] = angle_drafts
            merged["drafts_source"] = "campaign_angles"
            merged["post_format"] = "custom_post"
            merged["max_thread_replies"] = 0
            return merged
    if not deliverable:
        angle_drafts = compose_campaign_angle_standalone_drafts(merged)
        if len(angle_drafts) >= 2:
            merged["drafts"] = angle_drafts
            merged["drafts_source"] = "campaign_angles"
            return merged
        return merged
    if key == "quote_repost":
        merged["drafts"] = compose_quote_repost_drafts(merged)
        merged["drafts_source"] = "deliverable_rebuild"
    elif key == "retweet":
        merged["drafts"] = compose_retweet_drafts(merged)
        merged["drafts_source"] = "deliverable_rebuild"
    elif key == "narrative_thread":
        merged["drafts"] = build_fallback_robert_drafts(merged)
        merged["drafts_source"] = "deliverable_rebuild"
    elif key == "custom_x":
        merged["drafts"] = build_fallback_robert_drafts(merged)
        merged["drafts_source"] = "deliverable_rebuild"
    elif key in {"linkedin", "amplification_x", "founder_video", "x_space", "interview"}:
        merged["drafts"] = compose_special_format_drafts(merged)
        merged["drafts_source"] = "deliverable_rebuild"
    return merged


def polish_draft_text(text: str, payload: dict[str, Any], *, variant: int = 0) -> str:
    deliverable = _line(payload.get("deliverable_type")).lower()
    profile_key = deliverable_profile_key(deliverable)
    is_thread = profile_key == "narrative_thread"
    is_quote = profile_key == "quote_repost"

    if profile_key in {"linkedin", "amplification_x", "founder_video", "x_space", "interview"}:
        fallbacks = compose_special_format_drafts(payload)
        if not text or draft_needs_quality_polish(text):
            return _line((fallbacks[variant % len(fallbacks)] if fallbacks else {}).get("text"))
        return clean_draft_text(strip_hyphens_from_copy(text))

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
        if (
            draft_looks_like_client_boilerplate(reply_one)
            or draft_looks_like_pack_header(reply_one)
            or draft_reads_like_paper_copy(reply_one)
        ):
            if pack_uses_d_angle_sections(payload):
                theme = _d_angle_theme(_pack_section_label(payload, variant=variant))
                parts = extract_d_angle_parts(payload, variant=variant)
                reply_one = robertize_pack_reply_one(parts.get("t2") or parts.get("t1") or "", theme=theme, variant=variant)
            else:
                pack = extract_thread_section_parts(payload)
                reply_one = pack.get("t2") or product_proof(payload) or product_hook(payload)
        if draft_looks_instructional(reply_two):
            reply_two = _draft_footer(payload, for_reply=True)
        return format_thread_draft(main, reply_one, reply_two)

    out = strip_pollution(strip_hyphens_from_copy(text))
    if draft_needs_quality_polish(out):
        if is_quote:
            return compose_quote_repost_line(payload, variant=variant)
        return compose_strategic_standalone(payload, variant=variant)
    return clean_draft_text(out)


def build_fallback_robert_drafts(payload: dict[str, Any]) -> list[dict[str, str]]:
    deliverable = _line(payload.get("deliverable_type")).lower()
    profile_key = deliverable_profile_key(deliverable)
    is_thread = profile_key == "narrative_thread"
    special = compose_special_format_drafts(payload)
    if special:
        return special
    if not is_thread:
        angle_drafts = compose_campaign_angle_standalone_drafts(payload)
        if len(angle_drafts) >= 2:
            return angle_drafts

    if _deliverable_is_quote_repost(deliverable):
        return compose_quote_repost_drafts(payload)
    if "retweet" in deliverable:
        return compose_retweet_drafts(payload)
    labels = [
        "Option 1. Recommended",
        "Option 2. Technical angle",
        "Option 3. Market angle",
    ]
    has_pack = payload_has_creator_content_pack(payload) or bool(
        any(extract_thread_section_parts(payload).values())
        or any(extract_d_angle_parts(payload, variant=i).get("t1") for i in range(3))
    )
    has_angles = bool(payload.get("campaign_angles"))
    out: list[dict[str, str]] = []
    for idx, label in enumerate(labels):
        if is_thread:
            if has_pack:
                text = compose_thread_from_pack_sections(payload, variant=idx)
                if not text or draft_needs_quality_polish(text):
                    text = compose_thread_from_campaign_angles(payload, variant=idx)
            elif has_angles:
                text = compose_thread_from_campaign_angles(payload, variant=idx)
            else:
                text = compose_strategic_thread(payload, variant=idx)
            if (not text or draft_needs_quality_polish(text)) and not has_pack:
                text = compose_strategic_thread(payload, variant=idx)
        else:
            text = compose_strategic_standalone(payload, variant=idx)
        voice = score_robert_authenticity(text)
        out.append({
            "label": label,
            "text": strip_non_robert_preserve_format(text),
            "robert_voice_score": voice.get("score"),
            "robert_voice_tier": voice.get("tier"),
            "robert_tonality": voice.get("tonality"),
        })
    return out


def build_strict_profile_fallback_drafts(payload: dict[str, Any]) -> list[dict[str, str]]:
    """Last resort that always honors the selected deliverable shape."""
    key = deliverable_profile_key(_line(payload.get("deliverable_type")))
    special = compose_special_format_drafts(payload)
    if special:
        return special
    if key == "retweet":
        return compose_retweet_drafts(payload)
    labels = [
        "Option 1. Recommended",
        "Option 2. Technical angle",
        "Option 3. Market angle",
    ]
    drafts: list[dict[str, str]] = []
    for idx, label in enumerate(labels):
        if key == "quote_repost":
            text = compose_quote_repost_line(payload, variant=idx)
        elif key == "narrative_thread":
            text = compose_strategic_thread(payload, variant=idx)
        else:
            text = compose_source_grounded_standalone(payload, variant=idx)
        drafts.append({"label": label, "text": text})
    return drafts


def auto_fix_common_quality_failures(
    text: str,
    payload: dict[str, Any],
    *,
    variant: int = 0,
) -> str:
    """Deterministic fixes for the failures that used to force full LLM rewrites."""
    body = clean_draft_text(text)
    if not body:
        return body
    profile = deliverable_profile(_line(payload.get("deliverable_type")))
    key = profile["key"]
    report = draft_quality_report(body, payload)
    if report.get("ok"):
        return body
    failures = set(report.get("failures") or [])

    # Missing required handle / link / hashtags — append footer once.
    if any(item.startswith("missing required") for item in failures):
        body = _append_required_footer(body, payload)
        report = draft_quality_report(body, payload)
        failures = set(report.get("failures") or [])
        if report.get("ok"):
            return body

    # Too short / wrong format / recycled openers — rebuild in the correct shape.
    # Never append freeform facts onto a thread; that breaks Main/Reply labels.
    structural_fail = any(item.startswith("too short") for item in failures)
    format_failures = {
        "thread must contain one main post and two replies",
        "wrong format for a standalone post",
        "video option must include hook, talking points, close, and caption",
        "run of show must include opening, question arc, and closing",
        "retweet brief must contain the three action steps",
    }
    if (
        structural_fail
        or failures & format_failures
        or "uses a recycled Robert opener template" in failures
    ):
        rebuilt = build_strict_profile_fallback_drafts(payload)
        if rebuilt:
            candidate = clean_draft_text(rebuilt[variant % len(rebuilt)].get("text") or "")
            if candidate:
                report = draft_quality_report(candidate, payload)
                if report.get("ok") or len(report.get("failures") or []) < len(failures):
                    return candidate

    # Standalone-only length pad (not for labeled multi-section formats).
    if any(item.startswith("too short") for item in failures) and key in {
        "custom_x", "quote_repost", "linkedin", "amplification_x"
    }:
        min_words = int(profile.get("min_words") or 55)
        parts = [body]
        used = body.lower()
        for fact in _rotated_facts(payload, variant, count=10):
            if fact.lower() in used:
                continue
            parts.append(fact)
            used = " ".join(parts).lower()
            words = len(re.findall(r"\b[\w']+\b", " ".join(parts)))
            if words >= min_words + 4:
                break
        body = _append_required_footer("\n\n".join(parts), payload)
        report = draft_quality_report(body, payload)
        failures = set(report.get("failures") or [])
        if report.get("ok"):
            return body

    # Too few source facts — append a distinct fact.
    if any("source facts" in item for item in failures):
        for fact in _rotated_facts(payload, variant, count=8):
            if fact.lower() not in body.lower():
                body = _append_required_footer(f"{body}\n\n{fact}", payload)
                break

    return body


def ensure_publishable_drafts(payload: dict[str, Any]) -> dict[str, Any]:
    merged = dict(payload)
    deliverable = _line(merged.get("deliverable_type")).lower()
    profile = deliverable_profile(deliverable)
    merged["post_format"] = profile["post_format"]
    merged["draft_output_heading"] = profile["output_heading"]
    merged["draft_output_instruction"] = profile["output_instruction"]
    merged["max_thread_replies"] = 2 if profile["key"] == "narrative_thread" else 0
    drafts = [item for item in (merged.get("drafts") or []) if isinstance(item, dict)]
    expected_count = 1

    if profile["key"] == "retweet" and (
        not drafts
        or drafts_are_too_similar(drafts)
    ):
        merged = rebuild_drafts_for_deliverable(merged)
        drafts = [item for item in (merged.get("drafts") or []) if isinstance(item, dict)]

    if any(draft_uses_robert_template(_line(item.get("text"))) for item in drafts if isinstance(item, dict)):
        drafts = build_strict_profile_fallback_drafts(merged)
        merged["drafts_source"] = "strict_profile_fallback"

    polished: list[dict[str, Any]] = []
    reports: list[dict[str, Any]] = []
    for idx, draft in enumerate(drafts[:6]):
        text = polish_draft_text(str(draft.get("text") or ""), merged, variant=idx)
        if not text or draft_looks_instructional(text):
            continue
        voice = score_robert_authenticity(text)
        cleaned = format_draft_for_profile(
            strip_non_robert_preserve_format(text),
            merged,
        )
        report = draft_quality_report(cleaned, merged)
        if not report.get("ok"):
            cleaned = auto_fix_common_quality_failures(cleaned, merged, variant=idx)
            cleaned = format_draft_for_profile(
                strip_non_robert_preserve_format(cleaned),
                merged,
            )
            report = draft_quality_report(cleaned, merged)
        reports.append({"index": idx, "label": _line(draft.get("label")), **report})
        if not report.get("ok"):
            continue
        candidate = {
            "label": _line(draft.get("label")) or f"Option {len(polished) + 1}",
            "text": cleaned,
            "robert_voice_score": voice.get("score"),
            "robert_voice_tier": voice.get("tier"),
            "robert_tonality": voice.get("tonality"),
            "quality_score": report.get("score"),
            "source_fact_hits": report.get("fact_hits"),
            **{
                key: draft[key]
                for key in ("reach_score", "reach_tier", "reach_reason", "anchor", "facts_used", "angle")
                if draft.get(key) not in (None, "")
            },
        }
        if not any(_draft_signature(candidate["text"]) == _draft_signature(item["text"]) for item in polished):
            polished.append(candidate)

    if not polished:
        merged["drafts"] = []
        merged["drafts_source"] = "quality_gate_empty"
        merged["draft_quality_report"] = reports
        merged["draft_quality_warning"] = True
        merged["draft_generation_error"] = (
            "Could not write a post-ready draft. The local model did not clear the quality gate."
        )
        return merged

    if False and (len(polished) < expected_count or drafts_are_too_similar(polished[:expected_count])):
        # Disabled: source-stitched fills were why output sucked. Keep for reference.
        strict = build_strict_profile_fallback_drafts(merged)
        strict_polished: list[dict[str, Any]] = list(polished)
        strict_reports: list[dict[str, Any]] = list(reports)
        for idx, draft in enumerate(strict):
            if len(strict_polished) >= expected_count:
                break
            text = format_draft_for_profile(
                strip_non_robert_preserve_format(str(draft.get("text") or "")),
                merged,
            )
            text = auto_fix_common_quality_failures(text, merged, variant=idx)
            report = draft_quality_report(text, merged)
            strict_reports.append({"index": idx, "label": _line(draft.get("label")), **report, "fill": True})
            if not report.get("ok"):
                continue
            if any(_draft_signature(text) == _draft_signature(item["text"]) for item in strict_polished):
                continue
            strict_polished.append({
                "label": _line(draft.get("label")) or f"Option {len(strict_polished) + 1}",
                "text": text,
                "quality_score": report.get("score"),
                "source_fact_hits": report.get("fact_hits"),
            })
        # Renumber labels for the final set.
        for idx, item in enumerate(strict_polished[:expected_count]):
            if idx == 0 and "recommended" not in _line(item.get("label")).lower():
                item["label"] = "THE POST"
            elif idx > 0:
                item["label"] = item.get("label") or f"Option {idx + 1}"
        merged["drafts"] = strict_polished[:expected_count]
        merged["drafts_source"] = (
            "quality_gate_with_fill" if polished else "strict_profile_fallback"
        )
        merged["draft_quality_report"] = strict_reports
        merged["draft_quality_warning"] = len(strict_polished) < expected_count
        if not strict_polished:
            merged["draft_generation_error"] = (
                "Could not write a post-ready draft. Review the source facts or rerun the writer."
            )
        return merged

    merged["drafts"] = polished[:expected_count]
    merged["drafts_source"] = "quality_gate"
    merged["draft_quality_report"] = reports
    merged["draft_quality_warning"] = False
    return merged
