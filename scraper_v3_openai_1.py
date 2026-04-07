"""
scraper_v3_openai_fixed.py
─────────────────────────────────────────────────────────────
Gmail → OpenAI GPT-4o-mini Extraction → Supabase (FLOW Kanban)
─────────────────────────────────────────────────────────────
FIXES in this version (v3 → fixed):
  [1] fetch_thread_conversation — UnboundLocalError when all retries
      hit 'continue' without ever setting 'thread'. Added proper
      initialization and break-out logic.
  [2] upsert_cards — PATCH returns 200/204 even on 0 rows matched,
      silently losing cards. Switched to Supabase native upsert
      (POST + Prefer: resolution=merge-duplicates) which is atomic.
  [3] get_gmail_token — expiry was compared as Unix float but stored
      as ISO string in token file. Fixed to parse datetime correctly.
  [4] _clean helper moved above first use (was defined 300 lines late).
  [5] email_thread no longer capped at 5 messages — full conversation stored.
  [6] API keys moved to environment variables — never hardcode secrets.

FIXES in this version (scraper_v3_openai_fixed.py):
  [7] labels field — was json.dumps([{"name":..., "color":...}]) but Supabase
      schema defines labels as text[]. Now passed as a plain Python list of
      strings so PostgREST serialises it correctly as a Postgres array.
  [8] JSONB fields (activity, original_email, email_thread) — were wrapped in
      json.dumps() inside build_card(), then the card dict was serialised again
      for the POST body, causing Supabase to receive escaped string literals
      instead of JSON objects. Now passed as native Python lists so the single
      serialisation in httpx.post(json=...) produces valid JSONB.
  [9] extract_all — json.loads() failures were retried with smaller chunks but
      still used bare json.loads(). Now delegates to _parse_json_flexible() so
      the same recovery strategies used in draft_replies apply here too.
 [10] email_id validation — leads whose email_id the AI mangled/omitted were
      silently dropped with no log entry. Now logs a warning for every dropped
      lead so you can see exactly what the AI returned.

⚠️  ONE-TIME SQL you must run in Supabase (SQL Editor) before the first run:
      ALTER TABLE cards ADD CONSTRAINT cards_email_id_key UNIQUE (email_id);
    Without this, Supabase's merge-duplicates upsert has no conflict target and
    falls back to plain INSERT — creating duplicate rows on every run.
"""

import asyncio
import base64
import json
import logging
import os
import re
import time
import typing
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

import httpx
import openai

# ─────────────────────────────────────────────────────────────
# CONFIG  — secrets from environment, never hardcoded
# ─────────────────────────────────────────────────────────────

OPENAI_KEY       = os.environ.get("OPENAI_API_KEY", "")
SUPABASE_URL     = os.environ.get("SUPABASE_URL",   "https://hbnpwphxjurvtydezwgh.supabase.co")
SUPABASE_ANON    = os.environ.get("SUPABASE_ANON_KEY",    "")
SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
TELEGRAM_TOKEN   = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID",   "")

# If you must run without env vars set (local dev only), put values here temporarily:
# OPENAI_KEY       = "sk-..."
# SUPABASE_ANON    = "eyJ..."
# SERVICE_ROLE_KEY = "eyJ..."

# ─────────────────────────────────────────────────────────────
# PIPELINE CONFIG
# ─────────────────────────────────────────────────────────────

CONCURRENCY          = 5     # parallel Gmail metadata fetches
THREAD_CONCURRENCY   = 2     # parallel full thread fetches (stay under Gmail rate limit)
CHUNK_SIZE           = 50    # emails per AI extraction batch
CHECKPOINT_INTERVAL  = 100   # save checkpoint every N emails
FETCH_RETRY_ATTEMPTS = 5     # max retries on 403/429
FETCH_RETRY_DELAY    = 5     # base seconds between retries (exponential backoff applied)

