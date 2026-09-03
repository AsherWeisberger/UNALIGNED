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

# Dedicated overnight job always runs X, even when the daytime pipeline skips it.
export LIVE_X_ENABLED=1

cd "$ROOT"

# Message Requests (Priority + Hidden) on by default. Set LIVE_X_INCLUDE_REQUESTS=0 to skip.
INCLUDE_REQUESTS_FLAG="--include-requests"
if [ "${LIVE_X_INCLUDE_REQUESTS:-1}" = "0" ] || [ "${LIVE_X_INCLUDE_REQUESTS:-1}" = "false" ]; then
  INCLUDE_REQUESTS_FLAG="--no-include-requests"
fi

/opt/homebrew/bin/python3 scripts/active/export_x_gate_rules.py || true
echo "Starting live X inbox pass (All + Message Requests)."
/opt/homebrew/bin/python3 scripts/active/live_x_inbox_daily_scrape.py \
  --rebuild-intake \
  --recent-days="${LIVE_X_RECENT_DAYS:-1}" \
  --max-candidates="${LIVE_X_MAX_CANDIDATES:-80}" \
  --max-irrelevant-streak="${LIVE_X_MAX_IRRELEVANT_STREAK:-25}" \
  --known-stop-streak="${LIVE_X_KNOWN_STOP_STREAK:-3}" \
  ${INCLUDE_REQUESTS_FLAG} \
  --requests-recent-days="${LIVE_X_REQUESTS_RECENT_DAYS:-3}" \
  --requests-max-candidates="${LIVE_X_REQUESTS_MAX_CANDIDATES:-40}" \
  --requests-max-scrolls="${LIVE_X_REQUESTS_MAX_SCROLLS:-10}" || true
echo "Live X inbox pass complete."

/opt/homebrew/bin/python3 scripts/active/x_bridge.py || true
echo "X bridge sync complete."

/opt/homebrew/bin/python3 scripts/active/x_spam_cleanup.py || true
echo "X spam cleanup complete."

if [ "${X_API_SHADOW_ENABLED:-0}" = "1" ]; then
  echo "Starting X API shadow lane."
  /opt/homebrew/bin/python3 scripts/active/x_api_dm_shadow_scrape.py \
    --recent-days="${X_API_SHADOW_RECENT_DAYS:-1}" \
    --max-pages="${X_API_SHADOW_MAX_PAGES:-3}" || true
  /opt/homebrew/bin/python3 scripts/active/compare_x_scrape_sources.py || true
  echo "X API shadow comparison complete."
fi

echo "===== $(date) live x inbox scraper end ====="
