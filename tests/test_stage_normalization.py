from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

from dashboard_invariants import normalize_stage

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "cards"
STAGE_MJS = Path(__file__).resolve().parent / "lib" / "stage_rules.mjs"
BUNDLE = Path(__file__).resolve().parents[1] / "flow-v4" / "app-bundle.jsx"


STAGE_MATRIX = [
    ("new", "new"),
    ("negotiating", "negotiating"),
    ("dead-leads", "dead-leads"),
    ("trash", "trash"),
    ("discovery", "new"),
    ("dead", "dead-leads"),
    ("paid", "paid-out"),
    ("unknown-stage", "new"),
]


@pytest.mark.parametrize("raw,expected", STAGE_MATRIX)
def test_python_normalize_stage(raw: str, expected: str) -> None:
    assert normalize_stage(raw) == expected


def _js_normalize(raw: str) -> str:
    script = f"""
import {{ normalizeStage }} from {json.dumps(str(STAGE_MJS))};
console.log(normalizeStage({json.dumps(raw)}));
"""
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        capture_output=True,
        text=True,
        check=True,
    )
    return proc.stdout.strip()


@pytest.mark.parametrize("raw,expected", STAGE_MATRIX)
def test_js_python_stage_parity(raw: str, expected: str) -> None:
    assert _js_normalize(raw) == expected
    assert normalize_stage(raw) == expected


def test_dead_leads_never_becomes_new() -> None:
    """Regression: Benson appeared in Organs because dead-leads mapped to new."""
    assert normalize_stage("dead-leads") == "dead-leads"
    assert _js_normalize("dead-leads") == "dead-leads"


def test_bundle_declares_dead_leads_as_trash_stage() -> None:
    text = BUNDLE.read_text(encoding="utf-8")
    assert "'dead-leads'" in text or '"dead-leads"' in text
    assert "V3_TRASH_STAGE_IDS" in text
    # Must include dead-leads in trash stage ids array (post-fix contract)
    assert "['trash', 'dead-leads']" in text or '["trash", "dead-leads"]' in text


@pytest.mark.parametrize("fixture,expected_stage", [
    ("benson_16723_bug_state.json", "dead-leads"),
    ("shelly_16696_bug_state.json", "negotiating"),
    ("adog_15818_bug_state.json", "rates-sent"),
])
def test_fixture_stage_normalization(fixture: str, expected_stage: str) -> None:
    card = json.loads((FIXTURES / fixture).read_text(encoding="utf-8"))
    assert normalize_stage(card.get("list_id")) == expected_stage