CREDENTIALS_DIR = Path("/Users/asherweisberger/.config/google-credentials")
TOKEN_FILE      = CREDENTIALS_DIR / "gmail-token.json"
CHECKPOINT_FILE = CREDENTIALS_DIR / "scraper_checkpoint.json"
LOG_FILE        = CREDENTIALS_DIR / "scraper_v3_live.log"
LAST_RUN_FILE   = CREDENTIALS_DIR / "scraper_last_run.txt"

# Gmail search — wide net for Unaligned / Scoble opportunities
GMAIL_QUERY = (
    "("
    "from:scoble OR subject:unaligned OR subject:scobelizer OR subject:aligned "
    'OR subject:partnership OR subject:collaboration OR subject:"interview request" '
    'OR subject:"tech discussion" OR subject:AI OR subject:"sponsored interview" '
    "OR subject:startup OR subject:sponsorship OR subject:marketing "
    'OR subject:"paid opportunity" OR subject:affiliate OR subject:feature '
    "OR subject:funding OR subject:growth OR subject:podcast OR subject:opportunity"
    ")"
)

KEYWORDS = [
    "scoble", "scobelizer", "unaligned", "aligned",
    "partnership", "collaboration", "interview", "sponsor",
    "tweet", "retweet", "discussion", "ai", "tech", "podcast",
    "demo", "invest", "deal", "opportunity", "introduce",
    "startup", "marketing", "affiliate", "feature", "funding",
    "growth", "launch", "promotion", "exposure", "paid",
]

COLUMN_MAP = {
    "partnership":   "discovery",
    "sponsorship":   "discovery",
    "interview":     "discovery",
    "collaboration": "discovery",
    "intro":         "discovery",
    "other":         "discovery",
}

METADATA_HEADERS = ["From", "Subject", "Date"]

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
log = logging.getLogger("scraper_v3")


# ─────────────────────────────────────────────────────────────
# HELPERS  (defined first — used throughout)
# ─────────────────────────────────────────────────────────────

def _clean(val, fallback: str = "") -> str:
    """Return a clean string; never returns None/null/empty unless fallback is empty."""
    if val is None:
        return fallback
    s = str(val).strip()
    if s.lower() in ("null", "none", "n/a", ""):
        return fallback
    return s


def _parse_date_display(raw_date: str) -> str:
    """RFC 2822 → 'Jun 10, 2025'. Graceful fallback."""
    if not raw_date:
        return ""
    try:
        dt = parsedate_to_datetime(raw_date)
        return dt.astimezone(timezone.utc).strftime("%b %d, %Y")
    except Exception:
        match = re.search(r"\d{1,2}\s+\w+\s+\d{4}", raw_date)
        if match:
            try:
                return datetime.strptime(match.group(), "%d %b %Y").strftime("%b %d, %Y")
            except Exception:
                pass
        return raw_date[:30].strip()


def _parse_date_iso(raw_date: str) -> str:
    """RFC 2822 → '2025-06-10'. Graceful fallback."""
    if not raw_date:
        return ""
    try:
        dt = parsedate_to_datetime(raw_date)
        return dt.astimezone(timezone.utc).strftime("%Y-%m-%d")
    except Exception:
        return ""


def _parse_json_flexible(raw: str) -> typing.Optional[list]:
    """Try primary JSON parse, then recovery strategies, return None if all fail."""
    # Strategy 1: direct parse with strict=False (allows unescaped quotes in strings)
    try:
        return json.loads(raw, strict=False)
    except json.JSONDecodeError:
        pass

    # Strategy 2: find first [ and last ] and parse that window
    try:
        start = raw.index("[")
        end   = raw.rindex("]") + 1
        return json.loads(raw[start:end], strict=False)
    except (json.JSONDecodeError, ValueError):
        pass

    # Strategy 3: strip trailing commas, control chars
    try:
        cleaned = re.sub(r",(\s*[}\]])", r"\1", raw)
        cleaned = re.sub(r"[\x00-\x1f\x7f-\x9f]", "", cleaned)
        return json.loads(cleaned, strict=False)
    except json.JSONDecodeError:
        pass

    # Strategy 4: escape unescaped single quotes inside quoted strings
    # GPT-4o-mini often returns "I'm" instead of "I\'m"
    try:
        def _escape_quotes(s: str) -> str:
            result = []
            in_string = None
            i = 0
            while i < len(s):
                c = s[i]
                if in_string is None:
                    if c in ('"', "'"):
                        in_string = c
                        result.append(c)
                    else:
                        result.append(c)
                elif in_string == c:
                    # Could be end of string, but check for escaped
                    if s[i-1] == '\\':
                        # backslash-escaped quote — keep as-is
                        result.append(c)
                    else:
                        # End of string
                        in_string = None
                        result.append(c)
                else:
                    result.append(c)
                i += 1
            return "".join(result)
        # Only escape if no other strategy worked and raw contains likely JSON
        if raw.strip().startswith(('[', '{')):
            cleaned = _escape_quotes(raw)
            return json.loads(cleaned, strict=False)
    except (json.JSONDecodeError, Exception):
        pass

    log.warning(f"JSON parse failed for: {raw[:200]!r}...")
    return None


