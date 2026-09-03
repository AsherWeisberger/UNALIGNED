#!/usr/bin/env python3
"""
Approve-and-send X DMs as Robert (Company OS).

Auth (first that can send wins):
  1. OAuth 2.0 user token with dm.write
     ~/.config/google-credentials/x-api-oauth-token.json
  2. OAuth 1.0a user context (API key + access token/secret)
     X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET in x-api.env

Endpoints:
  POST /2/dm_conversations/with/{participant_id}/messages
  POST /2/dm_conversations/{dm_conversation_id}/messages  (fallback)
"""

from __future__ import annotations

import json
import os
import re
import sys
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx

STATE_DIR = Path.home() / ".config/google-credentials"
X_API_ENV = STATE_DIR / "x-api.env"
TOKEN_FILE = STATE_DIR / "x-api-oauth-token.json"
OUTBOUND_AUDIT_FILE = STATE_DIR / "x_dm_outbound_audit.json"
TOKEN_URL = "https://api.x.com/2/oauth2/token"
API_BASE = "https://api.x.com/2"

REQUIRED_SEND_SCOPE = "dm.write"
_AUDIT_LOCK = threading.Lock()


def read_x_dm_outbound_audit(conversation_id: str = "") -> list[dict[str, Any]]:
    data = read_json(OUTBOUND_AUDIT_FILE, [])
    records = data if isinstance(data, list) else []
    conversation_id = str(conversation_id or "").strip()
    if conversation_id:
        records = [row for row in records if str(row.get("conversation_id") or "") == conversation_id]
    return [row for row in records if isinstance(row, dict)]


def record_successful_x_dm(result: dict[str, Any], *, text: str, lead_id: str = "", contact_name: str = "") -> dict[str, Any]:
    """Persist only an API-confirmed outbound DM. Failed/cancelled drafts never reach here."""
    conversation_id = str(result.get("dm_conversation_id") or "").strip()
    event_id = str(result.get("dm_event_id") or "").strip()
    body = str(text or "").strip()
    if not result.get("ok") or not conversation_id or not body:
        raise RuntimeError("Refusing to audit an unconfirmed X DM send.")
    record = {
        "conversation_id": conversation_id,
        "event_id": event_id,
        "text": body,
        "sender": "You",
        "sent_at": datetime.now(timezone.utc).isoformat(),
        "lead_id": str(lead_id or ""),
        "contact_name": str(contact_name or ""),
        "delivery": "confirmed_by_x_api",
    }
    with _AUDIT_LOCK:
        records = read_x_dm_outbound_audit()
        duplicate = next((row for row in records if event_id and str(row.get("event_id") or "") == event_id), None)
        if duplicate:
            return duplicate
        records = (records + [record])[-500:]
        OUTBOUND_AUDIT_FILE.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(prefix="x-dm-audit-", suffix=".json", dir=str(OUTBOUND_AUDIT_FILE.parent))
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(records, handle, indent=2, ensure_ascii=False)
                handle.flush()
                os.fsync(handle.fileno())
            os.chmod(tmp_name, 0o600)
            os.replace(tmp_name, OUTBOUND_AUDIT_FILE)
        finally:
            if os.path.exists(tmp_name):
                os.unlink(tmp_name)
    return record


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
        # Force-load credentials so updates to the env file win over stale process env.
        os.environ[key.strip()] = value.strip().strip('"').strip("'")


def read_json(path: Path, default: Any = None) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def oauth_client_credentials() -> tuple[str, str]:
    client_id = os.environ.get("OAUTH2_CLIENT_ID") or os.environ.get("CLIENT_ID") or ""
    client_secret = os.environ.get("OAUTH2_CLIENT_SECRET") or os.environ.get("CLIENT_SECRET") or ""
    # Expand ${VAR} shell-style references used in x-api.env
    if client_id.startswith("${") and client_id.endswith("}"):
        client_id = os.environ.get(client_id[2:-1], "")
    if client_secret.startswith("${") and client_secret.endswith("}"):
        client_secret = os.environ.get(client_secret[2:-1], "")
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
    if not merged.get("refresh_token") and refresh:
        merged["refresh_token"] = refresh
    TOKEN_FILE.write_text(json.dumps(merged, indent=2), encoding="utf-8")
    TOKEN_FILE.chmod(0o600)
    return merged


def token_scopes(token_data: dict[str, Any]) -> set[str]:
    raw = str(token_data.get("scope") or "")
    return {part.strip() for part in raw.replace(",", " ").split() if part.strip()}


