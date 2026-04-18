"""
scraper_v4.py — Gmail → Claude Opus 4.6 → Supabase (UNALIGNED Lead Pipeline)
─────────────────────────────────────────────────────────────────────────────
KEY CHANGES FROM v3:
  [1] Pipeline reordered — threads fetched for ALL filtered emails BEFORE
      AI extraction. Claude now reads full conversation bodies, not 200-char
      snippets. This is the main quality fix.
  [2] Intent-based keyword filter — removed generic noise terms (ai, tech,
      startup, opportunity, growth). Kept only explicit business-intent signals.
  [3] Extraction prompt rewritten — strict, evidence-required, no contradictions.
      Claude must quote the line that makes it a real lead. Returns null to
      reject, not a garbage card.
  [4] Chunk size 50 → 15 — smaller batches, more attention per email.
  [5] Reply drafter now receives full thread content, not just metadata.
  [6] Telegram summary improved — shows filter/extract/write counts.

Usage:
    python scraper_v4.py               # incremental (since last run)
    python scraper_v4.py --full        # 1-year backfill
    python scraper_v4.py --dry-run     # filter + thread fetch only, no AI or write
"""

import asyncio
import base64
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

import httpx
import anthropic

# ─────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────

ANTHROPIC_KEY    = os.environ.get("ANTHROPIC_API_KEY", "")
SUPABASE_URL     = os.environ.get("SUPABASE_URL",   "https://hbnpwphxjurvtydezwgh.supabase.co")
SUPABASE_ANON    = os.environ.get("SUPABASE_ANON_KEY",    "")
SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
TELEGRAM_TOKEN   = os.environ.get("TELEGRAM_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")

CONCURRENCY        = 5     # parallel Gmail metadata fetches
THREAD_CONCURRENCY = 3     # parallel full thread fetches
CHUNK_SIZE         = 15    # emails per AI extraction batch (was 50 — smaller = better quality)
CHECKPOINT_INTERVAL = 100

CREDENTIALS_DIR = Path("/Users/asherweisberger/.config/google-credentials")
TOKEN_FILE      = CREDENTIALS_DIR / "gmail-token.json"
CHECKPOINT_FILE = CREDENTIALS_DIR / "scraper_v4_checkpoint.json"
LOG_FILE        = CREDENTIALS_DIR / "scraper_v4.log"
LAST_RUN_FILE   = CREDENTIALS_DIR / "scraper_v4_last_run.txt"

# ─── Gmail query — explicit business-intent signals only ───────────────────
# Deliberately narrow. Generic words like "ai", "tech", "startup" are removed
# because they match newsletters and cold outreach that wastes AI calls.
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

# ─── In-memory filter — must match at least ONE of these phrases ───────────
# Phrase matching beats single-word matching for precision.
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

# If any of these appear as a sender in the thread, the lead has been replied to
TEAM_SENDERS = [
    "scobleizer@gmail.com",
    "samlevin@mac.com",
    "asherweisberger",
    "robert scoble",
    "sam levin",
    "asher weisberger",
]

def thread_has_reply(conversation: list[dict]) -> bool:
    """Return True if any message in the thread was sent by a team member."""
    for msg in conversation:
        sender = (msg.get("from") or "").lower()
        if any(t in sender for t in TEAM_SENDERS):
            return True
    return False


PRICING_SIGNALS = [
    "$", "budget", "rate", "fee", "payment", "invoice", "proposal",
    "quote", "contract", "cost", "pricing", "price", "paid", "pay",
    "compensation", "flat fee", "per post", "per video", "per episode",
    "revenue share", "commission", "equity", "deal", "offer", "package",
    "thousand", "k usd", "k $", "usd", "eur", "gbp",
]

def has_pricing_signal(conversation: list[dict], lead: dict) -> bool:
    """Return True if the thread or extracted lead data contains deal/pricing language."""
    if lead.get("deal_value"):
        return True
    full_text = " ".join((m.get("body") or "") for m in conversation).lower()
    return any(sig in full_text for sig in PRICING_SIGNALS)

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
log = logging.getLogger("scraper_v4")


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
    if not raw_date:
        return ""
    try:
        dt = parsedate_to_datetime(raw_date)
        return dt.astimezone(timezone.utc).strftime("%Y-%m-%d")
    except Exception:
        return ""


