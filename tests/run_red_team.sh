#!/usr/bin/env bash
# UNALIGNED invariant red-team harness (Week 1).
# Runs pytest suite + prints regression scenario summary.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "error: node is required for JS/Python parity tests" >&2
  exit 1
fi

PY="$ROOT/.venv/bin/python"
if [[ -x "$PY" ]]; then
  RUNNER=("$PY" -m pytest)
elif python3 -m pytest --version >/dev/null 2>&1; then
  RUNNER=(python3 -m pytest)
elif command -v pytest >/dev/null 2>&1; then
  RUNNER=(pytest)
else
  echo "Bootstrapping .venv with pytest..."
  python3 -m venv "$ROOT/.venv"
  "$ROOT/.venv/bin/pip" install pytest httpx -q
  RUNNER=("$PY" -m pytest)
fi

echo "== UNALIGNED red-team: invariant tests =="
"${RUNNER[@]}" tests/ -q --tb=short "$@"

echo ""
echo "== Regression fixtures =="
ls -1 tests/fixtures/cards/*bug_state*.json tests/fixtures/cards/synthetic_*.json 2>/dev/null || true
echo ""
echo "Pass: staleness, stage normalization, and gate parity invariants held."