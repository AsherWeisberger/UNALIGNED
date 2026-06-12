#!/usr/bin/env python3
"""Rewrite _site/index.html to use precompiled JS instead of in-browser Babel.

Run after compiling the .jsx sources to .js (see .github/workflows/deploy-pages.yml).
The repo's own index.html is untouched — local dev still uses Babel standalone.

- swaps React development UMD builds for production ones
- drops the @babel/standalone script tag entirely
- rewrites every  <script type="text/babel" src="X.jsx?v=...">  to plain  X.js?v=...
"""

import re
import sys
from pathlib import Path

site = Path(sys.argv[1] if len(sys.argv) > 1 else "_site")
index = site / "index.html"
html = index.read_text()

html = html.replace("react.development.js", "react.production.min.js")
html = html.replace("react-dom.development.js", "react-dom.production.min.js")
# integrity hashes were for the dev builds; they no longer match
html = re.sub(r'(<script src="https://unpkg\.com/react[^"]*")\s+integrity="[^"]*"', r"\1", html)
html = re.sub(r'<script src="https://unpkg\.com/@babel/standalone[^<]*</script>\n?', "", html)

compiled = re.sub(
    r'<script type="text/babel" src="([^"?]+)\.jsx(\?[^"]*)?">',
    r'<script src="\1.js\2">',
    html,
)
if compiled == html:
    sys.exit("build_site.py: no text/babel script tags found — index.html format changed?")
html = compiled

leftover = [l for l in html.splitlines() if "text/babel" in l or ".jsx" in l]
if leftover:
    sys.exit(f"build_site.py: unrewritten jsx references remain: {leftover}")

index.write_text(html)
print("build_site.py: index.html rewritten for precompiled bundle")
