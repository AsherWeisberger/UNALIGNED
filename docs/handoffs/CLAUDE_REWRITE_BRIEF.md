# UNALIGNED Lead Pipeline — CLAUDE REWRITE BRIEF

## What This Is
A Gmail → AI extraction → Supabase Kanban pipeline that scrapes inbound emails, extracts structured lead data, and populates a Kanban board for Robert Scoble / Unaligned.

Ash's goal: hand this entire folder to a fresh Claude instance, have it rewrite the scraper and pipeline to be robust, and hand it back.

---

## What Works
- Gmail OAuth scraping (Ash's credentials at `~/.config/google-credentials/`)
- OpenAI GPT-4o-mini (historical rewrite target) for AI extraction
- Supabase for storage (project: `hbnpwphxjurvtydezwgh`)
- Robert Scoble's OAuth credentials now configured (client ID exists, auth token TBD)
- Telegram bot notifications were configured in the original rewrite sandbox. Secrets removed in archived handoff copy.

---

## What's Broken / Messy

### The Board (current state)
- **2,048 cards** collapsed to **360 clean leads** after emergency dedup
- `quality_tier = 'archived'` separates bad cards (not deleted — reversible)
- Schema has `sender_group` tracking (email address deduplication key)

### Problems with current data
1. **Titles are messy** — "Re: Hello from Unaligned", "*TIME SENSITIVE* Paid Collaboration" — not clean lead identifiers
2. **Missing fields** — phone almost always empty, estimated_value almost always empty, location rarely filled
3. **Duplicate senders** — same person creates multiple cards (mitigated with sender_group but not fixed at source)
4. **Priority is unreliable** — AI guesses, no dollar-value correlation
5. **Notes/description** — raw, unorganized, hard to scan
6. **intent field** — vague ("collaboration", "other") when original email had specific context
7. **Due dates** — almost never extracted
8. **Lead source** — all "GMAIL", no细分 (no subject line source, no thread origin)

### Problems with the scraper
1. **Filters too narrow** — the `GMAIL_QUERY` misses many relevant emails
2. **Keyword filter is basic** — crude substring match, no semantic relevance scoring
3. **No phone extraction** — field exists in schema but AI never populates it
4. **No deal value extraction** — `estimated_value` exists but AI doesn't try to find dollar amounts
5. **Duplicate card creation** — `email_id` uniqueness constraint prevents exact dupes but doesn't stop same-person-different-thread dupes
6. **No retry/dead-letter queue** — failed AI extractions are silently dropped
7. **Checkpoint is opaque** — JSON pickle, hard to inspect/modify

---

## The Schema (Supabase `cards` table)

```
id                      integer         NOT NULL (auto)
title                   text            NOT NULL  ← what shows on Kanban card
list_id                 text            NOT NULL  ← 'new', 'discovery', 'build', 'win', 'lost'
labels                  text[]          ← categories
description             text            ← full notes (currently messy)
checklist               jsonb           ← not used much
assignee                text            ← ''
due_date                date            ← rarely populated
contact_name            text            ← person's name
email                   text            ← sender email
phone                   text            ← almost always empty
business_name           text            ← company
job_title               text            ← rarely populated
lead_source             text            ← 'GMAIL' (always, needs细分)
estimated_value         text            ← almost always empty, needs to be extracted
priority                text            ← 'hot', 'warm', 'medium', 'low', 'cold' (unreliable)
intent                  text            ← vague category
email_id                text            ← Gmail message ID
gmail_thread_id         text            ← Gmail thread
linkedin_url            text            ← rarely populated
website                 text            ← rarely populated
location                text            ← rarely populated
draft_reply             text            ← AI-generated reply draft
draft_reply_status      text            ← 'pending', 'sent', 'drafted'
activity                jsonb           ← history log
owner                   text            ← ''
original_email          jsonb           ← raw From/Subject/Date of originating email
email_thread            jsonb           ← full Gmail thread conversation
date_received           text            ← display format "Mar 23, 2026"
date_received_iso       text            ← "2026-03-23"
reply_hook              text            ← custom
quality_tier            text            ← 'lead' or 'archived' (new field)
sender_group            text            ← normalized email (for dedup tracking)
merged_into             integer         ← if duplicate, points to surviving card
created_at              timestamptz     ← pipeline timestamp, NOT email date
updated_at              timestamptz
```

---

## What The Rewrite Must Fix

### Data Quality (most important)
1. **Clean titles** — Title should be the person's name + company + intent, not the raw email subject. E.g., "Sarah Chen — Mindstream AI — Partnership intro" not "Re: Re: Re: Hello"
2. **Phone number extraction** — The AI must attempt to find phone numbers in email bodies
3. **Deal value extraction** — Look for dollar amounts, "budget", "deal size", sponsorship rates
4. **Priority calibration** — hot/warm/cold should correlate with: explicit urgency, dollar value, named decision-maker
5. **Clean notes** — Description should be structured: "Original ask: ..., Context: ..., Robert's history: ..."
6. **Due dates** — Extract when mentioned ("reply by Friday", "deadline is March 15")
7. **Date received** — Must come from email headers (original email date), not pipeline run time
8. **Lead source细分** — How did this enter the pipeline? (Gmail search keyword that matched, thread origin, etc.)

### Deduplication (critical)
9. **Smarter dedup** — By email address AND by phone number. Same person different thread = one card, not three
10. **"Are you the same person?" logic** — If first name + last initial + domain matches, merge
11. **merged_into tracking** — Keep audit trail of what was merged into what

### Filtering (reduce noise)
12. **Noise filter** — Archive these at import time, not manually later:
    - Newsletters (Substack, Beehiiv, Thinkific notifications)
    - System emails (Zoom, Stripe, Google Meet, Read.ai, invoices)
    - Robert's own outbound (scobleizer@gmail.com)
    - Sam Levin / internal team
    - Maryam Scoble (family)
    - No actionable intent ("no specific action", "other", "N/A")
    - Auto-replies / out-of-office
    - PR blasts / mass outreach with no personalization
13. **Spam detection** — Basic signals: no personal name, generic greeting, mass BCC, known spam domains

### Pipeline Reliability
14. **Checkpoint should be human-readable** — JSON, not pickle. Easy to inspect, modify, reset
15. **Dead-letter queue** — Failed extractions should be logged separately with the raw email, not silently dropped
16. **Graceful degradation** — If AI extraction fails, still create card with raw email data + flag for review
17. **Run reporting** — Telegram message at end of each run: "Ran 1-year backfill | X emails found | Y new leads | Z archived as noise | N duplicates merged | Runtime: Xm"

---

## Gmail Query (current — too narrow)

```python
GMAIL_QUERY = (
    "("
    "from:scoble OR subject:unaligned OR subject:scobelizer OR subject:aligned "
    'OR subject:partnership OR subject:collaboration OR subject:"interview request" '
    'OR subject:"tech discussion" OR subject:AI OR subject:"sponsored interview" '
    "OR subject:startup OR subject:sponsorship OR subject:marketing "
    'OR subject:"paid opportunity" OR subject:affiliate OR subject:feature '
    "OR subject:funding OR subject:growth OR subject:podcast OR subject:opportunity"
    ")"
)
```

This misses: cold outreach TO Robert (not from him), inbound partnership requests with non-obvious subjects, inbound interview requests that don't say "interview request", etc.

**Suggested improvement:** Search Robert's INBOUND emails broadly, filter on the sender (not just subject). The scraper should find Robert's inbox emails and let the AI + keyword filter decide what's relevant.

---

## Credential Files

| File | Location | Purpose |
|------|----------|---------|
| Ash's Gmail token | `~/.config/google-credentials/gmail-token.json` | Current scraper OAuth (Ash's account) |
| Robert's Gmail client secret | `~/.config/google-credentials/client_secret_robert.json` | OAuth for Robert's Gmail (newly created, auth pending) |
| Robert's Gmail token | `~/.config/google-credentials/gmail-token-robert.json` | Will be created after OAuth flow |

Supabase: project `hbnpwphxjurvtydezwgh`, anon key + service role key need to be in env vars.

---

## What To Save Back

Inside `CLAUDE_REWRITE/`, save:
- `scraper_v3_openai_1.py` (current scraper — review this)
- `BRIEF.md` (this file)
- Any rewritten Python files
- Any SQL migration scripts
- Updated schema if needed
- Env var template

Ash will drop the folder back and we'll run the 1-year backfill on Robert's Gmail with the new system.
