#!/usr/bin/env python3
"""
UNALIGNED Deal Brain — PHASE 0 (LOCAL SHADOW, READ-ONLY).

Runs the "ACL workflow" loop on a deal: load persistent deal state, read the live
Gmail thread(s), diff the new messages against the state, classify every ask
against the scope boundary, and produce a status report + send-ready draft +
questions for the human.

SAFETY (Phase 0):
  - READS Gmail only (readonly tokens, same lane as deal_tracker.py).
  - WRITES only to ~/.config/google-credentials/deal_brain/ (reports) and the
    deal_state/<deal>.json file it owns (log + last_processed).
  - NEVER touches Supabase, cards, stages, drafts, or money fields.
  - NEVER sends email. Drafts are text in a report a human copies.

Usage (source ~/.config/google-credentials/unaligned-scraper.env first):
  python3 scripts/active/deal_brain.py --deal acl-2026-alibaba --dry-run
  python3 scripts/active/deal_brain.py --deal acl-2026-alibaba
  python3 scripts/active/deal_brain.py --all
  python3 scripts/active/deal_brain.py --list

Env:
  DEAL_MODEL_BASE  (default http://127.0.0.1:11434/v1)
  DEAL_MODEL_NAME  (default qwen3.6:35b-a3b)
  DEAL_GMAIL_TOKENS (comma list; default Robert then Asher tokens)
"""
from __future__ import annotations

import argparse
import html
import json
import re
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path("/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES")
STATE_DIR = ROOT / "deal_state"
OUT_DIR = Path.home() / ".config" / "google-credentials" / "deal_brain"
CRED_DIR = Path.home() / ".config" / "google-credentials"

LOCAL_MODEL_BASE = os.environ.get("DEAL_MODEL_BASE", "http://127.0.0.1:11434/v1").rstrip("/")
LOCAL_MODEL_NAME = os.environ.get("DEAL_MODEL_NAME", "qwen3.6:35b-a3b")
GMAIL_TOKEN_FILES = [Path(p) for p in os.environ.get(
    "DEAL_GMAIL_TOKENS",
    f"{CRED_DIR/'gmail-token.json'},{CRED_DIR/'asher-gmail-token.json'}").split(",") if p.strip()]

_GMAIL_ACCESS: dict[str, str | None] = {}


# ── Gmail (read-only; self-contained copies of deal_tracker conventions) ────
def gmail_token(path: Path) -> str | None:
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
    except Exception:  # noqa: BLE001 — bad/expired token file; try the next mailbox
        tok = None
    _GMAIL_ACCESS[key] = tok
    return tok


def _b64(data: str) -> str:
    import base64
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4)).decode("utf-8", "ignore")


def _strip(text: str) -> str:
    text = html.unescape(text or "")
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.split(r"\nOn .{0,120}wrote:|\n>", text)[0]
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def _msg_plaintext(payload: dict) -> str:
    mt = payload.get("mimeType", "")
    body = payload.get("body", {}) or {}
    if mt == "text/plain" and body.get("data"):
        return _b64(body["data"])
    out = ""
    for part in payload.get("parts", []) or []:
        out += _msg_plaintext(part) + "\n"
    if not out.strip() and mt == "text/html" and body.get("data"):
        return _strip(_b64(body["data"]))
    return out


def fetch_thread(tid: str) -> list[dict]:
    """Fetch one Gmail thread from whichever mailbox has it. Returns messages
    [{ts_ms, date, sender, body}] oldest→newest, quoted tails stripped."""
    for path in GMAIL_TOKEN_FILES:
        tok = gmail_token(path)
        if not tok:
            continue
        try:
            r = requests.get(f"https://gmail.googleapis.com/gmail/v1/users/me/threads/{tid}",
                             headers={"Authorization": "Bearer " + tok},
                             params={"format": "full"}, timeout=45)
            if r.status_code >= 400:
                continue
            out = []
            for m in r.json().get("messages", []):
                hdr = {x["name"].lower(): x["value"] for x in m.get("payload", {}).get("headers", [])}
                body = _strip(_msg_plaintext(m.get("payload", {})))
                if not body:
                    continue
                out.append({
                    "ts_ms": int(m.get("internalDate", "0")),
                    "date": hdr.get("date", ""),
                    "sender": hdr.get("from", "?"),
                    "body": body[:2000],
                })
            if out:
                return out
        except Exception:  # noqa: BLE001 — mailbox hiccup, try next token
            continue
    return []


