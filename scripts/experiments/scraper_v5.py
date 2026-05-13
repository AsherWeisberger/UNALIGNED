"""
scraper_v5.py — Gmail → Local MLX (small model extract / big model draft) → Supabase
──────────────────────────────────────────────────────────────────────────────────────
KEY CHANGES FROM v4:
  [1] Dual-model config — EXTRACT_MODEL (14B/8B) for extraction, DRAFT_MODEL (35B)
      for reply drafting. Extraction RAM drops from ~44GB to ~18-22GB, leaving
      comfortable headroom on a 48GB M4 Pro while still using AI calls.
  [2] Extraction prompt now sends actual thread body (not just snippet). v4 fetched
      full threads but _format_thread_for_prompt only forwarded the 300-char snippet.
      Fixed: up to 1 500 chars of conversation body per email sent to extraction model.
  [3] Aggressive gc.collect() BEFORE and AFTER every LLM call (not just before).
  [4] CHUNK_SIZE = 1 — one email per extraction call, minimum KV-cache pressure.
  [5] Both model servers auto-start if not running. If DRAFT_MODEL == EXTRACT_MODEL
      (or DRAFT_MODEL_URL == EXTRACT_MODEL_URL) a single server handles everything.
  [6] Max-tokens tuned per task: extraction 1 024, drafting 2 500.

RAM profile on M4 Pro 48GB (recommended config):
  • Extraction: rapid-mlx serve Qwen3-14B  → ~18-22 GB (weights + KV cache)
  • Drafting:   rapid-mlx serve qwen3.6-35b → ~38-42 GB (only while drafting)
  • If you never run both simultaneously the machine stays stable.

Usage:
    python scraper_v5.py               # incremental (since last run)
    python scraper_v5.py --full        # 6-month backfill
    python scraper_v5.py --dry-run     # filter + thread fetch only, no AI or write
"""

from __future__ import annotations

import asyncio
import base64
import gc
import json
import logging
import os
import re
import sys
import time
import typing
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Optional

import httpx
from openai import AsyncOpenAI

# ─────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────

CREDENTIALS_DIR = Path("/Users/asherweisberger/.config/google-credentials")

_env_file = CREDENTIALS_DIR / "unaligned-scraper.env"
if _env_file.exists():
    for _line in _env_file.read_text().splitlines():
        _line = _line.strip()
        if _line.startswith("export "):
            _line = _line[len("export "):]
        if "=" in _line and not _line.startswith("#"):
            _k, _, _v = _line.partition("=")
            _k = _k.strip()
            _v = _v.strip().strip('"')
            if _v:
                os.environ[_k] = _v

# ── Model A: small model used for lead extraction ──────────────────────────
# Recommended: Qwen3-14B (~18-22 GB RAM). Qwen3-8B also works (~10-13 GB).
# Start command: rapid-mlx serve Qwen3-14B --enable-prefix-cache --pin-system-prompt
EXTRACT_MODEL_URL  = os.environ.get("EXTRACT_MODEL_URL",  "http://127.0.0.1:8000/v1")
EXTRACT_MODEL_NAME = os.environ.get("EXTRACT_MODEL_NAME", "Qwen3-14B")

# ── Model B: large model used for reply drafting ───────────────────────────
# Recommended: qwen3.6-35b (~38-42 GB RAM). Only loaded when drafting runs.
# Set DRAFT_MODEL_URL to a different port if you want both loaded simultaneously,
# but that requires >60 GB RAM. Safer: let this default to the same server and
# just swap the model name — rapid-mlx loads whichever you start manually.
DRAFT_MODEL_URL  = os.environ.get("DRAFT_MODEL_URL",  "http://127.0.0.1:8000/v1")
DRAFT_MODEL_NAME = os.environ.get("DRAFT_MODEL_NAME", "qwen3.6-35b")

SUPABASE_URL     = os.environ.get("SUPABASE_URL",            "https://hbnpwphxjurvtydezwgh.supabase.co")
SUPABASE_ANON    = os.environ.get("SUPABASE_ANON_KEY",       "")
SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
TELEGRAM_TOKEN   = os.environ.get("TELEGRAM_TOKEN",          "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID",        "")

CONCURRENCY         = 5    # parallel Gmail metadata fetches
THREAD_CONCURRENCY  = 3    # parallel full thread fetches
CHUNK_SIZE          = 1    # one email per extraction call — minimum RAM pressure
CHECKPOINT_INTERVAL = 100

TOKEN_FILE      = CREDENTIALS_DIR / "gmail-token.json"
CHECKPOINT_FILE = CREDENTIALS_DIR / "scraper_v5_checkpoint.json"
LOG_FILE        = CREDENTIALS_DIR / "scraper_v5.log"
STATUS_FILE     = CREDENTIALS_DIR / "scraper_v5_status.json"
LAST_RUN_FILE   = CREDENTIALS_DIR / "scraper_v5_last_run.txt"

EXTRACT_BODY_LIMIT = 1500   # chars of thread body sent to extraction model per email
EXTRACT_MAX_TOKENS = 1024   # sufficient for 0-1 lead JSON objects
DRAFT_MAX_TOKENS   = 2500   # reply drafts need more room

AI_CONCURRENCY  = 1     # local MLX server is single-threaded
CHUNK_DELAY     = 1.5   # seconds between chunks
MAX_429_RETRIES = 6


def _write_status(phase: str, **kwargs):
    data = {"phase": phase, "updated_at": datetime.utcnow().isoformat(), **kwargs}
    STATUS_FILE.write_text(json.dumps(data, indent=2))


# ─── Gmail query ────────────────────────────────────────────────────────────
GMAIL_QUERY = (
    "("
    "from:scoble "
    "OR subject:unaligned OR subject:scobelizer "
    'OR subject:partnership OR subject:collaboration OR subject:sponsorship '
    'OR subject:"interview request" OR subject:"guest appearance" '
    'OR subject:"sponsored interview" OR subject:"podcast guest" '
    'OR subject:"media kit" OR subject:"press inquiry" '
    'OR subject:"business proposal" OR subject:"partnership proposal" '
    'OR subject:"demo request" OR subject:"feature request" '
    "OR subject:investment OR subject:funding "
    'OR subject:"press release" OR subject:exclusive '
    'OR subject:"robert scoble" OR subject:"robert s" '
    ")"
)

INTENT_PHRASES = [
    "scoble", "scobelizer", "unaligned",
    "partnership", "collaboration", "sponsorship", "sponsor",
    "interview request", "interview opportunity",
    "guest appearance", "podcast guest", "podcast interview",
    "business proposal", "partnership proposal",
    "media kit", "press inquiry", "press release",
    "demo request", "feature request",
    "investment", "funding",
    "robert scoble",
    "exclusive opportunity", "paid opportunity",
    "brand deal", "affiliate deal",
]

METADATA_HEADERS = ["From", "Subject", "Date"]

COLUMN_MAP = {
    "partnership":   "first-touch",
    "sponsorship":   "first-touch",
    "interview":     "first-touch",
    "collaboration": "first-touch",
    "intro":         "first-touch",
    "other":         "first-touch",
}

