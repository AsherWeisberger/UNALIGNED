#!/usr/bin/env python3
"""
daily_pipeline.py — UNALIGNED Daily Deal Intelligence Pipeline

Runs every morning after scraper_v4.py. For every active deal card:
  1. Reads the stored email thread from Supabase
  2. Claude determines the correct pipeline stage
  3. Moves the card if the stage changed
  4. Drafts a stage-appropriate reply if needed
  5. Queues it for approval (draft_reply_status = 'pending')
  6. Sends a Telegram summary

Stages:
  new          → just scraped, not yet analyzed
  first-touch  → needs initial reply
  engaged      → active conversation, pre-pricing
  rates-sent   → pricing sent, waiting
  negotiating  → active terms negotiation
  invoice-sent → invoice out, awaiting payment
  done         → delivery complete
  paid-out     → payment received
  dead-leads   → closed lost

Usage:
    python3 daily_pipeline.py
    python3 daily_pipeline.py --dry-run   # analyze only, no writes
"""

import json
import os
import sys
import httpx
import anthropic
from datetime import datetime, timezone

SUPABASE_URL     = os.environ.get("SUPABASE_URL", "https://hbnpwphxjurvtydezwgh.supabase.co")
PARTNERSHIP_PDF  = "/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/Unaligned_Partnership_Packages.pdf"
SUPABASE_ANON    = os.environ.get("SUPABASE_ANON_KEY", "")
SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ANTHROPIC_KEY    = os.environ.get("ANTHROPIC_API_KEY", "")
TELEGRAM_TOKEN   = os.environ.get("TELEGRAM_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")

DRY_RUN = "--dry-run" in sys.argv

# Opus 4.6 pricing per million tokens
OPUS_INPUT_PER_M  = 15.00
OPUS_OUTPUT_PER_M = 75.00

# Haiku 4.5 pricing
HAIKU_INPUT_PER_M  = 0.80
HAIKU_OUTPUT_PER_M = 4.00

PIPELINE_MAX_COST_USD = float(os.environ.get("PIPELINE_MAX_COST_USD", "0") or "0")
USE_LOCAL_CLASSIFIER = os.environ.get("USE_LOCAL_CLASSIFIER", "").strip().lower() in {
    "1", "true", "yes", "on",
}

_run_haiku_input_tokens = 0
_run_haiku_output_tokens = 0
_run_opus_input_tokens = 0
_run_opus_output_tokens = 0

def _track(resp, family):
    """Add token counts from a Claude response to this run's totals."""
    global _run_haiku_input_tokens, _run_haiku_output_tokens
    global _run_opus_input_tokens, _run_opus_output_tokens
    if not hasattr(resp, 'usage') or not resp.usage:
        return
    input_tokens = getattr(resp.usage, 'input_tokens', 0)
    output_tokens = getattr(resp.usage, 'output_tokens', 0)
    if family == "haiku":
        _run_haiku_input_tokens += input_tokens
        _run_haiku_output_tokens += output_tokens
    else:
        _run_opus_input_tokens += input_tokens
        _run_opus_output_tokens += output_tokens


def run_cost_usd(extra_haiku_in=0, extra_haiku_out=0, extra_opus_in=0, extra_opus_out=0):
    return (
        ((_run_haiku_input_tokens + extra_haiku_in) / 1_000_000 * HAIKU_INPUT_PER_M) +
        ((_run_haiku_output_tokens + extra_haiku_out) / 1_000_000 * HAIKU_OUTPUT_PER_M) +
        ((_run_opus_input_tokens + extra_opus_in) / 1_000_000 * OPUS_INPUT_PER_M) +
        ((_run_opus_output_tokens + extra_opus_out) / 1_000_000 * OPUS_OUTPUT_PER_M)
    )

# Stages that are "terminal" — don't analyze or move these
TERMINAL_STAGES = {"done", "paid-out", "dead-leads"}

# Stages in order — used to ensure we never move a card backward
STAGE_ORDER = ["new", "first-touch", "engaged", "rates-sent", "negotiating", "invoice-sent", "done", "paid-out"]

# Stages where we draft replies
REPLY_STAGES = {"first-touch", "engaged", "rates-sent", "negotiating", "invoice-sent"}


# ── Supabase helpers ────────────────────────────────────────────────────────
def hdrs(prefer="return=minimal"):
    return {
        "apikey":        SUPABASE_ANON,
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        prefer,
    }


def fetch_active_cards():
    """Fetch all non-terminal deal cards with their stored email threads."""
    cards, offset = [], 0
    # Never analyze/move terminal cards OR trashed leads — a trashed lead must
    # stay trashed and never be auto-moved back onto an active stage.
    skip_stages = TERMINAL_STAGES | {"trash", "dead-leads"}
    terminal_filter = ",".join(f'"{s}"' for s in skip_stages)
    while True:
        r = httpx.get(
            f"{SUPABASE_URL}/rest/v1/cards"
            f"?select=id,title,contact_name,business_name,email,list_id,priority,"
            f"estimated_value,intent,description,email_thread,draft_reply,"
            f"draft_reply_status,labels,activity,email_id,created_at,moved_at,new_reply_at"
            f"&list_id=not.in.({terminal_filter})"
            f"&limit=1000&offset={offset}",
            headers=hdrs(), timeout=30,
        )
        batch = r.json()
        if not isinstance(batch, list) or not batch:
            break
        cards.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000

    # Only deal cards (not relationship/network)
    deal_cards = []
    for c in cards:
        labels = c.get("labels") or []
        label_names = [l if isinstance(l, str) else (l.get("name") or "") for l in labels]
        if any("🤝" in n or "network" in n.lower() for n in label_names):
            continue  # skip relationship cards
        deal_cards.append(c)

    return deal_cards


