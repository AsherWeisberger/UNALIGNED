#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import email.utils
import json
import os
import re
import urllib.request
from datetime import datetime, timedelta, timezone
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

import google.auth.transport.requests
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build


ROOT = Path("/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES")
STATE_DIR = Path.home() / ".config" / "google-credentials"
STATE_FILE = STATE_DIR / "robert_handoff_operator_state.json"
LOG_FILE = STATE_DIR / "robert_handoff_operator.log"
PREVIEW_FILE = STATE_DIR / "robert_handoff_operator_preview.json"
ROBERT_CANDIDATES = STATE_DIR / "robert_codex_latest_candidates.json"
ROBERT_DUMP = STATE_DIR / "robert_codex_latest_gmail_dump.json"
X_INTAKE = ROOT / "flow-v4" / "assets" / "x_dm_daily_intake.json"
ENV_FILE = STATE_DIR / "unaligned-scraper.env"
LOCAL_LLM_BASE_URL = os.environ.get("ROBERT_HANDOFF_LLM_BASE_URL", "http://127.0.0.1:8000/v1")
LOCAL_LLM_MODEL = os.environ.get("ROBERT_HANDOFF_LLM_MODEL", "qwen3.5-9b-4bit")

TEAM_EMAILS = {
    "scobleizer@gmail.com",
    "asherunaligned@gmail.com",
    "unalignedx@gmail.com",
    "samlevin@mac.com",
}
CC_EMAILS = ["asherunaligned@gmail.com", "unalignedx@gmail.com"]
SEND_SCOPES = ["https://www.googleapis.com/auth/gmail.send"]
NOISE_SUBJECT_FRAGMENTS = (
    "invitation from an unknown sender",
    "home energy report",
    "calendar invitation",
    "your solar",
    "receipt",
    "invoice paid",
    "password",
    "security alert",
)
HIGH_INTENT_FRAGMENTS = (
    "collab",
    "collaboration",
    "sponsor",
    "sponsorship",
    "partner",
    "partnership",
    "campaign",
    "interview",
    "podcast",
    "newsletter",
    "promote",
    "launch",
    "feature",
    "quote repost",
    "pricing",
    "rates",
    "budget",
)

CLIENT_SECRET_FILE = Path(
    os.environ.get(
        "ROBERT_GOOGLE_CLIENT_SECRET_FILE",
        str(STATE_DIR / "client_secret_robert_desktop.json"),
    )
)
if not CLIENT_SECRET_FILE.exists():
    CLIENT_SECRET_FILE = Path(
        os.environ.get(
            "GOOGLE_CLIENT_SECRET_FILE",
            str(STATE_DIR / "client_secret.json"),
        )
    )

SEND_TOKEN_FILE = Path(
    os.environ.get(
        "ROBERT_GMAIL_SEND_TOKEN_FILE",
        str(STATE_DIR / "gmail-token-robert.json"),
    )
)


def log(msg: str) -> None:
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"{stamp} {msg}"
    print(line, flush=True)
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        with LOG_FILE.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except Exception:
        pass


def read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def load_env() -> None:
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export "):].strip()
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def parse_emails(raw: str) -> list[str]:
    return [
        addr.lower().strip()
        for _name, addr in email.utils.getaddresses([raw or ""])
        if addr and "@" in addr
    ]


def display_name(raw: str) -> str:
    name, addr = email.utils.parseaddr(raw or "")
    name = (name or "").strip().strip('"').strip()
    if name:
        return name
    if addr and "@" in addr:
        return addr.split("@", 1)[0]
    return ""


def is_team_email(addr: str) -> bool:
    return addr.lower().strip() in TEAM_EMAILS


def external_emails(raw: str) -> list[str]:
    seen: list[str] = []
    for addr in parse_emails(raw):
        if is_team_email(addr):
            continue
        if addr not in seen:
            seen.append(addr)
    return seen


def parse_dt(value: str) -> datetime | None:
    if not value:
        return None
    try:
        if value.endswith("Z"):
            value = value[:-1] + "+00:00"
        return datetime.fromisoformat(value)
    except Exception:
        try:
            return email.utils.parsedate_to_datetime(value)
        except Exception:
            return None


def body_text(msg: dict[str, Any]) -> str:
    return str(msg.get("body") or msg.get("snippet") or "").strip()


