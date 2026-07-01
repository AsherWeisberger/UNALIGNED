#!/usr/bin/env python3
"""Diagnose X OAuth2 setup before browser login."""

from __future__ import annotations

import os
import urllib.parse
from pathlib import Path

import httpx

STATE_DIR = Path.home() / ".config/google-credentials"
ENV_FILE = STATE_DIR / "x-api.env"
REDIRECT_URI = "http://127.0.0.1:8080/callback"


def load_env() -> None:
    if not ENV_FILE.exists():
        return
    for raw in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export "):].strip()
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def looks_like_api_key(client_id: str, api_key: str) -> bool:
    return bool(client_id and api_key and client_id == api_key)


def main() -> int:
    load_env()
    api_key = os.environ.get("X_API_KEY", "")
    api_secret = os.environ.get("X_API_SECRET", "")
    oauth_client_id = (
        os.environ.get("OAUTH2_CLIENT_ID")
        or os.environ.get("CLIENT_ID")
        or ""
    )
    oauth_client_secret = (
        os.environ.get("OAUTH2_CLIENT_SECRET")
        or os.environ.get("CLIENT_SECRET")
        or ""
    )
    bearer = os.environ.get("X_BEARER_TOKEN", "")

    print("X OAuth diagnostic")
    print("==================")
    print(f"env file: {ENV_FILE}")
    print()

    problems: list[str] = []
    if not oauth_client_id or not oauth_client_secret:
        problems.append("Missing OAUTH2_CLIENT_ID / OAUTH2_CLIENT_SECRET in x-api.env")
    if looks_like_api_key(oauth_client_id, api_key):
        problems.append(
            "CLIENT_ID matches X_API_KEY. OAuth login needs the separate OAuth 2.0 "
            "Client ID from developer.x.com (Keys and tokens), not the API Key."
        )
    if looks_like_api_key(oauth_client_secret, api_secret):
        problems.append(
            "CLIENT_SECRET matches X_API_SECRET. OAuth login needs the separate "
            "OAuth 2.0 Client Secret, not the API Key Secret."
        )

    if bearer:
        resp = httpx.get(
            "https://api.x.com/2/users/by/username/scobleizer",
            headers={"Authorization": f"Bearer {bearer}"},
            timeout=15,
        )
        print(f"Bearer token test: HTTP {resp.status_code}")
        if resp.status_code == 401:
            problems.append("Bearer token returns 401 (invalid or app not activated).")
    else:
        print("Bearer token: not set")
        problems.append("Missing X_BEARER_TOKEN (generate in Keys and tokens after billing).")

    print()
    if problems:
        print("BLOCKERS:")
        for i, item in enumerate(problems, 1):
            print(f"  {i}. {item}")
        print()
        print("Fix in developer.x.com -> your app:")
        print("  1. Settings -> User authentication settings -> Set up")
        print("  2. Enable OAuth 2.0")
        print("  3. Type of App: Automated App / Bot (confidential client)")
        print("  4. Callback URL (exact): http://localhost:8080/callback")
        print("  5. Website URL: https://mac-studio.tail50d3a2.ts.net/")
        print("  6. App permissions: Read (needs dm.read scope)")
        print("  7. Keys and tokens -> copy OAuth 2.0 Client ID + Client Secret")
        print("  8. Put them in x-api.env as:")
        print("       export OAUTH2_CLIENT_ID=\"...\"")
        print("       export OAUTH2_CLIENT_SECRET=\"...\"")
        print("       export CLIENT_ID=\"$OAUTH2_CLIENT_ID\"")
        print("       export CLIENT_SECRET=\"$OAUTH2_CLIENT_SECRET\"")
        print("  9. Re-register xurl app:")
        print("       xurl auth apps add unaligned --client-id \"$OAUTH2_CLIENT_ID\" --client-secret \"$OAUTH2_CLIENT_SECRET\"")
        return 1

    print("Credentials look structurally OK.")
    print(f"Redirect URI must be registered exactly as: {REDIRECT_URI}")
    print("Next: python3 scripts/active/x_oauth_setup.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())