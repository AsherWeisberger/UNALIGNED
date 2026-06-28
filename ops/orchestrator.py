"""The manager. Runs on Ash's Mac. Polls the board, triages, routes, writes drafts.
Never sends. Drafts land in cards.draft_reply with status for human approval.

SAFETY DEFAULTS:
  - Writes to the live board are OFF unless OPS_WRITES_ENABLED=1 in .env.
  - Even when enabled, a per-run cap (MAX_CARDS_PER_RUN) bounds the blast radius.
  - A `PAUSE` file next to this code halts all writes immediately (kill switch).
  - Idempotent: a card that already has a draft / pending / approved is never re-touched.
  - Every action is appended to orchestrator.log.

Usage:
  python3 orchestrator.py --dry-run   # never writes, prints what it would do
  python3 orchestrator.py --once      # one pass (writes only if OPS_WRITES_ENABLED)
  python3 orchestrator.py             # daemon loop
"""
import json
import os
import sys
import time
from datetime import datetime, timezone, date

import config
import board
import agents
import models

# Statuses that mean "a human already owns this card" — never reprocess.
_HUMAN_OWNED = {"pending", "review", "approved", "awaiting_robert", "edits_requested", "declined"}


def heartbeat(status="ok", reason="", now_handling=""):
    """Maintain the ops_health singleton the web console + Organs view bind to: status,
    heartbeat, the day's token / spend counters (daily reset), and which agent is
    currently running. Best effort."""
    today = date.today().isoformat()
    health = board.get_ops_health() or {}
    same_day = health.get("day") == today
    local = models.RUN_USAGE["local_tokens"]
    spend = models.claude_spend(models.RUN_USAGE["claude_input"], models.RUN_USAGE["claude_output"])
    now = datetime.now(timezone.utc).isoformat()
    fields = {
        "status": status,
        "halt_reason": reason,
        "heartbeat": now,
        "day": today,
        "local_tokens_today": int(health.get("local_tokens_today", 0) if same_day else 0) + local,
        "claude_spend_today": round(float(health.get("claude_spend_today", 0) if same_day else 0) + spend, 4),
        "now_handling": now_handling,
        "updated_at": now,
    }
    # If now_handling column is not migrated yet, the write fails; retry without it so
    # status/heartbeat/counters still land.
    if board.upsert_ops_health(fields) is None:
        fields.pop("now_handling", None)
        board.upsert_ops_health(fields)


def set_handling(label):
    """Mark which agent is mid-flight, so the Organs view lights the right organ.
    Best effort; a no-op if the now_handling column is not migrated yet."""
    board.upsert_ops_health({"now_handling": label})


