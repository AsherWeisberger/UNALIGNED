# Codex Handoff — June 14, 2026

Repo root:
- `/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES`

Current branch:
- `AI-DESIGN`

Last pushed commit on GitHub:
- `a7d996e` — `Add hybrid Stripe invoice sync`

Current local preview:
- `http://127.0.0.1:4174/index.html?dev=20260614-stripe-sync-3`

Important context:
- The prior Codex thread was corrupted earlier, so this work was rebuilt from repo inspection and local verification.
- The user wants Company OS as the main first-loaded screen.
- The user wants a Superhuman-inspired organization model: cleaner UI, clearer inbox/new leads separation, and much less visual clutter.
- The user wants a hybrid invoice system:
  - old/manual invoices remain folder-based
  - new Stripe invoices come from Stripe
  - wires/manual invoices still come from local `OUTSTANDING` / `DONE` folders

## What is already done

### 1. Company OS default landing
Company OS was already set to be the main screen users land on first.

Relevant files:
- `/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/flow-v4/company-os.jsx`
- `/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/flow-v4/views.jsx`

### 2. New leads split by source
New Leads now has X and Gmail source handling in progress, with the user’s intended structure being:
- X tab
- Gmail tab
- clean list rows
- newest to oldest
- minimal visible fields
- no duplicate leads already present elsewhere

There is also prior X DM extraction work already pushed earlier.

Relevant pushed X asset:
- `/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/flow-v4/assets/x_dm_daily_intake.json`

Relevant earlier commit:
- `fc302e5`

### 3. Stripe hybrid invoice sync
This was implemented and pushed in:
- `a7d996e`

Pushed files:
- `/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/scripts/active/sync_stripe_invoice_status.py`
- `/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/scripts/active/sync_invoice_page.py`
- `/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/flow-v4/views.jsx`
- `/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/flow-v4/styles.css`
- `/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/index.html`
- `/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/flow-v4.html`
- `/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/flow-v4/assets/stripe_invoices.json`

Behavior in pushed commit:
- manual invoices come from local folders
- Stripe invoices sync from Stripe into local JSON snapshot
- Stripe invoices only match manual invoices through explicit metadata:
  - `local_invoice_file`
  - `local_invoice_id`
- unmatched Stripe invoices show in their own `Stripe` bucket
- manual invoices remain visible separately

### 4. Local-only Stripe invoice open behavior improvement
After `a7d996e`, one more local-only change was made and verified:
- on Stripe invoice cards, clicking `Open` now goes to the Stripe dashboard invoice page
- the public customer-facing invoice link remains on-card as `Customer invoice`
- `Stripe PDF` remains available

This is working in the local preview at:
- `http://127.0.0.1:4174/index.html?dev=20260614-stripe-sync-3`

Verified current Stripe `Open` target:
- `https://dashboard.stripe.com/invoices/in_1ThwN2K0WeauAYMJFm1x0dPG`

## Current unpushed local changes

These files are modified locally and NOT yet pushed:
- `/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/flow-v4.html`
- `/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/flow-v4/assets/stripe_invoices.json`
- `/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/flow-v4/views.jsx`
- `/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/index.html`
- `/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/scripts/active/sync_invoice_page.py`
- `/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/scripts/active/sync_stripe_invoice_status.py`

Those local changes contain:
1. Stripe snapshot rows now include:
   - `livemode`
   - `dashboard_url`
2. Generated invoice items now include:
   - `stripeDashboardUrl`
3. Stripe invoice cards now prefer:
   - `stripeDashboardUrl` for the main `Open` action
4. Visible copy changed from:
   - `Hosted invoice`
   to
   - `Customer invoice`
5. Cache token updated to:
   - `20260614-stripe-sync-3`

## Local verification already performed

Verified in browser:
- invoice page loads correctly
- Stripe bucket appears separately from manual invoices
- manual invoices still open local assets
- Stripe card shows:
  - status
  - amount due
  - customer invoice link
  - Stripe PDF link
  - main `Open` link to Stripe dashboard