def _parse_json_flexible(raw: str) -> typing.Optional[list]:
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
            new_expiry = datetime.utcnow().replace(tzinfo=timezone.utc) + timedelta(seconds=token_data.get("expires_in", 3600))
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
    """
    Phrase-based intent filter. Matches against subject + from + snippet.
    Uses phrases not single words to minimize false positives.
    """
    relevant = []
    for e in emails:
        blob = f"{e['subject']} {e['from']} {e['snippet']}".lower()
        if any(phrase in blob for phrase in INTENT_PHRASES):
            relevant.append(e)
    log.info(f"Intent filter: {len(relevant)}/{len(emails)} passed.")
    return relevant


# ─────────────────────────────────────────────────────────────
# STEP 3 — FULL THREAD FETCH (for ALL filtered emails)
# ─────────────────────────────────────────────────────────────
# This is the key pipeline change from v3. We fetch full threads BEFORE
# AI extraction so Claude reads actual email bodies, not 200-char snippets.

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
    """
    Format a single email + its full thread for the extraction prompt.
    Claude reads the actual conversation, not just the snippet.
    """
    lines = [
        f"── EMAIL ──────────────────────────────────────────",
        f"id:      {email['id']}",
        f"from:    {email['from']}",
        f"date:    {email['date']}",
        f"subject: {email['subject']}",
    ]
    if conversation:
        lines.append(f"thread:  {len(conversation)} message(s)")
        for i, msg in enumerate(conversation[:5]):  # cap at 5 messages per thread
            lines.append(f"\n  [Message {i+1} — {msg['from']} — {msg['date']}]")
            lines.append(f"  {msg['body'][:800]}")
    else:
        lines.append(f"snippet: {email['snippet']}")
    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────
# STEP 4 — AI EXTRACTION (from full thread content)
# ─────────────────────────────────────────────────────────────

EXTRACT_SYSTEM = """\
You are a lead qualification agent for Unaligned, Robert Scoble's media/tech company.
Your job is to identify REAL inbound business opportunities from email conversations.

━━━ WHAT COUNTS AS A REAL LEAD ━━━
Only extract an email if it clearly shows:
  • Someone wanting to partner with, sponsor, or collaborate with Robert Scoble / Unaligned
  • A media opportunity (interview request, podcast guest, press feature)
  • A business deal with a specific proposal or ask
  • A direct introduction to a potential partner or investor
  • Someone specifically referencing Robert Scoble or Unaligned by name with intent

━━━ REJECT THESE — return nothing for them ━━━
  • Newsletters, digests, automated notifications
  • Cold outreach with no personalization to Robert/Unaligned specifically
  • SEO, backlinks, crypto, gambling, generic marketing pitches
  • Job applications, verification emails, receipts
  • Vague "let's connect" with no specific value proposition
  • Any email where you cannot find a SPECIFIC sentence showing business intent

━━━ EVIDENCE RULE ━━━
For every lead you extract, you MUST be able to quote a specific sentence from
the email that proves it is a real opportunity. If you cannot find that sentence,
do not extract the lead.

━━━ OUTPUT FORMAT ━━━
Return ONLY a valid JSON array. Empty array [] if nothing qualifies.
No markdown, no preamble, no explanation outside the JSON.

[
  {
    "email_id":    "<Gmail message ID exactly as given>",
    "name":        "<sender full name — from email headers, not guessed>",
    "business":    "<company name, or domain if no company — null if unknown>",
    "email_addr":  "<sender email address>",
    "phone":       "<phone if mentioned in body, else null>",
    "deal_value":  "<specific budget or dollar amount mentioned, else null>",
    "title":       "<email subject verbatim>",
    "notes":       "<2-3 sentence summary: who they are, what they want, why it matters>",
    "evidence":    "<direct quote from the email proving this is a real lead>",
    "date":        "<date string verbatim>",
    "intent":      "<partnership | sponsorship | interview | collaboration | intro | other>",
    "priority":    "<hot | warm | cold — hot means specific ask + budget or urgency, cold means vague>",
    "reply_hook":  "<1 sentence opener for a reply that references something specific from their email>"
  }
]

STRICT RULES:
  • Return [] for any email that doesn't clearly qualify — do not stretch
  • priority=hot requires BOTH a specific ask AND either budget/timeline/urgency signal
  • reply_hook must reference something concrete from THEIR email, not generic
  • notes must describe the actual opportunity — no filler like "seems interested"
  • never guess data — null over a bad guess, every time
"""


