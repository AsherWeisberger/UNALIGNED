from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ACTIVE = ROOT / "scripts" / "active"
TESTS_LIB = Path(__file__).resolve().parent / "lib"

for path in (str(ACTIVE), str(TESTS_LIB)):
    if path not in sys.path:
        sys.path.insert(0, path)