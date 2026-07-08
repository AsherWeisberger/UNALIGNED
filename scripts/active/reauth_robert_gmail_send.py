#!/usr/bin/env python3
"""
Re-authorize Robert's Gmail SEND token (desk intake + handoff operator).

Writes: ~/.config/google-credentials/gmail-token-robert.json
Scope:  gmail.send

Usage:
  python3 scripts/active/reauth_robert_gmail_send.py

Sign in as scobleizer@gmail.com when the browser opens and approve send access.
"""
from __future__ import annotations

import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

from google_auth_oauthlib.flow import InstalledAppFlow

STATE_DIR = Path.home() / ".config/google-credentials"
TOKEN_FILE = STATE_DIR / "gmail-token-robert.json"
SCOPES = ["https://www.googleapis.com/auth/gmail.send"]
EMAIL_HINT = "scobleizer@gmail.com"

CLIENT_SECRET = STATE_DIR / "client_secret_robert_desktop.json"
if not CLIENT_SECRET.exists():
    CLIENT_SECRET = STATE_DIR / "client_secret.json"


def main() -> int:
    if not CLIENT_SECRET.exists():
        print(f"Missing OAuth client file: {CLIENT_SECRET}", file=sys.stderr)
        return 1

    if TOKEN_FILE.exists():
        stamp = int(datetime.now(timezone.utc).timestamp())
        backup = TOKEN_FILE.with_name(TOKEN_FILE.name + f".pre-reauth-{stamp}.bak")
        shutil.copy2(TOKEN_FILE, backup)
        print(f"Backed up old token to {backup}")

    print(f"Opening browser — sign in as {EMAIL_HINT} and approve Gmail send access...")
    flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRET), SCOPES)
    creds = flow.run_local_server(port=0, open_browser=True, prompt="consent", login_hint=EMAIL_HINT)
    TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
    print(f"Saved fresh send token to {TOKEN_FILE}")
    print("Robert desk sends should work now. Hard refresh Company OS and retry.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())