def thread_has_handoff(thread: list[dict[str, Any]]) -> bool:
    text = " ".join(body_text(msg) for msg in thread).lower()
    return (
        "asher" in text
        and ("sam levin" in text or "unalignedx@gmail.com" in text or "samlevin@mac.com" in text)
    )


def latest_message(thread: list[dict[str, Any]]) -> dict[str, Any] | None:
    return thread[-1] if thread else None


def latest_inbound(thread: list[dict[str, Any]]) -> dict[str, Any] | None:
    for msg in reversed(thread):
        sender = parse_emails(str(msg.get("from") or ""))
        if sender and not is_team_email(sender[0]):
            return msg
    return None


def load_gmail_send_service(interactive: bool) -> Any | None:
    creds = None
    if SEND_TOKEN_FILE.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(SEND_TOKEN_FILE), SEND_SCOPES)
        except Exception:
            creds = None
    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(google.auth.transport.requests.Request())
            SEND_TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
        except Exception:
            creds = None
    if not creds and interactive:
        flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRET_FILE), SEND_SCOPES)
        creds = flow.run_local_server(port=0)
        SEND_TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
    if not creds:
        return None
    return build("gmail", "v1", credentials=creds)


def create_mime_message(
    to_emails: list[str],
    subject: str,
    body: str,
    cc: list[str] | None = None,
    reply_to_message_id: str | None = None,
) -> dict[str, str]:
    msg = MIMEText(body)
    msg["to"] = ", ".join(to_emails)
    msg["subject"] = subject
    if cc:
        msg["cc"] = ", ".join(cc)
    if reply_to_message_id:
        msg["In-Reply-To"] = reply_to_message_id
        msg["References"] = reply_to_message_id
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    return {"raw": raw}


def robert_signature() -> str:
    return (
        "Robert Scoble\n"
        "Founder, Unaligned\n"
        "scobleizer@gmail.com\n"
        "https://x.com/scobleizer\n"
        "https://unaligned.io"
    )


def greeting(name: str) -> str:
    cleaned = (name or "").strip()
    if not cleaned:
        return "Hi,"
    first = re.split(r"\s+|[|/@]", cleaned)[0].strip(",")
    return f"Hi {first},"


def compact(text: str, limit: int = 900) -> str:
    cleaned = re.sub(r"\s+", " ", str(text or "").strip())
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 1].rstrip() + "..."


def latest_external_excerpt(thread: list[dict[str, Any]]) -> str:
    inbound = latest_inbound(thread)
    if not inbound:
        return ""
    body = body_text(inbound)
    subject = str(inbound.get("subject") or "").strip()
    sender = str(inbound.get("from") or "").strip()
    return compact(f"From: {sender}\nSubject: {subject}\nMessage: {body}", 1200)


def normalize_subject(subject: str, fallback: str) -> str:
    subject = str(subject or "").strip()
    if not subject:
        subject = fallback
    return subject if subject.lower().startswith("re:") else f"Re: {subject}"