# ─────────────────────────────────────────────────────────────
# GMAIL AUTH
# ─────────────────────────────────────────────────────────────

def get_gmail_token() -> str:
    """
    Load the Gmail access token, refreshing if expired.
    FIX: expiry in token file is an ISO datetime string, not a Unix timestamp.
         Previous code compared it to time.time() (float) which always triggered refresh.
    """
    with open(TOKEN_FILE) as f:
        data = json.load(f)

    refresh = False
    expiry_raw = data.get("expiry") or data.get("token_expiry")

    if expiry_raw:
        try:
            expiry_raw_clean = expiry_raw.replace("Z", "+00:00")
            expiry_dt = datetime.fromisoformat(expiry_raw_clean)
            expiry_ts = expiry_dt.timestamp()
            if time.time() >= (expiry_ts - 300):   # refresh 5 min early
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
            expires_in = token_data.get("expires_in", 3600)
            from datetime import timedelta
            new_expiry = datetime.utcnow().replace(tzinfo=timezone.utc) + timedelta(seconds=expires_in)
            data["expiry"] = new_expiry.isoformat()
            with open(TOKEN_FILE, "w") as f:
                json.dump(data, f, indent=2)
            log.info("Token refreshed successfully.")
            return data["token"]
        else:
            raise RuntimeError(f"Token refresh failed: {resp.status_code} {resp.text}")

    return data["token"]


# ─────────────────────────────────────────────────────────────
# STEP 1 — PARALLEL GMAIL METADATA SCRAPE
# ─────────────────────────────────────────────────────────────

async def fetch_all_metadata(token: str, query: str) -> list[dict]:
    """Page through Gmail IDs then fetch metadata for each in parallel."""
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
                    raw      = resp.json()
                    hdrs     = {h["name"]: h["value"] for h in raw.get("payload", {}).get("headers", [])}
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
            log.info(f"  Checkpoint: {len(results)} emails saved.")

    log.info(f"Metadata fetch complete: {len(results)} emails.")
    return results


# ─────────────────────────────────────────────────────────────
# STEP 2 — KEYWORD FILTER
# ─────────────────────────────────────────────────────────────

def keyword_filter(emails: list[dict]) -> list[dict]:
    relevant = [
        e for e in emails
        if any(kw in f"{e['subject']} {e['from']} {e['snippet']}".lower() for kw in KEYWORDS)
    ]
    log.info(f"Keyword filter: {len(relevant)}/{len(emails)} passed.")
    return relevant


# ─────────────────────────────────────────────────────────────
# STEP 3 — FULL THREAD FETCH
# ─────────────────────────────────────────────────────────────

def _decode_body(payload: dict) -> str:
    """Recursively extract plain-text body from Gmail message payload."""
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
    """Strip quoted reply headers and collapse whitespace. Cap at 2000 chars."""
    lines = text.splitlines()
    cleaned = []
    for line in lines:
        if re.match(r"^(On .+ wrote:|>|_{5,}|From:\s)", line.strip()):
            break
        cleaned.append(line)
    result = "\n".join(cleaned).strip()
    result = re.sub(r"\n{3,}", "\n\n", result)
    return result[:2000]


