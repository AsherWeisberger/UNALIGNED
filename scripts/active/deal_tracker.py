#!/usr/bin/env python3
"""
UNALIGNED Deal Tracker — PHASE 1 (SHADOW).

Has the local LLM READ each ACTIVE card's thread and write a structured deal read
(stage / who-owes-the-next-move / agreement / evidence / confidence + flags) onto the
card. It does NOT move stages and never touches money stages. Phase 2 (auto-move) is a
separate, later change. Per DEAL_TRACKER_SPEC.md.

Usage:
  python3 scripts/active/deal_tracker.py --dry-run [--limit N]   # classify + print, NO writes (watch it think)
  python3 scripts/active/deal_tracker.py [--limit N]             # shadow: write deal_* fields, NO stage move

Env (same as the scraper; source ~/.config/google-credentials/unaligned-scraper.env):
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (preferred) or SUPABASE_ANON_KEY
  LOCAL_MODEL_BASE  (default http://127.0.0.1:11434/v1)   LOCAL_MODEL_NAME (default qwen3.6:35b-a3b)
  optional: ANTHROPIC_API_KEY + CLAUDE_MODEL  (low-confidence + high-stakes escalation only)
"""
import os
import re
import sys
import json
import html
import base64
from pathlib import Path
from datetime import datetime, timezone

import requests

# ── Phase is a MANUAL config flag. Default 1 = shadow (read + surface, move nothing).
# The tracker NEVER promotes itself. Only a human sets DEAL_TRACKER_PHASE=2 to allow moves.
PHASE = int(os.environ.get("DEAL_TRACKER_PHASE", "1"))
SHADOW = PHASE < 2  # Phase 1 = shadow. Phase 2+ is opt-in by the operator, not built here.
FORBIDDEN_WRITE_FIELDS = {"list_id", "stage", "draft_reply_status", "draft_reply"}

ACTIVE_STAGES = ("new", "first-touch", "engaged", "rates-sent", "negotiating")
# (invoice-sent, done, paid-out, dead-leads, trash are never read or written.)

SHADOW_FIELDS = (
    "deal_state", "deal_confidence", "deal_awaiting", "deal_evidence",
    "deal_next_action", "last_inbound_at", "needs_human_read", "needs_reply",
    "needs_followup", "ready_to_invoice", "agreement",
)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY", "")
# Dedicated DEAL_MODEL_* so the scraper env (which points LOCAL_MODEL_NAME at a
# separate :8000 server) cannot clobber this. Defaults to the live Ollama model.
LOCAL_MODEL_BASE = os.environ.get("DEAL_MODEL_BASE", "http://127.0.0.1:11434/v1").rstrip("/")
LOCAL_MODEL_NAME = os.environ.get("DEAL_MODEL_NAME", "qwen3.6:35b-a3b")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-opus-4-8")
ESCALATE_VALUE = float(os.environ.get("DEAL_ESCALATE_VALUE", "3000"))

# Live Gmail: read the freshest thread straight from Gmail (not the cached board scrape).
# A thread can live in Robert's OR Asher's mailbox, so try both tokens. Robert first
# (the scraper's primary inbox), then Asher. Override with DEAL_GMAIL_TOKENS (comma list).
_CRED_DIR = Path.home() / ".config/google-credentials"
GMAIL_TOKEN_FILES = [Path(p) for p in os.environ.get(
    "DEAL_GMAIL_TOKENS",
    f"{_CRED_DIR/'gmail-token.json'},{_CRED_DIR/'asher-gmail-token.json'}").split(",") if p.strip()]
_GMAIL_ACCESS = {}  # path -> access token


def _need_env():
    missing = [n for n, v in [("SUPABASE_URL", SUPABASE_URL), ("SUPABASE key", SUPABASE_KEY)] if not v]
    if missing:
        sys.exit("Missing env: " + ", ".join(missing) +
                 " — source ~/.config/google-credentials/unaligned-scraper.env first.")


def _headers(write=False):
    h = {"apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Accept": "application/json"}
    if write:
        h["Content-Type"] = "application/json"
        h["Prefer"] = "return=minimal"
    return h


def get_active_cards(limit):
    quoted = ",".join(ACTIVE_STAGES)
    params = {"list_id": f"in.({quoted})", "limit": str(limit), "order": "moved_at.desc.nullslast"}
    r = requests.get(f"{SUPABASE_URL}/rest/v1/cards", headers=_headers(), params=params, timeout=30)
    r.raise_for_status()
    return r.json()