def call_local_json(prompt: str) -> dict[str, Any] | None:
    try:
        payload = json.dumps(
            {
                "model": LOCAL_LLM_MODEL,
                "messages": [
                    {"role": "system", "content": "You write short natural business emails and return strict JSON only."},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.35,
                "max_tokens": 350,
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            f"{LOCAL_LLM_BASE_URL.rstrip('/')}/chat/completions",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=35) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        text = ((((data.get("choices") or [{}])[0]).get("message") or {}).get("content") or "").strip()
        if "```" in text:
            for part in text.split("```"):
                part = part.strip()
                if part.startswith("json"):
                    part = part[4:].strip()
                if part.startswith("{"):
                    text = part
                    break
        return json.loads(text)
    except Exception as exc:
        log(f"Local handoff draft failed: {exc}")
        return None


def handoff_prompt(kind: str, contact_name: str, company_hint: str, context: str) -> str:
    return f"""Write a short first handoff email as Robert Scoble.

Goal:
- respond naturally to the lead's actual request
- acknowledge what they are asking about
- sound human, warm, and specific
- loop in Asher Weisberger as Client Services Manager
- loop in Sam Levin as Robert's business partner at UNALIGNED
- make clear Asher will take it from here on details

Rules:
- do not sound like a bot or template
- do not over-explain
- do not invent facts
- do not promise dates, pricing, or deliverables
- under 120 words before signature
- no em dashes

Return strict JSON:
{{
  "subject": "email subject",
  "body": "email body ending right before the signature"
}}

Lead type: {kind}
Contact name: {contact_name}
Company hint: {company_hint}
Context:
{context}
"""


def build_contextual_handoff(
    *,
    kind: str,
    contact_name: str,
    subject: str,
    company_hint: str,
    context: str,
) -> dict[str, str]:
    drafted = call_local_json(handoff_prompt(kind, contact_name, company_hint, context))
    if drafted and drafted.get("body"):
        body = drafted["body"].strip()
        subject_line = normalize_subject(str(drafted.get("subject") or subject), subject or company_hint or "Collaboration")
        return {"subject": subject_line, "body": f"{body}\n\n{robert_signature()}"}

    return {
        "subject": normalize_subject(subject, company_hint or "Collaboration"),
        "body": (
            f"{greeting(contact_name)}\n\n"
            "Thanks for reaching out.\n\n"
            "Looping in Asher Weisberger, my Client Services Manager, and Sam Levin, my business partner at UNALIGNED, here so we can get the collaboration details moving. "
            "Asher will take it from here and help with the next steps.\n\n"
            f"{robert_signature()}"
        ),
    }


def build_gmail_handoff_body(contact_name: str, subject: str) -> str:
    return (
        f"{greeting(contact_name)}\n\n"
        "Thanks for reaching out.\n\n"
        "Looping in Asher Weisberger, my Client Services Manager, and Sam Levin, my business partner at UNALIGNED, here so we can get the collaboration details moving. "
        "Asher will take it from here and help with the next steps.\n\n"
        f"{robert_signature()}"
    )


def build_x_handoff_body(contact_name: str, x_name: str) -> str:
    ref = x_name.strip() or contact_name.strip()
    opener = "Thanks for reaching out on X."
    if ref:
        opener = f"Thanks for reaching out on X about {ref}."
    return (
        f"{greeting(contact_name or x_name)}\n\n"
        f"{opener}\n\n"
        "Looping in Asher Weisberger, my Client Services Manager, and Sam Levin, my business partner at UNALIGNED, here so we can get the collaboration details moving. "
        "Asher will take it from here and help with the next steps.\n\n"
        f"{robert_signature()}"
    )


def gmail_thread_external_contacts(thread: list[dict[str, Any]]) -> set[str]:
    contacts: set[str] = set()
    for msg in thread:
        for addr in parse_emails(str(msg.get("from") or "")):
            if not is_team_email(addr):
                contacts.add(addr)
        for addr in parse_emails(" ".join([str(msg.get("to") or ""), str(msg.get("cc") or "")])):
            if not is_team_email(addr):
                contacts.add(addr)
    return contacts


def build_recent_gmail_contact_index() -> set[str]:
    dump = read_json(ROBERT_DUMP, {})
    contacts: set[str] = set()
    for record in dump.get("records", []):
        thread = record.get("thread") or []
        contacts.update(gmail_thread_external_contacts(thread))
    return contacts


def load_state() -> dict[str, Any]:
    state = read_json(STATE_FILE, {"gmail": {}, "x": {}})
    if not isinstance(state.get("gmail"), dict):
        state["gmail"] = {}
    if not isinstance(state.get("x"), dict):
        state["x"] = {}
    return state


def save_state(state: dict[str, Any]) -> None:
    write_json(STATE_FILE, state)


def collect_gmail_targets(state: dict[str, Any]) -> list[dict[str, Any]]:
    payload = read_json(ROBERT_CANDIDATES, {})
    targets: list[dict[str, Any]] = []
    for record in payload.get("records", []):
        thread = record.get("thread") or []
        if not thread:
            continue
        latest = latest_message(thread)
        inbound = latest_inbound(thread)
        if not latest or not inbound or latest is not inbound:
            continue
        email_meta = record.get("email") or {}
        subject = str(email_meta.get("subject") or "Collaboration")
        latest_text = latest_external_excerpt(thread).lower()
        if any(fragment in subject.lower() for fragment in NOISE_SUBJECT_FRAGMENTS):
            continue
        if not any(fragment in (subject + " " + latest_text).lower() for fragment in HIGH_INTENT_FRAGMENTS):
            continue
        thread_id = str(email_meta.get("gmail_thread_id") or "")
        if not thread_id or thread_id in state["gmail"]:
            continue
        if record.get("already_has_card"):
            continue
        if thread_has_handoff(thread):
            continue
        target_emails = sorted(gmail_thread_external_contacts(thread))
        if not target_emails:
            continue
        targets.append(
            {
                "kind": "gmail",
                "thread_id": thread_id,
                "to_emails": target_emails,
                "contact_name": display_name(str(email_meta.get("from") or "")),
                "subject": subject,
                "reply_message_id": inbound.get("message_id"),
                "context": latest_external_excerpt(thread),
                "company_hint": str(email_meta.get("subject") or ""),
            }
        )
    return targets


def parse_x_contact_emails(raw: str) -> list[str]:
    emails: list[str] = []
    for part in re.split(r"[,\s;]+", raw or ""):
        value = part.strip().strip(",")
        if not value or "@" not in value:
            continue
        value = value.lower()
        if is_team_email(value):
            continue
        if value not in emails:
            emails.append(value)
    return emails


def collect_x_targets(state: dict[str, Any], max_age_days: int, limit: int, gmail_contacts: set[str]) -> list[dict[str, Any]]:
    rows = read_json(X_INTAKE, [])
    now = datetime.now(timezone.utc)
    targets: list[dict[str, Any]] = []
    seen_keys: set[str] = set()
    for row in rows:
        emails = parse_x_contact_emails(str(row.get("contactEmails") or ""))
        if not emails:
            continue
        newest = str(row.get("newestDmDate") or "")
        newest_dt = parse_dt(newest)
        if newest_dt:
            age_days = (now - newest_dt.astimezone(timezone.utc)).total_seconds() / 86400
            if age_days > max_age_days:
                continue
        key = str(row.get("openDm") or "") or "|".join(emails)
        if key in state["x"] or key in seen_keys:
            continue
        if row.get("alreadyEmailedInRobertGmail"):
            continue
        if any(email in gmail_contacts for email in emails):
            continue
        summary = str(row.get("summaryForTeam") or "").lower()
        if "sent an email" in summary or "emailed" in summary:
            continue
        seen_keys.add(key)
        context = compact(
            " ".join(
                filter(
                    None,
                    [
                        str(row.get("summaryForTeam") or ""),
                        str(row.get("lastLeadMessage") or ""),
                        str(row.get("leadType") or ""),
                    ],
                )
            ),
            1400,
        )
        targets.append(
            {
                "kind": "x",
                "key": key,
                "to_emails": emails,
                "contact_name": str(row.get("xName") or ""),
                "x_name": str(row.get("xName") or ""),
                "subject": f"Following up from X re: {str(row.get('xName') or 'collaboration')}",
                "context": context,
                "company_hint": str(row.get("xName") or ""),
            }
        )
        if len(targets) >= limit:
            break
    return targets


def mark_x_asset_sent(sent_keys: set[str]) -> None:
    rows = read_json(X_INTAKE, [])
    changed = False
    for row in rows:
        key = str(row.get("openDm") or "") or "|".join(parse_x_contact_emails(str(row.get("contactEmails") or "")))
        if key and key in sent_keys and not row.get("alreadyEmailedInRobertGmail"):
            row["alreadyEmailedInRobertGmail"] = True
            changed = True
    if changed:
        write_json(X_INTAKE, rows)


def build_target_draft(target: dict[str, Any]) -> dict[str, str]:
    if target["kind"] == "gmail":
        return build_contextual_handoff(
            kind="gmail",
            contact_name=target["contact_name"],
            subject=target["subject"],
            company_hint=target.get("company_hint") or "",
            context=target.get("context") or "",
        )
    return build_contextual_handoff(
        kind="x",
        contact_name=target["contact_name"],
        subject=target["subject"],
        company_hint=target.get("company_hint") or "",
        context=target.get("context") or "",
    )


def contextual_opening(kind: str, context: str, company_hint: str) -> str:
    text = (context or "").lower()
    company = (company_hint or "").strip()
    if "interview" in text or "podcast" in text:
        ref = f" about {company}" if company else ""
        return f"Thanks for reaching out{ref}. This sounds like a good fit to keep moving."
    if "sponsor" in text or "collab" in text or "campaign" in text or "partnership" in text:
        ref = f" on {company}" if company else ""
        return f"Thanks for reaching out{ref}. Appreciate you thinking of me for the collaboration."
    if "product" in text or "demo" in text or "launch" in text or "feature" in text:
        ref = f" around {company}" if company else ""
        return f"Thanks for sending this over{ref}. Happy to get the right people looped in."
    if kind == "x":
        return "Thanks for reaching out on X. Happy to move this over to email and get the details going."
    return "Thanks for reaching out. Happy to get the right people looped in on this."


def send_target(send_service: Any, target: dict[str, Any], draft: dict[str, str], dry_run: bool) -> tuple[bool, str]:
    if target["kind"] == "gmail":
        payload = create_mime_message(
            target["to_emails"],
            draft["subject"],
            draft["body"],
            cc=CC_EMAILS,
            reply_to_message_id=target.get("reply_message_id"),
        )
    else:
        payload = create_mime_message(target["to_emails"], draft["subject"], draft["body"], cc=CC_EMAILS)

    if dry_run:
        return True, "dry-run"
    send_service.users().messages().send(userId="me", body=payload).execute()
    return True, "sent"


def main() -> None:
    parser = argparse.ArgumentParser(description="Send Robert handoff emails that loop in Asher + Sam.")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--auth", action="store_true", help="Run interactive Gmail send auth for Robert.")
    parser.add_argument("--gmail-limit", type=int, default=10)
    parser.add_argument("--x-limit", type=int, default=15)
    parser.add_argument("--x-max-age-days", type=int, default=3)
    parser.add_argument("--preview-out", default=str(PREVIEW_FILE))
    parser.add_argument("--ignore-state", action="store_true")
    args = parser.parse_args()

    load_env()

    state = load_state()
    if args.ignore_state:
        state = {"gmail": {}, "x": {}}
    send_service = None if args.dry_run else load_gmail_send_service(interactive=args.auth)
    if not args.dry_run and not send_service:
        log("Robert Gmail send service unavailable. Run with --auth once if needed.")
        return

    gmail_contacts = build_recent_gmail_contact_index()
    gmail_targets = collect_gmail_targets(state)[: args.gmail_limit]
    x_targets = collect_x_targets(state, args.x_max_age_days, args.x_limit, gmail_contacts)
    all_targets = gmail_targets + x_targets

    log(f"Robert handoff operator starting — gmail={len(gmail_targets)} x={len(x_targets)}")

    sent_x_keys: set[str] = set()
    sent_count = 0
    previews: list[dict[str, Any]] = []
    for idx, target in enumerate(all_targets, start=1):
        draft = build_target_draft(target)
        previews.append(
            {
                "kind": target["kind"],
                "to_emails": target["to_emails"],
                "subject": draft["subject"],
                "body": draft["body"],
                "context": target.get("context") or "",
            }
        )
        ok, reason = send_target(send_service, target, draft, args.dry_run)
        label = ", ".join(target["to_emails"])
        log(f"[{idx}/{len(all_targets)}] {target['kind']} -> {label} ({reason})")
        if not ok:
            continue
        sent_count += 1
        stamp = datetime.now(timezone.utc).isoformat()
        if args.dry_run:
            continue
        if target["kind"] == "gmail":
            state["gmail"][target["thread_id"]] = {
                "sent_at": stamp,
                "to_emails": target["to_emails"],
                "subject": target["subject"],
            }
        else:
            state["x"][target["key"]] = {
                "sent_at": stamp,
                "to_emails": target["to_emails"],
                "subject": target["subject"],
            }
            sent_x_keys.add(target["key"])

    if sent_x_keys and not args.dry_run:
        mark_x_asset_sent(sent_x_keys)
    if not args.dry_run:
        save_state(state)
    write_json(Path(args.preview_out), {"generated_at": datetime.now(timezone.utc).isoformat(), "dry_run": args.dry_run, "drafts": previews})
    log(f"Done — sent={sent_count} total_targets={len(all_targets)} dry_run={args.dry_run}")


if __name__ == "__main__":
    main()
