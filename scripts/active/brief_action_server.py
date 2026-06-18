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
        if self.path != "/generate-brief":
            send_json(self, 404, {"ok": False, "error": "Unknown endpoint."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            output = generate_pdf(payload)
            send_json(
                self,
                200,
                {
                    "ok": True,
                    "path": str(output),
                    "filename": output.name,
                    "url": f"http://{HOST}:{PORT}/files/{output.name}",
                },
            )
        except Exception as exc:
            send_json(self, 400, {"ok": False, "error": str(exc)})

    def log_message(self, format: str, *args) -> None:
        print(format % args)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), BriefActionHandler)
    print(f"Brief action server listening at http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
