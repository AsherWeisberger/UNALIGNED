#!/usr/bin/env bash
# Local stdio bridge to X hosted MCP (api.x.com/mcp).
# Loads OAuth app credentials from ~/.config/google-credentials/x-api.env
set -euo pipefail

ENV_FILE="${HOME}/.config/google-credentials/x-api.env"
if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

: "${CLIENT_ID:=${OAUTH2_CLIENT_ID:-}}"
: "${CLIENT_SECRET:=${OAUTH2_CLIENT_SECRET:-}}"

if [[ -z "${CLIENT_ID}" || -z "${CLIENT_SECRET}" ]]; then
  echo "x_mcp_bridge: missing CLIENT_ID / CLIENT_SECRET in ${ENV_FILE}" >&2
  exit 1
fi

export CLIENT_ID CLIENT_SECRET
exec xurl mcp "${1:-https://api.x.com/mcp}"