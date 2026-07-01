#!/usr/bin/env python3
"""
Read-only X signal gathering for UNALIGNED outreach and content timing.

No writes, no Hermes/Supabase/kanban. Uses OAuth user token from
~/.config/google-credentials/x-api-oauth-token.json (same lane as DM shadow scrape).

Usage:
  python3 scripts/active/x_signal_intel.py guest zeb_evans
  python3 scripts/active/x_signal_intel.py guest @sama --json
  python3 scripts/active/x_signal_intel.py timing
  python3 scripts/active/x_signal_intel.py timing --query "spatial computing" -n 25
  python3 scripts/active/x_signal_intel.py radar "what should Robert post about AI agents today?"
  python3 scripts/active/x_signal_intel.py partnership --brand ClickUp --topic "Brain² AI" --handle clickup
  python3 scripts/active/x_signal_intel.py auth-check
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

STATE_DIR = Path.home() / ".config/google-credentials"
X_API_ENV = STATE_DIR / "x-api.env"
TOKEN_FILE = STATE_DIR / "x-api-oauth-token.json"
OUTPUT_DIR = Path.home() / "Desktop/UNALIGNED/x-signal"
API_BASE = "https://api.x.com/2"
TOKEN_URL = "https://api.x.com/2/oauth2/token"

TWEET_FIELDS = "created_at,public_metrics,author_id,text,lang,entities"
USER_FIELDS = "id,name,username,description,public_metrics,verified,created_at"

NICHE_PACKS: dict[str, str] = {
    "ai": '(AI OR "artificial intelligence" OR LLM OR "AI agents" OR Grok OR Claude OR GPT) lang:en -is:retweet',
    "tech_media": '("future of media" OR journalism OR creators OR podcast OR "content creator") (AI OR tech) lang:en -is:retweet',
    "ar_xr": '(AR OR XR OR "spatial computing" OR "Vision Pro" OR "AR glasses" OR Meta OR Quest) lang:en -is:retweet',
    "scoble": '(from:Scobleizer OR @Scobleizer OR "Robert Scoble" OR scobleizer) lang:en -is:retweet',
}

ANGLE_STOPWORDS = frozenset(
    "a an the and or but in on at to for of is are was were be been being "
    "i you he she it we they this that these those with from as by not just "
    "rt https http com".split()
)

# Terms too generic to lead a post — filtered from algo-first line suggestions.
ALGO_TERM_STOPWORDS = frozenset(
    "like what your has can have more all they this that with from are was get our you "
    "just not but when who how why them their there then than also very really some "
    "about into over after before still even".split()
)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


CREDENTIAL_KEYS = frozenset(
    {
        "X_BEARER_TOKEN",
        "X_API_KEY",
        "X_API_SECRET",
        "OAUTH2_CLIENT_ID",
        "OAUTH2_CLIENT_SECRET",
        "CLIENT_ID",
        "CLIENT_SECRET",
        "X_ACCESS_TOKEN",
    }
)


def load_env() -> None:
    if not X_API_ENV.exists():
        return
    for raw in X_API_ENV.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key in CREDENTIAL_KEYS:
            os.environ[key] = value
        else:
            os.environ.setdefault(key, value)


def read_json(path: Path, default: Any = None) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def oauth_client_credentials() -> tuple[str, str]:
    client_id = os.environ.get("OAUTH2_CLIENT_ID") or os.environ.get("CLIENT_ID") or ""
    client_secret = os.environ.get("OAUTH2_CLIENT_SECRET") or os.environ.get("CLIENT_SECRET") or ""
    return client_id, client_secret


def refresh_access_token(token_data: dict[str, Any]) -> dict[str, Any]:
    client_id, client_secret = oauth_client_credentials()
    refresh = str(token_data.get("refresh_token") or "").strip()
    if not client_id or not client_secret or not refresh:
        return token_data
    resp = httpx.post(
        TOKEN_URL,
        data={"grant_type": "refresh_token", "refresh_token": refresh, "client_id": client_id},
        auth=(client_id, client_secret),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=30,
    )
    if resp.status_code >= 400:
        return token_data
    merged = dict(token_data)
    merged.update(resp.json())
    TOKEN_FILE.write_text(json.dumps(merged, indent=2), encoding="utf-8")
    TOKEN_FILE.chmod(0o600)
    return merged


def app_bearer_token() -> str:
    """App-only bearer from x-api.env (keep URL-encoded — X expects it as stored)."""
    return os.environ.get("X_BEARER_TOKEN", "").strip()


def oauth_user_token() -> str:
    if TOKEN_FILE.exists():
        data = read_json(TOKEN_FILE, {})
        if isinstance(data, dict):
            for key in ("access_token", "token"):
                if data.get(key):
                    return str(data[key]).strip()
    token = os.environ.get("X_ACCESS_TOKEN", "").strip()
    if token:
        return token
    try:
        proc = subprocess.run(
            ["xurl", "auth", "print-token"],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if proc.returncode == 0 and proc.stdout.strip():
            return proc.stdout.strip()
    except Exception:
        pass
    return ""


def bearer_token(*, prefer_oauth: bool = False) -> str:
    oauth = oauth_user_token()
    app = app_bearer_token()
    if prefer_oauth and oauth:
        return oauth
    # Read-only search/user lookup works with app bearer; prefer it when set.
    if app:
        return app
    return oauth


class XClient:
    def __init__(self) -> None:
        load_env()
        self.token_data = read_json(TOKEN_FILE, {}) if TOKEN_FILE.exists() else {}
        self.token = bearer_token()
        self.auth_mode = "app" if app_bearer_token() and self.token == app_bearer_token() else "oauth"

    def _headers(self) -> dict[str, str]:
        if not self.token:
            raise RuntimeError(
                "No X credentials. Set X_BEARER_TOKEN in ~/.config/google-credentials/x-api.env "
                "or run: python3 scripts/active/x_oauth_setup.py"
            )
        return {"Authorization": f"Bearer {self.token}"}

    def _get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        resp = httpx.get(f"{API_BASE}{path}", headers=self._headers(), params=params or {}, timeout=30)
        if resp.status_code == 401 and self.auth_mode == "oauth" and self.token_data.get("refresh_token"):
            self.token_data = refresh_access_token(self.token_data)
            self.token = str(self.token_data.get("access_token") or self.token).strip()
            resp = httpx.get(f"{API_BASE}{path}", headers=self._headers(), params=params or {}, timeout=30)
        if resp.status_code == 401 and self.auth_mode == "oauth" and app_bearer_token():
            self.token = app_bearer_token()
            self.auth_mode = "app"
            resp = httpx.get(f"{API_BASE}{path}", headers=self._headers(), params=params or {}, timeout=30)
        if resp.status_code >= 400:
            detail = resp.text[:500]
            hint = ""
            if resp.status_code == 401:
                hint = (
                    " Token rejected — regenerate bearer in developer.x.com or re-auth: "
                    "python3 scripts/active/x_oauth_setup.py"
                )
            raise RuntimeError(f"X API {path} -> {resp.status_code}: {detail}{hint}")
        return resp.json()

    def users_by_username(self, username: str) -> dict[str, Any]:
        handle = username.lstrip("@")
        payload = self._get(f"/users/by/username/{handle}", {"user.fields": USER_FIELDS})
        return payload.get("data") or {}

    def user_tweets(self, user_id: str, *, max_results: int = 10) -> list[dict[str, Any]]:
        payload = self._get(
            f"/users/{user_id}/tweets",
            {
                "max_results": min(max(max_results, 5), 100),
                "tweet.fields": TWEET_FIELDS,
                "exclude": "retweets,replies",
            },
        )
        return payload.get("data") or []

    def search_recent(self, query: str, *, max_results: int = 25) -> dict[str, Any]:
        return self._get(
            "/tweets/search/recent",
            {
                "query": query,
                "max_results": min(max(max_results, 10), 100),
                "tweet.fields": TWEET_FIELDS,
                "expansions": "author_id",
                "user.fields": USER_FIELDS,
            },
        )

    def auth_check(self) -> dict[str, Any]:
        try:
            if self.auth_mode == "app":
                probe = self._get("/users/by/username/X", {"user.fields": "id,username"})
                return {"ok": True, "auth_mode": "app", "probe": probe.get("data")}
            me = self._get("/users/me", {"user.fields": USER_FIELDS})
            return {"ok": True, "auth_mode": "oauth", "user": me.get("data")}
        except RuntimeError as exc:
            return {"ok": False, "error": str(exc)}


def normalize_handle(handle: str) -> str:
    return handle.strip().lstrip("@").lower()


def engagement_score(tweet: dict[str, Any]) -> int:
    metrics = tweet.get("public_metrics") or {}
    return int(
        metrics.get("like_count", 0)
        + metrics.get("retweet_count", 0) * 2
        + metrics.get("reply_count", 0) * 3
        + metrics.get("quote_count", 0) * 2
    )


def index_users(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    users: dict[str, dict[str, Any]] = {}
    for user in payload.get("includes", {}).get("users") or []:
        uid = str(user.get("id") or "")
        if uid:
            users[uid] = user
    return users


def tweet_url(username: str, tweet_id: str) -> str:
    return f"https://x.com/{username}/status/{tweet_id}"


def extract_angle_terms(texts: list[str], *, top_n: int = 8) -> list[tuple[str, int]]:
    counter: Counter[str] = Counter()
    for text in texts:
        for token in re.findall(r"[#@]?[A-Za-z][A-Za-z0-9_]{2,}", text or ""):
            key = token.lower().lstrip("#@")
            if key in ANGLE_STOPWORDS or len(key) < 3:
                continue
            counter[key] += 1
    return counter.most_common(top_n)


def summarize_tweets(
    tweets: list[dict[str, Any]],
    users: dict[str, dict[str, Any]],
    *,
    limit: int = 8,
) -> list[dict[str, Any]]:
    ranked = sorted(tweets, key=engagement_score, reverse=True)
    rows: list[dict[str, Any]] = []
    for tweet in ranked[:limit]:
        author_id = str(tweet.get("author_id") or "")
        user = users.get(author_id) or {}
        username = user.get("username") or "i"
        rows.append(
            {
                "id": tweet.get("id"),
                "text": (tweet.get("text") or "").replace("\n", " ").strip(),
                "created_at": tweet.get("created_at"),
                "engagement": engagement_score(tweet),
                "metrics": tweet.get("public_metrics") or {},
                "author": user.get("name") or username,
                "username": username,
                "url": tweet_url(username, str(tweet.get("id") or "")),
            }
        )
    return rows


def guest_intel(client: XClient, handle: str, *, mention_limit: int = 25, own_limit: int = 10) -> dict[str, Any]:
    handle = normalize_handle(handle)
    profile = client.users_by_username(handle)
    if not profile:
        raise RuntimeError(f"User @{handle} not found")

    user_id = str(profile.get("id") or "")
    own_tweets = client.user_tweets(user_id, max_results=own_limit)
    mention_query = f"@{handle} lang:en -is:retweet"
    mention_payload = client.search_recent(mention_query, max_results=mention_limit)
    mention_users = index_users(mention_payload)
    mention_tweets = mention_payload.get("data") or []

    own_summaries = summarize_tweets(own_tweets, {user_id: profile}, limit=5)
    mention_summaries = summarize_tweets(mention_tweets, mention_users, limit=8)
    angle_source = [t.get("text") or "" for t in own_tweets] + [t.get("text") or "" for t in mention_tweets]
    angles = extract_angle_terms(angle_source)

    top_own = own_summaries[0] if own_summaries else None
    top_mention = mention_summaries[0] if mention_summaries else None
    moment = "quiet"
    if top_mention and top_mention["engagement"] >= 80:
        moment = "hot — high-engagement mentions in the last ~7 days"
    elif top_own and top_own["engagement"] >= 40:
        moment = "warm — their own posts are getting traction"
    elif mention_summaries:
        moment = "active — people are talking, moderate signal"

    return {
        "mode": "guest",
        "generated_at": utc_now_iso(),
        "handle": handle,
        "profile": profile,
        "moment": moment,
        "angles": [{"term": term, "count": count} for term, count in angles],
        "their_posts": own_summaries,
        "mentions": mention_summaries,
        "queries": {
            "mentions": mention_query,
            "own_timeline": f"/users/{user_id}/tweets",
        },
    }


def timing_intel(
    client: XClient,
    *,
    packs: list[str] | None = None,
    custom_query: str | None = None,
    per_pack: int = 15,
) -> dict[str, Any]:
    selected = packs or list(NICHE_PACKS.keys())
    lanes: dict[str, Any] = {}

    if custom_query:
        payload = client.search_recent(custom_query, max_results=per_pack)
        users = index_users(payload)
        tweets = payload.get("data") or []
        lanes["custom"] = {
            "query": custom_query,
            "top_posts": summarize_tweets(tweets, users, limit=8),
            "angles": [{"term": t, "count": c} for t, c in extract_angle_terms([x.get("text", "") for x in tweets])],
        }

    for pack_id in selected:
        if pack_id not in NICHE_PACKS:
            continue
        query = NICHE_PACKS[pack_id]
        payload = client.search_recent(query, max_results=per_pack)
        users = index_users(payload)
        tweets = payload.get("data") or []
        top = summarize_tweets(tweets, users, limit=6)
        lanes[pack_id] = {
            "label": pack_id.replace("_", " ").title(),
            "query": query,
            "post_count": len(tweets),
            "top_posts": top,
            "angles": [{"term": t, "count": c} for t, c in extract_angle_terms([x.get("text", "") for x in tweets])],
            "hook": top[0]["text"][:180] if top else "",
        }

    ranked_hooks: list[dict[str, Any]] = []
    for pack_id, lane in lanes.items():
        if pack_id == "custom":
            continue
        for post in lane.get("top_posts") or []:
            ranked_hooks.append({**post, "pack": pack_id})
    ranked_hooks.sort(key=lambda row: row.get("engagement", 0), reverse=True)

    return {
        "mode": "timing",
        "generated_at": utc_now_iso(),
        "lanes": lanes,
        "best_hooks": ranked_hooks[:10],
        "recommendation": _timing_recommendation(ranked_hooks),
    }


def _timing_recommendation(hooks: list[dict[str, Any]]) -> str:
    if not hooks:
        return "No recent niche signal — consider a standalone drop or widen the query."
    top = hooks[0]
    pack = str(top.get("pack") or "niche").replace("_", " ")
    return (
        f"Attach to {pack}: top post at {top.get('engagement', 0)} engagement "
        f"({top.get('url', '')}). Frame your drop as a reaction or extension of that thread."
    )


HANDLE_RE = re.compile(r"@([A-Za-z0-9_]{1,15})")


def classify_radar_question(question: str) -> dict[str, Any]:
    q = (question or "").strip()
    lower = q.lower()
    handles = [h.lower() for h in HANDLE_RE.findall(q)]

    if handles:
        return {"intent": "guest", "handle": handles[0], "topic": q}

    guest_cues = ("guest", "outreach", "reach out", "pitch", "book", "interview")
    timing_cues = ("trending", "timing", "drop", "post about", "video", "ahead of", "first on x", "algorithm", "algo", "keyword", "hashtag")
    if any(cue in lower for cue in guest_cues):
        return {"intent": "guest_lookup", "handle": None, "topic": q}
    if any(cue in lower for cue in timing_cues):
        return {"intent": "timing", "handle": None, "topic": q}
    return {"intent": "explore", "handle": None, "topic": q}


def build_search_query_from_question(question: str) -> str:
    q = question.strip()
    q = HANDLE_RE.sub("", q)
    q = re.sub(r"[^\w\s#\"-]", " ", q)
    q = re.sub(
        r"\b(what|should|robert|scoble|post|about|today|right now|tell me|show me|is|are|the|on x|twitter|get|ahead|how|can|we|use|this|see|into|future|crowd|audience|algo|algorithm|keyword|hashtag)\b",
        " ",
        q,
        flags=re.I,
    )
    q = re.sub(r"\s+", " ", q).strip()
    if not q:
        q = "AI OR tech OR spatial computing"
    if "lang:" not in q:
        q = f"({q}) lang:en -is:retweet"
    return q


def extract_hashtags(tweets: list[dict[str, Any]], *, top_n: int = 10) -> list[dict[str, Any]]:
    counter: Counter[str] = Counter()
    for tweet in tweets:
        entities = tweet.get("entities") or {}
        for tag in entities.get("hashtags") or []:
            tag_text = str(tag.get("tag") or "").strip()
            if tag_text:
                counter[tag_text.lower()] += 1
        for match in re.findall(r"#([A-Za-z0-9_]{2,30})", tweet.get("text") or ""):
            counter[match.lower()] += 1
    return [{"tag": f"#{term}", "count": count} for term, count in counter.most_common(top_n)]


def _algo_keywords(terms: list[tuple[str, int]], *, top_n: int = 6) -> list[str]:
    picked: list[str] = []
    for term, _count in terms:
        if term in ALGO_TERM_STOPWORDS or term in ANGLE_STOPWORDS:
            continue
        if len(term) < 3:
            continue
        picked.append(term)
        if len(picked) >= top_n:
            break
    return picked


def keyword_pack(tweets: list[dict[str, Any]], *, top_n: int = 12) -> dict[str, Any]:
    texts = [t.get("text") or "" for t in tweets]
    terms = extract_angle_terms(texts, top_n=top_n)
    hashtags = extract_hashtags(tweets, top_n=8)
    algo_terms = _algo_keywords(terms)
    return {
        "terms": [{"term": term, "count": count} for term, count in terms],
        "hashtags": hashtags,
        "suggested_keywords": algo_terms,
        "suggested_hashtags": [h["tag"] for h in hashtags[:2]],
    }


def build_algo_playbook(
    *,
    keywords: dict[str, Any],
    audience_play: dict[str, Any],
    must_tag: str | None,
    client_hashtags: str | None,
) -> dict[str, Any]:
    terms = keywords.get("suggested_keywords") or []
    attach = audience_play.get("attach_to") or {}
    attach_url = attach.get("url") or ""
    attach_eng = attach.get("engagement") or 0

    first_line_terms = terms[:3]
    steps: list[str] = []
    if attach_url and attach_eng >= 10:
        steps.append(f"QRT this thread (do not cold-post): {attach_url}")
    elif attach_url:
        steps.append(f"Consider QRT if it heats up: {attach_url}")
    else:
        steps.append("No strong attach thread — lead with a sharp first-person line using live terms below.")

    if first_line_terms:
        steps.append(f"First line must include one of: {', '.join(first_line_terms)}.")
    steps.append("Reply to comments for 30 minutes after posting. Replies compound reach more than likes.")
    if must_tag:
        steps.append(f"End with client tag: {must_tag}.")
    if client_hashtags:
        steps.append(f"Client hashtags (required): {client_hashtags}. Do not add extra tags.")
    else:
        steps.append("Skip hashtag stuffing. At most one signal hashtag if it already appears in the live pull.")

    return {
        "priority": ["attach", "first_line_terms", "reply_engagement", "client_tag", "client_hashtags"],
        "first_line_terms": first_line_terms,
        "attach_url": attach_url or None,
        "attach_engagement": attach_eng,
        "steps": steps,
        "dont": [
            "Do not open with 'excited to announce' or partnership boilerplate.",
            "Do not add hashtags beyond what the client requires.",
            "Do not post a generic original when a QRT anchor exists.",
        ],
    }


def robert_audience_play(
    *,
    top_posts: list[dict[str, Any]],
    keywords: dict[str, Any],
    moment: str | None = None,
    guest_handle: str | None = None,
) -> dict[str, Any]:
    top = top_posts[0] if top_posts else None
    terms = keywords.get("suggested_keywords") or []
    tags = keywords.get("suggested_hashtags") or []
    moves: list[str] = []

    if top:
        moves.append(f"Quote or reply to the top thread now: {top['url']} ({top['engagement']} engagement).")
        moves.append(f"Open with @{top.get('username', 'author')}'s angle, then add Robert's lived POV from the field.")
    if terms:
        moves.append(f"Work these terms into the first line: {', '.join(terms[:4])}.")
    if tags:
        moves.append(f"Hashtags in play: {' '.join(tags)} — use 1–2 max, not a tag dump.")
    if guest_handle:
        moves.append(f"DM/email hook: reference @{guest_handle}'s live conversation — moment is {moment or 'unknown'}.")
    if not moves:
        moves.append("No strong attach point — publish a standalone Robert POV post with a sharp first-person opener.")

    window = "strike now" if top and top.get("engagement", 0) >= 20 else "watch 2–4h — signal is thin"
    if top and top.get("engagement", 0) >= 200:
        window = "strike in the next 60 minutes — thread is hot"

    return {
        "timing_window": window,
        "primary_move": moves[0] if moves else "",
        "robert_first_moves": moves[:4],
        "attach_to": top,
    }


def radar_intel(client: XClient, question: str, *, max_results: int = 20) -> dict[str, Any]:
    classified = classify_radar_question(question)
    intent = classified["intent"]
    result: dict[str, Any] = {
        "mode": "radar",
        "generated_at": utc_now_iso(),
        "question": question,
        "classified_intent": intent,
        "layers": {},
    }

    if intent in ("guest", "guest_lookup") and classified.get("handle"):
        guest = guest_intel(client, classified["handle"], mention_limit=max_results)
        result["layers"]["guest"] = guest
        play_posts = (guest.get("mentions") or []) + (guest.get("their_posts") or [])
        keywords = keyword_pack(
            [{"text": p.get("text", ""), "entities": {}} for p in play_posts]
        )
        result["keywords"] = keywords
        result["audience_play"] = robert_audience_play(
            top_posts=guest.get("mentions") or guest.get("their_posts") or [],
            keywords=keywords,
            moment=guest.get("moment"),
            guest_handle=guest.get("handle"),
        )
        result["headline"] = f"Guest signal on @{guest['handle']} — {guest.get('moment', '')}"
        return result

    search_query = build_search_query_from_question(question)
    payload = client.search_recent(search_query, max_results=max_results)
    users = index_users(payload)
    tweets = payload.get("data") or []
    top_posts = summarize_tweets(tweets, users, limit=8)
    keywords = keyword_pack(tweets)
    result["layers"]["search"] = {
        "query": search_query,
        "top_posts": top_posts,
        "keywords": keywords,
    }

    if intent == "timing" or "timing" in question.lower() or "trend" in question.lower():
        timing = timing_intel(client, custom_query=search_query, per_pack=max_results)
        result["layers"]["timing"] = timing
        merged_hooks = (timing.get("best_hooks") or []) + top_posts
        merged_hooks.sort(key=lambda row: row.get("engagement", 0), reverse=True)
        top_posts = merged_hooks[:8]

    result["keywords"] = keywords
    result["audience_play"] = robert_audience_play(top_posts=top_posts, keywords=keywords)
    top = top_posts[0] if top_posts else None
    if top:
        result["headline"] = (
            f"Attach Robert to @{top.get('username', '?')} thread ({top.get('engagement', 0)} eng) — "
            f"keywords: {', '.join((keywords.get('suggested_keywords') or [])[:4])}"
        )
    else:
        result["headline"] = "Thin signal — widen query or wait for a stronger wave."
    return result


def render_radar_markdown(brief: dict[str, Any]) -> str:
    play = brief.get("audience_play") or {}
    keywords = brief.get("keywords") or {}
    lines = [
        "# X Radar — Audience Signal",
        "",
        f"**Question:** {brief.get('question', '')}",
        f"**Generated:** {brief.get('generated_at', '')}",
        f"**Headline:** {brief.get('headline', '')}",
        "",
        "## Best way to get in front of the audience",
        f"- **Timing window:** {play.get('timing_window', '—')}",
        f"- **Primary move:** {play.get('primary_move', '—')}",
    ]
    for move in play.get("robert_first_moves") or []:
        lines.append(f"- {move}")

    lines.extend(["", "## Keywords / algo terms to use"])
    terms = keywords.get("terms") or []
    if terms:
        lines.append("**Terms:** " + ", ".join(f"{t['term']}({t['count']})" for t in terms[:8]))
    tags = keywords.get("hashtags") or []
    if tags:
        lines.append("**Hashtags:** " + ", ".join(f"{t['tag']}({t['count']})" for t in tags[:6]))
    if keywords.get("suggested_keywords"):
        lines.append("**Use in post:** " + ", ".join(keywords["suggested_keywords"][:6]))
    if keywords.get("suggested_hashtags"):
        lines.append("**Tag lightly:** " + " ".join(keywords["suggested_hashtags"][:3]))

    search_layer = (brief.get("layers") or {}).get("search") or {}
    if search_layer.get("top_posts"):
        lines.extend(["", "## What's moving (search)", f"Query: `{search_layer.get('query', '')}`"])
        for post in search_layer["top_posts"]:
            lines.append(f"- [{post['engagement']} eng] @{post.get('username', '?')}: {post['text'][:200]}")
            lines.append(f"  {post.get('url', '')}")

    guest_layer = (brief.get("layers") or {}).get("guest")
    if guest_layer:
        lines.extend(["", f"## Guest layer — @{guest_layer.get('handle', '')}", f"**Moment:** {guest_layer.get('moment', '')}"])
        for post in (guest_layer.get("their_posts") or [])[:3]:
            lines.append(f"- Their post [{post['engagement']} eng]: {post['text'][:180]}")

    timing_layer = (brief.get("layers") or {}).get("timing")
    if timing_layer and timing_layer.get("best_hooks"):
        lines.extend(["", "## Niche lanes"])
        for hook in timing_layer["best_hooks"][:5]:
            lines.append(f"- [{hook.get('pack', '')}] {hook['engagement']} eng — @{hook.get('username', '?')}: {hook['text'][:160]}")

    return "\n".join(lines) + "\n"


PARTNERSHIP_BANNED_PHRASES = (
    "i've been watching",
    "wave on x",
    "stood out because",
    "making a serious move",
    "everyone is talking about",
    "clearest example",
    "not a slide deck",
    "the next fight in",
    "is not the model",
    "excited to announce",
    "game changer",
    "proud to partner",
    "hot take",
    "quick question",
    "is the word in this conversation",
    "robert's field take",
    "robert's lens",
    "robert's take",
    "worth watching",
    "caught my eye",
    "field take",
    "betting on the",
    "conversation worth",
)

VARIATION_HISTORY_FILE = STATE_DIR / "x_partnership_variation_history.json"
VARIATION_HISTORY_LIMIT = 80


def _opening_patterns(top_posts: list[dict[str, Any]], *, limit: int = 5) -> list[str]:
    patterns: list[str] = []
    for post in top_posts[:limit]:
        text = (post.get("text") or "").strip()
        if not text:
            continue
        first = text.split("\n")[0][:100]
        patterns.append(first)
    return patterns


def _hook_fragment(post: dict[str, Any] | None, *, max_len: int = 90) -> str:
    if not post:
        return ""
    text = (post.get("text") or "").strip().replace("\n", " ")
    text = re.sub(r"https?://\S+", "", text).strip()
    return text[:max_len].rstrip(".,;:")


def _footer(
    *,
    must_tag: str | None,
    link: str | None,
    client_hashtags: str | None,
    live_tags: list[str],
    draft_idx: int,
) -> str:
    """Algo-first footer: @tag + link + client-required hashtags only. Signal tags optional, max one."""
    parts: list[str] = []
    if must_tag:
        parts.append(must_tag)
    if link:
        parts.append(link)
    if client_hashtags:
        parts.append(client_hashtags.strip())
    elif live_tags and draft_idx == 0:
        # Only option 1 gets an optional single signal hashtag when client didn't require any.
        parts.append(live_tags[0])
    joined = " ".join(parts).strip()
    return f" {joined}" if joined else ""


def _sanitize_draft(text: str) -> str:
    """Strip botty sponsorship phrasing. Robert's voice is direct, not template Twitter."""
    out = (text or "").strip()
    for phrase in PARTNERSHIP_BANNED_PHRASES:
        out = re.sub(re.escape(phrase), "", out, flags=re.I)
    out = re.sub(r"\s+", " ", out)
    out = re.sub(r"\s+([,.])", r"\1", out)
    out = re.sub(r":\s*:", ":", out)
    return out.strip()