def _build_extract_prompt(emails: list[dict], conversations: dict[str, list[dict]]) -> str:
    parts = []
    for i, e in enumerate(emails):
        convo = conversations.get(e["id"], [])
        parts.append(f"\n{'='*60}\nEMAIL {i+1}/{len(emails)}\n{'='*60}")
        parts.append(_format_thread_for_prompt(e, convo))
    return "\n".join(parts)


AI_CONCURRENCY   = 3    # max parallel Claude calls at once
CHUNK_DELAY      = 2.0  # seconds between chunk starts to spread token usage
MAX_429_RETRIES  = 6    # retry budget for rate-limit errors per chunk


async def extract_all(
    emails: list[dict],
    conversations: dict[str, list[dict]],
    client: anthropic.AsyncAnthropic,
    existing_ids: set[str],
    id_map: dict[str, dict],
    existing_thread_map: dict[str, dict] | None = None,
) -> tuple[int, int]:
    """
    Extract leads chunk-by-chunk and write each chunk to Supabase immediately.
    Returns (total_extracted, total_written).
    existing_ids is mutated in-place so duplicate prevention stays current across chunks.
    """
    chunks = [emails[i:i + CHUNK_SIZE] for i in range(0, len(emails), CHUNK_SIZE)]
    log.info(f"AI extraction: {len(chunks)} chunks of ≤{CHUNK_SIZE} emails each "
             f"(concurrency={AI_CONCURRENCY}, delay={CHUNK_DELAY}s) …")

    sem        = asyncio.Semaphore(AI_CONCURRENCY)
    write_lock = asyncio.Lock()   # serialise Supabase writes across concurrent chunks
    total_extracted = 0
    total_written   = 0

    async def extract_chunk(chunk: list[dict], chunk_idx: int, attempt: int = 0) -> list[dict]:
        async with sem:
            # Small stagger so chunks don't all hit the API the same second
            await asyncio.sleep(chunk_idx * CHUNK_DELAY)

            for rate_attempt in range(MAX_429_RETRIES + 1):
                try:
                    prompt = _build_extract_prompt(chunk, conversations)
                    resp = await client.messages.create(
                        model="claude-opus-4-6",
                        messages=[{"role": "user", "content": EXTRACT_SYSTEM + "\n\n" + prompt}],
                        temperature=0.1,
                        max_tokens=4096,
                        timeout=120.0,
                    )
                    text = resp.content[0].text.strip()
                    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.MULTILINE).strip()

                    parsed = _parse_json_flexible(text)
                    if parsed is None:
                        raise json.JSONDecodeError("flexible parse failed", text, 0)
                    if isinstance(parsed, dict) and "leads" in parsed:
                        parsed = parsed["leads"]
                    result = parsed if isinstance(parsed, list) else []
                    log.info(f"  Chunk {chunk_idx}: {len(chunk)} emails → {len(result)} leads extracted.")
                    return result

                except json.JSONDecodeError as e:
                    log.warning(f"JSON parse failed (chunk {chunk_idx}, attempt {attempt}): {e}")
                    if attempt < 2 and len(chunk) > 5:
                        mid = len(chunk) // 2
                        a   = await extract_chunk(chunk[:mid], chunk_idx, attempt + 1)
                        b   = await extract_chunk(chunk[mid:], chunk_idx, attempt + 1)
                        return a + b
                    log.error(f"Chunk {chunk_idx} abandoned after {attempt+1} attempts ({len(chunk)} emails).")
                    return []

                except Exception as e:
                    err_str = str(e)
                    if "429" in err_str or "rate_limit" in err_str.lower():
                        # Exponential backoff: 15s, 30s, 60s, 120s, 240s, 300s
                        wait = min(15 * (2 ** rate_attempt), 300)
                        log.warning(f"  Rate limited (chunk {chunk_idx}, retry {rate_attempt+1}/{MAX_429_RETRIES})"
                                    f" — waiting {wait}s …")
                        await asyncio.sleep(wait)
                        continue  # retry the same chunk
                    log.error(f"Extraction error (chunk {chunk_idx}): {e}")
                    return []

            log.error(f"Chunk {chunk_idx} exhausted {MAX_429_RETRIES} rate-limit retries — dropping.")
            return []

    async def process_chunk(chunk: list[dict], chunk_idx: int):
        nonlocal total_extracted, total_written
        leads = await extract_chunk(chunk, chunk_idx)
        if not leads:
            return

        # Dedup + build + write immediately — don't wait for other chunks
        async with write_lock:
            new_leads     = []
            thread_updates = []  # (gmail_thread_id, new_list_id, conversation)

            for lead in leads:
                eid = str(lead.get("email_id", "")).strip()
                if not eid:
                    continue
                if eid not in id_map:
                    log.warning(f"Lead dropped — email_id '{eid}' not in metadata. Lead: {lead.get('name','?')}")
                    continue

                if eid in existing_ids:
                    # email_id already known — skip (already a card for this exact message)
                    continue

                # Check if same thread already has a card (lead replied to Robert's reply)
                original     = id_map.get(eid, {})
                conversation = conversations.get(eid, [])
                tid = str(original.get("gmail_thread_id", "")).strip()
                if tid and existing_thread_map and tid in existing_thread_map:
                    existing_card = existing_thread_map[tid]
                    # Only advance stage if current stage is early (not yet negotiating/closed)
                    current_stage = existing_card.get("list_id", "")
                    if current_stage in ("new", "first-touch", "engaged", "unreplied", "discovery"):
                        new_stage = (
                            "rates-sent" if thread_has_reply(conversation) and has_pricing_signal(conversation, lead)
                            else "engaged"  if thread_has_reply(conversation)
                            else current_stage
                        )
                        if new_stage != current_stage:
                            thread_updates.append((tid, new_stage, conversation))
                            log.info(f"  Thread {tid[:8]}… reply detected — moving {current_stage} → {new_stage}")
                    existing_ids.add(eid)  # don't create a dup card
                    continue

                new_leads.append(lead)

            # Apply thread stage updates first
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
                msg = f"⚠️ Chunk {chunk_idx}: wrote {written}/{len(cards)} cards — some may be missing"
                log.warning(msg)
                send_telegram(msg)
            else:
                log.info(f"  Chunk {chunk_idx}: {written} new cards written to board.")

            # Mark as written so later chunks don't re-insert
            for lead in new_leads:
                existing_ids.add(str(lead.get("email_id", "")))

            total_extracted += len(leads)
            total_written   += written

    tasks = [process_chunk(c, i) for i, c in enumerate(chunks)]
    await asyncio.gather(*tasks)
    log.info(f"Extraction complete: {total_extracted} leads extracted, {total_written} written.")
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
    # Classify deal type: revenue deal vs relationship/network card
    deal_value = _clean(lead.get("deal_value"), "")
    deal_type_label = "💼 Deal" if (intent in ("sponsorship", "partnership") or deal_value) else "🤝 Network"
    labels_list = [f"{priority_emoji} {priority.title()}", deal_type_label]

    activity_list = [{
        "time":   datetime.utcnow().isoformat() + "Z",
        "user":   "Scraper v4",
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
        "moved_at":           None,   # NULL = flashes gold until card is touched on the board
    }


# ─────────────────────────────────────────────────────────────
# STEP 6 — SUPABASE UPSERT
# ─────────────────────────────────────────────────────────────

def send_telegram(msg: str):
    """Fire-and-forget Telegram alert. Never raises."""
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
    """Crash early with a clear error (+ Telegram alert) if Supabase auth is broken."""
    if not SERVICE_ROLE_KEY:
        msg = "🚨 SCRAPER ABORTED — SUPABASE_SERVICE_ROLE_KEY is not set. No data will be written."
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


def get_existing_cards_index() -> tuple[set[str], dict[str, dict]]:
    """Returns (email_id_set, thread_id_to_card_map) for dedup and thread matching."""
    email_ids   = set()
    thread_map  = {}  # gmail_thread_id → card row
    offset = 0
    while True:
        try:
            resp = httpx.get(
                f"{SUPABASE_URL}/rest/v1/cards?select=email_id,gmail_thread_id,list_id,draft_reply_status&limit=1000&offset={offset}",
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
    """Return True if the message was sent by a lead (not our team)."""
    sender = (msg.get("from") or "").lower()
    return not any(t in sender for t in TEAM_SENDERS)


def update_card_stage_by_thread(gmail_thread_id: str, new_list_id: str, conversation: list[dict]) -> bool:
    """Update an existing card's stage and thread data when a reply is detected. Never overwrites a sent draft."""
    try:
        patch_data = {
            "list_id":      new_list_id,
            "email_thread": conversation,
        }
        # Flag card if the most recent message is an inbound (lead replied)
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
    """Re-check all active tracked threads for replies that didn't match the Gmail search query."""
    if not existing_thread_map:
        return 0

    # Look back last_run_date minus 3 days to catch same-day gaps in the cron
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
    sem = asyncio.Semaphore(THREAD_CONCURRENCY)
    updated = []

    async def check_one(tid: str, card: dict):
        conversation = await fetch_thread_conversation({"gmail_thread_id": tid}, token, sem)
        if not conversation:
            return
        # Any message on or after the cutoff date counts as new
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
            log.info(f"  Thread {tid[:8]}… new reply — moving {current_stage} → {new_stage}")
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
        batch      = cards[i:i + 50]
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
                            log.warning(f"Single upsert failed for {card.get('email_id', '?')}: {r2.text[:100]}")
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
# STEP 7 — REPLY DRAFTING (with thread content)
# ─────────────────────────────────────────────────────────────

REPLY_SYSTEM = """\
You write personalized first-response emails on behalf of Robert Scoble / Unaligned.
Return ONLY a valid JSON array. No markdown, no preamble.
Each object: {"email_id": "<id>", "subject": "<subject line>", "body": "<full email body>"}

Follow this exact structure for every email body:

Hi [their first name],

Appreciate you reaching out! [One sentence that references their specific company name or product and what makes it genuinely interesting — never generic.]

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


async def draft_replies(cards: list[dict], client: anthropic.AsyncAnthropic) -> list[dict]:
    if not cards:
        return []

    parts = []
    for i, c in enumerate(cards):
        thread = c.get("email_thread") or []
        thread_text = ""
        if thread:
            msgs = []
            for msg in thread[:3]:
                body = msg.get("body", "")[:600] if isinstance(msg, dict) else ""
                sender = msg.get("from", "") if isinstance(msg, dict) else ""
                msgs.append(f"  [{sender}]: {body}")
            thread_text = "\nTHREAD:\n" + "\n".join(msgs)

        parts.append(
            f"LEAD {i+1} | id:{c['email_id']} | name:{c.get('contact_name','')} | "
            f"company:{c.get('business_name','')} | intent:{c.get('intent','')} | "
            f"hook:{c.get('reply_hook','')}{thread_text}"
        )

    prompt = "\n\n".join(parts)
    try:
        resp = await client.messages.create(
            model="claude-opus-4-6",
            messages=[{"role": "user", "content": REPLY_SYSTEM + "\n\n" + prompt}],
            temperature=0.3,
            max_tokens=3000,
            timeout=90.0,
        )
        text = resp.content[0].text.strip()
        text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.MULTILINE).strip()
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
    hours: int = 0,
) -> int:
    start  = datetime.utcnow()
    log.info("═" * 64)
    log.info(f"scraper_v4 started — {start.strftime('%Y-%m-%d %H:%M UTC')}")
    if dry_run:
        log.info("DRY RUN — no AI calls, no Supabase writes")
    log.info("═" * 64)

    token  = get_gmail_token()
    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_KEY) if not dry_run else None

    # Validate Supabase auth before doing any work — fail fast, alert immediately
    if not dry_run:
        validate_supabase()

    # Build query + determine cutoff date
    from datetime import timedelta
    if hours > 0:
        query = f"newer_than:{hours}h {GMAIL_QUERY}"
        cutoff = (datetime.utcnow() - timedelta(hours=hours)).strftime("%Y/%m/%d")
        log.info(f"Hours mode: emails from last {hours}h")
    elif full_backfill:
        cutoff = (datetime.utcnow() - timedelta(days=180)).strftime("%Y/%m/%d")
        query = f"after:{cutoff} {GMAIL_QUERY}"
        log.info(f"Full backfill mode (after {cutoff})")
    elif incremental:
        cutoff = get_last_run_date()
        query = f"after:{cutoff} {GMAIL_QUERY}"
        log.info(f"Incremental mode: emails after {cutoff}")
    else:
        cutoff = (datetime.utcnow() - timedelta(days=30)).strftime("%Y/%m/%d")
        query = f"after:{cutoff} {GMAIL_QUERY}"
        log.info(f"Default mode: after {cutoff}")

    # Load existing cards index early — needed for active thread check AND dedup
    existing_ids, existing_thread_map = get_existing_cards_index()

    # Step 1.5 — Re-check active tracked threads for replies missed by the search query
    # (e.g. lead replies to Robert where the reply subject doesn't match any search keyword)
    if not dry_run:
        await check_active_threads_for_replies(existing_thread_map, token, cutoff)

    # Step 1 — Scrape metadata
    emails = await fetch_all_metadata(token, query)
    if not emails:
        log.info("No emails found. Done.")
        set_last_run_date(datetime.utcnow().strftime("%Y/%m/%d"))
        return 0

    # Step 2 — Intent filter
    filtered = intent_filter(emails)
    if not filtered:
        log.info("No emails passed intent filter. Done.")
        set_last_run_date(datetime.utcnow().strftime("%Y/%m/%d"))
        return 0

    if dry_run:
        log.info(f"DRY RUN complete — {len(filtered)} emails passed filter. Exiting.")
        return len(filtered)

    # Step 3 — Fetch full threads for ALL filtered emails (key change from v3)
    conversations = await fetch_all_conversations(filtered, token)

    # Step 4 — id_map for dedup (existing_ids + existing_thread_map already loaded above)
    id_map = {e["id"]: e for e in filtered}

    # Step 5 — AI extraction + incremental Supabase write (per chunk, not batch)
    total_extracted, written = await extract_all(filtered, conversations, client, existing_ids, id_map, existing_thread_map)
    if total_extracted == 0:
        log.info("No leads extracted. Done.")
        set_last_run_date(datetime.utcnow().strftime("%Y/%m/%d"))
        return 0

    log.info(f"All chunks done: {total_extracted} extracted, {written} written to board.")

    # Step 6 — Reply drafts for ALL unreplied leads with no draft yet
    unreplied_cards = []
    try:
        resp = httpx.get(
            f"{SUPABASE_URL}/rest/v1/cards?list_id=eq.unreplied&draft_reply_status=eq.pending&select=*&limit=500",
            headers=_sb_headers(), timeout=15,
        )
        if resp.status_code == 200:
            unreplied_cards = resp.json() if isinstance(resp.json(), list) else []
    except Exception as e:
        log.warning(f"Could not fetch unreplied cards for reply drafting: {e}")
    if unreplied_cards:
        log.info(f"Drafting replies for {len(unreplied_cards)} unreplied leads …")
        drafts = await draft_replies(unreplied_cards, client)
        if drafts:
            update_reply_drafts(drafts)

    set_last_run_date(datetime.utcnow().strftime("%Y/%m/%d"))

    elapsed = (datetime.utcnow() - start).total_seconds()
    log.info("═" * 64)
    log.info(
        f"Pipeline complete in {elapsed:.1f}s — "
        f"{len(emails)} fetched → {len(filtered)} filtered → "
        f"{total_extracted} extracted → {written} written"
    )
    log.info("═" * 64)

    if TELEGRAM_TOKEN and TELEGRAM_CHAT_ID:
        try:
            hot_count  = sum(1 for c in cards if c.get("priority") == "hot")
            warm_count = sum(1 for c in cards if c.get("priority") == "warm")
            msg = (
                f"✅ Scraper v4: {written} new leads in {elapsed:.0f}s\n"
                f"🔥 {hot_count} hot · 🌡️ {warm_count} warm\n"
                f"📧 {len(emails)} fetched → {len(filtered)} filtered → {len(leads)} extracted"
            )
            httpx.post(
                f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
                json={"chat_id": TELEGRAM_CHAT_ID, "text": msg},
                timeout=10.0,
            )
        except Exception:
            pass

    return written


# ─────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    full_backfill = "--full"    in sys.argv
    dry_run       = "--dry-run" in sys.argv
    hours = 0
    for arg in sys.argv:
        if arg.startswith("--hours="):
            try: hours = int(arg.split("=")[1])
            except: pass
    incremental   = not full_backfill and hours == 0

    result = asyncio.run(run_pipeline(
        incremental=incremental,
        full_backfill=full_backfill,
        dry_run=dry_run,
        hours=hours,
    ))
    sys.exit(0 if result is not None else 1)