def get_thread_text(card):
    """Convert stored email_thread to readable text for Claude."""
    thread = card.get("email_thread") or []
    if not thread:
        return ""
    parts = []
    for msg in thread:
        sender = msg.get("from") or msg.get("sender") or "?"
        date   = msg.get("date") or ""
        body   = msg.get("body") or msg.get("snippet") or ""
        parts.append(f"FROM: {sender}\nDATE: {date}\n{body[:1500]}")
    return "\n\n---\n\n".join(parts)


def patch_card(card_id, data):
    r = httpx.patch(
        f"{SUPABASE_URL}/rest/v1/cards?id=eq.{card_id}",
        headers=hdrs(), json=data, timeout=15,
    )
    return r.status_code in (200, 204)


def latest_thread_timestamp(card):
    thread = card.get("email_thread") or []
    if isinstance(thread, str):
        try:
            thread = json.loads(thread)
        except Exception:
            thread = []
    stamps = []
    for msg in thread:
        raw = msg.get("date_iso") or msg.get("date") or msg.get("when") or ""
        if not raw:
            continue
        try:
            stamps.append(datetime.fromisoformat(str(raw).replace("Z", "+00:00")).timestamp())
        except Exception:
            try:
                stamps.append(datetime.strptime(str(raw), "%a, %b %d, %Y, %I:%M %p").timestamp())
            except Exception:
                continue
    if stamps:
        return max(stamps)
    fallback = card.get("moved_at") or card.get("created_at") or card.get("new_reply_at") or ""
    if fallback:
        try:
            return datetime.fromisoformat(str(fallback).replace("Z", "+00:00")).timestamp()
        except Exception:
            return None
    return None


def auto_trash_stale_cards(cards):
    """Persist stale cards to trash so the frontend does not fake-hide them."""
    stale = []
    keep = []
    now_ts = datetime.now(timezone.utc).timestamp()
    for card in cards:
        stage = card.get("list_id") or "new"
        if stage in TERMINAL_STAGES or stage == "trash":
            continue
        latest_ts = latest_thread_timestamp(card)
        if latest_ts is None:
            keep.append(card)
            continue
        age_days = (now_ts - latest_ts) / 86400
        if age_days > 50:
            stale.append(card)
        else:
            keep.append(card)

    trashed = []
    for card in stale:
        if DRY_RUN or patch_card(card["id"], {
            "list_id": "trash",
            "moved_at": datetime.now(timezone.utc).isoformat(),
        }):
            trashed.append(card)
    return keep, trashed


def send_telegram(msg):
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
        return
    try:
        httpx.post(
            f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
            json={"chat_id": TELEGRAM_CHAT_ID, "text": msg, "parse_mode": "HTML"},
            timeout=10,
        )
    except Exception:
        pass


# ── Stage analysis ──────────────────────────────────────────────────────────
STAGE_PROMPT = """\
You are analyzing an email thread for UNALIGNED, a tech podcast/media company hosted by Robert Scoble.
The thread is a sponsorship or deal negotiation between Robert's team and a potential sponsor/partner.

Robert's team members who might be sending emails: Robert Scoble, Sam Levin, Asher Weisberger, \
scobleizer@gmail.com, unalignedx@gmail.com.

Determine the correct pipeline stage for this deal:

"first-touch"  — Robert/Sam have NOT sent any substantive reply yet. The lead emailed but got no \
real response. Needs initial outreach reply drafted.

"engaged"      — Robert/Sam have replied and there's back-and-forth conversation happening, but \
no specific pricing, rates, or formal proposal has been discussed yet.

"rates-sent"   — Robert/Sam have explicitly sent pricing, rates, or a formal proposal to the lead. \
Waiting for the lead's response.

"negotiating"  — The lead responded to the pricing and there is active negotiation: they pushed back \
on price, asked for different terms, or are actively working out specifics.

"invoice-sent" — A deal has been agreed. An invoice has been sent or payment is being arranged. \
Waiting for payment.

"done"         — Delivery is complete (content published, interview recorded, collab executed).

"dead"         — The conversation is clearly dead: lead ghosted after multiple follow-ups, \
explicitly said no, or went silent for 6+ weeks with no response.

Also determine:
- needs_reply: true if Robert/Sam should send a reply right now (e.g. lead asked something, \
deal is stalling, follow-up needed)
- reply_type: one of "initial-outreach", "move-to-rates", "follow-up-rates", \
"negotiate-response", "follow-up-invoice", or null

Return ONLY valid JSON:
{"stage": "<stage>", "reason": "<one sentence>", "needs_reply": true|false, "reply_type": "<type>|null"}

THREAD:
"""


