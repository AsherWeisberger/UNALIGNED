#!/bin/bash
set -euo pipefail

ROOT="/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES"
LOG_DIR="$HOME/Library/Logs/unaligned"
LOG_FILE="$LOG_DIR/deal_brain_server.log"

mkdir -p "$LOG_DIR"
exec >>"$LOG_FILE" 2>&1

echo "===== $(date) deal brain server start ====="

export DEAL_BRAIN_SERVER_PORT="${DEAL_BRAIN_SERVER_PORT:-8788}"
export DEAL_BRAIN_SERVER_HOST="${DEAL_BRAIN_SERVER_HOST:-127.0.0.1}"

cd "$ROOT"
exec /opt/homebrew/bin/python3 scripts/active/deal_brain_server.py
