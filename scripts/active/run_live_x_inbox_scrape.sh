#!/bin/bash
set -euo pipefail

ROOT="/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES"
ENV_FILE="$HOME/.config/google-credentials/unaligned-scraper.env"
LOG="$HOME/.config/google-credentials/live_x_inbox_scraper.log"

mkdir -p "$(dirname "$LOG")"
exec >>"$LOG" 2>&1

echo "===== $(date) live x inbox scraper start ====="

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

cd "$ROOT"

/opt/homebrew/bin/python3 scripts/active/live_x_inbox_daily_scrape.py \
  --rebuild-intake \
  --recent-days="${LIVE_X_RECENT_DAYS:-2}" \
  --max-candidates="${LIVE_X_MAX_CANDIDATES:-80}" \
  --max-irrelevant-streak="${LIVE_X_MAX_IRRELEVANT_STREAK:-25}" \
  --known-stop-streak="${LIVE_X_KNOWN_STOP_STREAK:-3}"

echo "===== $(date) live x inbox scraper end ====="