def analyze_stage(card, client):
    """Ask Claude what stage this deal is in and whether it needs a reply."""
    thread_text = get_thread_text(card)
    if not thread_text:
        return {"stage": "first-touch", "reason": "No thread stored", "needs_reply": True, "reply_type": "initial-outreach"}

    desc = ""
    raw = card.get("description", "")
    if isinstance(raw, str) and raw.strip().startswith("{"):
        try:
            desc = json.loads(raw).get("rich_description", "")[:300]
        except Exception:
            desc = raw[:300]
    else:
        desc = raw[:300]

    context = (
        f"Deal: {card.get('title','?')}\n"
        f"Company: {card.get('business_name','?')}\n"
        f"Contact: {card.get('contact_name','?')}\n"
        f"Summary: {desc}\n\n"
        f"EMAIL THREAD:\n{thread_text[:5000]}"
    )

    try:
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=256,
            messages=[{"role": "user", "content": STAGE_PROMPT + context}],
        )
        _track(resp, "haiku")
        text = resp.content[0].text.strip()
        if "```" in text:
            for part in text.split("```"):
                part = part.strip()
                if part.startswith("json"): part = part[4:].strip()
                if part.startswith("{"): text = part; break
        return json.loads(text)
    except Exception as e:
        print(f"    ⚠ Stage analysis failed: {e}")
        return None


# ── Reply drafting ──────────────────────────────────────────────────────────
SAM_SIGNATURE = """
Sam Levin
Partnerships, UNALIGNED
unalignedx@gmail.com"""

REPLY_PROMPTS = {
    "initial-outreach": """\
You are drafting an initial reply on behalf of Robert Scoble, host of UNALIGNED (a top tech \
podcast/media company). Write a warm, personal first reply that:
- Thanks them for reaching out
- Briefly acknowledges what they're interested in
- Expresses genuine excitement about the opportunity
- Says his team will follow up with rates/media kit shortly
Keep it under 150 words. Conversational, not corporate — this is Robert personally reaching out. \
Sign off with Robert's exact signature:

Robert Scoble
Founder, Unaligned (media company about how AI is bringing us new things)
Mobile: +1-425-205-1921
X: https://x.com/scobleizer
Web: https://unaligned.io
This message copyright the sender. All rights reserved.
""",
    "move-to-rates": """\
You are drafting a rates email on behalf of Sam Levin at UNALIGNED (Robert Scoble's tech \
podcast/media company). Write ONE short personalized opening sentence that references something \
specific from the thread (their product, what they're promoting, or who referred them). \
Then output the following rates template EXACTLY, word for word — do not change anything after \
the opening sentence:

---
I'm Sam Levin, Robert's business partner at Unaligned. Great to connect.

Quick background on our reach:

The Unaligned weekly newsletter has over 5,000 subscribers with an open rate of 50%.

The real engagement occurs with X.

Very recently, Elon Musk reposted Robert's X post receiving over 59M views.

Current Partnership Packages:

Tier 1    $5,995/mo    2x written X + 1x LinkedIn + 2x retweets + newsletter
Tier 2 ⭐  $3,995/mo    1x written X + 1x LinkedIn + 1x retweet + newsletter
Tier 3    $2,995/mo    1x written X + 1x LinkedIn + newsletter
Tier 4    $1,995/post  1x written X post only
Tier 5    $1,195/post  1x retweet only (you provide all assets)

Before we move forward, we'd love to get a clearer picture of your company and what you're \
promoting. Please send over your website, your X/LinkedIn handle, the content assets you'd like \
posted (video, caption, hashtags, posting dates), and a short brief on the campaign.

New clients pay in full before content goes live. Once you've completed your first campaign with \
us, future campaigns are invoiced on the day the post goes live. That's the benefit of becoming \
an ongoing partner.

Wire transfer only.

Let me know which tier fits your goals and we'll get moving.

Cheers,
Sam & Robert
---
""",
    "follow-up-rates": """\
You are drafting a follow-up on behalf of Sam Levin, who handles partnerships for UNALIGNED \
(Robert Scoble's tech podcast/media company). We sent pricing/rates but haven't heard back. \
Write a short, friendly nudge that:
- References that we sent rates recently
- Asks if they had a chance to review
- Keeps the door open without being pushy
Under 80 words. Friendly, not desperate. Sign off with Sam's signature.
""",
    "negotiate-response": """\
You are drafting a reply on behalf of Sam Levin, who handles partnerships for UNALIGNED \
(Robert Scoble's tech podcast/media company). The lead responded to our rates and is negotiating. \
Based on the thread, write a professional response that:
- Addresses their specific question or pushback
- Finds common ground where possible
- Keeps the deal moving forward
- Is firm but collaborative
Under 150 words. Sign off with Sam's signature.
""",
    "follow-up-invoice": """\
You are drafting a payment follow-up on behalf of Sam Levin, who handles partnerships for UNALIGNED \
(Robert Scoble's tech podcast/media company). We sent an invoice but haven't received payment. \
Write a brief, professional follow-up that:
- References the outstanding invoice
- Asks if there are any questions or issues
- Is polite and not aggressive
Under 80 words. Sign off with Sam's signature.
""",
    "qualify-suspicious": """\
You are drafting a CAUTIOUS reply on behalf of Sam Levin at UNALIGNED (Robert Scoble's tech \
podcast/media company). Something in this thread is unverified, so DO NOT commit, DO NOT quote \
rates or packages, and DO NOT agree to anything yet. Keep the door open but qualify them. Write a \
short, polite reply that:
- Says we're open to exploring it
- Asks them to confirm who they are and the company they represent, from an official company \
email/domain, plus the company website and the brand's verified X handle
- Asks them to spell out exactly what they're proposing
Friendly but careful, never accusatory. Under 90 words. Sign off with Sam's signature.
""",
}


