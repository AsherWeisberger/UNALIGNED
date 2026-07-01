#!/bin/bash
set -euo pipefail

ROOT="/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES"
ENV_FILE="$HOME/.config/google-credentials/unaligned-scraper.env"
LOG="$HOME/.config/google-credentials/x_overnight_full.log"
PY="/opt/homebrew/bin/python3"

exec >>"$LOG" 2>&1

echo "===== $(date) x overnight RESUME (phases 5-6) ====="

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
export DAILY_PIPELINE_ENABLED=1

"$PY" -c "
import os, sys
sys.path.insert(0, 'scripts/active')
import importlib.util
spec = importlib.util.spec_from_file_location('ph', 'scripts/active/pipeline_health.py')
ph = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ph)
ph.load_env()
ph.send_telegram('UNALIGNED overnight RESUMED — daily pipeline restarting (was killed at ~18/441). Will ping when done.')
" || true

echo "Phase 5 (resume): daily pipeline"
"$PY" daily_pipeline.py || true

echo "Phase 6: final X bridge + organize"
"$PY" scripts/active/x_bridge.py || true
"$PY" scripts/active/x_organize_board.py --days=30 --skip-bridge || true

"$PY" -c "
import os, sys
sys.path.insert(0, 'scripts/active')
import importlib.util
spec = importlib.util.spec_from_file_location('ph', 'scripts/active/pipeline_health.py')
ph = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ph)
ph.load_env()
ph.send_telegram('UNALIGNED overnight RESUME complete — pipeline + final X bridge/organize finished. Board ready for approvals.')
" || true

echo "===== $(date) x overnight RESUME complete ====="