# ── thread auto-discovery ───────────────────────────────────────────────────
# The brain reads the thread ids in the deal state. Counterparties keep forking
# NEW threads (a reply from a different address, a fresh subject). Discovery
# finds every thread involving the deal's EXTERNAL participants so nothing is
# missed. It searches only on counterparty/end-brand addresses, never our own,
# so it stays scoped to this deal.
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.\w+")


def external_participants(state: dict) -> list[str]:
    ours = {e.lower() for e in ([state.get("our_side", {}).get("sender")] +
                                (state.get("our_side", {}).get("cc") or [])) if e}
    ours |= {"asherunaligned@gmail.com", "scobleizer@gmail.com", "samlevin@mac.com",
             "unalignedx@gmail.com", "tradecryptonite@gmail.com"}
    emails: set[str] = set()
    cp = state.get("counterparty", {}) or {}
    for field in ("contacts", "end_brand_contacts"):
        for item in cp.get(field, []) or []:
            emails.update(m.lower() for m in _EMAIL_RE.findall(str(item)))
    emails.update(m.lower() for m in _EMAIL_RE.findall(str(cp.get("billing", "") or "")))
    return sorted(emails - ours)


def discover_threads(state: dict, lookback_days: int = 120) -> list[str]:
    """Find new threads for THIS deal. Requires the deal to define
    discovery_keywords so shared agency contacts (a broker who runs many deals)
    do not pull unrelated threads in. A thread must match a participant AND a
    topic keyword. No keywords defined = discovery off (safe default)."""
    parts = external_participants(state)
    kws = state.get("discovery_keywords") or []
    if not parts or not kws:
        return []
    who = " OR ".join(f"from:{p} OR to:{p} OR cc:{p}" for p in parts)
    topic = " OR ".join(f'"{k}"' if " " in k else k for k in kws)
    q = f"({who}) ({topic}) newer_than:{lookback_days}d"

    def norm_subj(s: str) -> str:
        s = re.sub(r"(?i)^\s*(re|fwd|回复|答复)\s*[:：]\s*", "", str(s or "")).strip()
        return re.sub(r"\s+", " ", s).lower()

    # subjects we already track (Gmail thread ids differ per mailbox, so dedup by subject)
    tracked_subjects: set[str] = set()
    for tid in state.get("gmail_thread_ids", []):
        for path in GMAIL_TOKEN_FILES:
            tok = gmail_token(path)
            if not tok:
                continue
            try:
                r = requests.get(f"https://gmail.googleapis.com/gmail/v1/users/me/threads/{tid}",
                                 headers={"Authorization": "Bearer " + tok},
                                 params={"format": "metadata", "metadataHeaders": "Subject"}, timeout=20)
                if r.status_code < 400 and r.json().get("messages"):
                    h = {x["name"].lower(): x["value"] for x in r.json()["messages"][0].get("payload", {}).get("headers", [])}
                    tracked_subjects.add(norm_subj(h.get("subject", "")))
                    break
            except Exception:  # noqa: BLE001
                continue

    candidates: list[dict] = []
    seen_subj: set[str] = set(tracked_subjects)
    for path in GMAIL_TOKEN_FILES:
        tok = gmail_token(path)
        if not tok:
            continue
        try:
            r = requests.get("https://gmail.googleapis.com/gmail/v1/users/me/threads",
                             headers={"Authorization": "Bearer " + tok},
                             params={"q": q, "maxResults": "40"}, timeout=30)
            if r.status_code >= 400:
                continue
            for t in r.json().get("threads", []) or []:
                tid = t["id"]
                if tid in state.get("gmail_thread_ids", []):
                    continue
                mr = requests.get(f"https://gmail.googleapis.com/gmail/v1/users/me/threads/{tid}",
                                  headers={"Authorization": "Bearer " + tok},
                                  params={"format": "metadata", "metadataHeaders": "Subject"}, timeout=20)
                if mr.status_code >= 400 or not mr.json().get("messages"):
                    continue
                h = {x["name"].lower(): x["value"] for x in mr.json()["messages"][-1].get("payload", {}).get("headers", [])}
                subj = h.get("subject", "(no subject)")
                ns = norm_subj(subj)
                if ns in seen_subj:
                    continue
                seen_subj.add(ns)
                candidates.append({"thread_id": tid, "subject": subj})
        except Exception:  # noqa: BLE001
            continue
    return candidates