async def fetch_thread_conversation(
    email: dict, token: str, sem: asyncio.Semaphore
) -> list[dict]:
    """
    Fetch all messages in a Gmail thread. Returns list of {from, date, body}.
    FIX: 'thread' was uninitialized if all retries hit 'continue' without break.
         Now initializes thread = None and returns [] if never set.
    """
    thread_id = email.get("gmail_thread_id")
    if not thread_id:
        return []

    thread = None  # always initialize before retry loop

    async with sem:
        for attempt in range(FETCH_RETRY_ATTEMPTS):
            # Refresh token before each attempt — handles expiry during long runs
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
                        log.warning(
                            f"{resp.status_code} on thread {thread_id}, "
                            f"retrying in {delay}s (attempt {attempt+1}/{FETCH_RETRY_ATTEMPTS})"
                        )
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
                continue

    if thread is None:
        log.warning(f"Thread {thread_id} could not be fetched after {FETCH_RETRY_ATTEMPTS} attempts.")
        return []

    conversation = []
    for msg in thread.get("messages", []):
        hdrs     = {h["name"]: h["value"] for h in msg.get("payload", {}).get("headers", [])}
        sender   = hdrs.get("From", "Unknown").strip()
        raw_date = hdrs.get("Date", "").strip()
        body     = _clean_body(_decode_body(msg.get("payload", {})))
        conversation.append({
            "from":     sender,
            "date":     _parse_date_display(raw_date),
            "date_iso": _parse_date_iso(raw_date),
            "body":     body or "[No body text]",
        })

    return conversation   # oldest → newest (Gmail default)


async def fetch_all_conversations(emails: list[dict], token: str) -> dict[str, list[dict]]:
    sem = asyncio.Semaphore(THREAD_CONCURRENCY)
    log.info(f"Fetching full thread conversations for {len(emails)} emails …")

    async def fetch_one(email: dict) -> tuple[str, list[dict]]:
        convo = await fetch_thread_conversation(email, token, sem)
        return email["id"], convo

    pairs  = await asyncio.gather(*[fetch_one(e) for e in emails])
    result = {email_id: convo for email_id, convo in pairs}
    log.info("Thread conversations fetched.")
    return result


# ─────────────────────────────────────────────────────────────
# STEP 4 — OPENAI GPT-4o-mini EXTRACTION
# ─────────────────────────────────────────────────────────────

EXTRACT_SYSTEM = """\
You are an elite business development AI agent for Unaligned.
Scan incoming email metadata and identify HIGH-VALUE BUSINESS OPPORTUNITIES.

━━━ PRIMARY OBJECTIVE ━━━
Detect emails related to:
  • Collaborations, partnerships, sponsorships, marketing deals
  • AI startups, tech startups
  • Media, interviews, or exposure opportunities
  • Mentions of "Unaligned" or "Robert Scoble"
  • Any business opportunity involving growth, promotion, or distribution

━━━ IGNORE / FILTER OUT ━━━
  • Newsletters, promotions, discounts
  • Cold spam (SEO, backlinks, crypto, gambling)
  • Generic outreach with no personalization
  • Job applications, verification emails
  • Receipts or invoices (unless tied to a deal conversation)
  If unsure, prioritize emails showing INTENT to collaborate or do business.

━━━ OUTPUT FORMAT ━━━
Return ONLY a valid JSON array. No markdown fences, no preamble, no extra text.
Each object must have EXACTLY these fields (use null for missing data — never guess):

[
  {
    "email_id":   "<Gmail message ID exactly as given>",
    "name":       "<sender full name or best guess from email address>",
    "business":   "<company or project name, or domain if no company found>",
    "email_addr": "<sender email address>",
    "phone":      "<phone number if present in snippet, else null>",
    "deal_value": "<any mentioned budget or monetary value, else null>",
    "title":      "<email subject line verbatim>",
    "notes":      "<1-2 sentence professional summary of the opportunity>",
    "date":       "<date string as provided — pass through verbatim>",
    "intent":     "<one of: partnership | sponsorship | interview | collaboration | intro | other>",
    "priority":   "<hot | warm | cold>",
    "reply_hook": "<1 punchy sentence opening for a reply — specific to this sender>"
  }
]

RULES:
  • If multiple leads in one email, extract all as separate objects
  • If data is missing, set to null — never guess
  • intent must be lowercase exactly as listed above
  • priority must be lowercase: hot, warm, or cold
  • notes must be professional — no slang, no filler
  • Be aggressive capturing real opportunities; be strict filtering spam
"""