def oauth2_can_send(token_data: dict[str, Any]) -> bool:
    return bool(token_data.get("access_token")) and REQUIRED_SEND_SCOPE in token_scopes(token_data)


def oauth1_credentials() -> dict[str, str] | None:
    load_env()
    api_key = str(os.environ.get("X_API_KEY") or "").strip()
    api_secret = str(os.environ.get("X_API_SECRET") or "").strip()
    access = str(os.environ.get("X_ACCESS_TOKEN") or "").strip()
    access_secret = str(os.environ.get("X_ACCESS_TOKEN_SECRET") or "").strip()
    if api_key and api_secret and access and access_secret:
        return {
            "client_key": api_key,
            "client_secret": api_secret,
            "resource_owner_key": access,
            "resource_owner_secret": access_secret,
        }
    return None


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
    m = re.search(r"(?:recipient_id|user_id|participant_id)=(\d+)", text)
    if m:
        return m.group(1)
    m = re.search(r"(?:/i/chat/|/messages/)(\d+)-(\d+)", text)
    if m:
        a, b = m.group(1), m.group(2)
        return b if len(b) >= len(a) else a
    m = re.search(r"conversation_id=([^&#\s]+)", text)
    if m:
        parts = re.findall(r"\d+", m.group(1))
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
        load_env()
        self.token_data: dict[str, Any] = read_json(TOKEN_FILE, {}) if TOKEN_FILE.exists() else {}
        if not isinstance(self.token_data, dict):
            self.token_data = {}
        self.oauth1 = oauth1_credentials()
        self.auth_mode = ""
        self.token = ""
        self._robert_id: str | None = None
        self._oauth1_session = None

        if oauth2_can_send(self.token_data):
            self.auth_mode = "oauth2"
            self.token = str(self.token_data.get("access_token") or "").strip()
        elif self.oauth1:
            self.auth_mode = "oauth1"
            self._init_oauth1_session()
        elif self.token_data.get("access_token"):
            scopes = " ".join(sorted(token_scopes(self.token_data))) or "none"
            raise RuntimeError(
                "X OAuth2 token is missing dm.write (scopes: "
                + scopes
                + ") and no OAuth1 access token/secret found. "
                "Add X_ACCESS_TOKEN + X_ACCESS_TOKEN_SECRET to x-api.env, "
                "or re-auth with dm.write via x_oauth_setup.py."
            )
        else:
            raise RuntimeError(
                "Missing X credentials for DM send. Add OAuth1 "
                "X_ACCESS_TOKEN + X_ACCESS_TOKEN_SECRET to x-api.env, "
                "or run: python3 scripts/active/x_oauth_setup.py"
            )

    def _init_oauth1_session(self) -> None:
        from requests_oauthlib import OAuth1Session  # type: ignore

        assert self.oauth1
        self._oauth1_session = OAuth1Session(
            self.oauth1["client_key"],
            client_secret=self.oauth1["client_secret"],
            resource_owner_key=self.oauth1["resource_owner_key"],
            resource_owner_secret=self.oauth1["resource_owner_secret"],
        )

    def _request(self, method: str, path: str, **kwargs) -> httpx.Response:
        url = path if path.startswith("http") else f"{API_BASE}{path}"
        method_u = method.upper()
        json_body = kwargs.pop("json", None)
        params = kwargs.pop("params", None)

        if self.auth_mode == "oauth1":
            assert self._oauth1_session is not None
            headers = {"Content-Type": "application/json"}
            resp = self._oauth1_session.request(
                method_u,
                url,
                params=params,
                json=json_body,
                headers=headers,
                timeout=30,
            )
            # Wrap as a lightweight object with httpx-like attrs we use.
            return _CompatResponse(resp)

        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }
        resp = httpx.request(
            method_u,
            url,
            headers=headers,
            params=params,
            json=json_body,
            timeout=30,
        )
        if resp.status_code == 401 and self.token_data.get("refresh_token"):
            self.token_data = refresh_access_token(self.token_data)
            if not oauth2_can_send(self.token_data) and self.oauth1:
                self.auth_mode = "oauth1"
                self._init_oauth1_session()
                return self._request(method, path, params=params, json=json_body)
            self.token = str(self.token_data.get("access_token") or "").strip()
            headers["Authorization"] = f"Bearer {self.token}"
            resp = httpx.request(
                method_u,
                url,
                headers=headers,
                params=params,
                json=json_body,
                timeout=30,
            )
        return resp

    def robert_user_id(self) -> str:
        if self._robert_id:
            return self._robert_id
        env_id = str(os.environ.get("ROBERT_X_USER_ID") or "").strip()
        if env_id and re.fullmatch(r"\d+", env_id):
            self._robert_id = env_id
            return env_id
        # OAuth1 access token is often "{user_id}-…"
        if self.oauth1:
            key = self.oauth1.get("resource_owner_key") or ""
            if "-" in key and key.split("-", 1)[0].isdigit():
                self._robert_id = key.split("-", 1)[0]
                return self._robert_id
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

        # Unify supplies the exact validated stored conversation ID. When it is
        # present, do not let X infer a one-to-one thread from a participant.
        explicit_conv = str(conversation_id or "").strip()
        if explicit_conv:
            if not re.fullmatch(r"\d+-\d+", explicit_conv):
                raise RuntimeError("Invalid X DM conversation ID format.")
            payload = {"text": body}
            exact = self._request("POST", f"/dm_conversations/{explicit_conv}/messages", json=payload)
            if exact.status_code in (200, 201):
                data = (exact.json() or {}).get("data") or {}
                return {
                    "ok": True,
                    "participant_id": "",
                    "dm_conversation_id": data.get("dm_conversation_id") or explicit_conv,
                    "dm_event_id": data.get("dm_event_id") or "",
                    "text": body,
                    "via": "conversation_exact",
                    "auth": self.auth_mode,
                }
            raise RuntimeError(f"X DM exact-conversation send failed ({exact.status_code}): {exact.text[:400]}")

        pid, conv_hint = self.resolve_participant_id(
            participant_id=participant_id,
            open_dm=open_dm,
            x_handle=x_handle,
            conversation_id=conversation_id,
        )

        payload = {"text": body}
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
                "auth": self.auth_mode,
            }

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
                    "auth": self.auth_mode,
                }
            detail = resp2.text[:400]
            raise RuntimeError(f"X DM send failed ({resp2.status_code}): {detail}")

        detail = resp.text[:400]
        if resp.status_code == 403:
            raise RuntimeError(
                "X rejected send (403). App may be Read-only or DMs not enabled for write. "
                f"Auth mode={self.auth_mode}. Detail: {detail}"
            )
        raise RuntimeError(f"X DM send failed ({resp.status_code}): {detail}")