# ── thread assembly ────────────────────────────────────────────────────────
def _strip(text):
    text = html.unescape(text or "")
    text = re.sub(r"<[^>]+>", " ", text)               # html tags
    text = re.split(r"\nOn .*wrote:|\n>.*", text)[0]    # quoted tails
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def thread_text(card):
    """Best-available thread for shadow reads. Prefers email_thread, falls back to
    original_email/description. NOTE: freshness depends on the scrape; Phase 1 compares
    the read against reality, so stale threads are part of what shadow surfaces."""
    raw = card.get("email_thread") or card.get("original_email") or card.get("description") or ""
    msgs = []
    if isinstance(raw, str) and raw.strip().startswith(("[", "{")):
        try:
            data = json.loads(raw)
            if isinstance(data, dict):
                data = data.get("messages") or [data]
            for m in (data or []):
                who = m.get("from") or m.get("sender") or m.get("role") or "?"
                body = _strip(m.get("body") or m.get("text") or m.get("snippet") or "")
                when = m.get("date") or m.get("ts") or ""
                if body:
                    msgs.append((when, who, body[:1200]))
        except (json.JSONDecodeError, ValueError):
            pass
    if not msgs:
        body = _strip(raw if isinstance(raw, str) else json.dumps(raw))
        if body:
            msgs.append(("", "?", body[:4000]))
    msgs = msgs[-8:]  # last ~8 messages
    last_when = next((w for w, _, _ in reversed(msgs) if w), "")
    rendered = "\n\n".join(f"[{w}] {who}:\n{b}" for w, who, b in msgs)
    return rendered, last_when


# ── live Gmail (fresh thread, not the cached board scrape) ──────────────────
def gmail_token(path):
    key = str(path)
    if key in _GMAIL_ACCESS:
        return _GMAIL_ACCESS[key]
    tok = None
    try:
        if path.exists():
            data = json.loads(path.read_text())
            r = requests.post(data.get("token_uri", "https://oauth2.googleapis.com/token"), data={
                "client_id": data["client_id"], "client_secret": data["client_secret"],
                "refresh_token": data["refresh_token"], "grant_type": "refresh_token"}, timeout=30)
            r.raise_for_status()
            tok = r.json()["access_token"]
    except Exception:  # noqa: BLE001
        tok = None
    _GMAIL_ACCESS[key] = tok
    return tok


def _b64(s):
    if not s:
        return ""
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4)).decode("utf-8", "ignore")


def _msg_plaintext(payload):
    if not payload:
        return ""
    mt = payload.get("mimeType", "")
    body = payload.get("body", {})
    if mt == "text/plain" and body.get("data"):
        return _b64(body["data"])
    out = ""
    for part in payload.get("parts", []) or []:
        out += _msg_plaintext(part) + "\n"
    if not out.strip() and mt == "text/html" and body.get("data"):
        return _strip(_b64(body["data"]))
    return out


def _fetch_thread_with(tok, card):
    base = "https://gmail.googleapis.com/gmail/v1/users/me"
    h = {"Authorization": "Bearer " + tok}
    tid = str(card.get("gmail_thread_id") or "").strip()
    email = str(card.get("email") or "").strip()
    if not re.fullmatch(r"[0-9a-fA-F]{8,20}", tid):
        tid = ""
    if not tid:
        if not email:
            return None
        r = requests.get(base + "/messages", headers=h,
                         params={"q": f"(from:{email} OR to:{email})", "maxResults": "1"}, timeout=30)
        if r.status_code >= 400:
            return None
        msgs = r.json().get("messages") or []
        if not msgs:
            return None
        tid = msgs[0]["threadId"]
    r = requests.get(f"{base}/threads/{tid}", headers=h, params={"format": "full"}, timeout=30)
    if r.status_code >= 400:
        return None  # thread not in this mailbox (try the next token)
    out = []
    for m in r.json().get("messages", []):
        hdr = {x["name"].lower(): x["value"] for x in m.get("payload", {}).get("headers", [])}
        body = _strip(_msg_plaintext(m.get("payload", {})))
        if body:
            out.append((hdr.get("date", ""), hdr.get("from", "?"), body[:1200]))
    if not out:
        return None
    out = out[-8:]
    last_when = next((w for w, _, _ in reversed(out) if w), "")
    return "\n\n".join(f"[{w}] {who}:\n{b}" for w, who, b in out), last_when


def gmail_live_thread(card):
    """Read the freshest Gmail thread for this lead, trying each mailbox (Robert,
    then Asher). Returns (rendered, last_when) or None if not found anywhere."""
    for path in GMAIL_TOKEN_FILES:
        tok = gmail_token(path)
        if not tok:
            continue
        try:
            res = _fetch_thread_with(tok, card)
        except Exception:  # noqa: BLE001 — Gmail hiccup, try next mailbox / fall back to cached
            res = None
        if res and res[0]:
            return res
    return None