def _algo_open(term: str, body: str) -> str:
    """Weave live term into line 1 without boilerplate openers."""
    term = (term or "").strip()
    body = (body or "").strip()
    if not body:
        return _sanitize_draft(body)
    if term and term.lower() not in body[:80].lower():
        # Short, human weaves — rotate by term length to vary across deals.
        weaves = (
            f"{term.capitalize()} keeps coming up. {body}",
            f"On {term}: {body}",
            f"{body} ({term})",
        )
        body = weaves[len(term) % len(weaves)]
    return _sanitize_draft(body)


def _load_variation_history() -> list[str]:
    data = read_json(VARIATION_HISTORY_FILE, {"openers": []})
    if not isinstance(data, dict):
        return []
    openers = data.get("openers") or []
    return [str(item).lower() for item in openers if item]


def _save_variation_history(openers: list[str]) -> None:
    prior = _load_variation_history()
    merged = (openers + prior)[:VARIATION_HISTORY_LIMIT]
    write_json(VARIATION_HISTORY_FILE, {"openers": merged})


def _is_too_similar(text: str, history: list[str]) -> bool:
    lower = text.lower()
    if any(phrase in lower for phrase in PARTNERSHIP_BANNED_PHRASES):
        return True
    opener = lower[:72]
    return any(opener and (opener in old or old in opener) for old in history)


