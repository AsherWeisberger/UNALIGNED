#!/bin/zsh
set -euo pipefail
export PATH="/Users/asherweisberger/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

ROOT="/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES"
LOG_DIR="$HOME/Library/Logs/unaligned"
PYTHON_BIN="/opt/homebrew/bin/python3"

mkdir -p "$LOG_DIR"
cd "$ROOT"

if lsof -iTCP:8767 -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') Brief Maker server already running on 127.0.0.1:8767" >> "$LOG_DIR/google_docs_brief_server.log"
  exit 0
fi

exec "$PYTHON_BIN" "$ROOT/scripts/active/google_docs_brief_server.py" >> "$LOG_DIR/google_docs_brief_server.log" 2>> "$LOG_DIR/google_docs_brief_server.error.log"