TEAM_SENDERS = [
    "scobleizer@gmail.com",
    "samlevin@mac.com",
    "asherweisberger",
    "robert scoble",
    "sam levin",
    "asher weisberger",
]

PRICING_SIGNALS = [
    "$", "budget", "rate", "fee", "payment", "invoice", "proposal",
    "quote", "contract", "cost", "pricing", "price", "paid", "pay",
    "compensation", "flat fee", "per post", "per video", "per episode",
    "revenue share", "commission", "equity", "deal", "offer", "package",
    "thousand", "k usd", "k $", "usd", "eur", "gbp",
]


def thread_has_reply(conversation: list[dict]) -> bool:
    for msg in conversation:
        sender = (msg.get("from") or "").lower()
        if any(t in sender for t in TEAM_SENDERS):
            return True
    return False


def has_pricing_signal(conversation: list[dict], lead: dict) -> bool:
    if lead.get("deal_value"):
        return True
    full_text = " ".join((m.get("body") or "") for m in conversation).lower()
    return any(sig in full_text for sig in PRICING_SIGNALS)


# ─────────────────────────────────────────────────────────────
# LLM CLIENTS — separate extract (small) and draft (large)
# ─────────────────────────────────────────────────────────────

_RAPID_MLX_STARTUP_WAIT = 60


def _ping_local_server(url: str, timeout: float = 3.0) -> bool:
    try:
        import urllib.request
        req = urllib.request.urlopen(
            url.rstrip("/").rstrip("/v1") + "/v1/models", timeout=timeout
        )
        return req.status == 200
    except Exception:
        return False


def _autostart_model(model_name: str, url: str) -> None:
    """Start rapid-mlx for model_name if the server at url is not responding."""
    if _ping_local_server(url):
        return
    import subprocess
    port = url.split(":")[-1].split("/")[0] if ":" in url else "8000"
    cmd = [
        "/opt/homebrew/bin/rapid-mlx", "serve", model_name,
        "--port", port,
        "--enable-prefix-cache", "--pin-system-prompt",
    ]
    print(f"[scraper] Starting rapid-mlx ({model_name}) on port {port} …")
    subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    deadline = time.time() + _RAPID_MLX_STARTUP_WAIT
    while time.time() < deadline:
        time.sleep(5)
        if _ping_local_server(url):
            print(f"[scraper] {model_name} ready.")
            return
    raise RuntimeError(
        f"rapid-mlx failed to start {model_name} within {_RAPID_MLX_STARTUP_WAIT}s. "
        f"Start manually: rapid-mlx serve {model_name} --enable-prefix-cache --pin-system-prompt"
    )


def make_extract_client() -> tuple[AsyncOpenAI, str]:
    """Return (client, model_name) for the small extraction model."""
    _autostart_model(EXTRACT_MODEL_NAME, EXTRACT_MODEL_URL)
    return AsyncOpenAI(base_url=EXTRACT_MODEL_URL, api_key="ollama"), EXTRACT_MODEL_NAME


def make_draft_client() -> tuple[AsyncOpenAI, str]:
    """Return (client, model_name) for the large reply-drafting model.

    If DRAFT_MODEL_URL == EXTRACT_MODEL_URL and you have the 35B loaded, it
    reuses the same server. If you want them isolated, point DRAFT_MODEL_URL to
    a second rapid-mlx instance on a different port.
    """
    _autostart_model(DRAFT_MODEL_NAME, DRAFT_MODEL_URL)
    return AsyncOpenAI(base_url=DRAFT_MODEL_URL, api_key="ollama"), DRAFT_MODEL_NAME


# ─────────────────────────────────────────────────────────────
# LOGGING
# ─────────────────────────────────────────────────────────────

CREDENTIALS_DIR.mkdir(parents=True, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger("scraper_v5")


# ─────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────

def _clean(val, fallback: str = "") -> str:
    if val is None:
        return fallback
    s = str(val).strip()
    if s.lower() in ("null", "none", "n/a", ""):
        return fallback
    return s


def _parse_date_display(raw_date: str) -> str:
    if not raw_date:
        return ""
    try:
        from zoneinfo import ZoneInfo
        dt = parsedate_to_datetime(raw_date)
        dt_utc = dt.astimezone(ZoneInfo("UTC"))
        sf  = dt_utc.astimezone(ZoneInfo("America/Los_Angeles")).strftime("%b %d, %Y %-I:%M%p PT")
        est = dt_utc.astimezone(ZoneInfo("America/Indiana/Indianapolis")).strftime("%-I:%M%p ET")
        return f"{sf} / {est}"
    except Exception:
        match = re.search(r"\d{1,2}\s+\w+\s+\d{4}", raw_date)
        if match:
            try:
                return datetime.strptime(match.group(), "%d %b %Y").strftime("%b %d, %Y")
            except Exception:
                pass
        return raw_date[:30].strip()


def _parse_date_iso(raw_date: str) -> str:
    if not raw_date:
        return ""
    try:
        from zoneinfo import ZoneInfo
        dt = parsedate_to_datetime(raw_date)
        return dt.astimezone(ZoneInfo("America/Los_Angeles")).strftime("%Y-%m-%d")
    except Exception:
        return ""


def _parse_json_flexible(raw: str) -> Optional[list]:
    try:
        return json.loads(raw, strict=False)
    except json.JSONDecodeError:
        pass
    try:
        start = raw.index("[")
        end   = raw.rindex("]") + 1
        return json.loads(raw[start:end], strict=False)
    except (json.JSONDecodeError, ValueError):
        pass
    try:
        cleaned = re.sub(r",(\s*[}\]])", r"\1", raw)
        cleaned = re.sub(r"[\x00-\x1f\x7f-\x9f]", "", cleaned)
        return json.loads(cleaned, strict=False)
    except json.JSONDecodeError:
        pass
    log.warning(f"JSON parse failed for: {raw[:200]!r}...")
    return None


# ─────────────────────────────────────────────────────────────
# GMAIL AUTH
# ─────────────────────────────────────────────────────────────

def get_gmail_token() -> str:
    with open(TOKEN_FILE) as f:
        data = json.load(f)

    refresh = False
    expiry_raw = data.get("expiry") or data.get("token_expiry")

    if expiry_raw:
        try:
            expiry_dt = datetime.fromisoformat(expiry_raw.replace("Z", "+00:00"))
            if time.time() >= (expiry_dt.timestamp() - 300):
                refresh = True
        except Exception:
            refresh = True
    else:
        refresh = True

    if refresh:
        log.info("Refreshing Gmail access token …")
        resp = httpx.post(
            data["token_uri"],
            data={
                "client_id":     data["client_id"],
                "client_secret": data["client_secret"],
                "refresh_token": data["refresh_token"],
                "grant_type":    "refresh_token",
            },
            timeout=30,
        )
        if resp.status_code == 200:
            token_data = resp.json()
            data["token"] = token_data["access_token"]
            from datetime import timedelta
            new_expiry = datetime.utcnow().replace(tzinfo=timezone.utc) + timedelta(
                seconds=token_data.get("expires_in", 3600)
            )
            data["expiry"] = new_expiry.isoformat()
            with open(TOKEN_FILE, "w") as f:
                json.dump(data, f, indent=2)
            log.info("Token refreshed.")
            return data["token"]
        else:
            raise RuntimeError(f"Token refresh failed: {resp.status_code} {resp.text}")

    return data["token"]


# ─────────────────────────────────────────────────────────────
# STEP 1 — PARALLEL GMAIL METADATA SCRAPE
# ─────────────────────────────────────────────────────────────

async def fetch_all_metadata(token: str, query: str) -> list[dict]:
    all_ids = []
    page_token = None
    log.info("Paging Gmail IDs …")

    async with httpx.AsyncClient(timeout=60.0) as client:
        while True:
            params = {"q": query, "maxResults": 500}
            if page_token:
                params["pageToken"] = page_token
            resp = await client.get(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages",
                headers={"Authorization": f"Bearer {token}"},
                params=params,
            )
            data = resp.json()
            all_ids.extend([m["id"] for m in data.get("messages", [])])
            page_token = data.get("nextPageToken")
            if not page_token:
                break

    log.info(f"Found {len(all_ids)} message IDs — fetching metadata …")

    sem     = asyncio.Semaphore(CONCURRENCY)
    results: list[dict] = []

    async def fetch_one(msg_id: str, attempt: int = 0) -> dict:
        async with sem:
            try:
                async with httpx.AsyncClient(timeout=30.0) as c:
                    resp = await c.get(
                        f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg_id}",
                        headers={"Authorization": f"Bearer {token}"},
                        params={"format": "metadata", "metadataHeaders": METADATA_HEADERS},
                    )
                    if resp.status_code == 429 and attempt < 3:
                        await asyncio.sleep(2 ** attempt)
                        return await fetch_one(msg_id, attempt + 1)
                    resp.raise_for_status()
                    raw  = resp.json()
                    hdrs = {h["name"]: h["value"] for h in raw.get("payload", {}).get("headers", [])}
                    raw_date = hdrs.get("Date", "").strip()
                    return {
                        "id":              msg_id,
                        "subject":         hdrs.get("Subject", "").strip(),
                        "from":            hdrs.get("From", "").strip(),
                        "date_raw":        raw_date,
                        "date":            _parse_date_display(raw_date),
                        "date_iso":        _parse_date_iso(raw_date),
                        "snippet":         raw.get("snippet", "").strip(),
                        "gmail_thread_id": raw.get("threadId", ""),
                    }
            except Exception as e:
                log.error(f"Metadata fetch failed for {msg_id}: {e}")
                return {}

    tasks = [fetch_one(i) for i in all_ids]
    for coro in asyncio.as_completed(tasks):
        result = await coro
        if result:
            results.append(result)
        if len(results) % CHECKPOINT_INTERVAL == 0 and results:
            CHECKPOINT_FILE.write_text(json.dumps(results, indent=2))
            log.info(f"  Checkpoint: {len(results)} emails.")

    log.info(f"Metadata fetch complete: {len(results)} emails.")
    return results


