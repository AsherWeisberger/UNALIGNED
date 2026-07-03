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
copy_if "$ROOT/connect.html"
copy_if "$ROOT/feedback.html"
copy_if "$ROOT/scope.html"
copy_if "$ROOT/404.html"
copy_if "$ROOT/CNAME"
copy_if "$ROOT/favicon.ico"
copy_if "$ROOT/unaligned_logo.png"
rsync -a "$ROOT/assets/" "$SITE/assets/"

# Router only — redirects custom domain to /connect/, never loads dashboard on Pages.
cp "$ROOT/index.html" "$SITE/index.html"

if [[ -f "$SITE/CNAME" ]]; then
  echo "Public Pages site → $(cat "$SITE/CNAME")"
fi

echo "Public Pages site ready (no ops.html, no flow-v4/)"