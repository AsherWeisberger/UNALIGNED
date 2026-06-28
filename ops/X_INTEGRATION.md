# X Integration — bridge, heartbeat, Medic watch, structural fixes

Goal: get X DM leads off the side feed and into the money pipeline, keep the scraper healthy, and never break the existing X tab. The X scraper (see the X_SCRAPER_HANDOFF for how it currently works) stays as-is. We add four things around it.

## 1. The cards bridge (x_bridge.py, PROVIDED)
Lands X leads on the board so the Deal Desk works them like any lead.
- Runs right after the scraper writes `x_dm_daily_intake.json` (add it as the last step in `run_live_x_inbox_scrape.sh`, after the Company OS sync).
- Reads the intake JSON (never writes it, the X tab is untouched), upserts each lead into `cards` with `lead_source='X'`, deduped on `openDm`.
- New lead → INSERT at `list_id='new'`. Already on the board → refresh only the X context and priority, never reset stage or draft (mirrors the single-writer rule).

Schema change, run once in the Supabase SQL editor:
```sql
alter table public.cards add column if not exists x_open_dm text;
create unique index if not exists cards_x_open_dm_uniq
  on public.cards (x_open_dm) where x_open_dm is not null;
```
Field mapping (intake JSON → card): xName → business_name + contact_name; leadType → intent; leadScore → priority (>=80 hot, >=50 warm, else cold); summaryForTeam / lastLeadMessage / bestNextStep / leadScore / xUsername / openDm → description JSON; contactEmails/Phones → email/phone; openDm → x_open_dm (dedupe key).

## 2. The heartbeat (scraper reports health so the Medic can watch)
At the end of every scrape run, write one health record to Supabase so it is visible:
```
{ source:'x_scraper', ran_at, inbox_rows_walked, threads_scraped, leads_found,
  intake_written: bool, login_ok: bool }
```
Put it in a small `scraper_health` table (or append to the incident log). On a bad run (exception, login wall, 0 inbox rows when recent_days should have some), write an incident row with severity and a one line reason.

Never overwrite a good `x_dm_daily_intake.json` with an empty one: write to a temp file, validate (non-empty, schema matches handoff section 7b), then swap. If validation fails, keep the prior asset and write an incident. This is the core "fail loud" rule.

## 3. Medic X-watch rules
The Medic reads the heartbeat + incident log each sweep and acts:
- No successful run in > 26h → alert "X scrape hasn't run" (likely launchd, permissions, or login). 
- Run completed but leads_found = 0 and inbox_rows_walked low or 0 → likely selector break or login wall → alert + diagnose.
- login_ok = false → alert "re-auth Robert's X session."
- threads_scraped = 0 while inbox_rows_walked > 0 → the message selector likely changed. If the Medic runs locally with access to the logged-in Chrome, attempt to re-detect the message selector against the live DOM, test, and apply, then log it. If not local, propose the fix to Ash.
- Always log the finding and the action to the incident log; only ping Ash when the action is genuinely his.

## 4. Structural fixes (one-time, Claude Code or Ash)
- Two-copy drift: make the `~/.config/...` runner a symlink to the repo copy, or point launchd at the repo script. One source of truth.
- X_ROOT: replace the hardcoded `~/Documents/Codex/2026-06-05/...` path with an env var (X_ROOT in .env). Consider consolidating that external project into the repo.
- macOS permissions: grant Automation (Python → Chrome, System Events) and Accessibility once. Confirm the scrape runs as a LaunchAgent in Robert's GUI session, not a LaunchDaemon, so UI automation works and prompts never block.
- Login expiry: the scraper detects the login wall and sets `login_ok=false` (feeds the heartbeat above).

## 5. Contract preservation (do not break)
- `x_dm_daily_intake.json` schema (handoff section 7b) stays exactly as-is. The New Leads X tab keeps working.
- `openDm` stays the identity key, in the JSON and as `x_open_dm` on the card.
- The bridge only reads the JSON and mirrors into cards. It never edits the JSON.

## 6. Build sequence
1. Run the schema change (x_open_dm column + partial unique index).
2. Add `x_bridge.py`; call it after `sync_company_os_x_asset()` in the run script.
3. Add the heartbeat write and the temp-validate-swap to the scraper.
4. Add `scraper_health` (or incident) reads to the Medic with the rules in section 3.
5. Do the structural fixes in section 4.
Verify: run the scrape manually. Confirm `x_dm_daily_intake.json` is still valid AND new X cards appear in `cards` with `lead_source='X'` AND a heartbeat row was written. Break a selector on purpose and confirm the Medic alerts instead of the board going quiet.
