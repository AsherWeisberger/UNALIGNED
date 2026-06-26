#!/bin/bash
set -euo pipefail

ROOT="/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES"
ENV_FILE="$HOME/.config/google-credentials/unaligned-scraper.env"
DUMP="$HOME/.config/google-credentials/robert_codex_latest_gmail_dump.json"
CANDIDATES="$HOME/.config/google-credentials/robert_codex_latest_candidates.json"
ASHER_DUMP="$HOME/.config/google-credentials/asher_codex_latest_gmail_dump.json"
ASHER_CANDIDATES="$HOME/.config/google-credentials/asher_codex_latest_candidates.json"
LOG="$HOME/.config/google-credentials/codex_daily_scraper.log"
ROBERT_TOKEN="$HOME/.config/google-credentials/gmail-token.json"
ASHER_TOKEN="$HOME/.config/google-credentials/asher-gmail-token.json"
LIVE_X_LOG="$HOME/.config/google-credentials/live_x_inbox_scraper.log"

mkdir -p "$(dirname "$LOG")"
exec >>"$LOG" 2>&1

echo "===== $(date) codex daily scraper start ====="

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

# All drafting/classification runs on local Qwen via Ollama (Mac Studio).
export LLM_BACKEND="${LLM_BACKEND:-local}"
export LOCAL_MODEL="${LOCAL_MODEL:-qwen3.6:35b-a3b}"
export OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434/api/chat}"
export USE_LOCAL_CLASSIFIER="${USE_LOCAL_CLASSIFIER:-1}"

cd "$ROOT"
echo "LLM backend: ${LLM_BACKEND} (${LOCAL_MODEL})"

if [ -f "$ROBERT_TOKEN" ]; then
  echo "Using Robert Gmail token: $ROBERT_TOKEN"
else
  echo "Robert Gmail token not found; using default Gmail token."
fi

if [ -f "$ROBERT_TOKEN" ]; then
  GMAIL_TOKEN_FILE="$ROBERT_TOKEN" /opt/homebrew/bin/python3 export_gmail_dump.py \
    --days=1 \
    --out "$DUMP" \
    --candidates-out "$CANDIDATES"
else
  /opt/homebrew/bin/python3 export_gmail_dump.py \
    --days=1 \
    --out "$DUMP" \
    --candidates-out "$CANDIDATES"
fi

if [ -f "$ASHER_TOKEN" ]; then
  echo "Using Asher Gmail token for Company OS sync: $ASHER_TOKEN"
  GMAIL_TOKEN_FILE="$ASHER_TOKEN" /opt/homebrew/bin/python3 export_gmail_dump.py \
    --days=14 \
    --out "$ASHER_DUMP" \
    --candidates-out "$ASHER_CANDIDATES"
  /opt/homebrew/bin/python3 sync_existing_threads_from_dump.py \
    --dump "$ASHER_DUMP"
  /opt/homebrew/bin/python3 write_asher_candidate_cards.py \
    --candidates "$ASHER_CANDIDATES"
else
  echo "Asher Gmail token not found; Company OS thread sync will stay on the default mailbox."
  /opt/homebrew/bin/python3 sync_existing_threads_from_dump.py \
    --dump "$DUMP"
fi

/opt/homebrew/bin/python3 write_split_thread_cards.py \
  --dump "$DUMP"

if [ "${ASHER_OPERATOR_ENABLED:-1}" = "1" ]; then
  if [ -f "$ASHER_TOKEN" ]; then
    GMAIL_TOKEN_FILE="$ASHER_TOKEN" /opt/homebrew/bin/python3 scripts/active/asher_operator.py --limit="${ASHER_OPERATOR_LIMIT:-150}" || true
  else
    /opt/homebrew/bin/python3 scripts/active/asher_operator.py --limit="${ASHER_OPERATOR_LIMIT:-150}" || true
  fi
fi

if [ "${DAILY_PIPELINE_ENABLED:-1}" = "1" ]; then
  echo "Starting daily pipeline (stage moves + reply drafts)."
  /opt/homebrew/bin/python3 daily_pipeline.py || true
  echo "Daily pipeline complete."
fi

# Mirror workspace Trash to Gmail Trash. Cron-safe: it skips silently until
# someone authorizes gmail.modify once by running it manually in a terminal.
# Guarded with || true so a trash hiccup never aborts the scrape.
/opt/homebrew/bin/python3 scripts/active/trash_gmail_from_supabase.py || true

if [ "${LIVE_X_ENABLED:-1}" = "1" ]; then
  echo "Starting live X inbox pass."
  /opt/homebrew/bin/python3 scripts/active/live_x_inbox_daily_scrape.py \
    --rebuild-intake \
    --recent-days="${LIVE_X_RECENT_DAYS:-1}" \
    --max-candidates="${LIVE_X_MAX_CANDIDATES:-80}" \
    --max-irrelevant-streak="${LIVE_X_MAX_IRRELEVANT_STREAK:-25}" \
    --known-stop-streak="${LIVE_X_KNOWN_STOP_STREAK:-3}" \
    >> "$LIVE_X_LOG" 2>&1 || true
  echo "Live X inbox pass complete."
fi

if [ "${ROBERT_HANDOFF_ENABLED:-0}" = "1" ]; then
  echo "Starting Robert handoff operator."
  /opt/homebrew/bin/python3 scripts/active/robert_handoff_operator.py \
    --gmail-limit="${ROBERT_HANDOFF_GMAIL_LIMIT:-10}" \
    --x-limit="${ROBERT_HANDOFF_X_LIMIT:-15}" \
    --x-max-age-days="${ROBERT_HANDOFF_X_MAX_AGE_DAYS:-3}" \
    ${ROBERT_HANDOFF_DRY_RUN:+--dry-run} \
    || true
  echo "Robert handoff operator complete."
fi

date +"%Y/%m/%d" > "$HOME/.config/google-credentials/scraper_v4_last_run.txt"

echo "Codex Gmail dump and existing-thread sync complete."
echo "Candidates are ready at: $CANDIDATES"
echo "===== $(date) codex daily scraper end ====="
