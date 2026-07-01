#!/usr/bin/env python3
"""
Keep Gmail OAuth access tokens fresh and alert when re-auth is needed.

Testing-mode Google OAuth apps expire refresh tokens about every 7 days.
This script cannot replace a dead refresh token without a browser sign-in,
but it:
  - refreshes access tokens on a schedule (fewer mid-run surprises)
  - verifies each mailbox with a lightweight Gmail API call
  - writes gmail_token_health.json for the dashboard / ops
  - pings Telegram when a mailbox needs reauth (with alert cooldown)

Usage:
  python3 scripts/active/refresh_gmail_tokens.py
  python3 scripts/active/refresh_gmail_tokens.py --account asher
  python3 scripts/active/refresh_gmail_tokens.py --try-reauth
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import google.auth.transport.requests
import httpx
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

STATE_DIR = Path.home() / ".config/google-credentials"
ENV_FILE = STATE_DIR / "unaligned-scraper.env"
STATUS_FILE = STATE_DIR / "gmail_token_health.json"
ALERT_STATE_FILE = STATE_DIR / "gmail_token_alert_state.json"
CLIENT_SECRET = STATE_DIR / "client_secret.json"

GMAIL_READONLY = ["https://www.googleapis.com/auth/gmail.readonly"]

ACCOUNTS = {
    "robert": {
        "token_file": STATE_DIR / "gmail-token.json",
        "email_hint": "scobleizer@gmail.com",
        "scopes": GMAIL_READONLY,
    },
    "asher": {
        "token_file": STATE_DIR / "asher-gmail-token.json",
        "email_hint": "asherunaligned@gmail.com",
        "scopes": GMAIL_READONLY,
    },
    "brief": {
        "token_file": STATE_DIR / "google-docs-brief-token.json",
        "email_hint": "brief maker Google account",
        "scopes": None,  # read scopes from token file
        "verify": "profile_only",
    },
}


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


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_json(path: Path, default: dict | None = None) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default or {}


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def parse_expiry(raw: str | None) -> datetime | None:
    if not raw:
        return None
    text = str(raw).strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(text)
    except Exception:
        return None


def send_telegram(message: str) -> None:
    token = os.environ.get("TELEGRAM_TOKEN", "").strip()
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if not token or not chat_id:
        return
    try:
        httpx.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": message},
            timeout=15,
        )
    except Exception:
        pass


def should_alert(account: str, cooldown_hours: float) -> bool:
    state = read_json(ALERT_STATE_FILE)
    last = state.get(account)
    if not last:
        return True
    try:
        prev = datetime.fromisoformat(str(last))
        if prev.tzinfo is None:
            prev = prev.replace(tzinfo=timezone.utc)
        elapsed = datetime.now(timezone.utc) - prev
        return elapsed.total_seconds() >= cooldown_hours * 3600
    except Exception:
        return True


def mark_alert(account: str) -> None:
    state = read_json(ALERT_STATE_FILE)
    state[account] = utc_now()
    write_json(ALERT_STATE_FILE, state)


def load_credentials(token_file: Path, scopes: list[str] | None) -> Credentials:
    data = read_json(token_file)
    use_scopes = scopes or list(data.get("scopes") or [])
    if not use_scopes:
        use_scopes = GMAIL_READONLY
    return Credentials.from_authorized_user_file(str(token_file), use_scopes)


def verify_gmail(creds: Credentials) -> dict:
    service = build("gmail", "v1", credentials=creds, cache_discovery=False)
    profile = service.users().getProfile(userId="me").execute()
    return {
        "email": profile.get("emailAddress", ""),
        "messages_total": profile.get("messagesTotal"),
        "threads_total": profile.get("threadsTotal"),
    }


def verify_brief(creds: Credentials) -> dict:
    # Lightweight check: token refresh succeeded; optional profile if gmail scope present.
    scopes = set(creds.scopes or [])
    if "https://www.googleapis.com/auth/gmail.readonly" in scopes:
        return verify_gmail(creds)
    return {"email": "", "verified": "token_refresh_only"}


def refresh_account(name: str, cfg: dict, try_reauth: bool) -> dict:
    token_file: Path = cfg["token_file"]
    result = {
        "account": name,
        "token_file": str(token_file),
        "email_hint": cfg.get("email_hint", ""),
        "ok": False,
        "checked_at": utc_now(),
    }
    if not token_file.exists():
        result["error"] = "token_file_missing"
        return result

    scopes = cfg.get("scopes")
    try:
        creds = load_credentials(token_file, scopes)
    except Exception as exc:
        result["error"] = f"load_failed: {exc}"
        return result

    if not creds.refresh_token:
        result["error"] = "missing_refresh_token"
        return result

    try:
        if creds.expired or not creds.token:
            creds.refresh(google.auth.transport.requests.Request())
        token_file.write_text(creds.to_json(), encoding="utf-8")
        result["refreshed"] = True
        result["expiry"] = creds.expiry.isoformat() if creds.expiry else None
    except Exception as exc:
        err = str(exc)
        result["error"] = err
        result["needs_reauth"] = "invalid_grant" in err.lower() or "revoked" in err.lower()
        if try_reauth and result.get("needs_reauth"):
            result["reauth_attempted"] = _try_interactive_reauth(name, cfg, scopes)
        return result

    try:
        if cfg.get("verify") == "profile_only":
            profile = verify_brief(creds)
        else:
            profile = verify_gmail(creds)
        result["profile"] = profile
        result["ok"] = True
    except HttpError as exc:
        result["error"] = f"gmail_verify_failed: {exc}"
        result["needs_reauth"] = exc.resp.status in (401, 403) if getattr(exc, "resp", None) else False
    except Exception as exc:
        result["error"] = f"verify_failed: {exc}"

    return result


def _try_interactive_reauth(name: str, cfg: dict, scopes: list[str] | None) -> bool:
    if not CLIENT_SECRET.exists():
        return False
    try:
        from google_auth_oauthlib.flow import InstalledAppFlow

        use_scopes = scopes or GMAIL_READONLY
        flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRET), use_scopes)
        creds = flow.run_local_server(port=0, open_browser=True)
        cfg["token_file"].write_text(creds.to_json(), encoding="utf-8")
        return True
    except Exception:
        return False


def patch_ops_health(accounts: dict[str, dict]) -> None:
    key = os.environ.get("SUPABASE_ANON_KEY", "").strip()
    if not key:
        return
    url = os.environ.get("SUPABASE_URL", "https://hbnpwphxjurvtydezwgh.supabase.co")
    robert = accounts.get("robert", {})
    asher = accounts.get("asher", {})
    fields = {
        "updated_at": utc_now(),
        "gmail_token_checked_at": utc_now(),
        "gmail_token_robert_ok": bool(robert.get("ok")),
        "gmail_token_asher_ok": bool(asher.get("ok")),
        "gmail_token_robert_error": str(robert.get("error") or "")[:200],
        "gmail_token_asher_error": str(asher.get("error") or "")[:200],
    }
    try:
        httpx.patch(
            f"{url}/rest/v1/ops_health?id=eq.1",
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
            json=fields,
            timeout=20,
        )
    except Exception:
        pass


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--account", choices=sorted(ACCOUNTS), action="append")
    parser.add_argument("--try-reauth", action="store_true", help="Open browser if refresh token is dead")
    parser.add_argument("--alert-cooldown-hours", type=float, default=12.0)
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args()

    load_env()
    names = args.account or list(ACCOUNTS)
    results: dict[str, dict] = {}

    for name in names:
        cfg = ACCOUNTS[name]
        result = refresh_account(name, cfg, args.try_reauth)
        results[name] = result
        if not result.get("ok"):
            msg = (
                f"UNALIGNED Gmail token needs re-auth ({name})\n"
                f"Mailbox: {cfg.get('email_hint', name)}\n"
                f"Error: {result.get('error', 'unknown')}\n"
                f"Fix on Mac Studio:\n"
                f"python3 scripts/active/reauth_gmail.py --account {name}"
            )
            if should_alert(name, args.alert_cooldown_hours):
                send_telegram(msg)
                mark_alert(name)
            if not args.quiet:
                print(msg, file=sys.stderr)
        elif not args.quiet:
            expiry = result.get("expiry") or "unknown"
            print(f"{name}: OK (expiry {expiry})")

    payload = {
        "updated_at": utc_now(),
        "accounts": results,
        "all_ok": all(item.get("ok") for item in results.values()),
    }
    write_json(STATUS_FILE, payload)
    patch_ops_health(results)
    print(json.dumps(payload, indent=2))
    return 0 if payload["all_ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())