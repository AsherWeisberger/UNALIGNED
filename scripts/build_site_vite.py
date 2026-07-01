#!/usr/bin/env python3
"""Copy Vite dist into _site with content-hashed assets for GitHub Pages."""

import json
import re
import shutil
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
dist = Path(sys.argv[1] if len(sys.argv) > 1 else root / "dist")
site = root / "_site"
site.mkdir(exist_ok=True)

manifest = dist / ".vite" / "manifest.json"
if not manifest.exists():
    sys.exit("build_site_vite.py: run npm run build first")

data = json.loads(manifest.read_text())
entry = data.get("flow-v4/main.jsx") or data.get("main.jsx")
if not entry:
    sys.exit("build_site_vite.py: manifest missing main entry")

entry_file = entry["file"]
css_files = entry.get("css") or []

html = (root / "index.html").read_text()
html = re.sub(r'<script type="text/babel" src="flow-v4/app-bundle\.jsx[^"]*"></script>',
              f'<script type="module" src="{entry_file}"></script>', html)
for css in css_files:
    html = html.replace("</head>", f'  <link rel="stylesheet" href="{css}">\n</head>')
html = html.replace("react.development.js", "react.production.min.js")
html = html.replace("react-dom.development.js", "react-dom.production.min.js")
html = re.sub(r'<script src="https://unpkg\.com/react[^<]+</script>\n?', "", html)
html = re.sub(r'<script src="https://unpkg\.com/react-dom[^<]+</script>\n?', "", html)
html = re.sub(r'<script src="https://unpkg\.com/@babel/standalone[^<]+</script>\n?', "", html)

(site / "index.html").write_text(html)
for item in dist.iterdir():
    if item.name == ".vite":
        continue
    dest = site / item.name
    if item.is_dir():
        if dest.exists():
            shutil.rmtree(dest)
        shutil.copytree(item, dest)
    else:
        shutil.copy2(item, dest)

for name in ("flow-v4",):
    src = root / name
    dest = site / name
    if src.exists():
        if dest.exists():
            shutil.rmtree(dest)
        shutil.copytree(
            src,
            dest,
            ignore=shutil.ignore_patterns("*.pyc", "__pycache__"),
        )

for name in ("favicon.ico", "unaligned_logo.png", ".nojekyll"):
    src = root / name
    if src.exists():
        shutil.copy2(src, site / name)

print(f"build_site_vite.py: wrote _site with {entry_file}")
