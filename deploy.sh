#!/bin/bash
# Push the current GitHub Pages branch, then deploy the same static site to Firebase.
set -euo pipefail

branch="$(git branch --show-current)"
if [ -z "$branch" ]; then
  echo "Could not detect the current git branch."
  exit 1
fi

echo "=== Compiling ops bundle (app-bundle.jsx → app-bundle.js) ==="
bash scripts/compile_ops_bundle.sh

echo "=== Committing and pushing to GitHub Pages branch: ${branch} ==="
git add index.html ops.html 404.html flow-v4.html aligned.html firebase.json feedback.html feedback connect.html connect scope.html assets CNAME robots.txt unaligned_logo.png favicon.ico robert-review.html flow-v4 functions docs/SINGLE_TIER.pdf docs/DUO_BUNDLE.pdf docs/MULTI_TIER.pdf
if [ -d assets/docs ]; then
  git add assets/docs
fi
git commit -m "Update site" || echo "Nothing to commit"
git push origin "HEAD:${branch}"

echo ""
echo "=== Deploying to Firebase ==="
firebase deploy --only hosting,functions:sendEmail,functions:collabFeedback,functions:createCollabFeedbackLink,functions:robertDeskIntake,functions:collabScopeIntake,functions:createCollabScopeLink --project unaligned-fc556

echo ""
echo "=== Done ==="
echo "GitHub Pages: https://agentdashboard.cloud/"
echo "Legacy URL:   https://asherweisberger.github.io/UNALIGNED/"
echo "Firebase:     https://unaligned-fc556.firebaseapp.com"