# ── Operator framework: Asher's tone + scam gate, applied to every draft ──────
# Source of truth: ~/.hermes/memories/unaligned_email_triage_and_briefs.md
OPERATOR_FRAMEWORK = """\
OPERATOR FRAMEWORK (apply before writing — this is Asher's own voice and judgment):

VOICE RULES:
- Never use hyphens or em dashes (-, the long dash, or the short dash). Use periods, commas, or
  sentence breaks instead. Rewrite compound phrases to avoid hyphenation (e.g. "long term partner"
  not the hyphenated form). Dashes read as AI and are off brand.
- Sound like a real person, not a corporate template. No filler, no AI tells, no overpolished fluff.

TONE — write in the tone given on the TONE line below:
- direct: new or unknown, pure business. Brief, clear, set terms (rate, payment before posting).
  Do not over-warm a stranger.
- friendship: warm rapport or repeat contact. Personable but firm on value.
- long_standing: proven history (e.g. OMANE, EchonLab). Appreciative, fast, trust based, less
  re-explaining. Skip the cold intro and talk like you already know them.
"""

# Brands with a proven, repeat relationship -> long_standing tone (extend as needed)
LONG_STANDING_PARTNERS = {
    "omane", "echonlab", "echon lab", "polyai", "poly ai",
    "ahacreator", "aha creator", "eezycollab", "arcgrowth", "arc growth",
}


def resolve_tone(card):
    """Decide reply tone from relationship depth. Code decides depth; the model applies the voice."""
    name = " ".join(
        str(card.get(k, "") or "") for k in ("business_name", "contact_name", "title")
    ).lower()
    for p in LONG_STANDING_PARTNERS:
        if p in name:
            return "long_standing"
    thread = card.get("email_thread") or []
    if isinstance(thread, str):
        try:
            thread = json.loads(thread)
        except Exception:
            thread = []
    ours = ("unalignedx@", "samlevin@", "scobleizer@", "asherweisberger@", "robert scoble", "sam levin")
    our_msgs = sum(
        1 for m in thread
        if isinstance(m, dict) and any(s in str(m.get("from", "")).lower() for s in ours)
    )
    if our_msgs >= 1 and len(thread) >= 3:
        return "friendship"
    return "direct"


# STRONG signals = clearly a scam -> AVOID (disengage, no draft, even if heavily involved).
SCAM_LOOKALIKE_DOMAINS = ("oauth-signin.com", "mail.skillshare", "tradeifytoken")
SCAM_STRONG_FLAGS = (
    "verify your account", "confirm your wallet", "connect your wallet",
    "send your password", "your login credentials", "banking details", "routing number",
    "without disclosure", "no disclosure", "do not disclose", "don't disclose",
    "change your account settings", "update your payment method",
)
# SOFT signals = suspicious -> keep qualifying lightly (cautious reply, do not commit).
SCAM_SOFT_FLAGS = (
    "commission structure", "referral bonus", "downline", "mlm",
    "act now", "urgent action", "within 24 hours", "limited spots",
    "guaranteed returns", "double your", "investment opportunity",
)


def scam_gate(card):
    """Asher's two-tier scam gate, runs BEFORE drafting.

    Returns (level, reasons) where level is:
      'scam'        — strong signal, AVOID: disengage, no draft (even if heavily involved)
      'suspicious'  — soft signal, keep qualifying lightly: cautious reply, do not commit
      None          — clear, proceed normally
    """
    thread_text = (get_thread_text(card) or "").lower()
    sender = (card.get("email") or "").lower()
    strong, soft = [], []
    for d in SCAM_LOOKALIKE_DOMAINS:
        if d in thread_text or d in sender:
            strong.append(f"lookalike domain: {d}")
    for flag in SCAM_STRONG_FLAGS:
        if flag in thread_text:
            strong.append(f"red-flag ask: '{flag}'")
    for flag in SCAM_SOFT_FLAGS:
        if flag in thread_text:
            soft.append(f"soft signal: '{flag}'")
    if strong:
        return ("scam", strong + soft)
    if soft:
        return ("suspicious", soft)
    return (None, [])


def _no_dashes(text):
    """Safety net for the no-hyphens voice rule: kill dashes used as punctuation, keep phone/URL hyphens."""
    import re as _re
    if not text:
        return text
    text = text.replace("—", ". ").replace("–", ". ")  # em / en dash
    text = _re.sub(r"\s+-\s+", ". ", text)                        # spaced hyphen used as a dash
    return text