REACH_ANGLE_BASE: dict[str, int] = {
    "qrt_reaction": 35,
    "brand_moment": 33,
    "contrarian": 24,
    "listicle_pushback": 22,
    "field_demo": 18,
    "question": 14,
}


def _reach_score_draft(
    draft: dict[str, Any],
    *,
    terms: list[str],
) -> dict[str, Any]:
    """Score how well a draft stacks waves: attach + engagement + live terms in line 1."""
    score = REACH_ANGLE_BASE.get(str(draft.get("angle") or ""), 12)
    wave_stack: list[str] = []

    angle = draft.get("angle")
    if angle in ("qrt_reaction", "brand_moment"):
        wave_stack.append("wave 2 on wave 1 (QRT)")
    elif draft.get("anchor"):
        wave_stack.append("thread reference")
    else:
        wave_stack.append("no attach (cold original)")

    anchor_eng = int(draft.get("anchor_eng") or 0)
    if anchor_eng >= 80:
        score += 28
        wave_stack.append(f"hot thread ({anchor_eng} eng)")
    elif anchor_eng >= 25:
        score += 20
        wave_stack.append(f"warm thread ({anchor_eng} eng)")
    elif anchor_eng >= 8:
        score += 12
        wave_stack.append(f"live thread ({anchor_eng} eng)")
    elif draft.get("anchor"):
        score += 6
        wave_stack.append("thin thread")

    text = (draft.get("text") or "")[:120]
    term_hit = next((t for t in terms[:4] if t.lower() in text.lower()), "")
    if term_hit:
        score += 18
        wave_stack.append(f"term in line 1: {term_hit}")
    else:
        wave_stack.append("weak term match in line 1")

    if must_tag := draft.get("_must_tag"):
        if must_tag.lower() in (draft.get("text") or "").lower():
            score += 5
            wave_stack.append("client @tag present")

    score = min(score, 100)
    if score >= 72:
        tier = "High"
    elif score >= 48:
        tier = "Medium"
    else:
        tier = "Lower"

    draft["reach_score"] = score
    draft["reach_tier"] = tier
    draft["reach_reason"] = " · ".join(wave_stack)
    draft["wave_stack"] = wave_stack
    return draft


