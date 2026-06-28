import os
from pathlib import Path

_env = Path(__file__).parent / ".env"
if _env.exists():
    for line in _env.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6")
LOCAL_MODEL_BASE = os.environ.get("LOCAL_MODEL_BASE", "http://127.0.0.1:8080/v1")
LOCAL_MODEL_NAME = os.environ.get("LOCAL_MODEL_NAME", "qwen3-32b")
POLL_SECONDS = int(os.environ.get("POLL_SECONDS", "120"))

# Claude price per MILLION tokens, for the ops_health spend counter (the 10%).
# Defaults are Opus-tier; override in .env if the model/price changes.
CLAUDE_PRICE_IN = float(os.environ.get("CLAUDE_PRICE_IN", "15"))
CLAUDE_PRICE_OUT = float(os.environ.get("CLAUDE_PRICE_OUT", "75"))

# --- Safety guardrails -------------------------------------------------------
# Writes to the live board are OFF unless explicitly enabled. Until then the
# orchestrator behaves as a dry run no matter what.
OPS_WRITES_ENABLED = os.environ.get("OPS_WRITES_ENABLED", "0").strip().lower() in {"1", "true", "yes", "on"}
# Hard cap on cards touched per run, so a bad pass can never run away.
MAX_CARDS_PER_RUN = int(os.environ.get("MAX_CARDS_PER_RUN", "10"))
# Status written on a drafted card. 'review' lands it in the Company OS Review lane.
DRAFT_STATUS = os.environ.get("DRAFT_STATUS", "review").strip() or "review"
# If this file exists next to the code, the orchestrator pauses (kill switch).
PAUSE_FILE = str(Path(__file__).parent / "PAUSE")
# Append-only audit log of every action/write.
LOG_FILE = str(Path(__file__).parent / "orchestrator.log")
