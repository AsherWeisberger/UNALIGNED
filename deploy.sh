#!/bin/bash
# Push the current GitHub Pages branch, then deploy the same static site to Firebase.
set -euo pipefail

branch="$(git branch --show-current)"
if [ -z "$branch" ]; then
  echo "Could not detect the current git branch."
  exit 1
fi

echo "=== Committing and pushing to GitHub Pages branch: ${branch} ==="
git add index.html flow-v4.html aligned.html firebase.json unaligned_logo.png favicon.ico flow-v4
if [ -d assets/docs ]; then
  git add assets/docs
fi
git commit -m "Update site" || echo "Nothing to commit"
git push origin "HEAD:${branch}"

echo ""
echo "=== Deploying to Firebase ==="
firebase deploy --only hosting --project unaligned-fc556

echo ""
echo "=== Done ==="
echo "GitHub Pages: https://asherweisberger.github.io/UNALIGNED/"
echo "Firebase:     https://unaligned-fc556.firebaseapp.com"
