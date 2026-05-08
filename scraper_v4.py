#!/usr/bin/env python3
"""
Compatibility launcher for the active UNALIGNED Gmail scraper.

The maintained scraper lives at scripts/active/scraper_v4.py. Keep this wrapper
so older commands like `python scraper_v4.py` still run the improved pipeline
instead of an outdated duplicate.
"""

from pathlib import Path
import runpy


ACTIVE_SCRAPER = Path(__file__).resolve().parent / "scripts" / "active" / "scraper_v4.py"


if __name__ == "__main__":
    runpy.run_path(str(ACTIVE_SCRAPER), run_name="__main__")