# ── LLM ─────────────────────────────────────────────────────────────────────
SYSTEM = """You are the UNALIGNED Deal Brain. You run one loop for a sponsorship deal:
read the DEAL STATE (ground truth from the signed agreement) and the NEW MESSAGES,
then report. Be strict and literal. Quote real text as evidence. Never invent facts.

Hard rules:
- The signed agreement in DEAL STATE is ground truth. Any new ask gets checked against scope_boundary.
- Money before work. Flag payment issues immediately.
- Silence is not agreement: if the counterparty ignored a point listed in open_items, re-raise it.
- Facts only the human knows (availability, pricing decisions, willingness) become questions_for_human, never guesses.
- Confidential items in DEAL STATE stay internal; never place them in a draft.
- Drafts: no hyphens or em dashes anywhere, use periods and commas. Warm but firm. Answer every open ask in one email, numbered like the counterparty numbers. Always give both time zones for any time. Full To/Cc/Subject.

Return ONE strict JSON object, no markdown:
{"status_summary":"plain-english what is happening, newest first, 3-6 sentences",
 "their_asks":[{"ask":"...","classification":"IN_SCOPE|OUT_OF_SCOPE|NEEDS_HUMAN","why":"one line citing scope_boundary or agreement"}],
 "ignored_points":["points we raised that they have not confirmed"],
 "we_owe":["..."],"they_owe":["..."],
 "deadline_alerts":["anything due within ~72h"],
 "draft_needed":true|false,
 "draft":{"to":"...","cc":"...","subject":"...","body":"..."} ,
 "questions_for_human":["only what blocks action"],
 "confidence":"high|medium|low"}"""


BOOTSTRAP_SYSTEM = """You are the UNALIGNED Deal Brain bootstrapper. Read one sales/sponsorship
email thread and DIAGNOSE the deal into a structured state file. Be strict and literal.
Only record what the thread actually shows. Quote-level accuracy matters: if a rate,
date, or scope was never explicitly accepted, do not mark it agreed.

UNALIGNED context: Robert Scoble sponsorships. Tiers run $995 to $5,995. Payment is
always collected before work goes live. Deliverables are things like retweets, quote
reposts, custom X posts, threads, interviews, event coverage.

Return ONE strict JSON object, no markdown:
{"title":"short deal title",
 "counterparty":{"agency":"...","contacts":["emails seen"],"end_brand":"brand being promoted or null"},
 "agreement":{"signed":true|false,
   "scope":"what was explicitly agreed, or 'Nothing agreed yet' ",
   "total_usd":number|null,
   "payments":[{"label":"...","amount":number,"due":"...","status":"paid|pending|failed|unknown"}]},
 "scope_boundary":"one paragraph: the boundary future asks get checked against. If unsigned: 'No commitments until signed. Rates per pricing floors, payment upfront.'",
 "deliverables":[{"id":"d1","title":"...","status":"...","notes":"..."}],
 "open_items":[{"owed_by":"us|them","item":"...","since":"YYYY-MM-DD"}],
 "confidential":["anything flagged internal/confidential in thread"],
 "stage_read":"new|engaged|rates-sent|negotiating|invoice-sent|done|paid-out",
 "evidence":["2-4 exact quotes that anchor the agreement/scope read"],
 "confidence":"high|medium|low"}"""

OLLAMA_CHAT_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434/api/chat")