def _compose_partnership_drafts(
    *,
    brand: str,
    topic: str,
    keywords: dict[str, Any],
    top_posts: list[dict[str, Any]],
    brand_posts: list[dict[str, Any]],
    must_tag: str | None,
    link: str | None,
    client_hashtags: str | None,
) -> tuple[list[dict[str, str]], list[str]]:
    terms = keywords.get("suggested_keywords") or []
    live_tag_list = keywords.get("suggested_hashtags") or []
    history = _load_variation_history()

    def term_at(idx: int, fallback: str = "AI") -> str:
        return terms[idx] if idx < len(terms) else fallback

    def post_at(idx: int) -> dict[str, Any] | None:
        return top_posts[idx] if idx < len(top_posts) else None

    brand_hook = _hook_fragment(brand_posts[0] if brand_posts else None)

    candidates: list[dict[str, str]] = []

    p0 = post_at(0)
    if p0:
        hook = _hook_fragment(p0)
        candidates.append(
            {
                "label": "Option A — QRT this thread",
                "angle": "qrt_reaction",
                "anchor": p0.get("url", ""),
                "anchor_eng": p0.get("engagement", 0),
                "_must_tag": must_tag,
                "text": _algo_open(
                    term_at(0, topic),
                    (
                        f"{hook} …I'd QRT this and tie in {brand}."
                        f"{_footer(must_tag=must_tag, link=link, client_hashtags=client_hashtags, live_tags=live_tag_list, draft_idx=0)}"
                    ),
                ).strip(),
            }
        )

    p1 = post_at(1)
    if p1:
        candidates.append(
            {
                "label": "Option B — Workflow angle",
                "angle": "contrarian",
                "anchor": p1.get("url", ""),
                "anchor_eng": p1.get("engagement", 0),
                "_must_tag": must_tag,
                "text": _algo_open(
                    term_at(1, topic),
                    (
                        f"@{p1.get('username', 'thread')} has the {term_at(1, topic)} chatter right. "
                        f"Most posts still skip the workflow part. {brand} lives where teams already work."
                        f"{_footer(must_tag=must_tag, link=link, client_hashtags=client_hashtags, live_tags=live_tag_list, draft_idx=1)}"
                    ),
                ).strip(),
            }
        )

    p2 = post_at(2)
    candidates.append(
        {
            "label": "Option C — After testing it",
            "angle": "field_demo",
            "anchor": p2.get("url", "") if p2 else "",
            "anchor_eng": (p2 or {}).get("engagement", 0),
            "_must_tag": must_tag,
            "text": _algo_open(
                term_at(2, topic),
                (
                    f"Tested a stack of {term_at(2, topic)} tools this month. "
                    f"{brand} stayed on the list after one afternoon with a real team."
                    f"{_footer(must_tag=must_tag, link=link, client_hashtags=client_hashtags, live_tags=live_tag_list, draft_idx=2)}"
                ),
            ).strip(),
        }
    )

    if brand_hook:
        candidates.append(
            {
                "label": "Option D — QRT their post",
                "angle": "brand_moment",
                "anchor": (brand_posts[0].get("url", "") if brand_posts else ""),
                "anchor_eng": (brand_posts[0].get("engagement", 0) if brand_posts else 0),
                "_must_tag": must_tag,
                "text": _algo_open(
                    term_at(0, topic),
                    (
                        f"{brand}: \"{brand_hook}…\" I'd QRT that and add what it means for builders."
                        f"{_footer(must_tag=must_tag, link=link, client_hashtags=client_hashtags, live_tags=live_tag_list, draft_idx=3)}"
                    ),
                ).strip(),
            }
        )

    p3 = post_at(3)
    candidates.append(
        {
            "label": "Option E — Chat box vs embedded",
            "angle": "question",
            "anchor": p3.get("url", "") if p3 else "",
            "anchor_eng": (p3 or {}).get("engagement", 0),
            "_must_tag": must_tag,
            "text": _algo_open(
                term_at(3, topic),
                (
                    f"People shipping {term_at(3, topic)} keep choosing between another chat box "
                    f"and wiring into tools they already live in. {brand} went embedded."
                    f"{_footer(must_tag=must_tag, link=link, client_hashtags=client_hashtags, live_tags=live_tag_list, draft_idx=4)}"
                ),
            ).strip(),
        }
    )

    p4 = post_at(4)
    if p4 and re.search(r"\d", _hook_fragment(p4)):
        candidates.append(
            {
                "label": "Option F — Beyond the list",
                "angle": "listicle_pushback",
                "anchor": p4.get("url", ""),
                "anchor_eng": p4.get("engagement", 0),
                "_must_tag": must_tag,
                "text": _algo_open(
                    term_at(4, topic),
                    (
                        f"Another {term_at(4, topic)} tools thread today. Good list. "
                        f"Still doesn't show you a team running a week. {brand} does."
                        f"{_footer(must_tag=must_tag, link=link, client_hashtags=client_hashtags, live_tags=live_tag_list, draft_idx=5)}"
                    ),
                ).strip(),
            }
        )

    selected: list[dict[str, str]] = []
    seen_angles: set[str] = set()
    for cand in candidates:
        if cand["angle"] in seen_angles:
            continue
        if _is_too_similar(cand["text"], history):
            continue
        selected.append(cand)
        seen_angles.add(cand["angle"])
        if len(selected) >= 3:
            break

    # Fill to 3 with remaining candidates even if similar to history (never return empty).
    if len(selected) < 3:
        for cand in candidates:
            if cand in selected:
                continue
            if cand["angle"] in {d.get("angle") for d in selected}:
                continue
            selected.append(cand)
            if len(selected) >= 3:
                break

    for draft in selected[:3]:
        draft["text"] = _sanitize_draft(draft.get("text", ""))
        _reach_score_draft(draft, terms=terms)
        draft.pop("_must_tag", None)

    selected[:3] = sorted(selected[:3], key=lambda d: d.get("reach_score", 0), reverse=True)

    for idx, draft in enumerate(selected[:3], start=1):
        label = draft.get("label", "Draft")
        rest = label.split("—", 1)[-1].strip() if "—" in label else label
        suffix = " (Recommended)" if idx == 1 else ""
        draft["label"] = f"Option {idx} — {rest}{suffix}"

    differentiation = [
        "Each option anchors a different live thread or angle (QRT, contrarian, field demo, brand moment, question).",
        "No shared opener across options — if two drafts start the same way, rewrite one.",
        "Rotate hashtags: one tag per draft max when using live signal tags.",
        "Never reuse banned partnership boilerplate (see anti_template_phrases).",
        f"Variation history tracks {len(history)} recent openers across campaigns to reduce copy/paste feel.",
    ]

    new_openers = [d["text"][:72] for d in selected[:3]]
    _save_variation_history(new_openers)
    return selected[:3], differentiation


