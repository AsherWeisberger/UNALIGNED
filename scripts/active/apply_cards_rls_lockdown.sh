#!/usr/bin/env bash
# Apply cards + desk intake anon lockdown in linked Supabase.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SQL="$ROOT/ops/sql/cards_rls_lockdown.sql"
if [[ ! -f "$SQL" ]]; then
  echo "Missing $SQL"
  exit 1
fi
if command -v supabase >/dev/null 2>&1; then
  supabase db execute --file "$SQL" --linked
  echo "Applied cards_rls_lockdown.sql via Supabase CLI"
  exit 0
fi
echo "Run this SQL in the Supabase SQL editor for project hbnpwphxjurvtydezwgh:"
cat "$SQL"