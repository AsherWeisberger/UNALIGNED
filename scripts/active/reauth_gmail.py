#!/usr/bin/env python3
"""
One-time Gmail OAuth for UNALIGNED mailboxes.

Usage:
  python3 scripts/active/reauth_gmail.py --account asher
  python3 scripts/active/reauth_gmail.py --account robert

Sign in as the target mailbox when the browser opens.
"""

from __future__ import annotations

import argparse
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

import google.auth.transport.requests
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

ROOT = Path(__file__).resolve().parents[2]
STATE_DIR = Path.home() / ".config/google-credentials"
CLIENT_SECRET = STATE_DIR / "client_secret.json"
SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]

ACCOUNTS = {
    "asher": {
        "token_file": STATE_DIR / "asher-gmail-token.json",
        "email_hint": "asherunaligned@gmail.com",
    },
    "robert": {
        "token_file": STATE_DIR / "gmail-token.json",
        "email_hint": "scobleizer@gmail.com",
    },
}


def backup(path: Path) -> Path | None:
    if not path.exists():
        return None
    stamp = int(datetime.now(timezone.utc).timestamp())
    dest = path.with_name(path.name + f".pre-reauth-{stamp}.bak")
    shutil.copy2(path, dest)
    return dest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--account", choices=sorted(ACCOUNTS), default="asher")
    parser.add_argument(
        "--refresh-only",
        action="store_true",
        help="Only refresh the existing access token (no browser).",
    )
    args = parser.parse_args()

    if args.refresh_only:
        import subprocess

        cmd = [
            sys.executable,
            str(ROOT / "scripts/active/refresh_gmail_tokens.py"),
            "--account",
            args.account,
        ]
        return subprocess.call(cmd)

    cfg = ACCOUNTS[args.account]
    token_file: Path = cfg["token_file"]

    if not CLIENT_SECRET.exists():
        print(f"Missing OAuth client file: {CLIENT_SECRET}", file=sys.stderr)
        return 1

    old = backup(token_file)
    if old:
        print(f"Backed up old token to {old}")

    print(f"Opening browser — sign in as {cfg['email_hint']}")
    flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRET), SCOPES)
    creds = flow.run_local_server(port=0, open_browser=True)
    token_file.write_text(creds.to_json(), encoding="utf-8")
    print(f"Saved fresh token to {token_file}")

    creds = Credentials.from_authorized_user_file(str(token_file), SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(google.auth.transport.requests.Request())
        token_file.write_text(creds.to_json(), encoding="utf-8")
        print("Refresh check: OK")
    else:
        print("Access token ready.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())