def partnership_intel(
    client: XClient,
    *,
    brand: str,
    topic: str,
    handle: str | None = None,
    must_tag: str | None = None,
    link: str | None = None,
    hashtags: str | None = None,
    max_results: int = 25,
) -> dict[str, Any]:
    handle_norm = normalize_handle(handle) if handle else ""
    tag_handle = must_tag.lstrip("@") if must_tag and must_tag.startswith("@") else (must_tag or "")
    if must_tag and must_tag.startswith("@"):
        must_tag = must_tag
    elif tag_handle:
        must_tag = f"@{tag_handle}"

    topic_terms = re.sub(r"[^\w\s]", " ", topic)
    topic_terms = re.sub(r"\s+", " ", topic_terms).strip()
    queries: dict[str, str] = {}
    all_tweets: list[dict[str, Any]] = []
    all_users: dict[str, dict[str, Any]] = {}

    topic_query = f'("{topic}" OR {topic_terms}) lang:en -is:retweet'
    queries["topic"] = topic_query
    topic_payload = client.search_recent(topic_query, max_results=max_results)
    all_users.update(index_users(topic_payload))
    all_tweets.extend(topic_payload.get("data") or [])

    if handle_norm:
        brand_query = f"(@{handle_norm} OR {brand}) lang:en -is:retweet"
        queries["brand"] = brand_query
        brand_payload = client.search_recent(brand_query, max_results=max_results)
        all_users.update(index_users(brand_payload))
        all_tweets.extend(brand_payload.get("data") or [])

    brand_posts: list[dict[str, Any]] = []
    if handle_norm:
        try:
            profile = client.users_by_username(handle_norm)
            if profile.get("id"):
                brand_posts = client.user_tweets(str(profile["id"]), max_results=8)
        except RuntimeError:
            profile = {}
    else:
        profile = {}

    top_posts = summarize_tweets(all_tweets, all_users, limit=10)
    brand_summaries = summarize_tweets(brand_posts, {str(profile.get("id", "")): profile} if profile else {}, limit=4)
    keywords = keyword_pack(all_tweets)
    audience_play = robert_audience_play(top_posts=top_posts, keywords=keywords)
    opening_patterns = _opening_patterns(top_posts)
    drafts, differentiation_notes = _compose_partnership_drafts(
        brand=brand,
        topic=topic,
        keywords=keywords,
        top_posts=top_posts,
        brand_posts=brand_summaries,
        must_tag=must_tag,
        link=link,
        client_hashtags=hashtags,
    )

    algo_playbook = build_algo_playbook(
        keywords=keywords,
        audience_play=audience_play,
        must_tag=must_tag,
        client_hashtags=hashtags,
    )

    wording_rules = list(algo_playbook.get("steps") or [])
    wording_rules.extend(algo_playbook.get("dont") or [])

    return {
        "mode": "partnership",
        "generated_at": utc_now_iso(),
        "brand": brand,
        "topic": topic,
        "handle": handle_norm or None,
        "must_include": {"tag": must_tag, "link": link, "hashtags": hashtags},
        "queries": queries,
        "keywords": keywords,
        "opening_patterns": opening_patterns,
        "audience_play": audience_play,
        "brand_recent_posts": brand_summaries,
        "top_conversation": top_posts[:6],
        "wording_rules": wording_rules,
        "differentiation_notes": differentiation_notes,
        "anti_template_phrases": list(PARTNERSHIP_BANNED_PHRASES),
        "algo_playbook": algo_playbook,
        "draft_posts": drafts,
        "headline": (
            f"Sponsored post wording for {brand}: lead with "
            f"{', '.join((keywords.get('suggested_keywords') or [])[:3]) or topic} — "
            f"{audience_play.get('timing_window', '')}"
        ),
    }


