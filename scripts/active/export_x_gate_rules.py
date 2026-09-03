#!/usr/bin/env python3
"""Export X spam/qualify rules from x_lead_qualification.py → flow-v4/assets/x_gate_rules.json."""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ACTIVE_DIR = Path(__file__).resolve().parent
if str(ACTIVE_DIR) not in sys.path:
    sys.path.insert(0, str(ACTIVE_DIR))

from x_lead_qualification import (  # noqa: E402
    NON_LEAD_SIGNALS,
    NOISE_SIGNALS,
    PARTNERSHIP_SIGNALS,
    PRODUCT_COMMERCIAL_SIGNALS,
    PRODUCT_SIGNALS,
    SPAM_SIGNALS,
    _BOUNDARY_SIGNALS,
)

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "flow-v4" / "assets" / "x_gate_rules.json"


def signal_to_regex_part(signal: str) -> str:
    esc = re.escape(signal)
    if signal in _BOUNDARY_SIGNALS:
        return rf"(?<![a-z]){esc}(?![a-z])"
    return esc


def signals_to_regex(signals: tuple[str, ...]) -> str:
    return "|".join(signal_to_regex_part(s) for s in signals)


def main() -> int:
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "spam_signals": list(SPAM_SIGNALS),
        "noise_signals": list(NOISE_SIGNALS),
        "partnership_signals": list(PARTNERSHIP_SIGNALS),
        "product_signals": list(PRODUCT_SIGNALS),
        "product_commercial_signals": list(PRODUCT_COMMERCIAL_SIGNALS),
        "non_lead_signals": list(NON_LEAD_SIGNALS),
        "boundary_signals": sorted(_BOUNDARY_SIGNALS),
        "spam_regex": signals_to_regex(SPAM_SIGNALS),
        "noise_regex": signals_to_regex(NOISE_SIGNALS),
        "partnership_regex": signals_to_regex(PARTNERSHIP_SIGNALS),
        "product_regex": signals_to_regex(PRODUCT_SIGNALS),
        "product_commercial_regex": signals_to_regex(PRODUCT_COMMERCIAL_SIGNALS),
        "non_lead_regex": signals_to_regex(NON_LEAD_SIGNALS),
        "commercial_regex": signals_to_regex(PARTNERSHIP_SIGNALS + PRODUCT_COMMERCIAL_SIGNALS),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUT} ({len(SPAM_SIGNALS)} spam, {len(NOISE_SIGNALS)} noise signals)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())