#!/usr/bin/env python3
"""
Approve-and-send X DMs as Robert (Company OS).

Uses OAuth user token at ~/.config/google-credentials/x-api-oauth-token.json.
Requires scopes: dm.write dm.read tweet.read users.read offline.access

Endpoints used:
  POST /2/dm_conversations/with/{participant_id}/messages
  POST /2/dm_conversations/{dm_conversation_id}/messages  (fallback)
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx

STATE_DIR = Path.home() / ".config/google-credentials"
X_API_ENV = STATE_DIR / "x-api.env"
TOKEN_FILE = STATE_DIR / "x-api-oauth-token.json"
TOKEN_URL = "https://api.x.com/2/oauth2/token"
API_BASE = "https://api.x.com/2"

REQUIRED_SEND_SCOPE = "dm.write"


def load_env() -> None:
    if not X_API_ENV.exists():
        return
    for raw in X_API_ENV.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def read_json(path: Path, default: Any = None) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def oauth_client_credentials() -> tuple[str, str]:
    client_id = os.environ.get("OAUTH2_CLIENT_ID") or os.environ.get("CLIENT_ID") or ""
    client_secret = os.environ.get("OAUTH2_CLIENT_SECRET") or os.environ.get("CLIENT_SECRET") or ""
    return client_id.strip(), client_secret.strip()


def refresh_access_token(token_data: dict[str, Any]) -> dict[str, Any]:
    client_id, client_secret = oauth_client_credentials()
    refresh = str(token_data.get("refresh_token") or "").strip()
    if not client_id or not client_secret or not refresh:
        return token_data
    resp = httpx.post(
        TOKEN_URL,
        data={"grant_type": "refresh_token", "refresh_token": refresh, "client_id": client_id},
        auth=(client_id, client_secret),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=30,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"X OAuth refresh failed {resp.status_code}: {resp.text[:400]}")
    merged = dict(token_data)
    merged.update(resp.json())
    # X may omit refresh_token on refresh — keep the old one.
    if not merged.get("refresh_token") and refresh:
        merged["refresh_token"] = refresh
    TOKEN_FILE.write_text(json.dumps(merged, indent=2), encoding="utf-8")
    TOKEN_FILE.chmod(0o600)
    return merged


def load_token_data() -> dict[str, Any]:
    load_env()
    data = read_json(TOKEN_FILE, {})
    if not isinstance(data, dict) or not data.get("access_token"):
        raise RuntimeError(
            "Missing X OAuth token. Run: python3 scripts/active/x_oauth_setup.py "
            "(sign in as Robert). Needs dm.write scope for send."
        )
    return data


def token_scopes(token_data: dict[str, Any]) -> set[str]:
    raw = str(token_data.get("scope") or "")
    return {part.strip() for part in raw.replace(",", " ").split() if part.strip()}


def ensure_send_scope(token_data: dict[str, Any]) -> None:
    scopes = token_scopes(token_data)
    if REQUIRED_SEND_SCOPE in scopes:
        return
    raise RuntimeError(
        "X OAuth token is missing dm.write (current scopes: "
        + (" ".join(sorted(scopes)) or "none")
        + "). Re-auth Robert with Read and write DM permissions: "
        "python3 scripts/active/x_oauth_setup.py "
        "— also enable Read and write DMs on the X developer app."
    )


def clean_handle(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_]", "", str(value or "").lstrip("@").strip())


def extract_participant_id_from_open_dm(open_dm: str) -> str:
    text = str(open_dm or "").strip()
    if not text:
        return ""
    try:
        parsed = urlparse(text)
        qs = parse_qs(parsed.query or "")
        for key in ("recipient_id", "user_id", "participant_id"):
            vals = qs.get(key) or []
            if vals and re.fullmatch(r"\d+", str(vals[0])):
                return str(vals[0])
    except Exception:
        pass
    # https://x.com/messages/compose?recipient_id=123
    m = re.search(r"(?:recipient_id|user_id|participant_id)=(\d+)", text)
    if m:
        return m.group(1)
    # https://x.com/i/chat/13348-1260690815862452224  or /messages/{a}-{b}
    m = re.search(r"(?:/i/chat/|/messages/)(\d+)-(\d+)", text)
    if m:
        # Prefer the longer snowflake-like id (recipient); chat UI often prefixes a short account key.
        a, b = m.group(1), m.group(2)
        return b if len(b) >= len(a) else a
    # conversation_id=...
    m = re.search(r"conversation_id=([^&#\s]+)", text)
    if m:
        cid = m.group(1)
        parts = re.findall(r"\d+", cid)
        if len(parts) >= 2:
            return parts[-1]
    return ""


def extract_conversation_id(open_dm: str) -> str:
    text = str(open_dm or "").strip()
    if not text:
        return ""
    m = re.search(r"conversation_id=([^&#\s]+)", text)
    if m:
        return m.group(1)
    m = re.search(r"(?:/i/chat/|/messages/)(\d+-\d+)", text)
    if m:
        return m.group(1)
    return ""


class XDmSender:
    def __init__(self) -> None:
        self.token_data = load_token_data()
        ensure_send_scope(self.token_data)
        self.token = str(self.token_data.get("access_token") or "").strip()
        self._robert_id: str | None = None

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }

    def _request(self, method: str, path: str, **kwargs) -> httpx.Response:
        url = path if path.startswith("http") else f"{API_BASE}{path}"
        resp = httpx.request(method, url, headers=self._headers(), timeout=30, **kwargs)
        if resp.status_code == 401 and self.token_data.get("refresh_token"):
            self.token_data = refresh_access_token(self.token_data)
            ensure_send_scope(self.token_data)
            self.token = str(self.token_data.get("access_token") or "").strip()
            resp = httpx.request(method, url, headers=self._headers(), timeout=30, **kwargs)
        return resp

    def robert_user_id(self) -> str:
        if self._robert_id:
            return self._robert_id
        env_id = str(os.environ.get("ROBERT_X_USER_ID") or "").strip()
        if env_id and re.fullmatch(r"\d+", env_id):
            self._robert_id = env_id
            return env_id
        resp = self._request("GET", "/users/me", params={"user.fields": "id,username"})
        if resp.status_code >= 400:
            raise RuntimeError(f"Could not resolve Robert user id: {resp.status_code} {resp.text[:300]}")
        data = (resp.json() or {}).get("data") or {}
        rid = str(data.get("id") or "").strip()
        if not rid:
            raise RuntimeError("X /users/me returned no id")
        self._robert_id = rid
        return rid

    def resolve_user_id_by_username(self, username: str) -> str:
        handle = clean_handle(username)
        if not handle:
            return ""
        resp = self._request("GET", f"/users/by/username/{handle}", params={"user.fields": "id,username"})
        if resp.status_code == 404:
            return ""
        if resp.status_code >= 400:
            raise RuntimeError(f"X user lookup failed for @{handle}: {resp.status_code} {resp.text[:300]}")
        data = (resp.json() or {}).get("data") or {}
        return str(data.get("id") or "").strip()

    def resolve_participant_id(
        self,
        *,
        participant_id: str = "",
        open_dm: str = "",
        x_handle: str = "",
        conversation_id: str = "",
    ) -> tuple[str, str]:
        """Return (participant_id, conversation_id_hint)."""
        pid = str(participant_id or "").strip()
        if pid and re.fullmatch(r"\d+", pid):
            return pid, str(conversation_id or extract_conversation_id(open_dm) or "")

        from_open = extract_participant_id_from_open_dm(open_dm)
        if from_open:
            # If open_dm is a-b pair including Robert, pick the other side.
            pair = extract_conversation_id(open_dm)
            if pair and "-" in pair:
                parts = pair.split("-", 1)
                try:
                    robert = self.robert_user_id()
                    if parts[0] == robert:
                        return parts[1], pair
                    if parts[1] == robert:
                        return parts[0], pair
                except Exception:
                    pass
            return from_open, pair or str(conversation_id or "")

        handle = clean_handle(x_handle)
        if handle:
            uid = self.resolve_user_id_by_username(handle)
            if uid:
                return uid, str(conversation_id or extract_conversation_id(open_dm) or "")

        raise RuntimeError(
            "Could not resolve X recipient. Need open_dm with recipient_id, "
            "or an x handle (e.g. @username) on the lead."
        )

    def send_text(
        self,
        text: str,
        *,
        participant_id: str = "",
        open_dm: str = "",
        x_handle: str = "",
        conversation_id: str = "",
    ) -> dict[str, Any]:
        body = str(text or "").strip()
        if not body:
            raise RuntimeError("DM text is empty.")
        if len(body) > 10000:
            raise RuntimeError("DM text is too long (max ~10k characters).")

        pid, conv_hint = self.resolve_participant_id(
            participant_id=participant_id,
            open_dm=open_dm,
            x_handle=x_handle,
            conversation_id=conversation_id,
        )

        payload = {"text": body}
        # Prefer one-to-one by participant (creates or continues the thread).
        resp = self._request("POST", f"/dm_conversations/with/{pid}/messages", json=payload)
        if resp.status_code in (200, 201):
            data = (resp.json() or {}).get("data") or {}
            return {
                "ok": True,
                "participant_id": pid,
                "dm_conversation_id": data.get("dm_conversation_id") or conv_hint or "",
                "dm_event_id": data.get("dm_event_id") or "",
                "text": body,
                "via": "participant",
            }

        # Fallback: existing conversation id when participant route fails (e.g. encrypted chat edge cases).
        conv = str(conversation_id or conv_hint or "").strip()
        if conv and resp.status_code in (400, 403, 404):
            resp2 = self._request("POST", f"/dm_conversations/{conv}/messages", json=payload)
            if resp2.status_code in (200, 201):
                data = (resp2.json() or {}).get("data") or {}
                return {
                    "ok": True,
                    "participant_id": pid,
                    "dm_conversation_id": data.get("dm_conversation_id") or conv,
                    "dm_event_id": data.get("dm_event_id") or "",
                    "text": body,
                    "via": "conversation",
                }
            detail = resp2.text[:400]
            raise RuntimeError(f"X DM send failed ({resp2.status_code}): {detail}")

        detail = resp.text[:400]
        if resp.status_code == 403 and "dm.write" in detail.lower():
            raise RuntimeError(
                "X rejected send — token lacks dm.write or app is Read-only. "
                "Enable Read and write DMs, then re-run x_oauth_setup.py."
            )
        raise RuntimeError(f"X DM send failed ({resp.status_code}): {detail}")


def send_x_dm_request(payload: dict[str, Any]) -> dict[str, Any]:
    """Brief-server entrypoint. Expects text + lead fields or explicit ids."""
    if not isinstance(payload, dict):
        return {"ok": False, "error": "Invalid payload."}

    lead = payload.get("lead") if isinstance(payload.get("lead"), dict) else {}
    text = str(payload.get("text") or payload.get("draft") or lead.get("templateDraft") or "").strip()
    open_dm = str(
        payload.get("open_dm")
        or payload.get("xOpenDm")
        or lead.get("xOpenDm")
        or lead.get("open_dm")
        or lead.get("openDm")
        or ""
    ).strip()
    x_handle = str(
        payload.get("x_handle")
        or payload.get("xHandle")
        or lead.get("xHandle")
        or lead.get("x_username")
        or lead.get("xUsername")
        or ""
    ).strip()
    participant_id = str(
        payload.get("participant_id")
        or payload.get("recipient_id")
        or lead.get("xUserId")
        or lead.get("x_user_id")
        or ""
    ).strip()
    conversation_id = str(
        payload.get("conversation_id")
        or payload.get("dm_conversation_id")
        or lead.get("dmConversationId")
        or ""
    ).strip()
    lead_id = str(payload.get("lead_id") or lead.get("id") or "").strip()
    contact = str(payload.get("contact_name") or lead.get("contactName") or lead.get("brand") or "").strip()

    if not text:
        return {"ok": False, "error": "No DM text to send."}

    try:
        sender = XDmSender()
        result = sender.send_text(
            text,
            participant_id=participant_id,
            open_dm=open_dm,
            x_handle=x_handle,
            conversation_id=conversation_id,
        )
        result["lead_id"] = lead_id
        result["contact_name"] = contact
        result["x_handle"] = clean_handle(x_handle)
        return result
    except Exception as exc:
        return {"ok": False, "error": str(exc), "lead_id": lead_id}


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Send an X DM as Robert (approve path).")
    parser.add_argument("--text", required=True, help="DM body to send")
    parser.add_argument("--handle", default="", help="@username")
    parser.add_argument("--open-dm", default="", help="xOpenDm URL")
    parser.add_argument("--participant-id", default="", help="X user id")
    parser.add_argument("--dry-run", action="store_true", help="Resolve target only, do not send")
    args = parser.parse_args()

    try:
        sender = XDmSender()
        if args.dry_run:
            pid, conv = sender.resolve_participant_id(
                participant_id=args.participant_id,
                open_dm=args.open_dm,
                x_handle=args.handle,
            )
            print(json.dumps({"ok": True, "dry_run": True, "participant_id": pid, "conversation_id": conv}, indent=2))
            return 0
        result = sender.send_text(
            args.text,
            participant_id=args.participant_id,
            open_dm=args.open_dm,
            x_handle=args.handle,
        )
        print(json.dumps(result, indent=2))
        return 0
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