def render_partnership_markdown(brief: dict[str, Any]) -> str:
    keywords = brief.get("keywords") or {}
    play = brief.get("audience_play") or {}
    must = brief.get("must_include") or {}
    lines = [
        f"# Partnership Draft Signal — {brief.get('brand', '')}",
        "",
        f"**Topic:** {brief.get('topic', '')}",
        f"**Generated:** {brief.get('generated_at', '')}",
        f"**Headline:** {brief.get('headline', '')}",
        "",
        "## Must include",
        f"- **Tag:** {must.get('tag') or '—'}",
        f"- **Link:** {must.get('link') or '—'}",
        f"- **Hashtags:** {must.get('hashtags') or '—'}",
        "",
        "## Live keywords (use in drafts)",
    ]
    if keywords.get("suggested_keywords"):
        lines.append("**Terms:** " + ", ".join(keywords["suggested_keywords"][:8]))
    if keywords.get("suggested_hashtags"):
        lines.append("**Hashtags in play:** " + " ".join(keywords["suggested_hashtags"][:4]))

    lines.extend(["", "## How people are opening posts right now"])
    for pattern in brief.get("opening_patterns") or []:
        lines.append(f"- \"{pattern}…\"")

    lines.extend(
        [
            "",
            "## Wording rules for this partnership",
        ]
    )
    for rule in brief.get("wording_rules") or []:
        lines.append(f"- {rule}")

    lines.extend(["", "## Anti copy/paste"])
    for note in brief.get("differentiation_notes") or []:
        lines.append(f"- {note}")
    banned = brief.get("anti_template_phrases") or []
    if banned:
        lines.append("- **Never use:** " + ", ".join(f'"{p}"' for p in banned[:6]) + ", …")

    lines.extend(
        [
            "",
            f"## Timing — {play.get('timing_window', '—')}",
            f"**Primary move:** {play.get('primary_move', '—')}",
            "",
            "## Draft post options (algo-informed)",
        ]
    )
    for draft in brief.get("draft_posts") or []:
        lines.append(f"### {draft.get('label', 'Draft')}")
        if draft.get("reach_score") is not None:
            lines.append(
                f"*Reach {draft.get('reach_score')}/100 ({draft.get('reach_tier', '')})* — "
                f"{draft.get('reach_reason', '')}"
            )
        if draft.get("anchor"):
            lines.append(f"*Anchor thread:* {draft['anchor']}")
        lines.append(draft.get("text", ""))
        lines.append("")

    if brief.get("top_conversation"):
        lines.append("## Top threads to attach to")
        for post in brief["top_conversation"]:
            lines.append(f"- [{post['engagement']} eng] @{post.get('username', '?')}: {post['text'][:180]}")
            lines.append(f"  {post.get('url', '')}")

    return "\n".join(lines) + "\n"


