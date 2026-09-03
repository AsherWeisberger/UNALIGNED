#!/usr/bin/env python3
"""
Local brief action server for Company OS Brief Maker.

POST http://127.0.0.1:8766/generate-brief with a JSON brief config to create
the PDF via the bundled brief creator skill. Generated files are saved in:
  /Users/asherweisberger/Desktop/UNALIGNED/

GET http://127.0.0.1:8766/files/<filename>.pdf serves the generated PDF so the
browser can open it directly.
"""

from __future__ import annotations

import base64
import json
import mimetypes
import subprocess
import tempfile
import urllib.parse
import urllib.request
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote


HOST = "127.0.0.1"
PORT = 8766
OUTPUT_ROOT = Path("/Users/asherweisberger/Desktop/UNALIGNED").resolve()
GENERATOR = Path("/Users/asherweisberger/.codex/skills/brief-creator/scripts/generate_brief.py").resolve()
INVOICE_GENERATOR = Path("/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/invoices/create_invoice.py").resolve()
INVOICE_OUTPUT_DIR = Path("/Users/asherweisberger/Desktop/UNALIGNED/INVOICES/OUTSTANDING").resolve()

_CRED = Path.home() / ".config/google-credentials"
_COMPOSE_TOKENS = {"asher": _CRED / "asher-gmail-compose-token.json",
                   "robert": _CRED / "robert-gmail-compose-token.json"}
_SENDER_EMAIL = {"asher": "asherunaligned@gmail.com", "robert": "scobleizer@gmail.com"}


def _access_token(path: Path) -> str:
    d = json.loads(path.read_text())
    data = urllib.parse.urlencode({
        "client_id": d["client_id"], "client_secret": d["client_secret"],
        "refresh_token": d["refresh_token"], "grant_type": "refresh_token"}).encode()
    req = urllib.request.Request(d.get("token_uri", "https://oauth2.googleapis.com/token"), data=data)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())["access_token"]