def get_thread(card):
    """Prefer LIVE Gmail (the spec's freshness requirement); fall back to the cached
    board thread only if Gmail is unreachable. Returns (rendered, last_when, source)."""
    live = gmail_live_thread(card)
    if live and live[0]:
        return live[0], live[1], "live"
    rendered, last_when = thread_text(card)
    return rendered, last_when, "cached"


# ── LLM ────────────────────────────────────────────────────────────────────
_SYSTEM = """You read one sales email thread for UNALIGNED (Robert Scoble sponsorships) and report the deal state. Be strict and literal. Quote real text as evidence or set confidence to "low". Never invent agreement.

Definitions:
- agreement = they explicitly accepted a rate or scope.
- "ready-to-invoice" = agreement reached, ready to bill.
- "declined" = they clearly passed / no budget.
- "stalled" = no movement, someone went quiet.
- awaiting = who owes the next move ("us", "them", or "none").

Return ONE strict JSON object, nothing else, no markdown:
{"stage":"engaged|rates-sent|negotiating|ready-to-invoice|stalled|declined|unclear","last_speaker":"us|them","awaiting":"us|them|none","agreement":true|false,"agreed_terms":"tier/rate/scope they accepted, or null","next_action":"one line: who owns the next move and what it is","evidence":"exact quoted sentence that proves the stage/agreement","confidence":"high|medium|low"}"""


def _post(url, headers, payload, timeout=180):
    r = requests.post(url, headers=headers, data=json.dumps(payload), timeout=timeout)
    r.raise_for_status()
    return r.json()


def llm_local(user):
    # qwen3.6 is a reasoning model; give it room so the "thinking" does not eat the
    # whole budget and leave the JSON answer empty.
    data = _post(LOCAL_MODEL_BASE + "/chat/completions",
                 {"Content-Type": "application/json"},
                 {"model": LOCAL_MODEL_NAME, "max_tokens": 4000,
                  "think": False,  # Ollama: disable reasoning so it answers JSON directly
                  "messages": [{"role": "system", "content": _SYSTEM},
                               {"role": "user", "content": user}]})
    msg = data["choices"][0]["message"]
    # qwen reasoning models sometimes leave content empty and put output in `reasoning`.
    return msg.get("content") or msg.get("reasoning") or ""


def llm_claude(user):
    data = _post("https://api.anthropic.com/v1/messages",
                 {"Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY,
                  "anthropic-version": "2023-06-01"},
                 {"model": CLAUDE_MODEL, "max_tokens": 1200, "system": _SYSTEM,
                  "messages": [{"role": "user", "content": user}]})
    return "".join(b.get("text", "") for b in data.get("content", []))


def _last_json(text):
    if not text:
        return None
    depth, end = 0, -1
    for i in range(len(text) - 1, -1, -1):
        c = text[i]
        if c == "}":
            if depth == 0:
                end = i
            depth += 1
        elif c == "{":
            depth -= 1
            if depth == 0 and end != -1:
                try:
                    return json.loads(text[i:end + 1])
                except (json.JSONDecodeError, ValueError):
                    end = -1
    return None


def classify(card):
    rendered, last_when, source = get_thread(card)
    meta = {k: card.get(k) for k in ("business_name", "contact_name", "agent_tier",
                                     "estimated_value", "list_id", "intent")}
    user = ("Card metadata:\n" + json.dumps(meta, ensure_ascii=False) +
            "\n\nThread (oldest to newest, quoted tails stripped):\n" +
            (rendered or "(no thread text available)") +
            "\n\nReturn the JSON object now. /no_think")
    raw = llm_local(user)
    read = _last_json(raw)
    # Escalate to Claude only when local is low-confidence AND the card is high-stakes.
    if ANTHROPIC_API_KEY and (not read or str(read.get("confidence", "")).lower() == "low"):
        value = _money(card.get("estimated_value"))
        stage = (card.get("list_id") or "").lower()
        if value >= ESCALATE_VALUE or stage in ("negotiating", "rates-sent"):
            try:
                read = _last_json(llm_claude(user)) or read
                if read:
                    read["_escalated"] = True
            except Exception:  # noqa: BLE001
                pass
    return read, last_when, raw, source


def _money(v):
    if v in (None, ""):
        return 0.0
    m = re.search(r"[\d,]+(?:\.\d+)?", str(v))
    return float(m.group(0).replace(",", "")) if m else 0.0


def _quiet_days(last_when):
    if not last_when:
        return None
    s = str(last_when).replace("Z", "+00:00")
    for parse in (datetime.fromisoformat,):
        try:
            dt = parse(s)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return round((datetime.now(timezone.utc) - dt).total_seconds() / 86400.0, 1)
        except Exception:  # noqa: BLE001
            return None
    return None


