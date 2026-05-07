# UNALIGNED Lead Pipeline Audit

Date: 2026-05-07

## Current Reality

The lead system is useful, but it is not yet enterprise-grade. The biggest issue is not the visual layer. The board is downstream of inconsistent pipeline state.

Observed from Supabase:

- 235 total cards.
- 133 active cards across first touch, engaged, rates sent, negotiating, and invoice.
- 136 cards have `new_reply_at`, but only 48 active cards appear to have an outside sender as the latest thread message.
- 91 cards have suspect reply flags.
- Latest visible card update is 2026-04-30, while this audit was run on 2026-05-07.
- 24 sender email addresses appear on multiple cards.
- 1 Gmail thread appears on multiple cards.

## Main Gaps

### 1. Scheduled scraping is broken

The macOS launch job `com.unaligned.dailyscraper` points to a missing script:

`/Users/asherweisberger/.openclaw/workspace/UNALIGNED/run_daily_scraper.sh`

That means the morning pipeline is not reliably running. This explains why the board looks stale.

### 2. Secrets are embedded in local shell scripts

The existing local runner stores live API keys and mail credentials directly in a shell script. That is not enterprise-grade.

Target:

- Move secrets to a local env file, cloud secret manager, or launchd environment file.
- Keep shell runners secret-free.
- Rotate credentials that have lived in plaintext scripts.

### 3. Reply state is not canonical

`new_reply_at` is being used as if it means "Robert needs to reply." In practice, many flagged cards have Robert, Sam, Asher, or another internal sender as the latest message.

Target:

- Store canonical fields:
  - `last_message_at`
  - `last_message_from`
  - `last_message_is_internal`
  - `needs_human_reply`
  - `reply_reason`
  - `next_action`
  - `next_action_due_at`

### 4. Active scripts used old board stages

The active scraper still referenced old stages like `build`, `review`, `unreplied`, and `discovery`. The current board uses:

- `first-touch`
- `engaged`
- `rates-sent`
- `negotiating`
- `invoice-sent`
- `paid-out`
- `done`
- `dead-leads`

That mismatch made automation refresh threads without moving cards into the right current lanes.

### 5. Daily Gmail sync wrote to the wrong thread field

The board reads `email_thread`, but the daily sync was primarily updating `original_email`. It also skipped threads it already knew about, which means new messages inside an existing thread could be missed.

### 6. Draft generation was pointed at a non-existent lane

The active scraper was trying to draft replies for `list_id=unreplied`, but that lane does not exist in the current board. That means reply drafting could silently do nothing.

### 7. The website has no action loop yet

The Robert console explains priority, but it still needs controlled actions:

- Mark not needed.
- Snooze until tomorrow or a date.
- Approve draft.
- Edit draft.
- Send through Robert or Sam.
- Move stage.
- Add owner.
- Log outcome.

Without those, the site is only a read model.

## Fixes Applied In This Pass

### `scripts/active/scraper_v4.py`

- Clears `new_reply_at` when the latest message is internal.
- Uses current board stages instead of old `build` / `review` lanes.
- Lets the pipeline continue to draft checks even when no brand-new leads were inserted.
- Drafts from active current lanes instead of the non-existent `unreplied` lane.
- Fixes the Telegram summary references that used undefined variables.

### `scripts/active/daily_gmail_sync.py`

- Writes refreshed thread data to `email_thread`, the field the board actually reads.
- Refreshes known threads instead of skipping them.
- Sets or clears `new_reply_at` based on the latest sender.
- Stops logging false success after failed Supabase updates.
- Handles empty Supabase PATCH responses correctly.

## Enterprise Target

The system should become a small lead operating platform with three layers.

### 1. Ingestion

Gmail, X DMs, LinkedIn, referrals, and manual adds all write raw events first.

Suggested table:

- `lead_events`
  - `id`
  - `source`
  - `source_message_id`
  - `source_thread_id`
  - `occurred_at`
  - `sender_email`
  - `sender_name`
  - `subject`
  - `body`
  - `raw_payload`

### 2. Intelligence

A classifier converts raw events into lead state, but never overwrites human decisions without logging why.

Suggested fields on `cards`:

- `last_message_at`
- `last_message_from`
- `last_message_is_internal`
- `needs_human_reply`
- `reply_reason`
- `next_action`
- `next_action_due_at`
- `ai_confidence`
- `ai_summary`
- `human_status`

### 3. Action Console

The Robert page should become the operating console:

- Today: hard focus queue.
- Yesterday: what changed, what was sent, what moved.
- Tomorrow: scheduled follow-ups.
- Cleanup: missing data, bad flags, duplicates.
- Send: draft review and controlled send.
- Audit: history of every action.

## Recommended Next Build

1. Fix launchd to point to the real runner.
2. Move secrets out of shell scripts.
3. Add canonical reply-state columns to Supabase.
4. Backfill canonical state from existing `email_thread`.
5. Add Supabase actions to the Robert console:
   - snooze
   - mark not needed
   - move stage
   - approve/send draft
6. Add an audit log table before enabling sends from the website.

