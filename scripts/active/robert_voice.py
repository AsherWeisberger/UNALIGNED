"""Robert Scoble voice profile — built from live @Scobleizer posts, used to sculpt drafts."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
PROFILE_PATH = ROOT / "data" / "robert_voice_profile.json"

# Patterns Robert uses; used for classification + draft openers.
TONALITY_DEFS: list[dict[str, Any]] = [
    {
        "id": "field_witness",
        "label": "Field witness",
        "description": "Eyewitness narrative. Robert was there, touched it, or lived it.",
        "signals": [r"\bI (am|was|sat|watched|arrived|bought|tested)\b", r"\bBeing at\b", r"\byears ago\b"],
        "opener_patterns": [
            "Being at the launch of {topic} was magic.",
            "I tested {brand} myself this week before saying anything.",
            "One prompt. Minutes later I had a finished {artifact}, not a chat thread I still had to stitch together.",
        ],
    },
    {
        "id": "contrarian_question",
        "label": "Contrarian question",
        "description": "Opens with a why/how challenge to the consensus.",
        "signals": [r"^Why\b", r"^How\b", r"\bshould we have a discussion\b", r"\bAt some point\b"],
        "opener_patterns": [
            "Why isn't {topic} operating with at least AI assistance?",
            "At some point we should have a discussion about {frame}.",
            "Everyone is sharing {topic} lists right now. Lists are fine. Workflow context is still the gap.",
        ],
    },
    {
        "id": "personal_stake",
        "label": "Personal stake",
        "description": "Robert names his own interest, investment, or discomfort.",
        "signals": [r"\bAs an investor\b", r"\bI hate myself for saying\b", r"\bI know it can be\b", r"\bmy son\b", r"\bmy brain\b"],
        "opener_patterns": [
            "I hate myself for saying this, but {truth}.",
            "As an investor I want {outcome}.",
            "I don't usually share {category}, but this one caught my eye.",
        ],
    },
    {
        "id": "quote_reframe",
        "label": "Quote reframe",
        "description": "Leads with someone else's line, then Robert's spin.",
        "signals": [r'^["“]', r"\bFrom one of\b", r"\bsaid\b"],
        "opener_patterns": [
            '"{quote}" From one of Silicon Valley\'s best VCs.',
            "{hook} …I'd QRT this and tie in {brand}.",
            "Like she says: {hook}",
        ],
    },
    {
        "id": "name_drop_story",
        "label": "Name-drop story",
        "description": "Person + context + why Robert cares.",
        "signals": [r"\bHe worked on\b", r"\bThe guy who\b", r"\b@(\w+)\b"],
        "opener_patterns": [
            "He worked on {context}. I don't usually share job moves, but this one caught my eye.",
            "The guy who started {org} told me he started it to do the same thing.",
            "Amongst the people collecting the data, they think {brand} has the best {category}.",
        ],
    },
    {
        "id": "honest_confession",
        "label": "Honest confession",
        "description": "Admits confusion, failure, or mixed feelings.",
        "signals": [r"\bEven I don'?t understand\b", r"\bHave failed many times\b", r"\bthe truth is\b"],
        "opener_patterns": [
            "Even I don't understand what this means.",
            "There is nothing more harmful than a rich and smart guy thinking his way is the only right one.",
            "The truth is, most people will choose closed systems if they're noticeably better.",
        ],
    },
    {
        "id": "values_frame",
        "label": "Values frame",
        "description": "Zooms out to quality of life, society, or moral stakes.",
        "signals": [r"\bquality of our life\b", r"\bmore important\b", r"\bdemonic\b", r"\bcarnage\b"],
        "opener_patterns": [
            "What is more important to the quality of our life: {a} or {b}?",
            "Humans cause too much carnage on our roads.",
            "What is the point of having a platform if not to voice strong opposition to {trend}?",
        ],
    },
]

ROBERT_BANNED_PHRASES = (
    "excited to announce",
    "thrilled to partner",
    "proud to partner",
    "game changer",
    "game-changer",
    "hot take",
    "delighted to",
    "honored to",
    "we're partnering",
    "official partnership",
    "innovative solution",
    "cutting-edge solution",
    "revolutionary platform",
    "stands out because",
    "making a serious move",
    "everyone is talking about",
    "not a slide deck",
    "robert's field take",
    "robert's lens",
    "worth watching",
    "field take",
)

STYLE_RULES = [
    "First person. Robert says I, my, me. Not we unless talking about a team on the ground.",
    "Short punchy first line, then one or two sentences of context. No brochure voice.",
    "Name real people, places, and physical details when possible.",
    "Questions work as hooks. About 1 in 6 posts opens with or contains a real question.",
    "No em dashes or hyphen-as-pause. Use periods and commas.",
    "Sponsorship posts still sound like Robert tested or witnessed something. Never 'excited to announce'.",
    "Quote tweets add Robert's reaction. Do not summarize the brand's marketing copy.",
    "End with @tag, link, hashtags when required. Disclosure is separate (Paid Partnership label).",
]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _line(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _first_sentence(text: str) -> str:
    chunk = re.split(r"[.!?\n]", _line(text))[0].strip()
    return chunk[:160]


def _classify_tonality(text: str) -> str | None:
    for spec in TONALITY_DEFS:
        for pattern in spec.get("signals") or []:
            if re.search(pattern, text, re.I | re.M):
                return str(spec["id"])
    return None


def _engagement(tweet: dict[str, Any]) -> int:
    metrics = tweet.get("public_metrics") or {}
    return int(
        metrics.get("like_count", 0)
        + metrics.get("retweet_count", 0) * 2
        + metrics.get("reply_count", 0) * 3
        + metrics.get("quote_count", 0) * 2
    )


def build_voice_profile(*, max_tweets: int = 100) -> dict[str, Any]:
    """Pull @Scobleizer timeline and compute tonal profile."""
    from x_signal_intel import XClient, tweet_url  # local import avoids circular CLI deps

    client = XClient()
    profile = client.users_by_username("Scobleizer")
    if not profile:
        raise RuntimeError("Could not load @Scobleizer profile")

    uid = str(profile.get("id") or "")
    tweets = client.user_tweets(uid, max_results=max(5, min(max_tweets, 100)))
    texts = [_line(t.get("text")) for t in tweets]
    texts = [re.sub(r"https://\S+", "", t).strip() for t in texts if t]

    tonality_counts: dict[str, int] = {spec["id"]: 0 for spec in TONALITY_DEFS}
    openers: list[str] = []
    for text in texts:
        opener = _first_sentence(text)
        if opener:
            openers.append(opener)
        tone = _classify_tonality(text)
        if tone:
            tonality_counts[tone] += 1

    sample = max(len(texts), 1)
    question_rate = sum(1 for t in texts if "?" in t) / sample
    i_rate = sum(len(re.findall(r"\bI\b", t)) for t in texts) / sample
    avg_len = sum(len(t) for t in texts) / sample

    ranked = sorted(tweets, key=_engagement, reverse=True)[:12]
    top_posts = [
        {
            "text": re.sub(r"https://\S+", "", _line(t.get("text"))),
            "engagement": _engagement(t),
            "url": tweet_url("Scobleizer", str(t.get("id") or "")),
            "tonality": _classify_tonality(_line(t.get("text"))),
        }
        for t in ranked
    ]

    tonalities: list[dict[str, Any]] = []
    for spec in TONALITY_DEFS:
        count = tonality_counts.get(spec["id"], 0)
        examples = [
            _first_sentence(t)
            for t in texts
            if _classify_tonality(t) == spec["id"]
        ][:4]
        tonalities.append(
            {
                "id": spec["id"],
                "label": spec["label"],
                "description": spec["description"],
                "frequency": round(count / sample, 3),
                "count": count,
                "opener_patterns": spec.get("opener_patterns") or [],
                "examples": examples,
            }
        )
    tonalities.sort(key=lambda row: row.get("count", 0), reverse=True)

    return {
        "generated_at": utc_now_iso(),
        "handle": "Scobleizer",
        "sample_size": sample,
        "metrics": {
            "avg_chars": round(avg_len),
            "questions_per_post": round(question_rate, 3),
            "first_person_I_per_post": round(i_rate, 2),
        },
        "tonalities": tonalities,
        "style_rules": STYLE_RULES,
        "banned_phrases": list(ROBERT_BANNED_PHRASES),
        "signature_openers": openers[:20],
        "top_posts_by_engagement": top_posts,
    }


def save_voice_profile(profile: dict[str, Any], path: Path | None = None) -> Path:
    target = path or PROFILE_PATH
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(profile, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return target


def load_voice_profile(*, refresh_if_missing: bool = False) -> dict[str, Any]:
    if PROFILE_PATH.is_file():
        return json.loads(PROFILE_PATH.read_text(encoding="utf-8"))
    if refresh_if_missing:
        profile = build_voice_profile()
        save_voice_profile(profile)
        return profile
    return {
        "tonalities": TONALITY_DEFS,
        "style_rules": STYLE_RULES,
        "banned_phrases": list(ROBERT_BANNED_PHRASES),
        "metrics": {},
        "signature_openers": [],
    }


def voice_prompt_block(*, max_rules: int = 8, max_examples: int = 6) -> str:
    """Compact block for LLM system prompts."""
    profile = load_voice_profile(refresh_if_missing=False)
    lines = ["ROBERT SCOBLE VOICE (from live @Scobleizer posts):"]
    for rule in (profile.get("style_rules") or STYLE_RULES)[:max_rules]:
        lines.append(f"- {rule}")
    lines.append("Banned in Robert copy: " + ", ".join((profile.get("banned_phrases") or ROBERT_BANNED_PHRASES)[:12]))
    lines.append("Tonalities (rotate across draft options):")
    for tone in (profile.get("tonalities") or TONALITY_DEFS)[:5]:
        ex = (tone.get("examples") or tone.get("opener_patterns") or [""])[0]
        lines.append(f"- {tone.get('label', tone.get('id'))}: {tone.get('description', '')} Example: {ex[:100]}")
    for post in (profile.get("top_posts_by_engagement") or [])[:max_examples]:
        lines.append(f"- High-eng: {str(post.get('text', ''))[:140]}")
    return "\n".join(lines)


def tonality_for_variant(variant: int) -> dict[str, Any]:
    profile = load_voice_profile()
    tones = profile.get("tonalities") or TONALITY_DEFS
    if not tones:
        return TONALITY_DEFS[variant % len(TONALITY_DEFS)]
    # Prefer tonalities that actually appear in Robert's feed.
    weighted = [t for t in tones if (t.get("count") or t.get("frequency", 0)) > 0] or tones
    return weighted[variant % len(weighted)]


def fill_opener(pattern: str, **kwargs: str) -> str:
    out = pattern
    for key, value in kwargs.items():
        out = out.replace("{" + key + "}", value or "")
    return _line(out)


EYEWITNESS_OPENER_MARKERS = (
    "being at the launch",
    "being at ",
    "i tested ",
    "one prompt. minutes later",
)
FABRICATED_NAME_DROP_MARKERS = ("the guy who started", "he worked on")


def robert_opener(
    *,
    variant: int = 0,
    brand: str = "",
    topic: str = "",
    hook: str = "",
    artifact: str = "launch page",
    allow_eyewitness: bool = False,
    allow_name_drop: bool = False,
) -> str:
    tone = tonality_for_variant(variant)
    patterns = tone.get("opener_patterns") or []
    if not patterns:
        patterns = TONALITY_DEFS[variant % len(TONALITY_DEFS)].get("opener_patterns") or [""]

    def _pattern_allowed(pattern: str) -> bool:
        lowered = pattern.lower()
        if not allow_eyewitness and any(marker in lowered for marker in EYEWITNESS_OPENER_MARKERS):
            return False
        if not allow_name_drop and any(marker in lowered for marker in FABRICATED_NAME_DROP_MARKERS):
            return False
        return True

    allowed = [pattern for pattern in patterns if _pattern_allowed(pattern)]
    pool = allowed or [
        pattern
        for tone_def in TONALITY_DEFS
        for pattern in (tone_def.get("opener_patterns") or [])
        if _pattern_allowed(pattern)
    ]
    if not pool:
        pool = ["What caught my eye with {brand} is the workflow shift, not another tool list."]
    pattern = pool[variant % len(pool)]
    return fill_opener(
        pattern,
        brand=brand or "this team",
        topic=topic or "AI",
        hook=hook or topic or "this",
        artifact=artifact,
        quote=hook or topic,
        frame=topic or "where this goes next",
        a=topic or "better infrastructure",
        b="another distraction",
        trend=topic or "bad trends",
        context=topic or "the stack",
        org=brand or "the company",
        category=topic or "model",
        truth=f"{brand} is worth a real look" if brand else "the workflow gap is real",
        outcome="this shipped safely" if brand else "clarity here",
        category_share="job moves",
    )


def strip_non_robert_phrases(text: str) -> str:
    out = _line(text)
    for phrase in ROBERT_BANNED_PHRASES:
        out = re.sub(re.escape(phrase), "", out, flags=re.I)
    out = re.sub(r"\s+", " ", out)
    out = re.sub(r"\s+([,.])", r"\1", out)
    return out.strip()


def score_robert_authenticity(text: str) -> dict[str, Any]:
    """0-100: how close draft text is to Robert's live voice patterns."""
    body = _line(text)
    if not body:
        return {"score": 0, "tier": "empty", "signals": [], "issues": ["empty"]}

    score = 40
    signals: list[str] = []
    issues: list[str] = []

    if re.search(r"\bI\b", body):
        score += 12
        signals.append("first person")
    else:
        issues.append("missing first person I")

    tonality = _classify_tonality(body)
    if tonality:
        score += 15
        signals.append(f"tonality:{tonality}")

    if "?" in body:
        score += 6
        signals.append("question hook")

    if re.search(r"https://\S+", body) or re.search(r"@\w+", body):
        score += 4
        signals.append("concrete tag/link")

    if len(body) >= 80:
        score += 8
    if len(body) > 420:
        score -= 10
        issues.append("too long for X")

    lowered = body.lower()
    for phrase in ROBERT_BANNED_PHRASES:
        if phrase in lowered:
            score -= 18
            issues.append(f"banned:{phrase}")

    if re.search(r"[—–]", body):
        score -= 8
        issues.append("em dash")

    for marker in ("excited to", "thrilled", "proud to partner", "game changer", "innovative solution"):
        if marker in lowered:
            score -= 12
            issues.append(f"brochure:{marker}")

    score = max(0, min(100, score))
    tier = "strong" if score >= 72 else "ok" if score >= 52 else "weak"
    return {"score": score, "tier": tier, "signals": signals, "issues": issues, "tonality": tonality}