## Stripe key note

The user pasted a live restricted Stripe key directly in chat earlier.
It was saved locally to:
- `~/.config/google-credentials/unaligned-scraper.env`

Variable name:
- `STRIPE_SECRET_KEY`

Security note:
- this key should be rotated after setup, because it was pasted into chat

## Automation state

Invoice automation was already updated so it runs:
1. Stripe invoice sync
2. invoice page sync

There is also an existing Company OS / Gmail automation that runs daily around 6:00 AM.

## Other files in working tree

There are unrelated untracked local files in the repo root / scripts area. They were intentionally left alone:
- `MOBILE.zip`
- `codex_extracted_leads_10day_2026-05-18.json`
- `export_gmail_dump.py`
- `scraper_status.md`
- `/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/scripts/active/invoice_action_server.py`
- `/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/scripts/active/run_codex_daily_scraper.sh`
- `write_asher_candidate_cards.py`
- `write_codex_dump_leads.py`
- `write_split_thread_cards.py`

Do not delete or revert these unless the user asks.

## Recommended next actions for Claude

## Start here first

Claude should start with this exact order:

1. Check branch immediately before doing anything else
   - This work was done on `AI-DESIGN`
   - GitHub currently has the pushed hybrid invoice commit on `AI-DESIGN`
   - In the user screenshot, another tool appears to be sitting on `master`
   - Claude should not assume `master` contains the latest work
   - First action should be to inspect branch state and switch to `AI-DESIGN` if needed

2. Push the local Stripe changes next
   - This is the cleanest immediate pickup point
   - The work is already implemented locally
   - It is already verified in local preview
   - It closes an in-flight task with low ambiguity
   - Specifically, this pushes the newer Stripe behavior where `Open` goes to the Stripe dashboard invoice page

3. Only after that, return to Company OS / New Leads cleanup
   - That work is larger and more open-ended
   - It should happen after the small Stripe loop is fully closed

### If the goal is to continue invoices
1. Commit and push the local Stripe dashboard-link changes
2. Verify GitHub branch `AI-DESIGN` includes the `stripe-sync-3` behavior
3. Optionally improve invoice copy so it reads more naturally for non-technical use

### If the goal is to continue Company OS / leads
1. Inspect:
   - `/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/flow-v4/company-os.jsx`
   - `/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/flow-v4/views.jsx`
   - `/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/flow-v4/styles.css`
2. Preserve the cleaner split between:
   - New Leads
   - Company OS
   - Network
3. Keep the user’s requested structure:
   - Gmail leads and X leads separated
   - newest first
   - minimal visible fields
   - name / handle
   - email or X handle
   - timestamp/date
   - summary
   - easy reply path as Robert with Asher/Sam copied where appropriate

## Useful commands / actions

To refresh Stripe snapshot:
- run `/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/scripts/active/sync_stripe_invoice_status.py`

To regenerate invoice page:
- run `/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/scripts/active/sync_invoice_page.py`

To verify current local preview:
- open `http://127.0.0.1:4174/index.html?dev=20260614-stripe-sync-3`

## Short summary for handoff

The repo is on branch `AI-DESIGN`. GitHub currently has pushed commit `a7d996e` with hybrid Stripe/manual invoice sync. There are additional local unpushed changes that improve Stripe invoice behavior so the main `Open` action goes to the Stripe dashboard invoice page instead of the customer-facing hosted invoice URL. That local behavior is verified in preview `?dev=20260614-stripe-sync-3`. Company OS is the default landing screen. New Leads / X / Gmail organization work is partially in place and should continue from `flow-v4/company-os.jsx`, `flow-v4/views.jsx`, and `flow-v4/styles.css`.

Most important immediate instruction: if Claude opens this from a workspace or UI currently on `master`, it should first switch or compare against `AI-DESIGN`, then push the 6 local Stripe-related file changes before doing any broader Company OS cleanup.
