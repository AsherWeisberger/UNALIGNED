# MERGE — fit this agent brain into the existing UNALIGNED system

Read this first. The goal is NOT to rebuild Ash's system. It already has a strong dashboard, working scrapers, and a live Supabase. This kit adds the one thing that doesn't exist yet: a **functioning agent brain** that actually works the leads. Merge it in, don't replace anything.

## What already exists (KEEP, do not rebuild)
Repo: `AsherWeisberger/UNALIGNED`, live branch `AI-DESIGN` (GitHub Pages serves it; default theme light).
- `flow-v4/` — the Company OS dashboard (React via Babel/CDN): `company-os.jsx`, `views.jsx`, `data.jsx`, `board.jsx`, `components.jsx`, `drawer.jsx`, `app.jsx`, `brief.jsx`, `styles.css` (14k lines, premium token system, has a Machine Room view), `index.html`.
- `scripts/active/` — the X DM scraper (`live_x_inbox_daily_scrape.py`, `run_live_x_inbox_scrape.sh`) and the Gmail importer pipeline. These FUNCTION today; they fill the board.
- `flow-v4/assets/x_dm_daily_intake.json` — the X scraper's output, feeds the New Leads X tab. Contract, do not break.
- `supabase/migrations/` — schema. Supabase tables: `cards` (the board), `leads` (~1,139 legacy email leads), `pricing_tiers`, `team_users`.
- The Machine Room view — today it's a DISPLAY wired to board data (worker lanes Intake/Conversion/Execution/Retention with statuses). No real agent reasons behind it yet.

## What this kit adds (the functioning brain)
A new folder in the repo, e.g. `ops/` (sibling to `scripts/` and `flow-v4/`):
- `orchestrator.py` — the daemon that manages the loop.
- `agents.py` + `prompts/` (triage, deal_desk, brief_maker, tracker, qa, reply_engines) — the real agent logic.
- `models.py` — local 32B (MLX) for the 90%, the Anthropic Claude API for the 10%.
- `router.py` — the 90/10 gate.
- `board.py` — Supabase `cards` read/update (provided, with get_cards/update_card helpers).
- `x_bridge.py` — X intake JSON → `cards` (lead_source='X').
- `notify.py` — nightly digest texts Robert the review link.
- `robert-review.html` — Robert's one-tap approval link.
- `memory/` — CANONICAL, PROOF, ARCHITECTURE_AND_SECURITY (load CANONICAL into every agent's context).

## How they connect (the merge points)
1. **Same Supabase, same `cards` board.** The brain reads and writes the existing `cards` table. The dashboard already renders `cards`, so when an agent writes `draft_reply` + `draft_reply_status='pending'` + moves `list_id`, it shows up in the existing UI with no UI change. board.py is already pointed at the live schema (list_id stages, draft_reply, etc.).
2. **Scrapers stay the source of truth for intake.** Gmail importer keeps filling `cards`. The X scraper keeps writing `x_dm_daily_intake.json`; `x_bridge.py` runs right after it and mirrors qualified X leads into `cards` with `lead_source='X'` (dedup on `x_open_dm`). The brain then works Gmail and X leads identically.
3. **The brain is the missing layer between intake and the dashboard.** Today: scrapers → board → dashboard (display). After merge: scrapers → board → **orchestrator (triage/draft/QA/chase)** → board → dashboard. Nothing about the dashboard changes; it just starts showing real agent work.
4. **Robert review link + nightly digest** sit on top: Brief Maker writes the Google Doc + sets `brief_status='awaiting_robert'`; notify.py texts the link at 6pm; approve writes back + pushes the calendar event.
5. **Machine Room becomes real.** Right now its lanes are display-only. Point them at the orchestrator's actual activity: which agent is running, on which card, the live queue. Same lanes (Intake/Conversion/Execution/Retention), now driven by the brain instead of inferred from board state. Then bring the life in (motion, pulse, a live ticker) — but only after it reflects real work.

## Rules that must hold
- Local 32B does the 90% (triage, classify, board ops, routine drafts). Claude (Ash's key) does the 10% (final client drafts, gray-area scam, negotiation, briefs). Keep the gate honest; that keeps cost in pennies.
- Drafts NEVER auto-send. Everything client-facing is approval-gated.
- The brain reads/updates `cards`; it does not create or delete lead rows. Lead creation stays with the scrapers and `x_bridge.py` (the X importer).
- Preserve the `x_dm_daily_intake.json` schema and the pricing_tiers as the live rate card (read it, don't hardcode).
- No OpenAI. Local LLM + Claude only. Claude Code is the builder.

## Order
Follow GO_LIVE.md. Phases 1 to 3 stand up the functioning brain (the unlock). Then X (Phase 4), Robert (Phase 5), and the Machine Room wiring + life (Phase 7).

## The honest one-liner for Ash
Your scrapers and dashboard already work. This kit is the brain that makes the agents actually function instead of just appearing in the Machine Room. Merge it into your repo under `ops/`, point it at your existing Supabase, and your 595 leads start getting worked for real.
