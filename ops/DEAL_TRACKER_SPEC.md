# UNALIGNED Deal Tracker — Build Spec (for Claude Code, on the Mac)

Goal: stop guessing deal stage from keywords. Have the local LLM READ each active
thread, report a structured deal state with evidence + confidence, and keep the board
honest: auto-advance the obvious ones, flag the ambiguous ones for Asher, learn from
his corrections. Money stages stay human. Runs on the Mac (local Qwen for the bulk,
Claude for the hard 10%).

Build in PHASES (see Rollout). Do NOT enable auto-move on day one — shadow first.

---

## 1. Where it slots in
- New module `scripts/active/deal_tracker.py`, called from the scraper pass (`scraper_v4.py`)
  and/or `asher_operator.py`, over every ACTIVE card after threads are fetched.
- "Active" = list_id in (new, first-touch, engaged, rates-sent, negotiating). NEVER touch
  invoice-sent, done, paid-out, dead-leads, trash.
- Reads the freshest thread available. Prefer live Gmail (resolve the real thread by the
  lead's email if the stored gmail_thread_id is the scraper format). The tracker is only as
  good as thread freshness — run it with/after a sync.

## 2. The classifier (LLM read)
Input per card: the deduped, time-ordered thread (last ~8 messages, quoted tails stripped),
plus card metadata (brand, agent_tier, value, current list_id) and a few-shot sample of
Asher's past corrections (see Learning Loop). Local Qwen by default.

Output — STRICT JSON, nothing else:
```json
{
  "stage": "engaged | rates-sent | negotiating | ready-to-invoice | stalled | declined | unclear",
  "last_speaker": "us | them",
  "awaiting": "us | them | none",
  "agreement": true,
  "agreed_terms": "tier/rate/scope they accepted, or null",
  "quiet_days": 0,
  "next_action": "one line: who owns the next move and what it is",
  "evidence": "exact quoted sentence that proves the stage/agreement",
  "confidence": "high | medium | low"
}
```
Rules in the prompt: quote real evidence or return confidence:"low". Never invent. "agreement"
means they accepted a rate or scope. "ready-to-invoice" = agreement reached, ready to bill.
"declined" = they clearly passed. "stalled" = no movement, someone has gone quiet.

## 3. Move rules (the decision table)
Compute `quiet_days` from the last message timestamp. Then:

- confidence == HIGH:
  - stage engaged/rates-sent/negotiating -> set that board stage IF it is a forward or lateral
    move within the conversation ladder. Do NOT move backward on a single read.
  - stage ready-to-invoice -> set list_id=negotiating (if earlier) AND set `ready_to_invoice=true`
    + raise a "Ready to invoice" task. NEVER auto-set invoice-sent.
  - stage declined -> DO NOT auto-kill. Flag `needs_human_read=true` with the decline evidence
    (killing a lead is consequential; let Asher confirm).
  - awaiting == us -> set `needs_reply=true` (this is the real reply queue).
  - awaiting == them AND quiet_days >= 4 -> set `needs_followup=true` (going-cold nudge). No stage change.
- confidence == MEDIUM or LOW:
  - DO NOT change stage. Set `needs_human_read=true` and store the best-guess read
    (deal_state, deal_evidence, deal_confidence) for the "Needs your read" lane.
- Money stages (invoice-sent, paid-out): set ONLY by Stripe sync + human. The tracker never sets them.
- Every stage change writes an activity-log entry: {time, "Deal Tracker", from_stage, to_stage, evidence}.
  This is what powers the REAL "Where this stands" timeline (replaces the fabricated one).

## 4. New board fields (Supabase `cards`)
Add columns (nullable): `deal_state` text, `deal_confidence` text, `deal_awaiting` text,
`deal_evidence` text, `deal_next_action` text, `last_inbound_at` timestamptz,
`needs_human_read` bool default false, `needs_reply` bool default false,
`needs_followup` bool default false, `ready_to_invoice` bool default false,
`agreement` bool default false. (Activity log already exists; append tracker events to it.)

## 5. Ambiguous handling + the dashboard
- "Needs your read" lane/filter in the Organs room + board: cards where `needs_human_read=true`.
  Shows the AI best guess + the evidence sentence + why it is unsure.
- On the card AND in the Organs approval bubble, a one-click control:
  `Confirm <AI guess>`  |  set -> Engaged / Rates sent / Negotiating / Ready to invoice
- On click: write the chosen list_id, clear `needs_human_read`, log the human decision in
  activity, AND append a correction example (see Learning Loop).
- "Going cold" badge on cards with `needs_followup`. "You owe a reply" badge on `needs_reply`.

## 6. Learning loop
- Every human confirm/override of a tracker call records a labeled example:
  append to `ops/memory/deal_corrections.jsonl` -> {thread_excerpt, chosen_stage, agreement,
  evidence, ts}. Keep `ops/memory/DEAL_EXAMPLES.md` as the curated human-readable set.
- The classifier prompt includes a rotating sample of these corrections as few-shot examples,
  prioritizing ones similar to the current card (same intent/tier/stage). Ambiguity shrinks
  as Asher clicks.

## 7. Model split (the 90/10)
- Local Qwen classifies every active card (the bulk).
- Escalate to Claude ONLY for low-confidence cases that are also high-stakes (value over a
  threshold, or stage >= negotiating) to get a sharper read before flagging. Keeps Claude spend low.

## 8. Safety rails (do not skip)
1. Confidence-gated: ambiguous never auto-moves; it flags for Asher.
2. Money stays human: invoice-sent / paid-out / done are never set by chat reading.
3. Evidence logged on every move (auditable + real timeline).
4. Human override always wins and teaches.
5. Conservative: no backward bounce on one read; declines flag, not auto-kill.
6. Freshness dependency: run on synced/live threads, not weeks-old cached ones.

## 9. Rollout (phased — important)
- Phase 1 SHADOW: classify + write deal_state/confidence/evidence/awaiting/quiet_days to cards.
  Do NOT auto-move stages. Surface the reads + "Needs your read" in the dashboard. Run a few
  days; Asher compares the AI read vs reality.
- Phase 2 AUTO-MOVE: once shadow looks trustworthy, enable high-confidence conversation-stage moves.
- Phase 3 NUDGES + LEARNING: enable going-cold flags and the correction-example feedback.

## 10. Acceptance checks
- A clear "yes, $2,995 works, send the invoice" thread -> agreement=true, ready-to-invoice,
  high confidence, evidence = that sentence. Card flags Ready to invoice, does NOT auto-invoice.
- A reply that says "we have no budget" -> NOT auto-moved to rates-sent (the old keyword bug);
  declined or stalled, flagged for human read.
- A thread where we replied last and they have been silent 6 days -> awaiting=them, needs_followup.
- A vague reply -> confidence low, needs_human_read, card stays put.
