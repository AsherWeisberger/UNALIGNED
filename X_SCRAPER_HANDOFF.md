# X Scraper — Handoff (how it CURRENTLY works)

This documents the live X (Twitter) DM lead scraper for the UNALIGNED Company OS,
exactly as it works today. Audience: another engineer/system that will work on it
and hand it back. Nothing here is aspirational — it is the current implementation.

---

## 1. What it does

Once a day it reads Robert Scoble's X (Twitter) Direct Message inbox, finds new
business leads (collab / sponsorship / interview / etc.), scrapes each relevant
thread, scores and summarizes them, and writes a ranked JSON file that the
Company OS web app loads into its **New Leads → X** tab.

It does NOT use the X API. It drives Robert's already logged-in Chrome browser.

---

## 2. The one non-obvious thing: it automates a real Chrome session

The scraper controls Chrome through macOS automation (`osascript`, both AppleScript
and JavaScript-for-Automation / JXA). It opens tabs on `x.com`, injects JavaScript
into the page, and reads the rendered DOM. There are **no API keys and no auth
tokens** — it relies entirely on the Chrome profile already being logged in as
Robert.

Consequences:
- Chrome must be running and logged into Robert's X account when it runs.
- macOS will prompt for **Automation / Accessibility** permission (Python controlling
  Chrome and System Events). This is the source of the recurring "allow Python to
  control…" prompts.
- It is DOM-dependent: if X changes its markup, the CSS/`data-testid` selectors
  must be updated (see Section 8).

---

## 3. The code lives in TWO places (important)

| Part | Location |
|---|---|
| Orchestrator + Chrome automation + Company OS sync | `…/Desktop/UNALIGNED/MASTER FILES/scripts/active/live_x_inbox_daily_scrape.py` |
| Runner script | `…/MASTER FILES/scripts/active/run_live_x_inbox_scrape.sh` |
| **Intake builder (scoring + summaries + ranking)** | `~/Documents/Codex/2026-06-05/most-efficient-way-to-get-leads/work/build_daily_x_lead_intake.py` |
| **All state + outputs** | `~/Documents/Codex/2026-06-05/most-efficient-way-to-get-leads/outputs/` |
| Final asset the web app reads | `…/MASTER FILES/flow-v4/assets/x_dm_daily_intake.json` |

`X_ROOT` in the orchestrator = `~/Documents/Codex/2026-06-05/most-efficient-way-to-get-leads`.
You CANNOT fully work on this with only the repo — the ranking/summary logic and all
state files live in that external Codex project.

---

## 4. End-to-end pipeline

`live_x_inbox_daily_scrape.py → main()`:

1. **Open Chrome tabs.** `ensure_chrome_tabs()` creates an "inbox" tab and a "worker"
   tab. Navigates the inbox tab to `https://x.com/i/chat`.
2. **Load memory.** `load_state()` reads `processed_threads` (so seen threads are not
   re-scraped); `load_live_contexts()` reads cached per-thread message data.
3. **Walk the inbox newest-first**, in scroll batches (`--max-scrolls`, default 8):
   - `extract_inbox_payload()` injects JS that reads each DM row via
     `a[href*="/i/chat/"], a[href*="/messages/"]` (title, timestamp, preview).
   - `wait_for_inbox_batch_change()` scrolls to load more rows; stops if the batch
     stops changing ("stalled_after_scroll").
   - Per thread: normalize URL to `…/messages/compose?recipient_id=<id>` as the key,
     dedupe, skip group chats (`is_group_chat_candidate`), skip unchanged already-seen
     threads (by `inbox_signature`).
   - Open relevant threads in the worker tab — `scrape_thread()` reads the last ~24
     messages via `[data-testid^="message-text-"]`.
   - Classify as a lead with `is_business_candidate()` using the `BUSINESS_SIGNALS`
     keyword list (collab, sponsor, pricing, partnership, invoice, interview, etc.).
4. **Persist** `live_contexts`, `processed_threads`/state, and new threads after each
   thread.
5. **Rebuild intake** (only if `--rebuild-intake`): `rebuild_intake()` runs the
   external `build_daily_x_lead_intake.py`, then `sync_company_os_x_asset()` maps its
   outputs into `flow-v4/assets/x_dm_daily_intake.json`.
6. **Log the run** via `append_run_log()` (keeps last 50 runs).

---

## 5. Stop conditions (CLI flags)

Newest-first, so it stops early once it is past fresh leads. Defaults shown:

| Flag | Default | Meaning |
|---|---|---|
| `--recent-days` | 1 | Stop once inbox rows are older than N days |
| `--known-stop-streak` | 3 | Stop after N already-processed rows in a row |
| `--max-irrelevant-streak` | 25 | Stop after N non-business threads in a row |
| `--max-candidates` | 80 | Hard cap on rows inspected per run |
| `--max-scrolls` | 8 | Inbox scroll batches to inspect |
| `--wait` | 4.5 | Seconds to wait after each X navigation |
| `--scroll-step` | 900 | Pixels per scroll batch |
| `--rebuild-intake` | off | Rebuild intake + sync Company OS after scraping |