def render_guest_markdown(brief: dict[str, Any]) -> str:
    profile = brief.get("profile") or {}
    handle = brief.get("handle") or profile.get("username") or "unknown"
    metrics = profile.get("public_metrics") or {}
    lines = [
        f"# Guest Intel — @{handle}",
        "",
        f"**Generated:** {brief.get('generated_at', '')}",
        f"**Moment:** {brief.get('moment', '')}",
        "",
        "## Profile",
        f"- **Name:** {profile.get('name', '')}",
        f"- **Bio:** {(profile.get('description') or '').strip() or '—'}",
        f"- **Followers:** {metrics.get('followers_count', '—')}",
        "",
        "## Resonating angles",
    ]
    angles = brief.get("angles") or []
    if angles:
        for item in angles[:6]:
            lines.append(f"- **{item['term']}** ({item['count']} mentions in sample)")
    else:
        lines.append("- No strong angle terms in sample")

    lines.extend(["", "## Their recent posts (by engagement)"])
    for post in brief.get("their_posts") or []:
        lines.append(f"- [{post['engagement']} eng] {post['text'][:220]}")
        lines.append(f"  {post['url']}")

    lines.extend(["", "## What people are saying about them"])
    for post in brief.get("mentions") or []:
        lines.append(f"- @{post.get('username', '?')} [{post['engagement']} eng]: {post['text'][:220]}")
        lines.append(f"  {post['url']}")

    lines.extend(["", "## Outreach angle", _guest_outreach_hint(brief)])
    return "\n".join(lines) + "\n"


def _guest_outreach_hint(brief: dict[str, Any]) -> str:
    angles = [a["term"] for a in (brief.get("angles") or [])[:3]]
    top_mention = (brief.get("mentions") or [None])[0]
    if top_mention:
        return (
            f"Lead with what others are already discussing: \"{top_mention['text'][:120]}…\" "
            f"Terms in play: {', '.join(angles) or 'general visibility'}."
        )
    top_own = (brief.get("their_posts") or [None])[0]
    if top_own:
        return f"Reference their recent post on {', '.join(angles[:2]) or 'their current theme'}: \"{top_own['text'][:120]}…\""
    return "Light touch — low recent mention volume; pitch the show topic directly."


def render_timing_markdown(brief: dict[str, Any]) -> str:
    lines = [
        "# Content Drop Timing — X Signal",
        "",
        f"**Generated:** {brief.get('generated_at', '')}",
        f"**Recommendation:** {brief.get('recommendation', '')}",
        "",
        "## Best hooks (all niches)",
    ]
    for hook in brief.get("best_hooks") or []:
        lines.append(
            f"- **[{hook.get('pack', '')}]** {hook['engagement']} eng — @{hook.get('username', '?')}: "
            f"{hook['text'][:200]}"
        )
        lines.append(f"  {hook.get('url', '')}")

    lines.append("")
    for pack_id, lane in (brief.get("lanes") or {}).items():
        if pack_id == "custom":
            continue
        lines.append(f"## {lane.get('label', pack_id)}")
        lines.append(f"Query: `{lane.get('query', '')}`")
        angles = lane.get("angles") or []
        if angles:
            terms = ", ".join(f"{a['term']}({a['count']})" for a in angles[:5])
            lines.append(f"Trending terms: {terms}")
        for post in lane.get("top_posts") or []:
            lines.append(f"- [{post['engagement']} eng] @{post.get('username', '?')}: {post['text'][:180]}")
        lines.append("")

    return "\n".join(lines) + "\n"


def _first_key_fact_line(config: dict[str, Any]) -> str:
    facts = config.get("key_facts") or []
    if not facts:
        return ""
    row = facts[0]
    if isinstance(row, (list, tuple)) and len(row) >= 2:
        return f"{row[0]}: {row[1]}."
    return str(row)