# ─────────────────────────────────────────────────────────────
# STEP 2 — INTENT FILTER
# ─────────────────────────────────────────────────────────────

def intent_filter(emails: list[dict]) -> list[dict]:
    relevant = []
    for e in emails:
        blob = f"{e['subject']} {e['from']} {e['snippet']}".lower()
        if any(phrase in blob for phrase in INTENT_PHRASES):
            relevant.append(e)
    log.info(f"Intent filter: {len(relevant)}/{len(emails)} passed.")
    return relevant


# ─────────────────────────────────────────────────────────────
# STEP 3 — FULL THREAD FETCH
# ─────────────────────────────────────────────────────────────

def _decode_body(payload: dict) -> str:
    mime = payload.get("mimeType", "")
    if mime == "text/plain":
        data = payload.get("body", {}).get("data", "")
        if data:
            return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")
    elif mime.startswith("multipart/"):
        for part in payload.get("parts", []):
            text = _decode_body(part)
            if text:
                return text
    return ""


def _clean_body(text: str) -> str:
    """Strip quoted reply headers, collapse whitespace. Cap at 3000 chars."""
    lines = text.splitlines()
    cleaned = []
    for line in lines:
        if re.match(r"^(On .+ wrote:|>|_{5,}|From:\s)", line.strip()):
            break
        cleaned.append(line)
    result = "\n".join(cleaned).strip()
    result = re.sub(r"\n{3,}", "\n\n", result)
    return result[:3000]


async def fetch_thread_conversation(
    email: dict, token: str, sem: asyncio.Semaphore
) -> list[dict]:
    thread_id = email.get("gmail_thread_id")
    if not thread_id:
        return []

    thread = None
    FETCH_RETRY_ATTEMPTS = 5
    FETCH_RETRY_DELAY    = 5

    async with sem:
        for attempt in range(FETCH_RETRY_ATTEMPTS):
            token = get_gmail_token()
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.get(
                        f"https://gmail.googleapis.com/gmail/v1/users/me/threads/{thread_id}",
                        headers={"Authorization": f"Bearer {token}"},
                        params={"format": "full"},
                    )
                    if resp.status_code in (429, 403):
                        delay = FETCH_RETRY_DELAY * (2 ** attempt)
                        log.warning(f"{resp.status_code} on thread {thread_id}, retrying in {delay}s")
                        await asyncio.sleep(delay)
                        continue
                    if resp.status_code != 200:
                        log.warning(f"Thread {thread_id} returned {resp.status_code} — skipping.")
                        return []
                    thread = resp.json()
                    break
            except Exception as e:
                log.warning(f"Thread fetch exception for {thread_id} (attempt {attempt+1}): {e}")
                await asyncio.sleep(FETCH_RETRY_DELAY)

    if thread is None:
        log.warning(f"Thread {thread_id} could not be fetched.")
        return []

    conversation = []
    for msg in thread.get("messages", []):
        hdrs     = {h["name"]: h["value"] for h in msg.get("payload", {}).get("headers", [])}
        sender   = hdrs.get("From", "Unknown").strip()
        raw_date = hdrs.get("Date", "").strip()
        body     = _clean_body(_decode_body(msg.get("payload", {})))
        if body:
            conversation.append({
                "from":     sender,
                "date":     _parse_date_display(raw_date),
                "date_iso": _parse_date_iso(raw_date),
                "body":     body,
            })

    return conversation


async def fetch_all_conversations(emails: list[dict], token: str) -> dict[str, list[dict]]:
    sem = asyncio.Semaphore(THREAD_CONCURRENCY)
    log.info(f"Fetching full thread conversations for {len(emails)} emails …")

    async def fetch_one(email: dict) -> tuple[str, list[dict]]:
        convo = await fetch_thread_conversation(email, token, sem)
        return email["id"], convo

    pairs  = await asyncio.gather(*[fetch_one(e) for e in emails])
    result = {email_id: convo for email_id, convo in pairs}
    log.info(f"Thread fetch complete: {sum(1 for v in result.values() if v)} threads with content.")
    return result


