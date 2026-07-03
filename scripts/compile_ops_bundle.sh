#!/usr/bin/env bash
# Precompile flow-v4/app-bundle.jsx for ops.html (skips in-browser Babel on iPad/Safari).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/flow-v4/app-bundle.jsx"
OUT="$ROOT/flow-v4/app-bundle.js"
CFG="$ROOT/scripts/babel-ops-bundle.json"

if [[ ! -f "$SRC" ]]; then
  echo "compile_ops_bundle.sh: missing $SRC" >&2
  exit 1
fi

npx --yes @babel/cli "$SRC" --out-file "$OUT" --config-file "$CFG"
echo "compile_ops_bundle.sh: wrote $(wc -c < "$OUT" | tr -d ' ') bytes → flow-v4/app-bundle.js"