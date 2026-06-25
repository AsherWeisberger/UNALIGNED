#!/usr/bin/env python3
"""Browser-facing proxy to local Qwen (Ollama) for Company OS."""

from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from local_llm import LOCAL_MODEL, backend_label, ollama_chat  # noqa: E402

PORT = int(os.environ.get("LOCAL_LLM_BRIDGE_PORT", "8787"))
HOST = os.environ.get("LOCAL_LLM_BRIDGE_HOST", "127.0.0.1")


class BridgeHandler(BaseHTTPRequestHandler):
    server_version = "UNALIGNED-LocalLLM/1.0"

    def log_message(self, fmt: str, *args) -> None:
        print(f"[local-llm-bridge] {self.address_string()} {fmt % args}")

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

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
        path = urlparse(self.path).path
        if path == "/health":
            self._json(200, {
                "ok": True,
                "backend": backend_label(),
                "model": LOCAL_MODEL,
            })
            return
        self._json(404, {"error": "not found"})

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path not in {"/complete", "/v1/chat/completions"}:
            self._json(404, {"error": "not found"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length) if length else b"{}"
            body = json.loads(raw.decode("utf-8") or "{}")
        except Exception as exc:
            self._json(400, {"error": f"invalid json: {exc}"})
            return

        prompt = str(body.get("prompt") or "").strip()
        if not prompt and isinstance(body.get("messages"), list):
            for msg in reversed(body["messages"]):
                if isinstance(msg, dict) and msg.get("content"):
                    prompt = str(msg["content"]).strip()
                    break
        if not prompt:
            self._json(400, {"error": "missing prompt"})
            return

        max_tokens = int(body.get("max_tokens") or 800)
        try:
            text = ollama_chat(prompt, max_tokens=max_tokens, temperature=0.35)
            self._json(200, {"text": text, "model": LOCAL_MODEL})
        except Exception as exc:
            self._json(502, {"error": str(exc)})


def main() -> None:
    httpd = ThreadingHTTPServer((HOST, PORT), BridgeHandler)
    print(f"Local LLM bridge listening on http://{HOST}:{PORT} ({backend_label()})")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("Shutting down local LLM bridge.")


if __name__ == "__main__":
    main()