#!/usr/bin/env python3
"""Browser-facing server for Deal Brain reads (Company OS panel), port 8788.

Serves the JSON files deal_brain_sync.py writes. Read-only, localhost.
  GET /health            -> {ok, count}
  GET /brain             -> {reads: {card_id: read, ...}}
  GET /brain/<card_id>   -> one read or 404
"""
from __future__ import annotations

import json
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

LIVE_DIR = Path.home() / ".config" / "google-credentials" / "deal_brain" / "live"
HOST = os.environ.get("DEAL_BRAIN_SERVER_HOST", "127.0.0.1")
PORT = int(os.environ.get("DEAL_BRAIN_SERVER_PORT", "8788"))
SAFE_ID = re.compile(r"^[A-Za-z0-9_\-]{1,80}$")


class Handler(BaseHTTPRequestHandler):
    server_version = "UNALIGNED-DealBrain/1.0"

    def log_message(self, fmt: str, *args) -> None:
        print(f"[deal-brain-server] {self.address_string()} {fmt % args}")

    def _cors(self) -> None:
        origin = self.headers.get("Origin") or "*"
        self.send_header("Access-Control-Allow-Origin", origin if origin else "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Vary", "Origin, Access-Control-Request-Private-Network")
        if str(self.headers.get("Access-Control-Request-Private-Network") or "").lower() == "true":
            self.send_header("Access-Control-Allow-Private-Network", "true")

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:
        path = self.path.split("?")[0].rstrip("/")
        if path == "/health":
            n = len(list(LIVE_DIR.glob("*.json"))) if LIVE_DIR.exists() else 0
            self._json(200, {"ok": True, "count": n})
            return
        if path == "/brain":
            reads = {}
            if LIVE_DIR.exists():
                for f in LIVE_DIR.glob("*.json"):
                    try:
                        reads[f.stem] = json.loads(f.read_text())
                    except (json.JSONDecodeError, OSError):
                        continue
            self._json(200, {"reads": reads})
            return
        m = re.match(r"^/brain/([^/]+)$", path)
        if m and SAFE_ID.match(m.group(1)):
            f = LIVE_DIR / f"{m.group(1)}.json"
            if f.exists():
                try:
                    self._json(200, json.loads(f.read_text()))
                    return
                except (json.JSONDecodeError, OSError):
                    pass
            self._json(404, {"error": "no read for that card"})
            return
        self._json(404, {"error": "unknown path"})


def main() -> None:
    LIVE_DIR.mkdir(parents=True, exist_ok=True)
    print(f"[deal-brain-server] serving {LIVE_DIR} on http://{HOST}:{PORT}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
