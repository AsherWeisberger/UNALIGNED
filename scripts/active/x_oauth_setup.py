#!/usr/bin/env python3
"""One-time X OAuth2 PKCE login for Robert DM API access."""

from __future__ import annotations

import hashlib
import base64
import json
import os
import secrets
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import httpx

STATE_DIR = Path.home() / ".config/google-credentials"
ENV_FILE = STATE_DIR / "x-api.env"
TOKEN_FILE = STATE_DIR / "x-api-oauth-token.json"
REDIRECT_URI = "http://127.0.0.1:8080/callback"
AUTH_URL = "https://x.com/i/oauth2/authorize"
TOKEN_URL = "https://api.x.com/2/oauth2/token"
SCOPES = "dm.read tweet.read users.read offline.access"


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


def pkce_pair() -> tuple[str, str]:
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode("utf-8").rstrip("=")
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode("utf-8")).digest()
    ).decode("utf-8").rstrip("=")
    return verifier, challenge


def resolve_oauth_credentials() -> tuple[str, str]:
    client_id = (
        os.environ.get("OAUTH2_CLIENT_ID")
        or os.environ.get("CLIENT_ID")
        or ""
    )
    client_secret = (
        os.environ.get("OAUTH2_CLIENT_SECRET")
        or os.environ.get("CLIENT_SECRET")
        or ""
    )
    return client_id, client_secret


def validate_credentials(client_id: str, client_secret: str) -> str | None:
    api_key = os.environ.get("X_API_KEY", "")
    api_secret = os.environ.get("X_API_SECRET", "")
    if not client_id or not client_secret:
        return "Missing OAUTH2_CLIENT_ID / OAUTH2_CLIENT_SECRET in ~/.config/google-credentials/x-api.env"
    if client_id == api_key or client_secret == api_secret:
        return (
            "CLIENT_ID/CLIENT_SECRET are set to API Key values. X OAuth login needs the "
            "separate OAuth 2.0 Client ID + Client Secret from developer.x.com "
            "(Keys and tokens, under OAuth 2.0 — not API Key and Secret). "
            "Run: python3 scripts/active/x_oauth_diagnose.py"
        )
    return None


def main() -> int:
    load_env()
    client_id, client_secret = resolve_oauth_credentials()
    cred_error = validate_credentials(client_id, client_secret)
    if cred_error:
        print(cred_error)
        return 1

    state = secrets.token_urlsafe(16)
    verifier, challenge = pkce_pair()
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": REDIRECT_URI,
        "scope": SCOPES,
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    login_url = f"{AUTH_URL}?{urllib.parse.urlencode(params)}"
    url_file = STATE_DIR / "x-oauth-login-url.txt"
    url_file.write_text(login_url + "\n", encoding="utf-8")
    print("Open this URL and sign in as Robert (scobleizer@gmail.com):", flush=True)
    print(login_url, flush=True)
    print(f"URL also saved to {url_file}", flush=True)
    webbrowser.open(login_url)

    captured: dict[str, str] = {}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            parsed = urllib.parse.urlparse(self.path)
            if parsed.path != "/callback":
                self.send_response(404)
                self.end_headers()
                return
            qs = urllib.parse.parse_qs(parsed.query)
            captured["code"] = (qs.get("code") or [""])[0]
            captured["state"] = (qs.get("state") or [""])[0]
            captured["error"] = (qs.get("error") or [""])[0]
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"<html><body><h2>UNALIGNED X auth complete.</h2><p>You can close this tab.</p></body></html>")

        def log_message(self, format, *args) -> None:
            return

    server = HTTPServer(("localhost", 8080), Handler)
    print(f"Waiting for callback on {REDIRECT_URI} ...")
    while "code" not in captured and not captured.get("error"):
        server.handle_request()

    if captured.get("error"):
        print("OAuth error:", captured.get("error"))
        return 1
    if captured.get("state") != state:
        print("OAuth state mismatch — try again.")
        return 1
    code = captured.get("code")
    if not code:
        print("No authorization code received.")
        return 1

    resp = httpx.post(
        TOKEN_URL,
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": REDIRECT_URI,
            "code_verifier": verifier,
            "client_id": client_id,
        },
        auth=(client_id, client_secret),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=30,
    )
    if resp.status_code >= 400:
        print(f"Token exchange failed {resp.status_code}: {resp.text[:500]}")
        return 1

    token_payload = resp.json()
    TOKEN_FILE.write_text(json.dumps(token_payload, indent=2), encoding="utf-8")
    TOKEN_FILE.chmod(0o600)
    print(f"Saved OAuth token to {TOKEN_FILE}")

    access = token_payload.get("access_token", "")
    me = httpx.get(
        "https://api.x.com/2/users/me",
        headers={"Authorization": f"Bearer {access}"},
        params={"user.fields": "id,name,username"},
        timeout=20,
    )
    if me.status_code == 200:
        print("Authenticated as:", me.json().get("data"))
    else:
        print("Token saved but /users/me returned", me.status_code, me.text[:200])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())