class _CompatResponse:
    """Minimal requests.Response → httpx-like surface used by XDmSender."""

    def __init__(self, resp: Any) -> None:
        self.status_code = int(getattr(resp, "status_code", 0) or 0)
        self.text = str(getattr(resp, "text", "") or "")
        self._resp = resp

    def json(self) -> Any:
        try:
            return self._resp.json()
        except Exception:
            return {}


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
        record_successful_x_dm(result, text=text, lead_id=lead_id, contact_name=contact)
        return result
    except Exception as exc:
        return {"ok": False, "error": str(exc), "lead_id": lead_id}


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Send an X DM as Robert (approve path).")
    parser.add_argument("--text", default="", help="DM body to send")
    parser.add_argument("--handle", default="", help="@username")
    parser.add_argument("--open-dm", default="", help="xOpenDm URL")
    parser.add_argument("--participant-id", default="", help="X user id")
    parser.add_argument("--dry-run", action="store_true", help="Resolve target / verify auth only")
    parser.add_argument("--whoami", action="store_true", help="Print authenticated user")
    args = parser.parse_args()

    try:
        sender = XDmSender()
        if args.whoami or (args.dry_run and not args.text and not args.handle and not args.open_dm and not args.participant_id):
            me = sender._request("GET", "/users/me", params={"user.fields": "id,name,username"})
            print(json.dumps({
                "ok": me.status_code < 400,
                "auth": sender.auth_mode,
                "status": me.status_code,
                "data": (me.json() or {}).get("data") if me.status_code < 400 else None,
                "error": me.text[:300] if me.status_code >= 400 else None,
                "robert_user_id": sender.robert_user_id(),
            }, indent=2))
            return 0 if me.status_code < 400 else 1
        if args.dry_run:
            pid, conv = sender.resolve_participant_id(
                participant_id=args.participant_id,
                open_dm=args.open_dm,
                x_handle=args.handle,
            )
            print(json.dumps({
                "ok": True,
                "dry_run": True,
                "auth": sender.auth_mode,
                "participant_id": pid,
                "conversation_id": conv,
                "robert_user_id": sender.robert_user_id(),
            }, indent=2))
            return 0
        if not args.text:
            print(json.dumps({"ok": False, "error": "--text required unless --dry-run/--whoami"}, indent=2))
            return 2
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