def _format_thread_for_prompt(email: dict, conversation: list[dict]) -> str:
    """Build the per-email block sent to the extraction model.

    v4 sent only the 300-char snippet. v5 sends the actual thread body so the
    model can read what was written and apply the evidence rule properly.
    Capped at EXTRACT_BODY_LIMIT chars to keep the small model's context light.
    """
    header = (
        f"From: {email['from']}\n"
        f"Subject: {email['subject']}\n"
        f"Date: {email.get('date', '')}\n"
    )
    if not conversation:
        # Fallback to snippet if thread fetch failed
        return header + f"Body: {email.get('snippet', '')[:300]}"

    # First inbound message body is the most important for lead qualification
    body_parts = []
    chars_used = 0
    for msg in conversation[:4]:  # look at up to 4 messages
        sender = msg.get("from", "")
        body   = (msg.get("body") or "").strip()
        if not body:
            continue
        segment = f"[{sender}]: {body}"
        remaining = EXTRACT_BODY_LIMIT - chars_used
        if remaining <= 0:
            break
        body_parts.append(segment[:remaining])
        chars_used += len(segment)

    return header + "Thread:\n" + "\n---\n".join(body_parts)


# ─────────────────────────────────────────────────────────────
# STEP 4 — AI EXTRACTION (lean prompt, small model)
# ─────────────────────────────────────────────────────────────

# Lean but precise. Designed for a 14B model: clear rules, concrete output format,
# no verbose examples. The evidence rule is the quality gate — it forces the model
# to ground every lead in the actual email text.
EXTRACT_SYSTEM = """\
You are a lead-qualification agent for Unaligned, Robert Scoble's media company.
Identify real inbound business opportunities from the email(s) below.

QUALIFY if the email clearly shows:
  • Someone wanting to sponsor, partner with, or collaborate with Robert Scoble / Unaligned
  • A media opportunity: interview request, podcast guest, press feature
  • A business proposal with a specific ask
  • A direct intro to a potential partner or investor who named Robert / Unaligned

REJECT (return []) if:
  • Newsletter, digest, automated notification, or job application
  • Cold pitch with no specific mention of Robert or Unaligned
  • SEO, crypto, gambling, or generic marketing
  • "Let's connect" with no value proposition
  • You cannot quote a sentence proving real business intent

EVIDENCE RULE: For every lead you return, you MUST be able to quote a line from
the email that proves it's a real opportunity. No quote = no lead.

Return ONLY a valid JSON array. First char must be [ and last must be ].
No markdown, no preamble, no thinking text outside the JSON.

Schema:
[
  {
    "email_id":   "<Gmail message ID exactly as given>",
    "name":       "<sender full name from headers>",
    "business":   "<company name or domain, null if unknown>",
    "email_addr": "<sender email address>",
    "phone":      "<phone if in body, else null>",
    "deal_value": "<dollar amount mentioned, else null>",
    "title":      "<email subject verbatim>",
    "notes":      "<2-3 sentences: who they are, what they want, why it matters>",
    "evidence":   "<exact quote from email proving this is a real lead>",
    "date":       "<date string verbatim>",
    "intent":     "<partnership|sponsorship|interview|collaboration|intro|other>",
    "priority":   "<hot|warm|cold — hot needs specific ask + budget or urgency>",
    "reply_hook": "<1-sentence reply opener referencing something specific from their email>"
  }
]

Return [] for anything that doesn't clearly qualify. Never guess — null over a bad guess.
"""


def _build_extract_prompt(emails: list[dict], conversations: dict[str, list[dict]]) -> str:
    parts = []
    for i, e in enumerate(emails):
        convo = conversations.get(e["id"], [])
        parts.append(f"\n{'='*60}\nEMAIL {i+1}/{len(emails)} | id:{e['id']}\n{'='*60}")
        parts.append(_format_thread_for_prompt(e, convo))
    return "\n".join(parts)


