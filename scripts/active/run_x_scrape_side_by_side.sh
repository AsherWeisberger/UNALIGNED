#!/bin/bash
# Chrome production scrape + API shadow lane + comparison report.
set -euo pipefail

ROOT="/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES"
ENV_FILE="$HOME/.config/google-credentials/unaligned-scraper.env"
LOG="$HOME/Library/Logs/unaligned/x-side-by-side.log"

mkdir -p "$(dirname "$LOG")"
exec >>"$LOG" 2>&1

echo "===== $(date) x scrape side-by-side start ====="

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

cd "$ROOT"

echo "--- Chrome lane (production) ---"
/opt/homebrew/bin/python3 scripts/active/live_x_inbox_daily_scrape.py \
  --rebuild-intake \
  --recent-days="${LIVE_X_RECENT_DAYS:-1}" \
  --max-candidates="${LIVE_X_MAX_CANDIDATES:-80}" || echo "Chrome lane failed (continuing to shadow)"

echo "--- API shadow lane ---"
/opt/homebrew/bin/python3 scripts/active/x_api_dm_shadow_scrape.py \
  --recent-days="${X_API_SHADOW_RECENT_DAYS:-3}" \
  --max-pages="${X_API_SHADOW_MAX_PAGES:-3}" || echo "API shadow failed (token may be missing)"

echo "--- Comparison report ---"
/opt/homebrew/bin/python3 scripts/active/compare_x_scrape_sources.py || true

echo "Report: $HOME/.config/google-credentials/x_api_shadow/x_scrape_side_by_side.json"
echo "===== $(date) x scrape side-by-side end ====="