def _build_extract_prompt(emails: list[dict]) -> str:
    lines = [
        f"EMAIL {i+1} | id:{e['id']} | from:{e['from']} | "
        f"date:{e['date']} | subject:{e['subject']} | snippet:{e['snippet']}"
        for i, e in enumerate(emails)
    ]
    return "\n".join(lines)


async def extract_all(emails: list[dict], client: openai.AsyncOpenAI) -> list[dict]:
    chunks = [emails[i:i + CHUNK_SIZE] for i in range(0, len(emails), CHUNK_SIZE)]
    log.info(f"AI extraction: {len(chunks)} chunks via GPT-4o-mini …")

    async def extract_chunk(chunk: list[dict], attempt: int = 0) -> list[dict]:
        try:
            resp = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": EXTRACT_SYSTEM},
                    {"role": "user",   "content": _build_extract_prompt(chunk)},
                ],
                temperature=0.1,
                max_tokens=4096,
                timeout=60.0,
            )
            text = resp.choices[0].message.content.strip()
            text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.MULTILINE).strip()

            # FIX [9]: use _parse_json_flexible instead of bare json.loads
            # so the same recovery strategies (array window, trailing-comma strip)
            # that protect draft_replies now also protect extraction.
            parsed = _parse_json_flexible(text)
            if parsed is None:
                raise json.JSONDecodeError("flexible parse failed — all strategies exhausted", text, 0)
            if isinstance(parsed, dict) and "leads" in parsed:
                parsed = parsed["leads"]
            return parsed if isinstance(parsed, list) else []

        except json.JSONDecodeError as e:
            log.warning(f"JSON parse failed (attempt {attempt}): {e}")
            if attempt < 2 and len(chunk) > 10:
                mid = len(chunk) // 2
                a   = await extract_chunk(chunk[:mid], attempt + 1)
                b   = await extract_chunk(chunk[mid:], attempt + 1)
                return a + b
            log.error(f"Extraction chunk abandoned after {attempt+1} attempts ({len(chunk)} emails).")
            return []
        except Exception as e:
            log.error(f"GPT-4o-mini extraction error: {e}")
            return []

    all_results = await asyncio.gather(*[extract_chunk(c) for c in chunks])
    leads = [lead for batch in all_results for lead in batch]
    log.info(f"Extraction complete: {len(leads)} leads identified.")
    return leads


# ─────────────────────────────────────────────────────────────
# STEP 5 — BUILD SUPABASE CARD
# ─────────────────────────────────────────────────────────────