def llm_json(user: str, system: str = SYSTEM) -> dict | None:
    """Native Ollama chat with format=json + think off — the same proven path as
    local_llm.ollama_chat (the OpenAI-compat endpoint leaks reasoning into content)."""
    try:
        r = requests.post(OLLAMA_CHAT_URL, json={
            "model": LOCAL_MODEL_NAME,
            "messages": [{"role": "system", "content": system},
                         {"role": "user", "content": user}],
            "stream": False,
            "think": False,
            "format": "json",
            "options": {"temperature": 0.3, "num_ctx": 32768, "num_predict": 6000},
        }, timeout=600)
        r.raise_for_status()
        text = (r.json().get("message", {}) or {}).get("content", "").strip()
        m = re.search(r"\{.*\}", text, re.S)
        if not m:
            return None
        # strict=False tolerates literal newlines/control chars inside strings.
        return json.loads(m.group(0), strict=False)
    except Exception as e:  # noqa: BLE001
        print(f"  [llm] unavailable or bad output: {e}")
        return None


def no_hyphens(text: str | None) -> str:
    """Hard-enforce the voice rule: no hyphens or dashes in outgoing copy.
    Em/en dashes become sentence breaks; word hyphens become spaces
    ('on-site' -> 'on site'). URLs and email addresses are left untouched."""
    if not text:
        return text or ""
    text = re.sub(r"\s*[—–]\s*", ". ", str(text))  # em/en dash, eat surrounding space
    text = re.sub(r"\s+-\s+", ". ", text)  # standalone " - "
    out = []
    for token in re.split(r"(\s+)", text):  # keep whitespace as-is
        if "-" in token and not ("://" in token or "@" in token
                                 or token.lower().startswith(("http", "www."))):
            token = token.replace("-", " ")
        out.append(token)
    return "".join(out)


def harden_draft(result: dict | None) -> None:
    """Apply the no-hyphen rule mechanically to the outward-facing draft."""
    if not result:
        return
    d = result.get("draft")
    if isinstance(d, dict):
        for k in ("subject", "body"):
            if d.get(k):
                d[k] = no_hyphens(d[k])


# ── core loop ───────────────────────────────────────────────────────────────
def compact_state(state: dict) -> dict:
    """State as the model sees it (drop bulky history, keep ground truth)."""
    s = {k: state.get(k) for k in (
        "deal_id", "title", "counterparty", "our_side", "agreement",
        "scope_boundary", "deliverables", "schedule", "open_items", "confidential")}
    s["recent_log"] = (state.get("log") or [])[-6:]
    return s


