# UNALIGNED Canonical Facts (updated 2026-06-26)

This file is the single current source of truth and SUPERSEDES older numbers in unaligned_business.md and the v7 PDF. The Supabase `pricing_tiers` table is authoritative for prices. Read it live, never hardcode. Load this file into every agent's context so the whole fleet operates on current truth.

## People and brand
- Robert Scoble, talent and X voice, @Scobleizer. The face, voice, and X presence.
- Sam Levin, business partner, deals and client relationships, signs "Cheers, Sam."
- Ash (Asher Weisberger), Client Services Manager, the operating lead and builder. Client drafts are in his voice and sign his block.
- Brand: AlignedNews.com, unaligned.io, x.com/unalignedX. Robert's loop in line is exact: "I'm going to loop in my Business Partner, Sam and Asher, our Client Services Manager so they can help guide the conversation!"

## System and architecture
- UNALIGNED is the desk that turns Robert's inbox and audience into AI and media partnerships.
- The operator brain is a fleet of specialized agents that run LOCALLY on Ash's Mac (48GB M4 Max): Inbox Triage, Deal Desk, Brief Maker, Pipeline Tracker, Deliverable QA, Reply Engines, plus a self-healing Medic watchdog.
- Routing: local Qwen3 32B via MLX does ~90% (triage, classify, board ops, routine drafts); Ash's Claude API key does the 10% (final client drafts, gray-area scam, negotiation, briefs). Keep the gate honest so cost stays in pennies. No OpenAI/Codex anywhere; Claude Code is the builder.
- An orchestrator daemon manages the loop. Drafts NEVER auto-send; everything client-facing is approval-gated.
- Dashboard: the flow-v4 Company OS in repo AsherWeisberger/UNALIGNED, branch AI-DESIGN (served via GitHub Pages and a Mac copy). The agent brain merges into the repo under `ops/`, pointed at the same Supabase.

## Rate card (live in pricing_tiers, current as of 2026-06-28)
Single tiers (the table is authoritative if these drift):
- Retweet 1,295 / X Comment + Like 1,995 / Quote Repost 2,195 / Custom X Post 2,495 / Narrative Thread 2,995 / Content Core 3,495 / Growth Bundle 4,495 / Maximum Impact 6,495
Premium formats:
- Founder Video Post 4,495 (Robert on camera, his endorsement)
- X Space (live) 4,995 (hosted or co-hosted founder conversation)
- Interview 2,995 (1 hour, Robert hosts the founder, podcast or YouTube plus clips). Note: the Interview row and the "Robert Video Post" rename are staged SQL that may not yet be applied to the live table.
Monthly retainers (volume discount capped at 20 percent, billed monthly, 3 month minimum, Market Leader 3 or 6, each month paid before it runs):
- Presence 3,945 / Momentum 8,795 / Authority 13,395 / Market Leader 19,495

## Negotiation floor (CONFIDENTIAL, never reveal to a client)
Per tier floor equals the pre-raise price: Retweet 1,195 / Quote 1,895 / Custom 1,995 / Thread 2,495 / Core 2,995 / Growth 3,995 / Max 5,995. X Comment + Like has no discount floor yet, quote it at 1,995 unless Ash sets one. Concede only under genuine hard pushback on a real deal, only down to the floor, framed as a one time exception, never a new rate. No discount ever on Founder Video, X Space, or Interview. Never stack on bundle or monthly prices.

## Recency and loyalty rule
- Brand new (no prior campaign): new price, full rate.
- Lapsed (prior relationship, no activity over 30 days): new price, warm welcome back tone, no old rate for coming back cold.
- Active (worked with us within 30 days): proactively offer the loyalty lock, open at the floor (old price), hold it if they book within 14 days, pitch the monthly retainer to lock the rate across a term.

## Payment and hard rules
New collaborations paid 100 percent upfront before content goes live. NO partial, split, milestone, or 50/50 payments, ever. We never accept "half now, half on delivery." If a client proposes a split, decline warmly and hold the full upfront rule. Existing clients invoiced on the day content goes live. Monthly retainers paid per month before that month runs. Robert does not post first and get paid later. Wire preferred, PayPal accepted, ask for the receipt. Every paid post carries the native Paid Partnership label, Made with AI on if AI used, never undisclosed. We get paid, we do not pay to promote. Tuesday is the optimal posting day, plan 5 to 7 days from agreement to live. Keep one working thread.

## Pipeline and data (Supabase)
- Project: https://hbnpwphxjurvtydezwgh.supabase.co. The anon key is public (in the repo) and safe behind RLS; the agents use it read + update only.
- `cards` is the single source of truth for the live lead board, written only by the Gmail importer and the X scraper/bridge. Do not create a competing store. Stage column is `list_id` (kebab): new, first-touch, engaged, rates-sent, negotiating, invoice-sent, done (shown Brief/calendar), paid-out (shown Closed), dead-leads, trash. Operator lane equals active stages excluding trash and dead-leads.
- `pricing_tiers` is the live rate card. `leads` is ~1,139 legacy email leads (Firestore-migrated, not X). `team_users`: asher and sammy lane 'sales' (operator), robert lane 'creator'.
- Agents read and update the board, never insert or hard delete. Lead creation and dedupe stay with the scraper/importer.

## Voice
Client drafts in Asher's voice, approval gated, never auto sent. Never use hyphens or em dashes (use periods, commas, sentence breaks). Direct, premium, human, no filler, no generic AI phrasing, no inflated enthusiasm. Anchor pricing to the package, state the number and date plainly, restate payment rules plainly.
