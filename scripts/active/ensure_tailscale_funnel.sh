#!/usr/bin/env bash
# Keep Tailscale Funnel pointed at the brief server (ops dashboard + god-mode APIs).
set -euo pipefail

if ! command -v tailscale >/dev/null 2>&1; then
  echo "tailscale CLI not found"
  exit 1
fi

if ! tailscale status >/dev/null 2>&1; then
  echo "Tailscale is not running — open the Tailscale app and sign in."
  exit 1
fi

if ! lsof -iTCP:8767 -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  echo "Brief server not listening on 8767 — start com.unaligned.google-docs-brief-server"
  exit 1
fi

tailscale funnel --bg --https=443 http://127.0.0.1:8767
tailscale funnel status
echo "Funnel ready: https://mac-studio.tail50d3a2.ts.net/ops.html"