async def extract_all(
    emails: list[dict],
    conversations: dict[str, list[dict]],
    extract_client: AsyncOpenAI,
    extract_model: str,
    existing_ids: set[str],
    id_map: dict[str, dict],
    existing_thread_map: Optional[dict[str, dict]] = None,
) -> tuple[int, int]:
    """Extract leads chunk-by-chunk and write to Supabase immediately.
    Returns (total_extracted, total_written).
    """
    chunks = [emails[i:i + CHUNK_SIZE] for i in range(0, len(emails), CHUNK_SIZE)]
    log.info(
        f"AI extraction: {len(chunks)} chunks of ≤{CHUNK_SIZE} emails "
        f"(model={extract_model}, concurrency={AI_CONCURRENCY}) …"
    )

    sem        = asyncio.Semaphore(AI_CONCURRENCY)
    write_lock = asyncio.Lock()
    total_extracted = 0
    total_written   = 0

    async def extract_chunk(chunk: list[dict], chunk_idx: int, attempt: int = 0) -> list[dict]:
        async with sem:
            await asyncio.sleep(chunk_idx * CHUNK_DELAY)

            for rate_attempt in range(MAX_429_RETRIES + 1):
                try:
                    prompt = _build_extract_prompt(chunk, conversations)

                    gc.collect()  # free any lingering allocations before the LLM call
                    resp = await extract_client.chat.completions.create(
                        model=extract_model,
                        messages=[
                            {"role": "system", "content": EXTRACT_SYSTEM},
                            {"role": "user",   "content": prompt},
                        ],
                        temperature=0.1,
                        max_tokens=EXTRACT_MAX_TOKENS,
                        timeout=180.0,
                    )
                    gc.collect()  # release KV-cache references after the call returns

                    _content = resp.choices[0].message.content
                    if not _content:
                        log.warning(f"  Chunk {chunk_idx}: model returned empty content.")
                        return []
                    text = _content.strip()
                    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
                    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.MULTILINE).strip()

                    # Extract JSON — scan backwards for last valid [...] block
                    parsed = None
                    last = text.rfind("[")
                    while last >= 0:
                        candidate = text[last:]
                        try:
                            parsed = json.loads(candidate)
                            break
                        except json.JSONDecodeError:
                            last_obj = candidate.rfind("},")
                            if last_obj < 0:
                                last_obj = candidate.rfind("}")
                            if last_obj >= 0:
                                repaired = candidate[:last_obj + 1] + "]"
                                try:
                                    parsed = json.loads(repaired, strict=False)
                                    log.info(f"  Chunk {chunk_idx}: repaired truncated JSON.")
                                    break
                                except json.JSONDecodeError:
                                    pass
                            last = text.rfind("[", 0, last)

                    if parsed is None:
                        parsed = _parse_json_flexible(text)
                    if parsed is None:
                        if "[" not in text or "email_id" not in text.lower():
                            log.info(f"  Chunk {chunk_idx}: thinking-only response — no leads.")
                            return []
                        raise json.JSONDecodeError("flexible parse failed", text, 0)
                    if isinstance(parsed, dict) and "leads" in parsed:
                        parsed = parsed["leads"]
                    result = parsed if isinstance(parsed, list) else []
                    log.info(f"  Chunk {chunk_idx}: {len(chunk)} emails → {len(result)} leads.")
                    return result

                except json.JSONDecodeError as e:
                    log.warning(f"JSON parse failed (chunk {chunk_idx}, attempt {attempt}): {e}")
                    if attempt < 2 and len(chunk) > 1:
                        mid = len(chunk) // 2
                        a   = await extract_chunk(chunk[:mid], chunk_idx, attempt + 1)
                        b   = await extract_chunk(chunk[mid:], chunk_idx, attempt + 1)
                        return a + b
                    log.error(f"Chunk {chunk_idx} abandoned after {attempt+1} attempts.")
                    return []

                except Exception as e:
                    err_str = str(e)
                    if "429" in err_str or "rate_limit" in err_str.lower():
                        wait = min(15 * (2 ** rate_attempt), 300)
                        log.warning(
                            f"  Rate limited (chunk {chunk_idx}, retry {rate_attempt+1}/{MAX_429_RETRIES})"
                            f" — waiting {wait}s …"
                        )
                        await asyncio.sleep(wait)
                        continue
                    if "connection" in err_str.lower() or "connect" in err_str.lower():
                        log.warning(f"  Server down (chunk {chunk_idx}) — waiting for rapid-mlx restart …")
                        for _ in range(24):
                            await asyncio.sleep(5)
                            if _ping_local_server(EXTRACT_MODEL_URL):
                                log.info(f"  Server back up — retrying chunk {chunk_idx}.")
                                break
                        else:
                            log.error(f"  Server did not recover — chunk {chunk_idx} abandoned.")
                            return []
                        continue
                    log.error(f"Extraction error (chunk {chunk_idx}): {e}")
                    return []

            log.error(f"Chunk {chunk_idx} exhausted {MAX_429_RETRIES} retries — dropping.")
            return []

    async def process_chunk(chunk: list[dict], chunk_idx: int):
        nonlocal total_extracted, total_written
        leads = await extract_chunk(chunk, chunk_idx)
        if not leads:
            return

        async with write_lock:
            new_leads      = []
            thread_updates = []

            for lead in leads:
                eid = str(lead.get("email_id", "")).strip()
                if not eid:
                    continue
                if eid not in id_map:
                    log.warning(f"Lead dropped — email_id '{eid}' not in metadata.")
                    continue
                if eid in existing_ids:
                    continue

                original     = id_map.get(eid, {})
                conversation = conversations.get(eid, [])
                tid = str(original.get("gmail_thread_id", "")).strip()
                if tid and existing_thread_map and tid in existing_thread_map:
                    existing_card  = existing_thread_map[tid]
                    current_stage  = existing_card.get("list_id", "")
                    if current_stage in ("new", "first-touch", "engaged", "unreplied", "discovery"):
                        new_stage = (
                            "rates-sent" if thread_has_reply(conversation) and has_pricing_signal(conversation, lead)
                            else "engaged"  if thread_has_reply(conversation)
                            else current_stage
                        )
                        if new_stage != current_stage:
                            thread_updates.append((tid, new_stage, conversation))
                            log.info(f"  Thread {tid[:8]}… {current_stage} → {new_stage}")
                    existing_ids.add(eid)
                    continue

                new_leads.append(lead)

            for tid, new_stage, convo in thread_updates:
                update_card_stage_by_thread(tid, new_stage, convo)

            if not new_leads:
                return

            cards = []
            for lead in new_leads:
                eid          = str(lead.get("email_id", "")).strip()
                original     = id_map.get(eid, {})
                conversation = conversations.get(eid, [])
                if not lead.get("date") and original.get("date"):
                    lead["date"] = original["date"]
                cards.append(build_card(lead, original, conversation))

            written = upsert_cards(cards)
            if written < len(cards):
                msg = f"⚠️ Chunk {chunk_idx}: wrote {written}/{len(cards)} cards"
                log.warning(msg)
                send_telegram(msg)
            else:
                log.info(f"  Chunk {chunk_idx}: {written} new cards written.")

            for lead in new_leads:
                existing_ids.add(str(lead.get("email_id", "")))

            total_extracted += len(leads)
            total_written   += written
            _write_status(
                "extracting",
                chunk=chunk_idx + 1, total_chunks=len(chunks),
                extracted=total_extracted, written=total_written,
            )

    tasks = [process_chunk(c, i) for i, c in enumerate(chunks)]
    await asyncio.gather(*tasks)
    log.info(f"Extraction complete: {total_extracted} extracted, {total_written} written.")
    return total_extracted, total_written


# ─────────────────────────────────────────────────────────────
# STEP 5 — BUILD SUPABASE CARD
# ─────────────────────────────────────────────────────────────

def build_card(lead: dict, original_email: dict, conversation: list[dict]) -> dict:
    priority = _clean(lead.get("priority"), "cold").lower()
    intent   = _clean(lead.get("intent"),   "other").lower()

    if priority not in ("hot", "warm", "cold"):
        priority = "cold"
    if intent not in ("partnership", "sponsorship", "interview", "collaboration", "intro", "other"):
        intent = "other"

    from_raw     = original_email.get("from", "")
    em_match     = re.search(r"<([^>]+)>", from_raw)
    sender_email = em_match.group(1).strip() if em_match else from_raw.strip()
    from_name    = re.sub(r"<[^>]+>", "", from_raw).strip()

    date_display = original_email.get("date")     or _clean(lead.get("date"), "")
    date_iso     = original_email.get("date_iso") or _parse_date_iso(original_email.get("date_raw", ""))

    notes_text    = _clean(lead.get("notes"),    "No summary available.")
    evidence_text = _clean(lead.get("evidence"), "")

    rich_desc = {
        "rich_description": notes_text,
        "evidence":         evidence_text,
        "intent":           intent,
        "priority":         priority,
        "deal_value":       _clean(lead.get("deal_value"), ""),
    }

    priority_emoji = "🔥" if priority == "hot" else "🌡️" if priority == "warm" else "❄️"
    deal_value     = _clean(lead.get("deal_value"), "")
    deal_type_label = "💼 Deal" if (intent in ("sponsorship", "partnership") or deal_value) else "🤝 Network"
    labels_list    = [f"{priority_emoji} {priority.title()}", deal_type_label]

    activity_list = [{
        "time":   datetime.utcnow().isoformat() + "Z",
        "user":   "Scraper v5",
        "action": "imported from Gmail",
    }]

    return {
        "email_id":           lead.get("email_id", original_email.get("id", "")),
        "gmail_thread_id":    original_email.get("gmail_thread_id", ""),
        "title":              _clean(lead.get("title"), "No Subject"),
        "list_id":            (
            "rates-sent" if thread_has_reply(conversation) and has_pricing_signal(conversation, lead)
            else "engaged"  if thread_has_reply(conversation)
            else COLUMN_MAP.get(intent, "first-touch")
        ),
        "contact_name":       _clean(lead.get("name"), from_name) or from_name,
        "email":              _clean(lead.get("email_addr"), sender_email) or sender_email,
        "phone":              _clean(lead.get("phone"), ""),
        "business_name":      _clean(lead.get("business"), ""),
        "job_title":          "",
        "lead_source":        "GMAIL",
        "estimated_value":    _clean(lead.get("deal_value"), ""),
        "priority":           priority,
        "intent":             intent,
        "date_received":      date_display,
        "date_received_iso":  date_iso,
        "description":        json.dumps(rich_desc, ensure_ascii=False),
        "draft_reply":        "",
        "draft_reply_status": "pending",
        "activity":           activity_list,
        "original_email":     conversation[:1] if conversation else [],
        "email_thread":       conversation,
        "owner":              "",
        "labels":             labels_list,
        "reply_hook":         _clean(lead.get("reply_hook"), ""),
    }