def run_deal(state_file: Path, dry_run: bool) -> int:
    state = json.loads(state_file.read_text())
    deal_id = state.get("deal_id", state_file.stem)
    print(f"— deal: {deal_id}")

    # Surface (do NOT auto-merge) any forked/untracked thread that matches this
    # deal's participants AND topic keywords. Human confirms before it is tracked.
    candidates = discover_threads(state)
    if candidates:
        print(f"  {len(candidates)} candidate thread(s) to review (not yet tracked):")
        for c in candidates:
            print(f"    · {c['thread_id']}  {c['subject']}")

    msgs: list[dict] = []
    for tid in state.get("gmail_thread_ids", []):
        msgs.extend(fetch_thread(tid))
    if not msgs:
        print("  no thread messages fetched (check tokens / thread ids)")
        return 1
    msgs.sort(key=lambda m: m["ts_ms"])

    last_ms = 0
    lp = state.get("last_processed") or ""
    if lp:
        try:
            last_ms = int(datetime.fromisoformat(lp).timestamp() * 1000)
        except ValueError:
            last_ms = 0
    new = [m for m in msgs if m["ts_ms"] > last_ms]
    print(f"  {len(msgs)} messages total, {len(new)} new since last run")

    # Cap what the model sees: state carries the history, so the prompt only
    # needs the recent tail. Prevents first runs (everything "new") from
    # blowing the local model's context window.
    MAX_NEW, MAX_CTX, BODY_CAP = 20, 6, 1400
    new_shown = new[-MAX_NEW:]
    context = [m for m in msgs[-(MAX_NEW + MAX_CTX):] if m not in new_shown][-MAX_CTX:]
    omitted = len(new) - len(new_shown)

    def render(items):
        return "\n\n".join(f"[{m['date']}] {m['sender']}:\n{m['body'][:BODY_CAP]}" for m in items) or "(none)"

    user = (
        "DEAL STATE (ground truth):\n" + json.dumps(compact_state(state), indent=1) +
        "\n\nRECENT THREAD (context, oldest first):\n" + render(context) +
        "\n\nNEW MESSAGES (since last run — focus your diff here" +
        (f"; {omitted} older new messages omitted, their outcomes are in DEAL STATE" if omitted > 0 else "") +
        (", none: report standing state only" if not new else "") + "):\n" + render(new_shown)
    )

    result = llm_json(user)
    harden_draft(result)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    raw_path = OUT_DIR / f"{deal_id}_{ts}.json"
    raw_path.write_text(json.dumps({"deal_id": deal_id, "generated": ts,
                                    "new_message_count": len(new),
                                    "result": result}, indent=2))

    # Human-readable report
    lines = [f"# Deal Brain — {state.get('title', deal_id)}", f"Generated {ts}Z · {len(new)} new message(s)", ""]
    if result:
        lines += ["## What's happening", result.get("status_summary", ""), "", "## Their asks"]
        for a in result.get("their_asks", []):
            lines.append(f"- [{a.get('classification')}] {a.get('ask')} — {a.get('why')}")
        if result.get("ignored_points"):
            lines += ["", "## They still haven't confirmed"] + [f"- {p}" for p in result["ignored_points"]]
        lines += ["", "## We owe them"] + [f"- {p}" for p in result.get("we_owe", [])]
        lines += ["", "## They owe us"] + [f"- {p}" for p in result.get("they_owe", [])]
        if result.get("deadline_alerts"):
            lines += ["", "## ⏰ Deadlines"] + [f"- {p}" for p in result["deadline_alerts"]]
        d = result.get("draft") if result.get("draft_needed") else None
        if d:
            lines += ["", "## Send ready draft", f"To: {d.get('to')}", f"Cc: {d.get('cc')}",
                      f"Subject: {d.get('subject')}", "", d.get("body", "")]
        if result.get("questions_for_human"):
            lines += ["", "## Questions for you"] + [f"- {q}" for q in result["questions_for_human"]]
        lines += ["", f"_confidence: {result.get('confidence')}_"]
    else:
        lines += ["## LLM unavailable — raw new messages for manual read", render(new)]
    report_path = OUT_DIR / f"{deal_id}_{ts}.md"
    report_path.write_text("\n".join(lines))
    print(f"  report: {report_path}")

    if not dry_run and msgs:
        newest = datetime.fromtimestamp(msgs[-1]["ts_ms"] / 1000, tz=timezone.utc)
        state["last_processed"] = newest.isoformat()
        if candidates:
            state["discovery_candidates"] = candidates  # for the human / UI to confirm
        if result and result.get("status_summary"):
            state.setdefault("log", []).append({
                "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                "event": "deal_brain: " + result["status_summary"][:300]})
        state_file.write_text(json.dumps(state, indent=2))
        print("  state updated (last_processed advanced)")
    elif dry_run:
        print("  dry-run: state untouched")
    return 0


def bootstrap_deal(deal_id: str, thread_ids: list[str], force: bool) -> int:
    """Have the AI diagnose a thread into a new deal_state file. The result is
    marked verified:false — a human reviews it once, then the loop owns it."""
    out_file = STATE_DIR / f"{deal_id}.json"
    if out_file.exists() and not force:
        print(f"refusing to overwrite existing {out_file} (use --force)")
        return 1

    msgs: list[dict] = []
    for tid in thread_ids:
        msgs.extend(fetch_thread(tid))
    if not msgs:
        print("no messages fetched — check thread ids / tokens")
        return 1
    msgs.sort(key=lambda m: m["ts_ms"])
    print(f"— bootstrapping {deal_id} from {len(msgs)} messages")

    # Diagnose in chunks so long threads fit the local context window; each pass
    # refines the previous state (the same read-then-diff idea, applied to history).
    CHUNK, BODY_CAP = 18, 1200
    state_guess: dict | None = None
    for i in range(0, len(msgs), CHUNK):
        chunk = msgs[i:i + CHUNK]
        rendered = "\n\n".join(f"[{m['date']}] {m['sender']}:\n{m['body'][:BODY_CAP]}" for m in chunk)
        user = ""
        if state_guess:
            user += ("CURRENT STATE (from earlier messages — refine it, keep what still "
                     "holds, update what changed):\n" + json.dumps(state_guess, indent=1) + "\n\n")
        user += f"THREAD MESSAGES {i + 1}-{i + len(chunk)} of {len(msgs)} (oldest first):\n{rendered}"
        result = llm_json(user, system=BOOTSTRAP_SYSTEM)
        if result:
            state_guess = result
            print(f"  pass {i // CHUNK + 1}: ok (confidence {result.get('confidence')})")
        else:
            print(f"  pass {i // CHUNK + 1}: llm failed, keeping previous state")
    if not state_guess:
        print("bootstrap failed — no usable LLM output")
        return 1

    state = {
        "deal_id": deal_id,
        "verified": False,
        "bootstrap_note": "AI-diagnosed from thread. REVIEW before trusting: agreement, totals, scope_boundary.",
        **state_guess,
        "gmail_thread_ids": thread_ids,
        "log": [{"date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                 "event": "bootstrapped by deal_brain from thread history"}],
        "last_processed": "",
    }
    STATE_DIR.mkdir(exist_ok=True)
    out_file.write_text(json.dumps(state, indent=2))
    print(f"  wrote {out_file}")
    print("  REVIEW IT — check agreement/scope/payments, then set \"verified\": true.")
    ev = state_guess.get("evidence") or []
    if ev:
        print("  evidence the AI anchored on:")
        for q in ev[:4]:
            print(f"    · {q}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--deal", help="deal id (deal_state/<id>.json)")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--bootstrap", action="store_true",
                    help="AI-diagnose a thread into a new deal_state file")
    ap.add_argument("--threads", help="comma-separated gmail thread ids (for --bootstrap)")
    ap.add_argument("--force", action="store_true", help="overwrite existing state on bootstrap")
    ap.add_argument("--discover", action="store_true",
                    help="list candidate threads for a deal (participant + keyword gated)")
    ap.add_argument("--add-thread", help="add a confirmed thread id to the deal's tracked list")
    args = ap.parse_args()

    if args.add_thread:
        if not args.deal:
            print("usage: --add-thread <tid> --deal <id>"); return 1
        f = STATE_DIR / f"{args.deal}.json"
        st = json.loads(f.read_text())
        if args.add_thread not in st.get("gmail_thread_ids", []):
            st.setdefault("gmail_thread_ids", []).append(args.add_thread)
            st["discovery_candidates"] = [c for c in st.get("discovery_candidates", [])
                                          if c.get("thread_id") != args.add_thread]
            f.write_text(json.dumps(st, indent=2))
            print(f"added {args.add_thread} to {args.deal}")
        else:
            print("already tracked")
        return 0

    if args.discover:
        if not args.deal:
            print("usage: --discover --deal <id>"); return 1
        st = json.loads((STATE_DIR / f"{args.deal}.json").read_text())
        cands = discover_threads(st)
        if not cands:
            print("no new candidate threads (all tracked, or no discovery_keywords set)")
        else:
            print(f"{len(cands)} candidate thread(s) — confirm with --add-thread <tid>:")
            for c in cands:
                print(f"  {c['thread_id']}  {c['subject']}")
        return 0

    if args.bootstrap:
        if not args.deal or not args.threads:
            print("usage: --bootstrap --deal <id> --threads tid1[,tid2]")
            return 1
        return bootstrap_deal(args.deal, [t.strip() for t in args.threads.split(",") if t.strip()], args.force)

    STATE_DIR.mkdir(exist_ok=True)
    files = sorted(STATE_DIR.glob("*.json"))
    if args.list or (not args.deal and not args.all):
        print("deals:")
        for f in files:
            print("  -", f.stem)
        return 0
    targets = files if args.all else [STATE_DIR / f"{args.deal}.json"]
    rc = 0
    for f in targets:
        if not f.exists():
            print(f"no state file: {f}")
            rc = 1
            continue
        rc = max(rc, run_deal(f, args.dry_run))
    return rc


if __name__ == "__main__":
    sys.exit(main())