def draft_reply(card, reply_type, client, tone="direct"):
    """Draft a stage-appropriate reply for a card."""
    prompt_template = REPLY_PROMPTS.get(reply_type)
    if not prompt_template:
        return None

    thread_text = get_thread_text(card)
    desc = ""
    raw = card.get("description", "")
    if isinstance(raw, str) and raw.strip().startswith("{"):
        try:
            desc = json.loads(raw).get("rich_description", "")[:400]
        except Exception:
            desc = raw[:400]
    else:
        desc = raw[:400]

    context = (
        f"{OPERATOR_FRAMEWORK}\n"
        f"TONE: {tone}\n\n"
        f"{prompt_template}\n\n"
        f"Deal context: {card.get('title','?')}, {card.get('business_name','?')}\n"
        f"Contact: {card.get('contact_name','?')}\n"
        f"Summary: {desc}\n\n"
        f"RECENT THREAD (most relevant):\n{thread_text[-3000:]}"
    )

    try:
        resp = client.messages.create(
            model="claude-opus-4-6",
            max_tokens=512,
            messages=[{"role": "user", "content": context}],
        )
        _track(resp, "opus")
        body = _no_dashes(resp.content[0].text.strip())

        # Ensure correct signature is present
        if reply_type == "initial-outreach":
            if "robert scoble" not in body.lower():
                body = body.rstrip() + "\n\nRobert Scoble\nFounder, Unaligned (media company about how AI is bringing us new things)\nMobile: +1-425-205-1921\nX: https://x.com/scobleizer\nWeb: https://unaligned.io\nThis message copyright the sender. All rights reserved."
        else:
            if "sam levin" not in body.lower():
                body = body.rstrip() + "\n" + SAM_SIGNATURE

        # Infer a subject line
        title = card.get("title", "Re: Follow-up")
        subject = title if title.lower().startswith("re:") else f"Re: {title}"

        return {"subject": subject, "body": body}
    except Exception as e:
        print(f"    ⚠ Reply draft failed: {e}")
        return None


# ── Stage ordering helpers ──────────────────────────────────────────────────
def stage_rank(stage_id):
    try:
        return STAGE_ORDER.index(stage_id)
    except ValueError:
        return -1


def should_advance(current, new_stage):
    """Only move a card forward in the pipeline, never backward."""
    if new_stage == "dead":
        return True  # dead-leads is always valid
    return stage_rank(new_stage) > stage_rank(current)


