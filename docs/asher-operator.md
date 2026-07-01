# Asher Operator

This is the first autonomous deal-operator layer for Company OS.

## What it does

`scripts/active/asher_operator.py`:

- reads Gmail-backed lead cards from Supabase
- reads stored thread history from `original_email`
- builds local operator memory per thread
- classifies the current deal stage
- drafts an Asher-style reply when a reply is needed
- writes operator memory back into the card `description`
- updates `draft_reply` and `draft_reply_status`
- optionally auto-sends only low-risk reply types

## Files

- policy:
  - `scripts/active/asher_operator_policy.json`
- operator runtime:
  - `scripts/active/asher_operator.py`
- daily runner:
  - `scripts/active/run_codex_daily_scraper.sh`

## Default behavior

By default the operator is conservative:

- it does **not** auto-send
- it drafts replies and marks them pending
- it escalates custom pricing / risky terms / high-value / contract issues

## Environment

The daily runner already sources:

- `~/.config/google-credentials/unaligned-scraper.env`

Useful env vars:

- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `ASHER_OPERATOR_ENABLED=1`
- `ASHER_OPERATOR_LIMIT=150`
- `ASHER_OPERATOR_AUTO_SEND=false`

Optional token overrides:

- `GMAIL_TOKEN_FILE`
- `GMAIL_SEND_TOKEN_FILE`
- `GOOGLE_CLIENT_SECRET_FILE`

Recommended token setup:

- read-only token for inbox reading:
  - `~/.config/google-credentials/asher-gmail-token.json`
- send token for auto-send mode:
  - `~/.config/google-credentials/asher-gmail-send-token.json`

## Safe auto-send

Auto-send is controlled by:

- `ASHER_OPERATOR_AUTO_SEND=true`

Even then, it only attempts low-risk reply types from policy:

- `initial-scope`
- `pricing-send`
- `follow-up`
- `brief-request`
- `payment-check`
- `live-link-request`

Anything escalated stays draft-only.

## Run manually

Draft-only:

```bash
python3 scripts/active/asher_operator.py --limit=25
```

Draft-only for only threads waiting on us:

```bash
python3 scripts/active/asher_operator.py --only-needs-reply --limit=25
```

Dry run:

```bash
python3 scripts/active/asher_operator.py --dry-run --limit=10
```

## What gets written

Per lead card:

- `list_id` when the stage changes
- `draft_reply`
- `draft_reply_status`
- `description.operator_memory`

Local memory:

- `~/.config/google-credentials/asher_operator_memory.json`

## Next upgrades

The foundation is now in place. The next logical steps are:

1. connect the operator to X lead reply handling
2. add approval thresholds per deal size
3. generate Robert briefs automatically after sold deals
4. create calendar hold suggestions from confirmed launch dates
5. add a send/audit log so every autonomous reply is searchable
