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

import json
import mimetypes
import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote


HOST = "127.0.0.1"
PORT = 8766
OUTPUT_ROOT = Path("/Users/asherweisberger/Desktop/UNALIGNED").resolve()
GENERATOR = Path("/Users/asherweisberger/.codex/skills/brief-creator/scripts/generate_brief.py").resolve()
INVOICE_GENERATOR = Path("/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES/invoices/create_invoice.py").resolve()
INVOICE_OUTPUT_DIR = Path("/Users/asherweisberger/Desktop/UNALIGNED/INVOICES/OUTSTANDING").resolve()


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

        send_json(self, 404, {"ok": False, "error": "Unknown endpoint."})

    def log_message(self, format: str, *args) -> None:
        print(format % args)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), BriefActionHandler)
    print(f"Brief action server listening at http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
