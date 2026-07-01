from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

from dashboard_invariants import card_to_lead, should_show_in_replies_gate
from draft_staleness import draft_staleness_reason, should_regenerate_draft

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "cards"
SCENARIOS = Path(__file__).resolve().parent / "fixtures" / "scenarios.json"
STAGE_MJS = Path(__file__).resolve().parent / "lib" / "stage_rules.mjs"
BUNDLE = Path(__file__).resolve().parents[1] / "flow-v4" / "app-bundle.jsx"


def _load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def _js_gate(lead: dict) -> bool:
    script = f"""
import {{ shouldShowInRepliesGate }} from {json.dumps(str(STAGE_MJS))};
const lead = {json.dumps(lead)};
console.log(shouldShowInRepliesGate(lead) ? '1' : '0');
"""
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        capture_output=True,
        text=True,
        check=True,
    )
    return proc.stdout.strip() == "1"


@pytest.mark.parametrize("scenario", json.loads(SCENARIOS.read_text(encoding="utf-8")), ids=lambda s: s["id"])
def test_replies_gate_scenarios(scenario: dict) -> None:
    card = _load(scenario["fixture"])
    lead = card_to_lead(card)
    py_gate = should_show_in_replies_gate(lead)
    js_gate = _js_gate(lead)
    assert py_gate == js_gate
    assert py_gate is scenario["expect_in_replies_gate"], scenario["description"]


@pytest.mark.parametrize("scenario", json.loads(SCENARIOS.read_text(encoding="utf-8")), ids=lambda s: s["id"])
def test_stale_implies_not_in_replies_gate(scenario: dict) -> None:
    """If backend marks draft stale, Organs must not show it in Replies."""
    card = _load(scenario["fixture"])
    lead = card_to_lead(card)
    stale, _ = should_regenerate_draft(card)
    in_gate = should_show_in_replies_gate(lead)
    if stale:
        assert in_gate is False, f"stale card must not appear in gate: {scenario['id']}"
    if scenario["expect_in_replies_gate"]:
        assert stale is False
        assert in_gate is True


def test_bundle_uses_team_replied_last_in_gates() -> None:
    text = BUNDLE.read_text(encoding="utf-8")
    assert "function V4TeamRepliedLast" in text
    assert "V4TeamRepliedLast(l)" in text
    assert "!l.newReplyAt" in text


def test_gmail_delta_loads_draft_reply_for_staleness() -> None:
    path = Path(__file__).resolve().parents[1] / "scripts" / "active" / "gmail_delta_sync.py"
    text = path.read_text(encoding="utf-8")
    assert "draft_reply" in text
    assert "stale_draft_clear_patch" in text


def test_refresh_sweep_imports_staleness() -> None:
    path = Path(__file__).resolve().parents[1] / "scripts" / "active" / "refresh_stale_drafts.py"
    text = path.read_text(encoding="utf-8")
    assert "should_regenerate_draft" in text
    assert "new_reply_at" in text