---

## 6. State + output files (all under the external `outputs/` dir)

| File | Role |
|---|---|
| `robert_x_dm_live_inbox_state.json` | `processed_threads` — dedupe / "already seen" memory |
| `robert_x_dm_live_contexts.json` | Cached scraped messages per thread |
| `robert_x_dm_live_inbox_new_threads.json` | New threads found this run |
| `robert_x_dm_live_inbox_runs.json` | Run log (last 50) |
| `x_dm_daily_new_leads.csv` | **Main enriched lead table** the builder produces (one row per lead) |
| `robert_x_dm_safe_manual_queue.json` | Ranking + display name per `Open DM` |
| `~/.config/google-credentials/robert_handoff_operator_state.json` | Tracks which X leads Robert already emailed (`x` map) |

---

## 7. Data contracts (do NOT break these)

### 7a. Builder output → `x_dm_daily_new_leads.csv` columns (consumed by `sync_company_os_x_asset`)
`New Lead`, `Seen In Prior Scrape`, `Changed Since Prior Scrape`, `Newest DM Date`,
`Lead Score`, `X Name`, `X Username`, `Open DM`, `Contact Info`, `Contact Emails`,
`Contact Phones`, `Lead Type`, `Current Status`, `Already Emailed In Robert Gmail`,
`Summary For Team`, `Last Lead Message`, `Best Next Step`, `Recommended Owner`,
`Message Count`.

### 7b. Final asset → `flow-v4/assets/x_dm_daily_intake.json` (consumed by the web app)
Array of objects, sorted by `rank` asc, then `leadScore` desc, then `xName`. Schema:

```
rank, newLead, seenInPriorScrape, changedSincePriorScrape, newestDmDate,
leadScore, xName, xUsername, openDm, contactInfo, contactEmails, contactPhones,
leadType, currentStatus, alreadyEmailedInRobertGmail, summaryForTeam,
lastLeadMessage, bestNextStep, recommendedOwner, messageCount
```

This JSON is THE contract between the scraper and the Company OS UI
(`flow-v4/data.jsx` → `V3NormalizeXDmLeadRow` → New Leads X tab). If you change a
key name or type here, the UI breaks. `openDm` is the stable identity key
(`…/messages/compose?recipient_id=<id>`); the UI and the trash/suppression logic
both key off it.

---

## 8. Things that break it (known fragility)

- **X DOM changes.** Selectors `a[href*="/i/chat/"]`, `a[href*="/messages/"]`, and
  `[data-testid^="message-text-"]` are hard-coded. An X redesign breaks scraping.
- **Chrome not logged in / not running** → nothing to read.
- **macOS permission prompts** (Automation/Accessibility) can block a headless/cron
  run until granted once interactively.
- **Two copies of the runner.** There is a repo copy
  (`scripts/active/run_codex_daily_scraper.sh`) and a `~/.config/google-credentials/`
  copy. **launchd runs the `~/.config` copy**, not the repo copy — edits to the repo
  copy do not take effect on schedule. Confirm which copy you are editing.

---

## 9. Scheduling

- launchd agent `com.unaligned.dailyscraper` runs daily at **08:00**.
- It runs `~/.config/google-credentials/run_codex_daily_scraper.sh`, which invokes the
  X inbox scrape (`run_live_x_inbox_scrape.sh` → `live_x_inbox_daily_scrape.py
  --rebuild-intake …`).
- Log: `~/.config/google-credentials/live_x_inbox_scraper.log`.

---

## 10. What the other system should do, and hand back

1. Treat **Section 7b (`x_dm_daily_intake.json` schema)** as fixed. Any reimplementation
   must produce that exact file/shape so the Company OS UI keeps working.
2. If you reimplement the scrape mechanism (e.g. move off Chrome automation to an
   official/unofficial API or a headless browser), preserve: newest-first walking,
   the dedupe/state model (`processed_threads` keyed by `openDm`), the business-signal
   filter, and the stop conditions.
3. Keep both the CSV (7a) and the final JSON (7b) — `sync_company_os_x_asset()` is the
   only mapping between them.
4. Note the **two-location** split (Section 3). If you consolidate it into one repo,
   document the new paths.
5. Hand back: the updated scraper, an updated version of THIS doc reflecting any
   changes, and confirmation that a real run still produces a valid
   `x_dm_daily_intake.json`.

---

## 11. Quick reference — run it manually

```bash
# Full daily run with intake rebuild + Company OS sync:
bash "/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/scripts/active/run_live_x_inbox_scrape.sh"

# Or the python directly (Chrome must be open + logged into X):
python3 "/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/scripts/active/live_x_inbox_daily_scrape.py" \
  --rebuild-intake --recent-days=1 --max-candidates=80
```
