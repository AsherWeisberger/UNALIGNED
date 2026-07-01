#!/bin/bash
# Move UNALIGNED repo off Desktop (macOS TCC) — run once on Mac Studio.
set -euo pipefail

SRC="${1:-$HOME/Desktop/UNALIGNED/MASTER FILES}"
DEST="${2:-$HOME/unaligned/MASTER FILES}"

if [ ! -d "$SRC" ]; then
  echo "Source not found: $SRC" >&2
  exit 1
fi

mkdir -p "$(dirname "$DEST")"
if [ -e "$DEST" ]; then
  echo "Destination exists: $DEST" >&2
  exit 1
fi

echo "Moving $SRC -> $DEST"
mv "$SRC" "$DEST"

echo "Update launchd WorkingDirectory paths and reinstall:"
echo "  cd \"$DEST\" && bash scripts/active/install_mac_services.sh"
echo "Update any hardcoded Desktop paths in plists if needed."