def create_reply_draft(payload: dict, pdf_path: Path) -> dict:
    """Create a Gmail DRAFT (never auto-sent) replying on the deal thread with the
    invoice PDF attached. Needs a compose token (run reauth_gmail_compose.py once)."""
    sender_key = str(payload.get("sender") or "asher").lower()
    if sender_key not in _COMPOSE_TOKENS:
        sender_key = "asher"
    tok_path = _COMPOSE_TOKENS[sender_key]
    if not tok_path.exists():
        raise RuntimeError(
            "No Gmail compose token yet. Run once: "
            f"python3 scripts/active/reauth_gmail_compose.py --account {sender_key}")
    access = _access_token(tok_path)

    msg = MIMEMultipart()
    msg["To"] = str(payload.get("to") or payload.get("email") or "")
    if payload.get("cc"):
        msg["Cc"] = str(payload["cc"])
    msg["From"] = _SENDER_EMAIL[sender_key]
    msg["Subject"] = str(payload.get("subject") or "Invoice")
    if payload.get("inReplyTo"):
        msg["In-Reply-To"] = str(payload["inReplyTo"])
        msg["References"] = str(payload["inReplyTo"])
    msg.attach(MIMEText(str(payload.get("body") or "Please find the invoice attached."), "plain"))
    with open(pdf_path, "rb") as f:
        part = MIMEApplication(f.read(), _subtype="pdf")
    part.add_header("Content-Disposition", "attachment", filename=pdf_path.name)
    msg.attach(part)

    draft = {"message": {"raw": base64.urlsafe_b64encode(msg.as_bytes()).decode()}}
    if payload.get("threadId"):
        draft["message"]["threadId"] = str(payload["threadId"])
    req = urllib.request.Request(
        "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
        data=json.dumps(draft).encode(),
        headers={"Authorization": "Bearer " + access, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        res = json.loads(r.read())
    return {"draft_id": res.get("id"), "draft_url": "https://mail.google.com/mail/u/0/#drafts"}


def send_json(handler: BaseHTTPRequestHandler, status: int, payload: dict) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def ensure_config(payload: dict) -> dict:
    if not isinstance(payload, dict):
      raise ValueError("Invalid brief payload.")
    title = str(payload.get("title") or "").strip()
    if not title:
        raise ValueError("Brief title is required.")
    return payload


def generate_pdf(payload: dict) -> Path:
    ensure_config(payload)
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        temp_path = Path(handle.name)
    try:
        result = subprocess.run(
            ["python3", str(GENERATOR), str(temp_path)],
            check=True,
            capture_output=True,
            text=True,
        )
        output = Path(result.stdout.strip()).resolve()
    finally:
        temp_path.unlink(missing_ok=True)

    if OUTPUT_ROOT not in output.parents:
        raise ValueError("Generated PDF landed outside Desktop/UNALIGNED.")
    if not output.exists():
        raise FileNotFoundError("Brief PDF was not created.")
    return output


def generate_invoice(payload: dict) -> Path:
    company = str(payload.get("company") or "").strip()
    if not company:
        raise ValueError("Company name is required.")

    deliverables = str(payload.get("deliverables") or "").strip()
    if not deliverables:
        raise ValueError("Deliverables are required.")

    amount = payload.get("amount")
    try:
        amount = float(amount)
    except (TypeError, ValueError):
        raise ValueError("A valid amount is required.")
    if amount <= 0:
        raise ValueError("Amount must be greater than 0.")

    args = ["python3", str(INVOICE_GENERATOR)]

    name = str(payload.get("name") or "").strip()
    if name:
        args += ["--name", name]

    args += ["--company", company]

    address = str(payload.get("address") or "").strip()
    if address:
        args += ["--address", address]

    email = str(payload.get("email") or "").strip()
    if email:
        args += ["--email", email]

    campaign = str(payload.get("campaign") or "").strip()
    if campaign:
        args += ["--campaign", campaign]

    args += ["--deliverables", deliverables]
    args += ["--amount", str(amount)]

    payment_details = str(payload.get("payment_details") or "").strip()
    if payment_details:
        args += ["--payment-details", payment_details]

    args += ["--output-dir", str(INVOICE_OUTPUT_DIR)]

    result = subprocess.run(args, capture_output=True, text=True)

    for line in result.stdout.splitlines():
        if "PDF saved:" in line:
            path = Path(line.split("PDF saved:", 1)[1].strip()).resolve()
            if path.exists():
                return path

    raise RuntimeError(
        result.stderr.strip() or result.stdout.strip() or "Invoice PDF was not created."
    )


def safe_output_file(name: str) -> Path:
    filename = unquote(name or "").strip()
    if not filename or "/" in filename or "\\" in filename:
        raise ValueError("Invalid brief filename.")
    path = (OUTPUT_ROOT / filename).resolve()
    if OUTPUT_ROOT != path.parent:
        raise ValueError("Brief path is outside Desktop/UNALIGNED.")
    if not path.exists() or not path.is_file():
        raise FileNotFoundError("Brief file not found.")
    return path


class BriefActionHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:
        send_json(self, 204, {})

    def do_GET(self) -> None:
        if self.path.startswith("/invoice-files/"):
            try:
                filename = unquote(self.path.split("/invoice-files/", 1)[1])
                path = (INVOICE_OUTPUT_DIR / filename).resolve()
                if INVOICE_OUTPUT_DIR not in path.parents:
                    raise FileNotFoundError("Not found.")
                if not path.exists() or not path.is_file():
                    raise FileNotFoundError("Invoice file not found.")
                body = path.read_bytes()
                mime, _ = mimetypes.guess_type(str(path))
                self.send_response(200)
                self.send_header("Content-Type", mime or "application/pdf")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except Exception as exc:
                send_json(self, 404, {"ok": False, "error": str(exc)})
            return
        if not self.path.startswith("/files/"):
            send_json(self, 404, {"ok": False, "error": "Unknown endpoint."})
            return
        try:
            path = safe_output_file(self.path.split("/files/", 1)[1])
            body = path.read_bytes()
            mime, _ = mimetypes.guess_type(str(path))
            self.send_response(200)
            self.send_header("Content-Type", mime or "application/pdf")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            send_json(self, 404, {"ok": False, "error": str(exc)})

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8") or "{}"
        try:
            payload = json.loads(raw)
        except Exception:
            send_json(self, 400, {"ok": False, "error": "Invalid JSON."})
            return

        if self.path == "/generate-brief":
            try:
                output = generate_pdf(payload)
                send_json(self, 200, {
                    "ok": True,
                    "path": str(output),
                    "filename": output.name,
                    "url": f"http://{HOST}:{PORT}/files/{output.name}",
                })
            except Exception as exc:
                send_json(self, 400, {"ok": False, "error": str(exc)})
            return

        if self.path == "/generate-invoice":
            try:
                output = generate_invoice(payload)
                send_json(self, 200, {
                    "ok": True,
                    "path": str(output),
                    "filename": output.name,
                    "url": f"http://{HOST}:{PORT}/invoice-files/{output.name}",
                })
            except Exception as exc:
                send_json(self, 400, {"ok": False, "error": str(exc)})
            return

        if self.path == "/invoice-to-draft":
            try:
                output = generate_invoice(payload)
                draft = create_reply_draft(payload, output)
                send_json(self, 200, {
                    "ok": True,
                    "filename": output.name,
                    "url": f"http://{HOST}:{PORT}/invoice-files/{output.name}",
                    **draft,
                })
            except Exception as exc:
                send_json(self, 400, {"ok": False, "error": str(exc)})
            return

        send_json(self, 404, {"ok": False, "error": "Unknown endpoint."})

    def log_message(self, format: str, *args) -> None:
        print(format % args)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), BriefActionHandler)
    print(f"Brief action server listening at http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
