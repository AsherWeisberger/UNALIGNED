#!/bin/bash
set -euo pipefail

ROOT="/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES"
ENV_FILE="$HOME/.config/google-credentials/unaligned-scraper.env"
LOG="$HOME/.config/google-credentials/x_overnight_full.log"
PY="/opt/homebrew/bin/python3"

mkdir -p "$(dirname "$LOG")"
exec >>"$LOG" 2>&1

echo "===== $(date) x overnight full start ====="

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

cd "$ROOT"

export LLM_BACKEND="${LLM_BACKEND:-local}"
export LOCAL_MODEL="${LOCAL_MODEL:-qwen3.6:35b-a3b}"
export OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434/api/chat}"
export USE_LOCAL_CLASSIFIER="${USE_LOCAL_CLASSIFIER:-1}"

echo "Phase 1: full 30-day live X inbox scrape"
"$PY" scripts/active/live_x_inbox_daily_scrape.py \
  --rebuild-intake \
  --recent-days=30 \
  --max-candidates=700 \
  --max-scrolls=60 \
  --max-irrelevant-streak=120 \
  --known-stop-streak=200 \
  --between-min=1.0 \
  --between-max=2.5 \
  --wait=4.0 || {
    echo "⚠️  X scrape failed; continuing with organize on existing intake."
  }

echo "Phase 2: X bridge sync + Gmail merge"
"$PY" scripts/active/x_bridge.py || true

echo "Phase 3: prune stale X cards + dedupe"
"$PY" scripts/active/x_organize_board.py --days=30 --skip-bridge || true

echo "Phase 4: refresh Gmail threads for merged leads"
ASHER_TOKEN="$HOME/.config/google-credentials/asher-gmail-token.json"
ROBERT_TOKEN="$HOME/.config/google-credentials/gmail-token.json"
if [ -f "$ASHER_TOKEN" ]; then
  GMAIL_TOKEN_FILE="$ASHER_TOKEN" "$PY" scripts/active/gmail_delta_sync.py || true
fi
if [ -f "$ROBERT_TOKEN" ]; then
  GMAIL_TOKEN_FILE="$ROBERT_TOKEN" "$PY" export_gmail_dump.py \
    --days=14 \
    --out "$HOME/.config/google-credentials/robert_codex_latest_gmail_dump.json" \
    --candidates-out "$HOME/.config/google-credentials/robert_codex_latest_candidates.json" || true
  "$PY" sync_existing_threads_from_dump.py \
    --dump "$HOME/.config/google-credentials/robert_codex_latest_gmail_dump.json" || true
fi

echo "Phase 5: daily pipeline (stage + draft queue)"
export DAILY_PIPELINE_ENABLED=1
"$PY" daily_pipeline.py || true

echo "Phase 6: second bridge pass after Gmail sync"
"$PY" scripts/active/x_bridge.py || true
"$PY" scripts/active/x_organize_board.py --days=30 --skip-bridge || true

date +"%Y/%m/%d" > "$HOME/.config/google-credentials/scraper_v4_last_run.txt"
echo "===== $(date) x overnight full complete ====="