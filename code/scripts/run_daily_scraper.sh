#!/bin/bash
# UNALIGNED daily scraper — runs at 8am and 12:30pm via launchd
# Canonical script: ~/Desktop/UNALIGNED/MASTER FILES/scraper_v5.py
# Canonical pipeline: ~/Desktop/UNALIGNED/MASTER FILES/daily_pipeline.py

set -euo pipefail

PYTHON=/opt/homebrew/bin/python3
MASTER="/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES"

# Load secrets — scraper_v5.py loads this itself too, but load here so
# daily_pipeline.py also gets the env vars
SECRETS="$HOME/.config/google-credentials/unaligned-scraper.env"
if [ -f "$SECRETS" ]; then
  set -a; . "$SECRETS"; set +a
else
  echo "$(date): ERROR — missing $SECRETS" >&2
  exit 1
fi

echo "$(date): Starting scraper run"

# 1. Scrape new Gmail leads → Supabase
"$PYTHON" "$MASTER/scraper_v5.py"
echo "$(date): Scraper done (exit $?)"

# 2. Analyze threads, move cards, draft replies
"$PYTHON" "$MASTER/daily_pipeline.py"
echo "$(date): Pipeline done (exit $?)"