def enrich_brief_config(config: dict[str, Any]) -> dict[str, Any]:
    """
    Merge live X partnership signal into a brief-creator config before PDF generation.
    Preserves campaign key_facts / go-live; replaces draft wording with algo-informed options.
    """
    enriched = dict(config)
    x_cfg = enriched.get("x_signal") or {}
    if x_cfg.get("enabled") is False:
        return enriched

    must = enriched.get("must_include") or {}
    tag = (must.get("tag") or x_cfg.get("tag") or "").strip()
    brand = (x_cfg.get("brand") or enriched.get("title") or "").strip()
    if not brand and not tag:
        enriched["x_signal_skipped"] = "no brand or tag to query"
        return enriched

    if not brand:
        brand = tag.lstrip("@").replace("_", " ").title()

    topic = (x_cfg.get("topic") or enriched.get("title") or brand).strip()
    handle = (x_cfg.get("handle") or tag.lstrip("@") or "").strip() or None
    link = (must.get("link") or x_cfg.get("link") or "").strip() or None
    hashtags = (must.get("hashtags") or x_cfg.get("hashtags") or "").strip() or None
    max_results = int(x_cfg.get("max_results") or 25)

    try:
        client = XClient()
        signal = partnership_intel(
            client,
            brand=brand,
            topic=topic,
            handle=handle,
            must_tag=tag or None,
            link=link,
            hashtags=hashtags,
            max_results=max_results,
        )
    except RuntimeError as exc:
        enriched["x_signal_error"] = str(exc)
        return enriched

    fact_hook = _first_key_fact_line(enriched)
    brief_drafts: list[dict[str, str]] = []
    for draft in signal.get("draft_posts") or []:
        text = (draft.get("text") or "").strip()
        if fact_hook and fact_hook.lower() not in text.lower():
            text = f"{text}\n\n{fact_hook}"
        anchor = (draft.get("anchor") or "").strip()
        if anchor:
            text = f"{text}\n\nAnchor: {anchor}"
        brief_drafts.append(
            {
                "label": draft.get("label", "Draft"),
                "text": text,
                "reach_score": draft.get("reach_score"),
                "reach_tier": draft.get("reach_tier"),
                "reach_reason": draft.get("reach_reason"),
                "anchor": draft.get("anchor"),
            }
        )

    if brief_drafts:
        enriched["drafts"] = brief_drafts
        enriched["drafts_source"] = "x_signal_partnership"
        top = brief_drafts[0]
        enriched["recommended_reach"] = {
            "label": top.get("label"),
            "reach_score": top.get("reach_score"),
            "reach_reason": top.get("reach_reason"),
        }

    keywords = signal.get("keywords") or {}
    algo = signal.get("algo_playbook") or {}
    enriched["x_signal_result"] = {
        "generated_at": signal.get("generated_at"),
        "headline": signal.get("headline"),
        "keywords": keywords.get("suggested_keywords") or [],
        "hashtags": keywords.get("suggested_hashtags") or [],
        "algo_playbook": algo,
        "wording_rules": signal.get("wording_rules") or [],
        "differentiation_notes": signal.get("differentiation_notes") or [],
        "estimated_api_cost_usd": round(0.50, 2),
    }

    algo_steps = list(algo.get("steps") or [])
    if algo_steps:
        enriched["what_to_do"] = algo_steps + [
            step for step in (enriched.get("what_to_do") or [])
            if not any(k in step.lower() for k in ("qrt", "quote tweet", "first line", "hashtag", "reply to comments"))
        ]

    return enriched


def save_brief(brief: dict[str, Any], markdown: str, *, stem: str) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    json_path = OUTPUT_DIR / f"{stem}-{stamp}.json"
    md_path = OUTPUT_DIR / f"{stem}-{stamp}.md"
    write_json(json_path, brief)
    md_path.write_text(markdown, encoding="utf-8")
    return md_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only X signal intel for UNALIGNED")
    sub = parser.add_subparsers(dest="command", required=True)

    guest_p = sub.add_parser("guest", help="Pre-outreach brief for a potential guest")
    guest_p.add_argument("handle", help="X handle, with or without @")
    guest_p.add_argument("-n", "--mentions", type=int, default=25, help="Mention search sample size")
    guest_p.add_argument("--json", action="store_true", help="Print JSON only")

    timing_p = sub.add_parser("timing", help="Niche conversation scan for content drops")
    timing_p.add_argument("--pack", action="append", dest="packs", help=f"Lane: {', '.join(NICHE_PACKS)}")
    timing_p.add_argument("--query", help="Custom search query (adds a custom lane)")
    timing_p.add_argument("-n", "--max-results", type=int, default=15, help="Posts per lane")
    timing_p.add_argument("--json", action="store_true", help="Print JSON only")

    radar_p = sub.add_parser("radar", help="Free-form X signal — audience play + keywords")
    radar_p.add_argument("question", help="Natural language question about guests, timing, or topics")
    radar_p.add_argument("-n", "--max-results", type=int, default=20, help="Search sample size")
    radar_p.add_argument("--json", action="store_true", help="Print JSON only")

    partner_p = sub.add_parser("partnership", help="Sponsored post wording from live X signal")
    partner_p.add_argument("--brand", required=True, help="Client/brand name")
    partner_p.add_argument("--topic", required=True, help="Campaign topic or product angle")
    partner_p.add_argument("--handle", help="Client X handle (no @)")
    partner_p.add_argument("--tag", dest="must_tag", help="Required @mention for the post")
    partner_p.add_argument("--link", help="Required link")
    partner_p.add_argument("--hashtags", help="Required hashtags string")
    partner_p.add_argument("-n", "--max-results", type=int, default=25, help="Search sample size")
    partner_p.add_argument("--json", action="store_true", help="Print JSON only")

    sub.add_parser("auth-check", help="Verify OAuth token and /users/me")

    args = parser.parse_args()
    client = XClient()

    if args.command == "auth-check":
        result = client.auth_check()
        print(json.dumps(result, indent=2))
        return 0 if result.get("ok") else 1

    try:
        if args.command == "guest":
            brief = guest_intel(client, args.handle, mention_limit=args.mentions)
            md = render_guest_markdown(brief)
            path = save_brief(brief, md, stem=f"guest-{normalize_handle(args.handle)}")
            if args.json:
                print(json.dumps(brief, indent=2, ensure_ascii=False))
            else:
                print(md)
                print(f"Saved: {path}")
            return 0

        if args.command == "timing":
            brief = timing_intel(
                client,
                packs=args.packs,
                custom_query=args.query,
                per_pack=args.max_results,
            )
            md = render_timing_markdown(brief)
            path = save_brief(brief, md, stem="timing")
            if args.json:
                print(json.dumps(brief, indent=2, ensure_ascii=False))
            else:
                print(md)
                print(f"Saved: {path}")
            return 0

        if args.command == "radar":
            brief = radar_intel(client, args.question, max_results=args.max_results)
            md = render_radar_markdown(brief)
            slug = re.sub(r"[^a-z0-9]+", "-", args.question.lower())[:40].strip("-") or "radar"
            path = save_brief(brief, md, stem=f"radar-{slug}")
            if args.json:
                print(json.dumps(brief, indent=2, ensure_ascii=False))
            else:
                print(md)
                print(f"Saved: {path}")
            return 0

        if args.command == "partnership":
            brief = partnership_intel(
                client,
                brand=args.brand,
                topic=args.topic,
                handle=args.handle,
                must_tag=args.must_tag,
                link=args.link,
                hashtags=args.hashtags,
                max_results=args.max_results,
            )
            md = render_partnership_markdown(brief)
            slug = re.sub(r"[^a-z0-9]+", "-", args.brand.lower())[:30].strip("-") or "partner"
            path = save_brief(brief, md, stem=f"partnership-{slug}")
            if args.json:
                print(json.dumps(brief, indent=2, ensure_ascii=False))
            else:
                print(md)
                print(f"Saved: {path}")
            return 0
    except RuntimeError as exc:
        print(f"X signal intel failed: {exc}", file=sys.stderr)
        print("Run: python3 scripts/active/x_signal_intel.py auth-check", file=sys.stderr)
        return 1

    return 1


if __name__ == "__main__":
    raise SystemExit(main())