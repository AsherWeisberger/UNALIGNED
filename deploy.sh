#!/bin/bash
# Push to GitHub (GitHub Pages) + deploy to Firebase in one shot
set -e

echo "=== Committing and pushing to GitHub ==="
git add index.html firebase.json
git commit -m "Update" || echo "Nothing to commit"
git push origin main

echo ""
echo "=== Deploying to Firebase ==="
firebase deploy --only hosting --project unaligned-fc556

echo ""
echo "=== Done ==="
echo "GitHub Pages: https://asherweisberger.github.io/UNALIGNED/"
echo "Firebase:     https://unaligned-fc556.firebaseapp.com"
