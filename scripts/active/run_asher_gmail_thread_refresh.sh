#!/bin/bash
# Scheduled Asher Gmail → Company OS thread refresh (7 AM + 10 PM Eastern).
# Same path as the Company OS "Sync Gmail" button: export recent mail, patch
# board cards, import new threads. Lighter than the full morning scraper.
set -euo pipefail

ROOT="/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES"
ENV_FILE="$HOME/.config/google-credentials/unaligned-scraper.env"
ASHER_TOKEN="$HOME/.config/google-credentials/asher-gmail-token.json"
LOG="$HOME/Library/Logs/unaligned/gmail-thread-refresh.log"
STATUS_FILE="$HOME/.config/google-credentials/gmail_scheduled_refresh_status.json"

mkdir -p "$(dirname "$LOG")"
exec >>"$LOG" 2>&1

echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') gmail thread refresh start ====="

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

cd "$ROOT"

/opt/homebrew/bin/python3 scripts/active/refresh_gmail_tokens.py --quiet || true

if [ ! -f "$ASHER_TOKEN" ]; then
  echo "Asher Gmail token missing at $ASHER_TOKEN — aborting scheduled refresh."
  /opt/homebrew/bin/python3 - <<'PY' || true
import json
from datetime import datetime, timezone
from pathlib import Path
path = Path.home() / ".config/google-credentials/gmail_scheduled_refresh_status.json"
path.write_text(json.dumps({
    "ok": False,
    "error": "asher-gmail-token.json missing",
    "updated_at": datetime.now(timezone.utc).isoformat(),
}, indent=2), encoding="utf-8")
PY
  exit 1
fi

export GMAIL_TOKEN_FILE="$ASHER_TOKEN"

# Skip if Asher's Gmail API is in a recorded rate-limit cooldown.
if /opt/homebrew/bin/python3 - <<'PY'
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

def active(path: Path) -> str:
    if not path.exists():
        return ""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return ""
    raw = str(data.get("retry_after") or "").strip()
    if not raw:
        return ""
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        until = datetime.fromisoformat(raw).astimezone(timezone.utc).timestamp()
    except Exception:
        path.unlink(missing_ok=True)
        return ""
    if datetime.now(timezone.utc).timestamp() < until:
        return str(data.get("retry_after") or raw)
    path.unlink(missing_ok=True)
    return ""

cred_dir = Path.home() / ".config/google-credentials"
blocked = []
for name in ("gmail_api_rate_limit_asher.json", "gmail_api_rate_limit.json"):
    hit = active(cred_dir / name)
    if hit:
        blocked.append(hit)
if blocked:
    print(f"Asher Gmail rate limit active until {min(blocked)}")
    sys.exit(1)
sys.exit(0)
PY
then
  :
else
  echo "Gmail rate limit still active — skipping this scheduled run."
  exit 0
fi

OK=0
if /opt/homebrew/bin/python3 scripts/active/sync_asher_gmail_now.py; then
  OK=1
  echo "Scheduled full Gmail thread refresh OK."
else
  echo "Full refresh failed — trying delta sync fallback."
  /opt/homebrew/bin/python3 scripts/active/gmail_delta_sync.py || true
fi

/opt/homebrew/bin/python3 scripts/active/pipeline_health.py gmail_refresh_end || true

/opt/homebrew/bin/python3 - <<PY || true
import json
from datetime import datetime, timezone
from pathlib import Path

def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}

now = datetime.now(timezone.utc).isoformat()
full = read_json(Path.home() / ".config/google-credentials/asher_gmail_sync_now_status.json")
delta = read_json(Path.home() / ".config/google-credentials/gmail_delta_asher_status.json")
out = {
    "ok": bool(full.get("ok")) or bool(delta.get("ok")),
    "updated_at": now,
    "full_sync": full,
    "delta_sync": delta,
    "threads_patched": full.get("threads_patched", 0),
    "new_cards_written": full.get("new_cards_written", 0),
}
Path.home().joinpath(".config/google-credentials/gmail_scheduled_refresh_status.json").write_text(
    json.dumps(out, indent=2, ensure_ascii=False),
    encoding="utf-8",
)
PY

echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') gmail thread refresh end (ok=$OK) ====="