# ── Dedup recent cards ──────────────────────────────────────────────────────
def dedup_recent_cards(client):
    """
    Find and merge duplicate cards created in the last 24 hours.
    Uses Claude Haiku — cheap, fast yes/no check per pair.
    Returns (merged_count, haiku_input_tokens, haiku_output_tokens).
    """
    from datetime import timedelta
    import re as _re
    from collections import defaultdict as _dd

    since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()

    r = httpx.get(
        f"{SUPABASE_URL}/rest/v1/cards"
        f"?select=id,title,email,contact_name,business_name,list_id,"
        f"gmail_thread_id,email_thread,description,created_at"
        f"&created_at=gte.{since}&limit=500",
        headers=hdrs(), timeout=30,
    )
    recent = r.json()
    if not isinstance(recent, list) or not recent:
        return 0, 0, 0

    print(f"\n[Dedup] Checking {len(recent)} cards created in the last 24h...")

    SKIP_EMAILS  = {"samlevin@mac.com","scobleizer@gmail.com",
                    "asherweisberger@gmail.com","unalignedx@gmail.com"}
    SKIP_DOMAINS = {"gmail.com","yahoo.com","hotmail.com",
                    "outlook.com","mac.com","icloud.com"}

    def parse_thread(c):
        t = c.get("email_thread") or []
        if isinstance(t, str):
            try: t = json.loads(t)
            except: t = []
        return t if isinstance(t, list) else []

    def desc_text(c):
        d = c.get("description") or "{}"
        if isinstance(d, str):
            try: d = json.loads(d)
            except: return d[:300]
        return d.get("rich_description","")[:300] if isinstance(d,dict) else str(d)[:300]

    h_in = h_out = 0

    def same_deal(a, b):
        nonlocal h_in, h_out
        try:
            prompt = (
                f"Card A:\nTitle: {a.get('title','')}\nSummary: {desc_text(a)}\n\n"
                f"Card B:\nTitle: {b.get('title','')}\nSummary: {desc_text(b)}\n\n"
                "Same deal / campaign / collaboration? "
                'JSON only: {"same_deal": true} or {"same_deal": false}'
            )
            resp = client.messages.create(
                model="claude-haiku-4-5-20251001",
                messages=[{"role":"user","content":prompt}],
                max_tokens=20, temperature=0.0,
            )
            if hasattr(resp, "usage"):
                h_in  += getattr(resp.usage, "input_tokens",  0)
                h_out += getattr(resp.usage, "output_tokens", 0)
            text = resp.content[0].text.strip()
            text = _re.sub(r"^```(?:json)?|```$","",text,flags=_re.MULTILINE).strip()
            return json.loads(text).get("same_deal", False)
        except Exception as e:
            print(f"  [Dedup] Claude check error: {e}")
            return False

    def merge_and_delete(keep, delete):
        keep_t = parse_thread(keep)
        del_t  = parse_thread(delete)
        seen   = {(m.get("from",""), m.get("date_iso", m.get("date",""))) for m in keep_t}
        added  = 0
        for msg in del_t:
            key = (msg.get("from",""), msg.get("date_iso", msg.get("date","")))
            if key not in seen:
                keep_t.append(msg); seen.add(key); added += 1
        keep_t.sort(key=lambda m: m.get("date_iso", m.get("date","")))

        desc_raw = keep.get("description") or "{}"
        try:
            desc = json.loads(desc_raw) if isinstance(desc_raw,str) else (desc_raw or {})
        except:
            desc = {}
        agents = desc.get("agents", [])
        known  = {a.get("email","").lower() for a in agents}
        de = (delete.get("email") or "").lower()
        if de and de not in known:
            agents.append({"name": delete.get("contact_name",""),
                           "email": de,
                           "thread_ids": [delete.get("gmail_thread_id","")]})
        desc["agents"] = agents

        # Flag card if new messages were merged AND the latest message is inbound (lead replied)
        TEAM_SENDERS_DP = ["scobleizer@gmail.com", "samlevin@mac.com", "asherweisberger",
                           "robert scoble", "sam levin", "asher weisberger", "unalignedx"]
        latest_sender = (keep_t[-1].get("from") or "").lower() if keep_t else ""
        latest_is_inbound = added > 0 and not any(t in latest_sender for t in TEAM_SENDERS_DP)
        latest_date = keep_t[-1].get("date_iso") or keep_t[-1].get("date") if keep_t else ""

        if not DRY_RUN:
            patch_payload = {"email_thread": keep_t,
                             "description": json.dumps(desc, ensure_ascii=False)}
            if latest_is_inbound:
                patch_payload["new_reply_at"] = latest_date or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            else:
                patch_payload["new_reply_at"] = None
            httpx.patch(
                f"{SUPABASE_URL}/rest/v1/cards?id=eq.{keep['id']}",
                headers=hdrs(),
                json=patch_payload,
                timeout=15,
            )
            httpx.delete(
                f"{SUPABASE_URL}/rest/v1/cards?id=eq.{delete['id']}",
                headers=hdrs(), timeout=15,
            )
        return added

    # Group by sender email
    by_email = _dd(list)
    by_domain = _dd(list)
    for c in recent:
        email = (c.get("email") or "").strip().lower()
        if email and email not in SKIP_EMAILS:
            by_email[email].append(c)
            if "@" in email:
                domain = email.split("@")[1]
                if domain not in SKIP_DOMAINS:
                    by_domain[domain].append(c)

    deleted_ids = set()
    merged = 0

    def process_group(group, label):
        nonlocal merged
        group = sorted([c for c in group if c["id"] not in deleted_ids],
                       key=lambda c: c.get("created_at",""))
        for i in range(1, len(group)):
            ci = group[i]
            if ci["id"] in deleted_ids: continue
            for j in range(i):
                cj = group[j]
                if cj["id"] in deleted_ids: continue
                ti, tj = len(parse_thread(ci)), len(parse_thread(cj))
                keep, delete = (cj, ci) if tj >= ti else (ci, cj)
                if same_deal(keep, delete):
                    added = merge_and_delete(keep, delete)
                    deleted_ids.add(delete["id"])
                    merged += 1
                    print(f"  [Dedup] ✅ Merged card {delete['id']} → {keep['id']} "
                          f"({label}, +{added} msgs{'  DRY RUN' if DRY_RUN else ''})")
                    break

    for email, group in by_email.items():
        if len(group) > 1:
            process_group(group, f"email={email}")

    for domain, group in by_domain.items():
        senders = {(c.get("email") or "").lower() for c in group}
        if len(senders) > 1:
            process_group(group, f"domain={domain}")

    haiku_cost = (h_in / 1_000_000 * HAIKU_INPUT_PER_M) + (h_out / 1_000_000 * HAIKU_OUTPUT_PER_M)
    print(f"[Dedup] {merged} duplicates merged | "
          f"{h_in} in / {h_out} out tokens (≈ ${haiku_cost:.4f})")
    return merged, h_in, h_out