# ─────────────────────────────────────────────────────────────
# STEP 6 — SUPABASE UPSERT
# ─────────────────────────────────────────────────────────────

def send_telegram(msg: str):
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
        return
    try:
        httpx.post(
            f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
            json={"chat_id": TELEGRAM_CHAT_ID, "text": msg},
            timeout=10,
        )
    except Exception:
        pass


def validate_supabase():
    if not SERVICE_ROLE_KEY:
        msg = "🚨 SCRAPER ABORTED — SUPABASE_SERVICE_ROLE_KEY is not set."
        log.error(msg)
        send_telegram(msg)
        raise RuntimeError(msg)
    try:
        resp = httpx.get(
            f"{SUPABASE_URL}/rest/v1/cards?select=id&limit=1",
            headers=_sb_headers(),
            timeout=10,
        )
        if resp.status_code not in (200, 206):
            msg = f"🚨 SCRAPER ABORTED — Supabase auth check failed ({resp.status_code}): {resp.text[:100]}"
            log.error(msg)
            send_telegram(msg)
            raise RuntimeError(msg)
        log.info("Supabase auth validated ✓")
    except RuntimeError:
        raise
    except Exception as e:
        msg = f"🚨 SCRAPER ABORTED — Supabase connection error: {e}"
        log.error(msg)
        send_telegram(msg)
        raise RuntimeError(msg)


def _sb_headers() -> dict:
    return {
        "apikey":        SUPABASE_ANON,
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        "resolution=merge-duplicates,return=minimal",
    }


def fix_timestamps(token: str) -> None:
    log.info("── Timestamp fix: fetching all cards from Supabase …")
    all_cards = []
    offset = 0
    while True:
        try:
            resp = httpx.get(
                f"{SUPABASE_URL}/rest/v1/cards?select=id,email_id&limit=1000&offset={offset}",
                headers=_sb_headers(), timeout=30.0,
            )
            batch = resp.json()
            if not isinstance(batch, list) or not batch:
                break
            all_cards.extend(batch)
            if len(batch) < 1000:
                break
            offset += 1000
        except Exception as e:
            log.error(f"Timestamp fix: error fetching cards: {e}")
            break

    log.info(f"Timestamp fix: {len(all_cards)} cards to patch")
    patched = 0
    failed  = 0
    for card in all_cards:
        eid = card.get("email_id")
        if not eid:
            continue
        try:
            raw = httpx.get(
                f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{eid}",
                params={"format": "metadata", "metadataHeaders": "Date"},
                headers={"Authorization": f"Bearer {token}"},
                timeout=15.0,
            ).json()
            headers  = {h["name"]: h["value"] for h in raw.get("payload", {}).get("headers", [])}
            raw_date = headers.get("Date", "")
            if not raw_date:
                continue
            patch = httpx.patch(
                f"{SUPABASE_URL}/rest/v1/cards?email_id=eq.{eid}",
                headers={**_sb_headers(), "Prefer": "return=minimal"},
                json={
                    "date_received":     _parse_date_display(raw_date),
                    "date_received_iso": _parse_date_iso(raw_date),
                },
                timeout=15.0,
            )
            if patch.status_code in (200, 204):
                patched += 1
            else:
                log.warning(f"Timestamp fix: patch failed for {eid}: {patch.status_code}")
                failed += 1
        except Exception as e:
            log.warning(f"Timestamp fix: error on {eid}: {e}")
            failed += 1

    log.info(f"Timestamp fix complete: {patched} patched, {failed} failed.")


def get_existing_cards_index() -> tuple[set[str], dict[str, dict]]:
    email_ids  = set()
    thread_map = {}
    offset = 0
    while True:
        try:
            resp = httpx.get(
                f"{SUPABASE_URL}/rest/v1/cards"
                f"?select=email_id,gmail_thread_id,list_id,draft_reply_status"
                f"&limit=1000&offset={offset}",
                headers=_sb_headers(),
                timeout=30.0,
            )
            cards = resp.json()
            if not isinstance(cards, list) or not cards:
                break
            for c in cards:
                eid = c.get("email_id")
                tid = c.get("gmail_thread_id")
                if eid:
                    email_ids.add(str(eid))
                if tid:
                    thread_map[str(tid)] = c
            if len(cards) < 1000:
                break
            offset += 1000
        except Exception as e:
            log.error(f"Error fetching existing cards index: {e}")
            break
    log.info(f"Existing cards: {len(email_ids)} email_ids, {len(thread_map)} thread_ids")
    return email_ids, thread_map


def _is_inbound(msg: dict) -> bool:
    sender = (msg.get("from") or "").lower()
    return not any(t in sender for t in TEAM_SENDERS)


def update_card_stage_by_thread(gmail_thread_id: str, new_list_id: str, conversation: list[dict]) -> bool:
    try:
        patch_data = {
            "list_id":      new_list_id,
            "email_thread": conversation,
        }
        if conversation and _is_inbound(conversation[-1]):
            patch_data["new_reply_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        resp = httpx.patch(
            f"{SUPABASE_URL}/rest/v1/cards?gmail_thread_id=eq.{gmail_thread_id}",
            headers={**_sb_headers(), "Prefer": "return=minimal"},
            json=patch_data,
            timeout=15.0,
        )
        return resp.status_code in (200, 204)
    except Exception as e:
        log.error(f"update_card_stage_by_thread error: {e}")
        return False


_INACTIVE_STAGES = {"done", "paid-out", "dead-leads"}


