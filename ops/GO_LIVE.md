# GO LIVE — ordered punch list

Tagged [YOU] (Ash) or [CC] (Claude Code). The system is alive at the end of Phase 3; X, Robert, and the live dashboard layer on after.

## Phase 1 — Keys & accounts [YOU]
1. Anthropic API key for the 10% brain.
2. Supabase URL + anon key (have them).
3. Twilio (or any SMS) account + Robert's mobile number. Can wait for Phase 5.
4. Google OAuth for Calendar + Docs (Brief Maker). Can wait for Phase 5.

## Phase 2 — Database, in the Supabase SQL editor [YOU]
5. RLS on `cards`: allow select/update/insert, deny hard delete (the security fix).
6. X bridge schema: `x_open_dm` column + partial unique index (in X_INTEGRATION.md).
7. Optional: the monthly tiers and interview tier SQL, if you want them in the rate card now.

## Phase 3 — Build the core agent brain [CC, from the kit]
8. Hand Claude Code the kit: "Build per BUILD.md and MERGE.md, do Step 0 first."
9. Step 0 discovery: inventory the Mac, confirm the Gmail scraper feeds Supabase, test Supabase + Claude + the local model.
10. Scaffold the agent brain in the repo (see MERGE.md for the target folder); `.env` (you paste keys); board.py helpers already provided.
11. Stand up MLX + Qwen3 32B (you approve the model download and the memory sysctl).
12. Build models.py, router.py, orchestrator.py, and agents.py; load the prompts and memory.
13. AGENT WIRING ORDER (do not wire all prompts at once; each wired agent is one more thing to test). Wire and prove in this sequence:
    a. CORE FIRST: `triage()` + `deal_desk()` only, driven by the orchestrator loop + router + models. This is the engine that works leads. Prove it (step 14) before adding anything.
    b. THEN (no new deps): `tracker()` (follow-up + payment chase + stage moves) and `qa()` (go-live verify sold vs delivered). Both run off the board.
    c. THEN (needs Google OAuth, Phase 5): `brief_maker()`. Do not wire before OAuth is in.
    d. Reply Engines is NOT a standalone agent. It is the shared reply-pattern playbook that triage/deal_desk/tracker draft WITH. Wire it as a module the agents call, not its own loop.
    e. MEDIC LAST: `medic()` watches the other agents + scrapers, so it only has value once they are running. Wire it on top after the rest proves out.
14. Prove the core loop: manual pass on one or two real cards. Triage runs, scam gate fires, Deal Desk drafts at the live rate, the draft lands as `draft_reply` + `draft_reply_status='pending'`, the card stage moves, and NOTHING sends. That is the milestone.
15. Wrap as a launchd agent.
**← Core loop live: your leads get triaged and drafted, queued for your approval, shown in your existing dashboard. Extend (tracker/qa → brief_maker → medic) only after this proves out.**

## Phase 4 — X integration [CC, per X_INTEGRATION.md]
15. Wire x_bridge.py after the scraper's sync step.
16. Add the scraper heartbeat + temp-validate-swap (fail loud).
17. Structural fixes: kill the two-copy drift, X_ROOT env var, grant Mac Automation/Accessibility, LaunchAgent in the GUI session.
18. Give the Medic the X-watch rules.
**← X leads hit the board and run through the Deal Desk.**

## Phase 5 — Robert review link + nightly digest [CC, needs 1.3 and 1.4]
19. Serve robert-review.html reading live Supabase, tokenized link.
20. Approve handler: write back to the card, push the Google Doc onto the calendar, flag it for you.
21. Brief Maker generates the Google Doc with the approval block, sets `brief_status='awaiting_robert'`.
22. notify.py: 6pm nightly digest texts Robert the link when briefs are waiting.
**← Robert approves from his phone, approved posts land on your calendar to post.**

## Phase 6 — Sending [YOU / CC]
23. Gmail send for approved replies, approval gated. You or Sam click send, or wire it so an approved draft goes out on your click.

## Phase 7 — Dashboard upgrades (optional) [CC]
24. Wire the Machine Room lanes to the orchestrator's real activity (see MERGE.md), and bring the life/motion in. Drop the Mac redirect and take the Funnel exposure down once the dashboard runs fully on Supabase.

## Phase 8 — Security cleanup [YOU]
25. Remove the invoice PDFs + stripe_invoices.json from the public repo, purge git history.
26. Confirm the anon key is now safe behind RLS (from Phase 2.5).

Critical path to a working machine: Phases 1 to 3.