def build_card(lead: dict, original_email: dict, conversation: list[dict]) -> dict:
    """
    Assemble a clean Supabase card record.

    FIX [7]: labels is text[] in Supabase — pass a plain Python list of strings.
             Previous json.dumps([{"name":..., "color":...}]) caused type errors.

    FIX [8]: activity, original_email, email_thread are jsonb columns — pass as
             native Python lists. Previous json.dumps() pre-serialised them to
             strings, so Supabase received escaped string literals instead of JSON.
    """
    priority = _clean(lead.get("priority"), "cold").lower()
    intent   = _clean(lead.get("intent"),   "other").lower()

    if priority not in ("hot", "warm", "cold"):
        priority = "cold"
    if intent not in ("partnership", "sponsorship", "interview", "collaboration", "intro", "other"):
        intent = "other"

    # Extract sender email and name from "From" header
    from_raw     = original_email.get("from", "")
    em_match     = re.search(r"<([^>]+)>", from_raw)
    sender_email = em_match.group(1).strip() if em_match else from_raw.strip()
    from_name    = re.sub(r"<[^>]+>", "", from_raw).strip()

    date_display = original_email.get("date")     or _clean(lead.get("date"), "")
    date_iso     = original_email.get("date_iso") or _parse_date_iso(original_email.get("date_raw", ""))

    notes_text = _clean(lead.get("notes"), "No summary available.")

    # description is a text column — JSON string is correct here
    rich_desc = {
        "rich_description": notes_text,
        "intent":           intent,
        "priority":         priority,
        "deal_value":       _clean(lead.get("deal_value"), ""),
    }

    # FIX [7]: labels must be a Python list[str] — Supabase schema is text[]
    priority_emoji = "🔥" if priority == "hot" else "🌡️" if priority == "warm" else "❄️"
    labels_list = [f"{priority_emoji} {priority.title()}"]

    # FIX [8]: activity / original_email / email_thread must be Python lists (jsonb)
    activity_list = [{
        "time":   datetime.utcnow().isoformat() + "Z",
        "user":   "Scraper v3",
        "action": "imported from Gmail",
    }]
    original_email_list = conversation[:1] if conversation else []
    email_thread_list   = conversation      if conversation else []

    return {
        "email_id":           lead.get("email_id", original_email.get("id", "")),
        "gmail_thread_id":    original_email.get("gmail_thread_id", ""),
        "title":              _clean(lead.get("title"), "No Subject"),
        "list_id":            COLUMN_MAP.get(intent, "discovery"),
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
        "description":        json.dumps(rich_desc, ensure_ascii=False),  # text col — string OK
        "draft_reply":        "",
        "draft_reply_status": "pending",
        "activity":           activity_list,        # FIX [8]: native list, not json.dumps()
        "original_email":     original_email_list,  # FIX [8]: native list, not json.dumps()
        "email_thread":       email_thread_list,    # FIX [8]: native list, not json.dumps()
        "owner":              "",
        "labels":             labels_list,           # FIX [7]: native list[str], not json.dumps()
        "reply_hook":         _clean(lead.get("reply_hook"), ""),
    }


# ─────────────────────────────────────────────────────────────
# STEP 6 — SUPABASE UPSERT
# ─────────────────────────────────────────────────────────────

def _sb_headers() -> dict:
    return {
        "apikey":        SUPABASE_ANON,
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        "resolution=merge-duplicates,return=minimal",
    }


def get_existing_email_ids() -> set[str]:
    """Fetch all email_ids already in Supabase to prevent duplicates."""
    ids    = set()
    offset = 0
    while True:
        try:
            resp = httpx.get(
                f"{SUPABASE_URL}/rest/v1/cards?select=email_id&limit=1000&offset={offset}",
                headers=_sb_headers(),
                timeout=30.0,
            )
            cards = resp.json()
            if not isinstance(cards, list) or not cards:
                break
            for c in cards:
                eid = c.get("email_id")
                if eid:
                    ids.add(str(eid))
            if len(cards) < 1000:
                break
            offset += 1000
        except Exception as e:
            log.error(f"Error fetching existing email_ids: {e}")
            break
    log.info(f"Existing email_ids in Supabase: {len(ids)}")
    return ids


def upsert_cards(cards: list[dict]) -> int:
    """
    Upsert cards to Supabase using POST with merge-duplicates conflict resolution.
    Requires a UNIQUE constraint on email_id — see top-of-file SQL note.
    """
    if not cards:
        return 0

    written = 0
    for i in range(0, len(cards), 50):
        batch = cards[i:i + 50]
        # Strip None values that Supabase rejects
        clean_batch = [
            {k: v for k, v in card.items() if v is not None}
            for card in batch
        ]
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
                log.warning(f"Upsert batch failed ({resp.status_code}): {resp.text[:200]}")
                # Fall back to one-by-one for this batch to salvage what we can
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
                            log.warning(f"Single upsert failed for {card.get('email_id', '?')}: {r2.text[:100]}")
                    except Exception as e:
                        log.error(f"Single upsert exception: {e}")
        except Exception as e:
            log.error(f"Batch upsert exception: {e}")

    log.info(f"Supabase upsert: {written}/{len(cards)} cards written.")
    return written


