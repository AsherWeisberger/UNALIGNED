#!/bin/bash
# Install UNALIGNED launchd agents from repo → ~/.local/bin + LaunchAgents
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BIN="$HOME/.local/bin"
AGENTS="$HOME/Library/LaunchAgents"
LOG="$HOME/Library/Logs/unaligned"

mkdir -p "$BIN" "$AGENTS" "$LOG"

for script in start_local_llm_bridge.sh start_google_docs_brief_server.sh start_deal_brain_server.sh run_codex_daily_scraper.sh run_live_x_inbox_scrape.sh run_asher_gmail_thread_refresh.sh refresh_gmail_tokens.py; do
  cp "$ROOT/scripts/active/$script" "$BIN/$script"
  chmod +x "$BIN/$script"
done

for plist in com.unaligned.local-llm-bridge.plist com.unaligned.google-docs-brief-server.plist com.unaligned.deal-brain-server.plist com.unaligned.dailyscraper.plist com.unaligned.live-x-scraper.plist com.unaligned.gmail-thread-refresh.plist com.unaligned.gmail-token-refresh.plist; do
  cp "$ROOT/scripts/active/$plist" "$AGENTS/$plist"
done

USER_UID="$(id -u)"
for label in com.unaligned.local-llm-bridge com.unaligned.google-docs-brief-server com.unaligned.deal-brain-server com.unaligned.dailyscraper com.unaligned.live-x-scraper com.unaligned.gmail-thread-refresh com.unaligned.gmail-token-refresh; do
  launchctl bootout "gui/$USER_UID/$label" 2>/dev/null || true
  launchctl bootstrap "gui/$USER_UID" "$AGENTS/$label.plist"
done

echo "Installed. Services:"
launchctl list | rg "unaligned\." || true