def build_shadow_fields(card, read, last_when):
    """Map the LLM read -> board fields. PHASE 1: flags only, NEVER a stage move."""
    qd = _quiet_days(last_when)
    conf = str(read.get("confidence", "low")).lower()
    stage = str(read.get("stage", "unclear")).lower()
    awaiting = str(read.get("awaiting", "none")).lower()
    agreement = bool(read.get("agreement"))

    needs_reply = conf == "high" and awaiting == "us"
    needs_followup = conf == "high" and awaiting == "them" and (qd is not None and qd >= 4)
    ready = conf == "high" and stage == "ready-to-invoice"
    # Anything the read would WANT to change, or any uncertainty, goes to a human in shadow.
    current = (card.get("list_id") or "").lower()
    suggests_change = stage in ("engaged", "rates-sent", "negotiating", "ready-to-invoice", "declined") and stage != current
    needs_human = conf in ("medium", "low") or stage == "declined" or ready or suggests_change

    fields = {
        "deal_state": stage,
        "deal_confidence": conf,
        "deal_awaiting": awaiting,
        "deal_evidence": (read.get("evidence") or "")[:1000],
        "deal_next_action": (read.get("next_action") or "")[:500],
        "needs_human_read": bool(needs_human),
        "needs_reply": bool(needs_reply),
        "needs_followup": bool(needs_followup),
        "ready_to_invoice": bool(ready),
        "agreement": agreement,
    }
    if last_when:
        s = str(last_when).replace("Z", "+00:00")
        try:
            datetime.fromisoformat(s)
            fields["last_inbound_at"] = s
        except Exception:  # noqa: BLE001
            pass
    return fields, qd


def shadow_write(card_id, fields):
    # Hard guard: Phase 1 can never write a stage or money/draft field.
    bad = FORBIDDEN_WRITE_FIELDS.intersection(fields)
    if bad:
        raise RuntimeError("Phase 1 refuses to write forbidden fields: " + ", ".join(bad))
    r = requests.patch(f"{SUPABASE_URL}/rest/v1/cards", headers=_headers(write=True),
                       params={"id": f"eq.{card_id}"}, data=json.dumps(fields), timeout=30)
    r.raise_for_status()


def log(event, **kw):
    print(json.dumps({"ts": datetime.now(timezone.utc).isoformat(), "event": event, **kw}, ensure_ascii=False))


def run(dry_run, limit):
    _need_env()
    if not SHADOW:
        log("phase_guard", note="DEAL_TRACKER_PHASE>=2 set, but stage-moves are not built here. Running shadow anyway.")
    cards = get_active_cards(limit)
    log("run_start", phase=PHASE, mode=("dry-run" if dry_run else "shadow"),
        active=len(cards), local_model=LOCAL_MODEL_NAME,
        gmail_mailboxes=[p.name for p in GMAIL_TOKEN_FILES])
    done = 0
    for c in cards:
        cid = c.get("id")
        who = c.get("business_name") or c.get("contact_name") or "?"
        try:
            read, last_when, raw, source = classify(c)
            if not read:
                log("read_unparsed", card=cid, who=who, source=source, raw=(raw or "")[:200])
                continue
            fields, qd = build_shadow_fields(c, read, last_when)
            log("read", card=cid, who=who, source=source, current_stage=c.get("list_id"),
                deal_state=fields["deal_state"], confidence=fields["deal_confidence"],
                awaiting=fields["deal_awaiting"], agreement=fields["agreement"],
                quiet_days=qd, needs_human_read=fields["needs_human_read"],
                needs_reply=fields["needs_reply"], needs_followup=fields["needs_followup"],
                ready_to_invoice=fields["ready_to_invoice"],
                escalated=bool(read.get("_escalated")),
                evidence=fields["deal_evidence"][:160],
                next_action=fields["deal_next_action"][:160])
            if not dry_run:
                shadow_write(cid, fields)
                log("shadow_written", card=cid, who=who)
            done += 1
        except Exception as e:  # noqa: BLE001
            log("card_error", card=cid, who=who, error=str(e)[:200])
    log("run_end", processed=done, wrote=(0 if dry_run else done))


if __name__ == "__main__":
    argv = sys.argv[1:]
    dry = "--dry-run" in argv
    lim = 25
    for i, a in enumerate(argv):
        if a == "--limit" and i + 1 < len(argv) and argv[i + 1].isdigit():
            lim = int(argv[i + 1])
        elif a.startswith("--limit="):
            t = a.split("=", 1)[1]
            lim = int(t) if t.isdigit() else lim
    run(dry_run=dry, limit=lim)