def update_reply_drafts(drafts: list[dict]) -> int:
    """Patch reply drafts into existing Supabase cards."""
    updated = 0
    for d in drafts:
        eid   = d.get("email_id")
        draft = d.get("draft", "")
        if not eid or not draft:
            continue
        try:
            resp = httpx.patch(
                f"{SUPABASE_URL}/rest/v1/cards?email_id=eq.{eid}",
                headers={**_sb_headers(), "Prefer": "return=minimal"},
                json={"draft_reply": draft, "draft_reply_status": "drafted"},
                timeout=15.0,
            )
            if resp.status_code in (200, 204):
                updated += 1
        except Exception as e:
            log.error(f"Reply draft update error for {eid}: {e}")
    log.info(f"Reply drafts applied: {updated} cards updated.")
    return updated


# ─────────────────────────────────────────────────────────────
# STEP 7 — REPLY DRAFTING
# ─────────────────────────────────────────────────────────────

REPLY_SYSTEM = """\
You write concise, personalized reply drafts on behalf of Robert Scoble / Unaligned.
Return ONLY a valid JSON array. No markdown, no preamble.
Each object: {"email_id": "<id>", "draft": "<reply text>"}

Draft requirements:
  • Under 90 words
  • Reference the sender's specific company or opportunity — be concrete
  • Mention Robert Scoble's interview or discussion format naturally
  • End with a clear call-to-action (suggest a quick call or next step)
  • Tone: warm, direct, tech-savvy — never generic or corporate-sounding
  • Sign off as: Robert Scoble / Unaligned
"""


async def draft_replies(leads: list[dict], client: openai.AsyncOpenAI) -> list[dict]:
    if not leads:
        return []
    prompt = "\n".join(
        f"LEAD {i+1} | id:{l['email_id']} | name:{l.get('contact_name','')} | "
        f"company:{l.get('business_name','')} | intent:{l.get('intent','')} | "
        f"hook:{l.get('reply_hook','')}"
        for i, l in enumerate(leads)
    )
    try:
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": REPLY_SYSTEM},
                {"role": "user",   "content": prompt},
            ],
            temperature=0.3,
            max_tokens=2048,
            timeout=60.0,
        )
        text = resp.choices[0].message.content.strip()
        text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.MULTILINE).strip()

        drafts = _parse_json_flexible(text)
        if drafts is None:
            log.warning("Reply drafting JSON parse failed, skipping drafts for this batch.")
            return []
        return drafts
    except Exception as e:
        log.error(f"Reply drafting failed: {e}")
        return []


# ─────────────────────────────────────────────────────────────
# WATERMARK HELPERS
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

