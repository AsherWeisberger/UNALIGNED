#!/bin/bash
set -euo pipefail

ROOT="/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES"
ENV_FILE="$HOME/.config/google-credentials/unaligned-scraper.env"
LOG_DIR="$HOME/Library/Logs/unaligned"
LOG_FILE="$LOG_DIR/local_llm_bridge.log"

mkdir -p "$LOG_DIR"
exec >>"$LOG_FILE" 2>&1

echo "===== $(date) local llm bridge start ====="

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

export LLM_BACKEND="${LLM_BACKEND:-local}"
export LOCAL_MODEL="${LOCAL_MODEL:-qwen3.6:35b-a3b}"
export OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434/api/chat}"
export LOCAL_LLM_BRIDGE_PORT="${LOCAL_LLM_BRIDGE_PORT:-8787}"
export LOCAL_LLM_BRIDGE_HOST="${LOCAL_LLM_BRIDGE_HOST:-127.0.0.1}"

cd "$ROOT"
exec /opt/homebrew/bin/python3 scripts/active/local_llm_bridge.py