def log(event, **fields):
    rec = {"ts": datetime.now(timezone.utc).isoformat(), "event": event, **fields}
    line = json.dumps(rec, ensure_ascii=False)
    print(line)
    try:
        with open(config.LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def paused():
    return os.path.exists(config.PAUSE_FILE)


def needs_processing(card):
    stage = (card.get("list_id") or "").lower()
    if stage in ("trash", "dead-leads", "paid-out", "done"):
        return False
    status = (card.get("draft_reply_status") or "").lower()
    # Idempotency: if a draft already exists or a human already owns it, leave it alone.
    # This is the fix for the re-draft loop (a `new` card never gets re-drafted once handled).
    if card.get("draft_reply") or status in _HUMAN_OWNED:
        return False
    return bool(card.get("new_reply_at")) or stage == "new" or status in ("", "needs_draft")


def recency_of(card):
    # Placeholder until wired to real activity dates. new = no prior campaign.
    return card.get("_recency", "new")


# Forward-only stage progression. A queued draft means we have engaged the lead,
# so we advance up to `engaged` at most. Never to `rates-sent` (nothing was sent),
# and never backward for a card already further along.
_STAGE_ORDER = ["new", "first-touch", "engaged", "rates-sent", "negotiating",
                "invoice-sent", "done", "paid-out"]
_DRAFT_STAGE_CAP = "engaged"


def _draft_stage(current):
    cur = (current or "new").lower()
    try:
        ci = _STAGE_ORDER.index(cur)
    except ValueError:
        return cur  # unknown stage, leave it
    cap = _STAGE_ORDER.index(_DRAFT_STAGE_CAP)
    return _DRAFT_STAGE_CAP if ci < cap else cur  # move up to engaged, never backward


def _writes_live(dry_run):
    return config.OPS_WRITES_ENABLED and not dry_run


# Columns added by the approval-console migration. If the DB has not been migrated
# yet, a write including them 400s; we strip them and retry so drafts never drop.
_AGENT_COLS = ("agent_assessment", "recommended_action", "agent_tier")


def _update_card_safe(cid, fields):
    try:
        return board.update_card(cid, fields)
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        if any(col in msg for col in _AGENT_COLS) or "PGRST204" in msg or "column" in msg.lower():
            stripped = {k: v for k, v in fields.items() if k not in _AGENT_COLS}
            log("agent_cols_missing", card=cid,
                note="run schema migration (ops/sql/approval_console.sql); wrote draft without why-panel fields")
            return board.update_card(cid, stripped)
        raise


def process_card(card, pricing, *, dry_run):
    cid = card.get("id")
    label = card.get("business_name") or card.get("contact_name") or "?"

    # 1. Triage (local model, read-only). Returns prose + a machine verdict.
    t = agents.triage(card)
    v = t["verdict"]
    log("triage", card=cid, who=label, scam=v["scam"], action=v["action"],
        is_lead=v["is_lead"], one_line=v["one_line"][:200])

    # 2. Scam gate. Strong scam signal or "do not engage" => route to review, NO draft, NO Claude.
    if v["scam"] == "likely_scam" or v["action"] == "do_not_engage":
        log("scam_gate_blocked", card=cid, who=label, scam=v["scam"], action=v["action"])
        if _writes_live(dry_run):
            board.update_card(cid, {"draft_reply_status": "review"})
            log("routed_to_review", card=cid, who=label, status="review", draft="none")
        return

    # 3. Deal Desk draft (Claude, the 10%). Needs the API key.
    if not config.ANTHROPIC_API_KEY:
        log("draft_blocked_no_key", card=cid, who=label,
            note="ANTHROPIC_API_KEY empty in ops/.env; triage+gate proven, paste a key to draft")
        return

    if _writes_live(dry_run):
        set_handling(f"deal_desk → {label}")
    d = agents.deal_desk_draft(card, recency=recency_of(card), pricing=pricing)

    # Non-negotiable: a blob can never reach draft_reply.body. If the model did not
    # return a clean, isolated email_body, route to review with NO client-facing draft.
    if not d["parse_ok"] or not d["email_body"].strip():
        log("draft_parse_failed", card=cid, who=label, model=d["model"],
            assessment=d["assessment"][:400])
        if _writes_live(dry_run):
            board.update_card(cid, {"draft_reply_status": "review"})
            log("routed_to_review", card=cid, who=label, status="review", draft="none",
                reason="unclean email_body")
        return

    new_stage = _draft_stage(card.get("list_id"))
    # The assessment + structured extras are the fuel for the approval console's
    # "why" panel. Logged now; the body stays client-facing-only.
    log("deal_desk", card=cid, who=label, model=d["model"],
        recommended_action=d["recommended_action"], mapped_tier=d["mapped_tier"],
        estimated_value=d["estimated_value"], suggested_stage=d["suggested_stage"],
        would_stage=new_stage, assessment=d["assessment"][:600])

    if not _writes_live(dry_run):
        log("dry_run_draft", card=cid, who=label, model=d["model"],
            would_stage=new_stage, would_status="pending",
            subject=d["subject"], email_body_preview=d["email_body"][:240])
        return

    fields = {
        # draft_reply.body is the ONLY client-facing text: the clean, send-ready email.
        "draft_reply": json.dumps({"subject": d["subject"], "body": d["email_body"]}),
        "draft_reply_status": "pending",
        "list_id": new_stage,
        # The "why" panel fuel, persisted so the web approval console can read it
        # (orchestrator.log is not reachable from the browser).
        "agent_assessment": d["assessment"],
        "recommended_action": d["recommended_action"],
        "agent_tier": d["mapped_tier"],
    }
    if d["estimated_value"].strip():  # estimated_value is a free-text column on cards
        fields["estimated_value"] = d["estimated_value"].strip()
    _update_card_safe(cid, fields)
    log("draft_written", card=cid, who=label, model=d["model"], status="pending",
        stage=new_stage, estimated_value=fields.get("estimated_value", ""))


def run_once(*, dry_run=False, limit=None):
    # Local kill switch wins over everything.
    if paused():
        log("paused", reason="PAUSE file present")
        if not dry_run:
            heartbeat(status="halted", reason="PAUSE file present (local kill switch)")
        return
    # Soft halt: the console (or a prior fatal error) can set ops_health.status='halted'.
    # Stay down, keep the heartbeat fresh, until a human hits Resume (sets status back to ok).
    health = board.get_ops_health()
    if health and (health.get("status") or "ok") != "ok":
        log("halted", reason=health.get("halt_reason") or "ops_health.status != ok")
        if not dry_run:
            heartbeat(status=health.get("status"), reason=health.get("halt_reason") or "halted")
        return

    cap = limit or config.MAX_CARDS_PER_RUN
    cards = board.get_cards(filters={"list_id": "in.(new,first-touch,engaged,negotiating)"}, limit=100)
    todo = [c for c in cards if needs_processing(c)][:cap]
    # Live rate card, fetched once per run and handed to the Deal Desk so drafts quote real numbers.
    try:
        pricing = board.get_pricing()
    except Exception as e:  # noqa: BLE001
        pricing = []
        log("pricing_fetch_error", error=str(e))
    log("run_start", fetched=len(cards), to_process=len(todo), cap=cap,
        pricing_rows=len(pricing),
        writes=("on" if (config.OPS_WRITES_ENABLED and not dry_run) else "off"))
    for c in todo:
        try:
            process_card(c, pricing, dry_run=dry_run)
        except Exception as e:  # noqa: BLE001
            log("card_error", card=c.get("id"), error=str(e))
    log("run_end", processed=len(todo))
    # Healthy heartbeat + token/spend counters (real runs only; dry-run never writes).
    if not dry_run:
        heartbeat(status="ok", reason="")


def loop():
    while True:
        try:
            run_once()
        except Exception as e:  # noqa: BLE001
            log("loop_error", error=str(e))
        time.sleep(config.POLL_SECONDS)


def _arg_limit(argv):
    for i, a in enumerate(argv):
        if a == "--limit" and i + 1 < len(argv) and argv[i + 1].isdigit():
            return int(argv[i + 1])
        if a.startswith("--limit="):
            tail = a.split("=", 1)[1]
            if tail.isdigit():
                return int(tail)
    return None


if __name__ == "__main__":
    argv = sys.argv[1:]
    args = set(argv)
    limit = _arg_limit(argv)
    if "--dry-run" in args:
        run_once(dry_run=True, limit=limit)
    elif "--once" in args:
        run_once(dry_run=False, limit=limit)
    else:
        loop()
