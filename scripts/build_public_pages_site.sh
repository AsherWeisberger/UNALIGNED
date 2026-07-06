#!/usr/bin/env bash
# GitHub Pages = public forms only. No ops.html, no flow-v4 dashboard bundle.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE="${1:-$ROOT/_site}"

rm -rf "$SITE"
mkdir -p "$SITE"

copy_if() {
  if [[ -e "$1" ]]; then
    rsync -a "$1" "$SITE/$(basename "$1")"
  fi
}

rsync -a "$ROOT/connect/" "$SITE/connect/"
rsync -a "$ROOT/feedback/" "$SITE/feedback/"
mkdir -p "$SITE/ops"
cp "$ROOT/team-ops-redirect.html" "$SITE/ops/index.html"
copy_if "$ROOT/connect.html"
copy_if "$ROOT/feedback.html"
copy_if "$ROOT/scope.html"
copy_if "$ROOT/404.html"
copy_if "$ROOT/CNAME"
copy_if "$ROOT/favicon.ico"
copy_if "$ROOT/unaligned_logo.png"
rsync -a "$ROOT/assets/" "$SITE/assets/"
mkdir -p "$SITE/docs"
for pdf in SINGLE_TIER.pdf DUO_BUNDLE.pdf MULTI_TIER.pdf; do
  if [[ -f "$ROOT/docs/$pdf" ]]; then
    cp "$ROOT/docs/$pdf" "$SITE/docs/$pdf"
  fi
done

# Public router only — no private hostnames in shipped HTML.
cp "$ROOT/public-index.html" "$SITE/index.html"

if [[ -f "$SITE/CNAME" ]]; then
  echo "Public Pages site → $(cat "$SITE/CNAME")"
fi

echo "Public Pages site ready (no ops.html, no flow-v4/)"