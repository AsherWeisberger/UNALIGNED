#!/usr/bin/env python3
"""
One-time re-consent for the brief maker's Google access.

The brief server now needs Drive read access (to download uploaded Office files
like .docx that the Google Docs API refuses). The existing token does not have
that scope, so run this once in a terminal. A browser opens; approve, and the
token is updated in place. After that the brief server can read .docx links.

    python3 scripts/active/reauth_brief_google.py
"""
from pathlib import Path

from google_auth_oauthlib.flow import InstalledAppFlow

STATE_DIR = Path.home() / ".config" / "google-credentials"
CLIENT_SECRET_FILE = STATE_DIR / "client_secret.json"
TOKEN_FILE = STATE_DIR / "google-docs-brief-token.json"

# Must match SCOPES in google_docs_brief_server.py.
SCOPES = [
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/tasks",
]


def main() -> None:
    print("Opening a browser to authorize the brief maker (now including Drive read)...")
    flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRET_FILE), SCOPES)
    creds = flow.run_local_server(port=0)
    TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
    print(f"Done. Token updated at {TOKEN_FILE}")
    print("The brief maker can now read uploaded .docx links.")


if __name__ == "__main__":
    main()
