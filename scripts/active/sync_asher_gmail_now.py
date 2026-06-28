#!/usr/bin/env python3
"""
On-demand Asher Gmail → Company OS sync.

1. Export recent Asher Gmail (default 14 days)
2. Patch existing Supabase cards with fresh thread text
3. Import new Asher threads as candidate cards

Used by the daily cron (via write_asher_candidate_cards) and the Company OS
"Sync Gmail" button (POST /sync-asher-gmail on the brief server).
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = Path.home() / ".config/google-credentials/unaligned-scraper.env"
ASHER_DUMP = Path.home() / ".config/google-credentials/asher_codex_latest_gmail_dump.json"
ASHER_CANDIDATES = Path.home() / ".config/google-credentials/asher_codex_latest_candidates.json"
ASHER_TOKEN = Path.home() / ".config/google-credentials/asher-gmail-token.json"
STATUS_FILE = Path.home() / ".config/google-credentials/asher_gmail_sync_now_status.json"
PYTHON = os.environ.get("PYTHON_BIN", "/opt/homebrew/bin/python3")


def load_env() -> None:
    if not ENV_FILE.exists():
        return
    for raw in ENV_FILE.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export "):].strip()
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def write_status(**data) -> None:
    payload = {"updated_at": datetime.now(timezone.utc).isoformat(), **data}
    STATUS_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def run_step(label: str, cmd: list[str], env: dict[str, str]) -> dict:
    started = datetime.now(timezone.utc).isoformat()
    proc = subprocess.run(
        cmd,
        cwd=str(ROOT),
        env=env,
        capture_output=True,
        text=True,
        timeout=int(os.environ.get("ASHER_SYNC_TIMEOUT_SEC", "180")),
    )
    return {
        "label": label,
        "cmd": cmd,
        "started_at": started,
        "returncode": proc.returncode,
        "stdout": (proc.stdout or "")[-4000:],
        "stderr": (proc.stderr or "")[-4000:],
        "ok": proc.returncode == 0,
    }


def read_json_status(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=int(os.environ.get("ASHER_SYNC_DAYS", "14")))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    load_env()
    env = os.environ.copy()
    if ASHER_TOKEN.exists():
        env["GMAIL_TOKEN_FILE"] = str(ASHER_TOKEN)

    steps: list[dict] = []
    try:
        if not args.dry_run:
            steps.append(run_step(
                "export_asher_gmail",
                [
                    PYTHON,
                    str(ROOT / "export_gmail_dump.py"),
                    f"--days={args.days}",
                    "--out", str(ASHER_DUMP),
                    "--candidates-out", str(ASHER_CANDIDATES),
                ],
                env,
            ))
            if not steps[-1]["ok"]:
                raise RuntimeError(steps[-1]["stderr"] or steps[-1]["stdout"] or "Asher Gmail export failed")

            steps.append(run_step(
                "sync_existing_threads",
                [PYTHON, str(ROOT / "sync_existing_threads_from_dump.py"), "--dump", str(ASHER_DUMP)],
                env,
            ))
            if not steps[-1]["ok"]:
                raise RuntimeError(steps[-1]["stderr"] or steps[-1]["stdout"] or "Thread sync failed")

            steps.append(run_step(
                "import_asher_candidates",
                [PYTHON, str(ROOT / "write_asher_candidate_cards.py"), "--candidates", str(ASHER_CANDIDATES)],
                env,
            ))
            if not steps[-1]["ok"]:
                raise RuntimeError(steps[-1]["stderr"] or steps[-1]["stdout"] or "Asher candidate import failed")

        thread_sync = read_json_status(Path.home() / ".config/google-credentials/codex_thread_sync_status.json")
        candidate_sync = read_json_status(Path.home() / ".config/google-credentials/codex_asher_candidate_write_status.json")

        result = {
            "ok": True,
            "dry_run": args.dry_run,
            "days": args.days,
            "threads_patched": thread_sync.get("written", 0),
            "threads_prepared": thread_sync.get("prepared", 0),
            "new_cards_prepared": candidate_sync.get("prepared", 0),
            "new_cards_written": candidate_sync.get("written", 0),
            "steps": steps,
        }
        write_status(phase="ok", **{k: v for k, v in result.items() if k != "steps"})
        print(json.dumps(result, indent=2))
        return 0
    except Exception as exc:
        result = {
            "ok": False,
            "error": str(exc),
            "steps": steps,
        }
        write_status(phase="error", **result)
        print(json.dumps(result, indent=2))
        return 1


if __name__ == "__main__":
    sys.exit(main())