async def check_active_threads_for_replies(
    existing_thread_map: dict, token: str, last_run_date_str: str
) -> int:
    if not existing_thread_map:
        return 0

    from datetime import timedelta as _td
    try:
        _d = datetime.strptime(last_run_date_str.replace("/", "-"), "%Y-%m-%d")
        cutoff = (_d - _td(days=3)).strftime("%Y-%m-%d")
    except Exception:
        cutoff = last_run_date_str.replace("/", "-")

    active_threads = {
        tid: card for tid, card in existing_thread_map.items()
        if card.get("list_id") not in _INACTIVE_STAGES
    }
    if not active_threads:
        return 0

    log.info(f"Checking {len(active_threads)} active threads for new replies…")
    sem     = asyncio.Semaphore(THREAD_CONCURRENCY)
    updated = []

    async def check_one(tid: str, card: dict):
        conversation = await fetch_thread_conversation({"gmail_thread_id": tid}, token, sem)
        if not conversation:
            return
        has_new = any((msg.get("date_iso") or "") >= cutoff for msg in conversation)
        if not has_new:
            return
        current_stage = card.get("list_id", "")
        if current_stage in ("unreplied", "discovery"):
            if thread_has_reply(conversation) and has_pricing_signal(conversation, {}):
                new_stage = "review"
            elif thread_has_reply(conversation):
                new_stage = "build"
            else:
                new_stage = current_stage
        elif current_stage == "build":
            new_stage = "review" if has_pricing_signal(conversation, {}) else current_stage
        else:
            new_stage = current_stage

        if new_stage != current_stage:
            log.info(f"  Thread {tid[:8]}… new reply — {current_stage} → {new_stage}")
        else:
            log.info(f"  Thread {tid[:8]}… new activity — refreshing thread data")

        update_card_stage_by_thread(tid, new_stage, conversation)
        updated.append(tid)

    await asyncio.gather(*[check_one(tid, card) for tid, card in active_threads.items()])
    log.info(f"Active thread check complete: {len(updated)} threads updated.")
    return len(updated)


def upsert_cards(cards: list[dict]) -> int:
    if not cards:
        return 0

    written = 0
    for i in range(0, len(cards), 50):
        batch       = cards[i:i + 50]
        clean_batch = [{k: v for k, v in card.items() if v is not None} for card in batch]
        try:
            resp = httpx.post(
                f"{SUPABASE_URL}/rest/v1/cards",
                headers=_sb_headers(),
                json=clean_batch,
                timeout=30.0,
            )
            if resp.status_code in (200, 201, 204):
                written += len(batch)
            else:
                log.warning(f"Batch upsert failed ({resp.status_code}): {resp.text[:200]}")
                for card in clean_batch:
                    try:
                        r2 = httpx.post(
                            f"{SUPABASE_URL}/rest/v1/cards",
                            headers=_sb_headers(),
                            json=card,
                            timeout=15.0,
                        )
                        if r2.status_code in (200, 201, 204):
                            written += 1
                        else:
                            log.warning(f"Single upsert failed for {card.get('email_id','?')}: {r2.text[:100]}")
                    except Exception as e:
                        log.error(f"Single upsert exception: {e}")
        except Exception as e:
            log.error(f"Batch upsert exception: {e}")

    log.info(f"Supabase upsert: {written}/{len(cards)} cards written.")
    return written


def update_reply_drafts(drafts: list[dict]) -> int:
    updated = 0
    for d in drafts:
        eid     = d.get("email_id")
        subject = d.get("subject", "")
        body    = d.get("body", "")
        if not eid or not body:
            continue
        try:
            resp = httpx.patch(
                f"{SUPABASE_URL}/rest/v1/cards?email_id=eq.{eid}",
                headers={**_sb_headers(), "Prefer": "return=minimal"},
                json={"draft_reply": {"subject": subject, "body": body}, "draft_reply_status": "drafted"},
                timeout=15.0,
            )
            if resp.status_code in (200, 204):
                updated += 1
        except Exception as e:
            log.error(f"Reply draft update error for {eid}: {e}")
    log.info(f"Reply drafts applied: {updated} cards updated.")
    return updated


# ─────────────────────────────────────────────────────────────
# STEP 7 — REPLY DRAFTING (large model)
# ─────────────────────────────────────────────────────────────

REPLY_SYSTEM = """\
You write personalized first-response emails on behalf of Robert Scoble / Unaligned.
Return ONLY a valid JSON array. No markdown, no preamble.
Each object: {"email_id": "<id>", "subject": "<subject line>", "body": "<full email body>"}

Follow this exact structure for every email body:

Hi [their first name],

Appreciate you reaching out! [One sentence referencing their specific company name or product and what makes it genuinely interesting — never generic.]

I'm looping in my business partner, Sam Levin, along with Unaligned, which I oversee. We're currently being selective with the partnerships we take on, particularly around [their specific niche/domain].

Before moving forward, I'd like a clearer picture of your thinking regarding collaboration, specifically the scope, level of creative control, and how you structure [sponsorships/partnerships/etc] with creators at this stage.

If we have strong alignment on both the product and the partnership structure, we'd be open to exploring this further.

Best,

Robert Scoble
Founder, Unaligned
Mobile: +1-425-205-1921
X: @scobleizer | Web: unaligned.io

Rules:
  • MUST use their actual first name in the greeting
  • MUST reference their specific company name or project in the opening sentence
  • Fill in ALL bracketed placeholders with real details from the email
  • Subject line: natural reply subject based on what they sent
  • Every email must feel personally written — not templated
"""


async def draft_replies(cards: list[dict], draft_client: AsyncOpenAI, draft_model: str) -> list[dict]:
    if not cards:
        return []

    parts = []
    for i, c in enumerate(cards):
        thread = c.get("email_thread") or []
        thread_text = ""
        if thread:
            msgs = []
            for msg in thread[:3]:
                body   = msg.get("body", "")[:600] if isinstance(msg, dict) else ""
                sender = msg.get("from", "")       if isinstance(msg, dict) else ""
                msgs.append(f"  [{sender}]: {body}")
            thread_text = "\nTHREAD:\n" + "\n".join(msgs)

        parts.append(
            f"LEAD {i+1} | id:{c['email_id']} | name:{c.get('contact_name','')} | "
            f"company:{c.get('business_name','')} | intent:{c.get('intent','')} | "
            f"hook:{c.get('reply_hook','')}{thread_text}"
        )

    prompt = "\n\n".join(parts)
    try:
        gc.collect()
        resp = await draft_client.chat.completions.create(
            model=draft_model,
            messages=[
                {"role": "system", "content": REPLY_SYSTEM},
                {"role": "user",   "content": prompt},
            ],
            temperature=0.3,
            max_tokens=DRAFT_MAX_TOKENS,
            timeout=90.0,
        )
        gc.collect()

        text = resp.choices[0].message.content.strip()
        text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
        text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.MULTILINE).strip()
        last = text.rfind("[")
        while last >= 0:
            candidate = text[last:]
            try:
                json.loads(candidate)
                text = candidate
                break
            except json.JSONDecodeError:
                last = text.rfind("[", 0, last)
        drafts = _parse_json_flexible(text)
        if drafts is None:
            log.warning("Reply drafting JSON parse failed.")
            return []
        return drafts
    except Exception as e:
        log.error(f"Reply drafting failed: {e}")
        return []


# ─────────────────────────────────────────────────────────────
# WATERMARK
# ─────────────────────────────────────────────────────────────

def get_last_run_date() -> str:
    try:
        if LAST_RUN_FILE.exists():
            val = LAST_RUN_FILE.read_text().strip()
            if val:
                return val
    except Exception:
        pass
    return "2025/01/01"


def set_last_run_date(date_str: str):
    try:
        LAST_RUN_FILE.write_text(date_str)
    except Exception as e:
        log.warning(f"Could not write last_run file: {e}")


