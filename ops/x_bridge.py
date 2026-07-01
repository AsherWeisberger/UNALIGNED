#!/usr/bin/env python3
"""
X intake -> Supabase cards bridge (ops kit entrypoint).

Canonical implementation: scripts/active/x_bridge.py
"""
from __future__ import annotations

import runpy
import sys
from pathlib import Path

ACTIVE = Path(__file__).resolve().parents[1] / "scripts" / "active" / "x_bridge.py"
sys.argv[0] = str(ACTIVE)
runpy.run_path(str(ACTIVE), run_name="__main__")