# ── Main ────────────────────────────────────────────────────────────────────
def main():
    print(f"\n{'='*62}")
    print(f"  UNALIGNED Daily Pipeline — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"  Mode: {'DRY RUN' if DRY_RUN else 'LIVE'}")
    if USE_LOCAL_CLASSIFIER:
        print(f"  Local classifier: ON (qwen3.6:35b-a3b via Ollama)")
    print(f"{'='*62}\n")

    if not SERVICE_ROLE_KEY or not ANTHROPIC_KEY:
        print("ERROR: Missing env vars")
        sys.exit(1)

    print("Fetching active deal cards...")
    cards = fetch_active_cards()
    print(f"Found {len(cards)} active deal cards before stale cleanup.\n")

    client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)

    cards, auto_trashed = auto_trash_stale_cards(cards)
    if auto_trashed:
        print(f"Auto-trashed {len(auto_trashed)} stale card(s) older than 50 days.")
    print(f"Analyzing {len(cards)} active deal cards after stale cleanup.\n")

    moved       = []
    drafted     = []
    errors      = []
    flagged     = []
    budget_hit  = False
    analyzed_count = 0

    for i, card in enumerate(cards):
        if PIPELINE_MAX_COST_USD > 0 and run_cost_usd() >= PIPELINE_MAX_COST_USD:
            budget_hit = True
            print(f"\nBudget cap reached at ${run_cost_usd():.4f}. Stopping before remaining cards.")
            break
        analyzed_count += 1
        cid   = card["id"]
        name  = card.get("contact_name") or "?"
        biz   = card.get("business_name") or "?"
        stage = card.get("list_id") or "new"

        print(f"[{i+1}/{len(cards)}] {name} @ {biz} (currently: {stage})")

        # Analyze stage
        analysis = analyze_stage(card, client)
        if not analysis:
            errors.append(f"ID={cid} — stage analysis failed")
            continue

        if USE_LOCAL_CLASSIFIER:
            try:
                from local_classifiers import enrich_analysis
                analysis = enrich_analysis(card, analysis)
                lc = analysis.get("local_classifier")
                if lc:
                    print(f"  🤖 Local {lc}: {analysis.get('local_verdict', {}).get('recommended_action', 'ok')}")
            except Exception as exc:
                print(f"  ⚠ Local classifier skipped: {exc}")

        new_stage  = analysis.get("stage", "").replace("dead", "dead-leads")
        reason     = analysis.get("reason", "")
        needs_reply = analysis.get("needs_reply", False)
        reply_type  = analysis.get("reply_type")

        print(f"  → {new_stage} | {reason}")

        patch = {}
        activity_entries = []

        # Stage movement
        if new_stage and new_stage != stage and should_advance(stage, new_stage):
            patch["list_id"] = new_stage
            patch["moved_at"] = datetime.now(timezone.utc).isoformat()
            activity_entries.append({
                "time":   datetime.now(timezone.utc).isoformat(),
                "user":   "Daily Pipeline",
                "action": f"Auto-moved {stage} → {new_stage}: {reason}",
            })
            moved.append(f"{name} @ {biz}: {stage} → {new_stage}")
            print(f"  ✓ Moving to {new_stage}")

        # Reply drafting — only if card doesn't already have a pending draft
        existing_draft_status = card.get("draft_reply_status") or ""
        already_has_draft = existing_draft_status == "pending" and card.get("draft_reply")

        if needs_reply and reply_type and not already_has_draft:
            final_stage = new_stage if new_stage else stage
            if final_stage in REPLY_STAGES or reply_type == "fulfillment-fix":
                scam_level, scam_reasons = scam_gate(card)
                why = scam_reasons[0] if scam_reasons else ""
                if scam_level == "scam":
                    # Clearly a scam -> AVOID: disengage, no draft, flag for human review
                    print(f"  ⛔ Scam gate AVOID ({why}) — flagged for review, no draft")
                    patch["draft_reply_status"] = "review"
                    flagged.append(("scam", f"{name} @ {biz}", why))
                    activity_entries.append({
                        "time": datetime.now(timezone.utc).isoformat(),
                        "user": "Scam gate",
                        "action": f"AVOID. Looks like a scam ({why}). Disengage, do not commit.",
                    })
                elif scam_level == "suspicious":
                    # Suspicious -> keep qualifying lightly: cautious reply, do not commit
                    print(f"  ⚠ Scam gate qualify ({why}) — drafting cautious qualify reply")
                    reply = draft_reply(card, "qualify-suspicious", client, tone="direct")
                    if reply:
                        patch["draft_reply"] = reply
                    patch["draft_reply_status"] = "review"
                    flagged.append(("suspicious", f"{name} @ {biz}", why))
                    activity_entries.append({
                        "time": datetime.now(timezone.utc).isoformat(),
                        "user": "Scam gate",
                        "action": f"Suspicious ({why}). Cautious qualify reply drafted. Verify before committing.",
                    })
                else:
                    if analysis.get("local_holding_reply"):
                        reply = analysis["local_holding_reply"]
                        print(f"  ✍ Using local holding reply (fulfillment-fix)...")
                    else:
                        tone = resolve_tone(card)
                        print(f"  ✍ Drafting reply ({reply_type}, tone={tone})...")
                        reply = draft_reply(card, reply_type, client, tone=tone)
                    if reply:
                        patch["draft_reply"] = reply
                        patch["draft_reply_status"] = "pending"
                        drafted.append(f"{name} @ {biz} ({reply_type})")
                        print(f"  ✓ Reply drafted")

        # Append activity (stage move and/or scam-gate review note)
        if activity_entries:
            existing_activity = card.get("activity") or []
            patch["activity"] = existing_activity + activity_entries

        # Apply patch
        if patch and not DRY_RUN:
            ok = patch_card(cid, patch)
            if not ok:
                errors.append(f"ID={cid} — patch failed")
                print(f"  ✗ Patch failed")

    # ── Dedup last 24h ───────────────────────────────────────────────────────
    dedup_merged, h_in, h_out = dedup_recent_cards(client)

    # ── Summary ──────────────────────────────────────────────────────────────
    print(f"\n{'='*62}")
    print(f"  SUMMARY")
    print(f"{'='*62}")
    print(f"  Cards analyzed:    {analyzed_count}")
    print(f"  Stage moves:       {len(moved)}")
    print(f"  Replies drafted:   {len(drafted)}")
    print(f"  Needs review:      {len(flagged)}")
    print(f"  Auto-trashed:      {len(auto_trashed)}")
    if flagged:
        for level, who, why in flagged:
            icon = "⛔" if level == "scam" else "⚠"
            print(f"     {icon} {who} — {why}")
    print(f"  Dupes merged:      {dedup_merged}")
    print(f"  Errors:            {len(errors)}")
    run_cost = run_cost_usd(extra_haiku_in=h_in, extra_haiku_out=h_out)
    total_in = _run_haiku_input_tokens + _run_opus_input_tokens + h_in
    total_out = _run_haiku_output_tokens + _run_opus_output_tokens + h_out
    print(f"  Tokens this run:   {total_in:,} in / {total_out:,} out  (≈ ${run_cost:.4f})")
    print(f"  Haiku usage:       {_run_haiku_input_tokens + h_in:,} in / {_run_haiku_output_tokens + h_out:,} out")
    print(f"  Opus usage:        {_run_opus_input_tokens:,} in / {_run_opus_output_tokens:,} out")
    if budget_hit:
        print(f"  Budget cap:        hit (${PIPELINE_MAX_COST_USD:.2f})")
    if DRY_RUN:
        print(f"\n  DRY RUN — no changes written.")

    # Flush token usage to Supabase
    if not DRY_RUN and (total_in or total_out):
        try:
            import json as _json
            existing = httpx.get(
                f"{SUPABASE_URL}/rest/v1/_secrets?id=eq.usage_stats&select=anthropic_key",
                headers=hdrs(), timeout=10
            ).json()
            # Safely parse existing stats — guard against the column holding a real API key string
            raw = (existing or [{}])[0].get("anthropic_key", "") if existing else ""
            try:
                stats = _json.loads(raw) if raw and raw.strip().startswith("{") else {}
            except Exception:
                stats = {}
            stats["pipeline_input_tokens"]  = stats.get("pipeline_input_tokens",  0) + total_in
            stats["pipeline_output_tokens"] = stats.get("pipeline_output_tokens", 0) + total_out
            stats["pipeline_haiku_input_tokens"] = stats.get("pipeline_haiku_input_tokens", 0) + _run_haiku_input_tokens + h_in
            stats["pipeline_haiku_output_tokens"] = stats.get("pipeline_haiku_output_tokens", 0) + _run_haiku_output_tokens + h_out
            stats["pipeline_opus_input_tokens"] = stats.get("pipeline_opus_input_tokens", 0) + _run_opus_input_tokens
            stats["pipeline_opus_output_tokens"] = stats.get("pipeline_opus_output_tokens", 0) + _run_opus_output_tokens
            stats["pipeline_runs"]          = stats.get("pipeline_runs", 0) + 1
            stats["last_run"]               = datetime.now(timezone.utc).isoformat()
            # UPSERT: creates the row if it doesn't exist, updates if it does
            upsert_hdrs = {**hdrs(), "Prefer": "resolution=merge-duplicates"}
            httpx.post(
                f"{SUPABASE_URL}/rest/v1/_secrets",
                headers=upsert_hdrs,
                json={"id": "usage_stats", "anthropic_key": _json.dumps(stats)},
                timeout=10
            )
            print(f"  Usage logged to Supabase ({total_in:,} in / {total_out:,} out).")
        except Exception as e:
            print(f"  ⚠ Could not log usage: {e}")

    # Telegram
    tg_lines = [f"🤖 <b>UNALIGNED Daily Pipeline</b> — {datetime.now().strftime('%b %d')}"]
    tg_lines.append(f"📊 {analyzed_count} deals analyzed")
    if moved:
        tg_lines.append(f"\n<b>Stage moves ({len(moved)}):</b>")
        for m in moved[:8]:
            tg_lines.append(f"  • {m}")
    if drafted:
        tg_lines.append(f"\n<b>Replies queued for approval ({len(drafted)}):</b>")
        for d in drafted[:8]:
            tg_lines.append(f"  ✉ {d}")
    if flagged:
        scam_n = sum(1 for f in flagged if f[0] == "scam")
        susp_n = sum(1 for f in flagged if f[0] == "suspicious")
        tg_lines.append(f"\n<b>🚩 Needs review ({len(flagged)}):</b> {scam_n} scam, {susp_n} suspicious")
        for level, who, why in flagged[:8]:
            icon = "⛔" if level == "scam" else "⚠"
            tg_lines.append(f"  {icon} {who} — {why}")
        tg_lines.append("Open Company OS → Needs review to approve or dismiss.")
    if auto_trashed:
        tg_lines.append(f"\n🗑 {len(auto_trashed)} stale lead(s) moved to trash")
    if dedup_merged:
        tg_lines.append(f"\n🔀 {dedup_merged} duplicate card(s) merged")
    if errors:
        tg_lines.append(f"\n⚠ {len(errors)} errors")
    if budget_hit:
        tg_lines.append(f"\n💸 Budget cap hit at ${PIPELINE_MAX_COST_USD:.2f}")
    send_telegram("\n".join(tg_lines))

    print(f"{'='*62}\n")


if __name__ == "__main__":
    main()
