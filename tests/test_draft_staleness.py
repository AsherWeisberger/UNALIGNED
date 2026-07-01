from __future__ import annotations

import json
from pathlib import Path

import pytest

from draft_staleness import (
    draft_staleness_reason,
    parse_thread,
    should_regenerate_draft,
    stale_draft_clear_patch,
    team_replied_last,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "cards"
SCENARIOS = Path(__file__).resolve().parent / "fixtures" / "scenarios.json"


def _load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def test_team_replied_last_on_shelly_thread() -> None:
    card = _load("shelly_16696_bug_state.json")
    thread = parse_thread(card)
    assert team_replied_last(thread) is True
    stale, reason = should_regenerate_draft(card, thread)
    assert stale is True
    assert "team already sent" in reason


@pytest.mark.parametrize("list_id", ["dead-leads", "trash"])
def test_inactive_stage_pending_draft_is_stale(list_id: str) -> None:
    card = _load("shelly_16696_bug_state.json")
    card["list_id"] = list_id
    stale, reason = should_regenerate_draft(card)
    assert stale is True
    assert "inactive stage" in reason


def test_stale_patch_clears_pending_fields() -> None:
    card = _load("shelly_16696_bug_state.json")
    patch = stale_draft_clear_patch(card)
    assert patch.get("draft_reply") is None
    assert patch.get("draft_reply_status") == ""
    assert patch.get("new_reply_at") is None
    assert patch.get("_stale_draft_reason")


@pytest.mark.parametrize("scenario", json.loads(SCENARIOS.read_text(encoding="utf-8")), ids=lambda s: s["id"])
def test_regression_scenarios_staleness(scenario: dict) -> None:
    card = _load(scenario["fixture"])
    thread = parse_thread(card)
    reason = draft_staleness_reason(card, thread)
    if scenario["expect_stale"]:
        assert reason is not None, f"expected stale: {scenario['description']}"
        for needle in scenario.get("expect_stale_substrings", []):
            assert needle.lower() in reason.lower(), f"missing '{needle}' in '{reason}'"
        any_needles = scenario.get("expect_stale_any_substrings", [])
        if any_needles:
            assert any(n.lower() in reason.lower() for n in any_needles), (
                f"expected one of {any_needles} in '{reason}'"
            )
    else:
        assert reason is None, f"unexpected stale ({reason}): {scenario['description']}"


def test_valid_pending_not_stale() -> None:
    card = _load("synthetic_valid_pending.json")
    assert draft_staleness_reason(card) is None
    assert should_regenerate_draft(card)[0] is False