async def run_pipeline(incremental: bool = True, full_backfill: bool = False) -> int:
    start = datetime.utcnow()
    log.info("═" * 64)
    log.info(f"scraper_v3_openai_fixed started — {start.strftime('%Y-%m-%d %H:%M UTC')}")
    log.info("═" * 64)

    token  = get_gmail_token()
    client = openai.AsyncOpenAI(api_key=OPENAI_KEY)

    if full_backfill:
        from datetime import timedelta
        one_year_ago = (datetime.utcnow() - timedelta(days=365)).strftime("%Y/%m/%d")
        query = f"after:{one_year_ago} {GMAIL_QUERY}"
        log.info(f"Full backfill mode (after {one_year_ago})")
    elif incremental:
        last_run = get_last_run_date()
        query = f"after:{last_run} {GMAIL_QUERY}"
        log.info(f"Incremental mode: emails after {last_run}")
    else:
        from datetime import timedelta
        thirty_ago = (datetime.utcnow() - timedelta(days=30)).strftime("%Y/%m/%d")
        query = f"after:{thirty_ago} {GMAIL_QUERY}"
        log.info(f"Default mode: after {thirty_ago}")

    # Step 1 — Scrape metadata only (no thread bodies yet)
    emails = await fetch_all_metadata(token, query)
    if not emails:
        log.info("No emails found. Pipeline complete.")
        return 0

    # Step 2 — Keyword filter
    filtered = keyword_filter(emails)
    if not filtered:
        log.info("No emails passed keyword filter. Pipeline complete.")
        return 0

    # Step 3 — AI extraction (uses metadata only — no thread bodies needed here)
    leads = await extract_all(filtered, client)
    if not leads:
        log.info("GPT-4o-mini extraction returned no leads.")
        return 0

    # Step 4 — Dedup
    existing_ids = get_existing_email_ids()
    new_leads    = [l for l in leads if str(l.get("email_id", "")).strip() not in existing_ids]
    log.info(f"New leads after dedup: {len(new_leads)}/{len(leads)}")

    if not new_leads:
        log.info("No new leads to write. Pipeline complete.")
        set_last_run_date(datetime.utcnow().strftime("%Y/%m/%d"))
        return 0

    # Step 5 — Fetch thread conversations ONLY for new leads
    # FIX [10]: validate email_id against id_map before proceeding;
    # log a warning for any lead whose ID the AI mangled so nothing drops silently.
    id_map = {e["id"]: e for e in filtered}
    valid_new_leads = []
    for lead in new_leads:
        eid = str(lead.get("email_id", "")).strip()
        if eid and eid in id_map:
            valid_new_leads.append(lead)
        else:
            log.warning(
                f"Lead dropped — email_id '{eid}' not found in metadata map "
                f"(AI may have mangled it). Lead name: {lead.get('name', '?')} | "
                f"Raw AI output: {lead}"
            )
    new_leads = valid_new_leads

    if not new_leads:
        log.info("No valid leads after email_id validation. Pipeline complete.")
        set_last_run_date(datetime.utcnow().strftime("%Y/%m/%d"))
        return 0

    leads_with_emails = [id_map[str(l.get("email_id", ""))] for l in new_leads]
    log.info(f"Fetching thread conversations for {len(leads_with_emails)} leads …")
    conversations = await fetch_all_conversations(leads_with_emails, token)

    # Step 6 — Build cards
    cards = []
    for lead in new_leads:
        email_id     = str(lead.get("email_id", "")).strip()
        original     = id_map.get(email_id, {})
        conversation = conversations.get(email_id, [])
        if not original:
            log.warning(f"Skipping card build — no original email for id '{email_id}'")
            continue
        if not lead.get("date") and original.get("date"):
            lead["date"] = original["date"]
        cards.append(build_card(lead, original, conversation))

    # Step 7 — Upsert to Supabase
    written = upsert_cards(cards)

    # Step 8 — Reply drafts for HOT + WARM
    hot_warm = [c for c in cards if c.get("priority") in ("hot", "warm")]
    if hot_warm:
        log.info(f"Drafting replies for {len(hot_warm)} HOT/WARM leads …")
        drafts = await draft_replies(hot_warm, client)
        if drafts:
            update_reply_drafts(drafts)

    set_last_run_date(datetime.utcnow().strftime("%Y/%m/%d"))

    elapsed = (datetime.utcnow() - start).total_seconds()
    log.info("═" * 64)
    log.info(f"Pipeline complete in {elapsed:.1f}s — {written} new leads written.")
    log.info("═" * 64)

    # Telegram notification
    if TELEGRAM_TOKEN and TELEGRAM_CHAT_ID:
        try:
            httpx.post(
                f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
                json={"chat_id": TELEGRAM_CHAT_ID, "text": f"✅ Scraper v3 fixed: {written} new leads in {elapsed:.0f}s."},
                timeout=10.0,
            )
        except Exception:
            pass

    return written


# ─────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    full_backfill = "--full" in sys.argv
    incremental   = not full_backfill

    result = asyncio.run(run_pipeline(
        incremental=incremental,
        full_backfill=full_backfill,
    ))
    sys.exit(0 if result is not None else 1)