# ─────────────────────────────────────────────────────────────
# MAIN PIPELINE
# ─────────────────────────────────────────────────────────────

async def run_pipeline(
    incremental: bool = True,
    full_backfill: bool = False,
    dry_run: bool = False,
    days: int = 0,
) -> int:
    start = datetime.utcnow()
    log.info("═" * 64)
    log.info(f"scraper_v5 started — {start.strftime('%Y-%m-%d %H:%M UTC')}")
    log.info(f"Extract model : {EXTRACT_MODEL_NAME} @ {EXTRACT_MODEL_URL}")
    log.info(f"Draft model   : {DRAFT_MODEL_NAME} @ {DRAFT_MODEL_URL}")
    if dry_run:
        log.info("DRY RUN — no AI calls, no Supabase writes")
    log.info("═" * 64)
    _write_status("starting", started_at=start.isoformat())

    token = get_gmail_token()

    if not dry_run:
        # Start the small extraction model — it runs for the whole pipeline
        extract_client, extract_model = make_extract_client()
        log.info(f"Extraction client ready ({extract_model})")
        validate_supabase()
    else:
        extract_client = extract_model = None

    from datetime import timedelta
    if days > 0:
        cutoff = (datetime.utcnow() - timedelta(days=days)).strftime("%Y/%m/%d")
        query  = f"after:{cutoff} {GMAIL_QUERY}"
        log.info(f"Custom lookback: emails after {cutoff} ({days} days)")
    elif full_backfill:
        cutoff = (datetime.utcnow() - timedelta(days=180)).strftime("%Y/%m/%d")
        query  = f"after:{cutoff} {GMAIL_QUERY}"
        log.info(f"Full backfill mode (after {cutoff})")
    elif incremental:
        cutoff = get_last_run_date()
        query  = f"after:{cutoff} {GMAIL_QUERY}"
        log.info(f"Incremental mode: emails after {cutoff}")
    else:
        cutoff = (datetime.utcnow() - timedelta(days=30)).strftime("%Y/%m/%d")
        query  = f"after:{cutoff} {GMAIL_QUERY}"
        log.info(f"Default mode: after {cutoff}")

    existing_ids, existing_thread_map = get_existing_cards_index()

    if not dry_run:
        await check_active_threads_for_replies(existing_thread_map, token, cutoff)

    _write_status("scraping_gmail", started_at=start.isoformat())
    emails = await fetch_all_metadata(token, query)
    if not emails:
        log.info("No emails found. Done.")
        _write_status("done", result="no_emails", extracted=0, written=0)
        set_last_run_date(datetime.utcnow().strftime("%Y/%m/%d"))
        return 0

    filtered = intent_filter(emails)
    _write_status("filtering", found=len(emails), passed_filter=len(filtered))
    if not filtered:
        log.info("No emails passed intent filter. Done.")
        _write_status("done", result="no_matches", extracted=0, written=0)
        set_last_run_date(datetime.utcnow().strftime("%Y/%m/%d"))
        return 0

    if dry_run:
        log.info(f"DRY RUN complete — {len(filtered)} emails passed filter. Exiting.")
        return len(filtered)

    _write_status("fetching_threads", found=len(emails), passed_filter=len(filtered))
    conversations = await fetch_all_conversations(filtered, token)

    id_map = {e["id"]: e for e in filtered}

    _write_status(
        "extracting", found=len(emails), passed_filter=len(filtered),
        chunk=0, total_chunks=(len(filtered) + CHUNK_SIZE - 1) // CHUNK_SIZE,
        extracted=0, written=0,
    )
    total_extracted, written = await extract_all(
        filtered, conversations, extract_client, extract_model,
        existing_ids, id_map, existing_thread_map,
    )
    if total_extracted == 0:
        log.info("No leads extracted. Done.")
        _write_status("done", result="no_leads", extracted=0, written=0)
        set_last_run_date(datetime.utcnow().strftime("%Y/%m/%d"))
        return 0

    log.info(f"All chunks done: {total_extracted} extracted, {written} written.")

    # Reply drafting — load the large model only now (extraction is complete)
    unreplied_cards = []
    try:
        resp = httpx.get(
            f"{SUPABASE_URL}/rest/v1/cards"
            f"?list_id=eq.unreplied&draft_reply_status=eq.pending&select=*&limit=500",
            headers=_sb_headers(), timeout=15,
        )
        if resp.status_code == 200:
            unreplied_cards = resp.json() if isinstance(resp.json(), list) else []
    except Exception as e:
        log.warning(f"Could not fetch unreplied cards: {e}")

    if unreplied_cards:
        log.info(f"Drafting replies for {len(unreplied_cards)} unreplied leads …")
        log.info(f"Loading draft model ({DRAFT_MODEL_NAME}) …")
        gc.collect()  # free extraction model KV cache before loading the large model
        draft_client, draft_model = make_draft_client()
        drafts = await draft_replies(unreplied_cards, draft_client, draft_model)
        if drafts:
            update_reply_drafts(drafts)
        gc.collect()

    set_last_run_date(datetime.utcnow().strftime("%Y/%m/%d"))

    elapsed = (datetime.utcnow() - start).total_seconds()
    log.info("═" * 64)
    log.info(
        f"Pipeline complete in {elapsed:.1f}s — "
        f"{len(emails)} fetched → {len(filtered)} filtered → "
        f"{total_extracted} extracted → {written} written"
    )
    log.info("═" * 64)
    _write_status(
        "done", result="success", elapsed_seconds=round(elapsed),
        found=len(emails), passed_filter=len(filtered),
        extracted=total_extracted, written=written,
    )

    if TELEGRAM_TOKEN and TELEGRAM_CHAT_ID:
        try:
            send_telegram(
                f"✅ Scraper v5: {written} new leads in {elapsed:.0f}s\n"
                f"📧 {len(emails)} fetched → {len(filtered)} filtered → {total_extracted} extracted\n"
                f"🤖 extract={EXTRACT_MODEL_NAME} | draft={DRAFT_MODEL_NAME}"
            )
        except Exception:
            pass

    return written


# ─────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import fcntl
    LOCK_FILE = Path(os.path.expanduser("~/.config/google-credentials/scraper_v5.lock"))
    _lock_fh = open(LOCK_FILE, "w")
    try:
        fcntl.flock(_lock_fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        print("ERROR: scraper_v5.py is already running. Exiting.", file=sys.stderr)
        sys.exit(1)

    full_backfill = "--full"           in sys.argv
    dry_run       = "--dry-run"        in sys.argv
    fix_ts        = "--fix-timestamps" in sys.argv

    days = 0
    for _arg in sys.argv:
        if _arg.startswith("--days="):
            try:
                days = int(_arg.split("=")[1])
            except ValueError:
                pass

    incremental = not full_backfill and days == 0

    if fix_ts:
        _token = get_gmail_token()
        fix_timestamps(_token)
        sys.exit(0)

    result = asyncio.run(run_pipeline(
        incremental=incremental,
        full_backfill=full_backfill,
        dry_run=dry_run,
        days=days,
    ))
    sys.exit(0 if result is not None else 1)
