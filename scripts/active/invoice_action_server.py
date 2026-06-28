#!/usr/bin/env python3
"""
Local invoice action server for the Flow v4 invoice page.

Run this on the Mac that owns the invoice folders. The browser can then call
POST http://127.0.0.1:8765/complete-invoice to move an invoice file from
OUTSTANDING into DONE and refresh the invoice page data.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote


HOST = "127.0.0.1"
PORT = 8765
ROOT = Path("/Users/asherweisberger/Desktop/UNALIGNED")
INVOICE_ROOT = ROOT / "INVOICES"
DONE_DIR = INVOICE_ROOT / "DONE"
SYNC_SCRIPT = ROOT / "MASTER FILES" / "scripts" / "active" / "sync_invoice_page.py"


def response(handler: BaseHTTPRequestHandler, status: int, payload: dict) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def safe_invoice_path(source_dir: str, filename: str) -> Path:
    source_dir = unquote(str(source_dir or "")).strip().strip("/")
    filename = unquote(str(filename or "")).strip()

    if not source_dir.startswith("OUTSTANDING"):
        raise ValueError("Only outstanding invoices can be completed.")
    if "/" in filename or "\\" in filename or not filename:
        raise ValueError("Invalid invoice filename.")

    source = (INVOICE_ROOT / source_dir / filename).resolve()
    invoice_root = INVOICE_ROOT.resolve()
    if invoice_root not in source.parents:
        raise ValueError("Invoice path is outside the invoice folder.")
    if not source.exists() or not source.is_file():
        raise FileNotFoundError(f"Invoice file not found: {filename}")
    if source.suffix.lower() not in {".pdf", ".html", ".htm"}:
        raise ValueError("Only PDF and HTML invoice files can be completed.")

    return source


def unique_done_path(filename: str) -> Path:
    DONE_DIR.mkdir(parents=True, exist_ok=True)
    candidate = DONE_DIR / filename
    if not candidate.exists():
        return candidate

    stem = candidate.stem
    suffix = candidate.suffix
    for index in range(2, 1000):
        next_candidate = DONE_DIR / f"{stem}_{index}{suffix}"
        if not next_candidate.exists():
            return next_candidate
    raise RuntimeError("Could not find a unique DONE filename.")


def run_sync() -> None:
    subprocess.run(["python3", str(SYNC_SCRIPT)], check=True, capture_output=True, text=True)


class InvoiceActionHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:
        response(self, 204, {})

    def do_POST(self) -> None:
        if self.path != "/complete-invoice":
            response(self, 404, {"ok": False, "error": "Unknown endpoint."})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            source = safe_invoice_path(payload.get("sourceDir", ""), payload.get("file", ""))
            destination = unique_done_path(source.name)
            shutil.move(str(source), str(destination))
            run_sync()
            response(
                self,
                200,
                {
                    "ok": True,
                    "file": destination.name,
                    "from": str(source),
                    "to": str(destination),
                },
            )
        except Exception as exc:
            response(self, 400, {"ok": False, "error": str(exc)})

    def log_message(self, format: str, *args) -> None:
        print(format % args)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), InvoiceActionHandler)
    print(f"Invoice action server listening at http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
