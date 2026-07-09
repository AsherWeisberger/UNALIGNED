from __future__ import annotations

from gmail_delta_sync import (
    CLOSED_RESURFACE_STAGES,
    RESURFACE_STAGE_DONE,
    RESURFACE_STAGE_PAID,
    build_card_thread_patch,
    fresh_inbound_tail,
    inbound_needs_reply,
    match_cards_for_thread,
    resurface_stage_for_card,
)


def test_fresh_inbound_tail_detects_new_message() -> None:
    existing = [{"message_id": "a", "from": "Lead", "body": "old"}]
    merged = [
        {"message_id": "a", "from": "Lead", "body": "old"},
        {"message_id": "b", "from": "Lead", "email": "lead@example.com", "body": "any update?"},
    ]
    assert fresh_inbound_tail(existing, merged) is True


def test_fresh_inbound_tail_ignores_unchanged_thread() -> None:
    msg = {"message_id": "b", "from": "Lead", "email": "lead@example.com", "body": "any update?"}
    assert fresh_inbound_tail([msg], [msg]) is False


def test_fresh_inbound_tail_ignores_thanks_for_post() -> None:
    existing = [{"message_id": "a", "from": "Lead", "body": "old"}]
    merged = existing + [{
        "message_id": "b",
        "from": "Lead",
        "email": "lead@example.com",
        "body": "Thanks for the post!",
    }]
    assert fresh_inbound_tail(existing, merged) is False


def test_inbound_detects_returning_collab_language() -> None:
    msg = {
        "from": "Orlando",
        "email": "orlando@example.com",
        "body": "We'd love to explore another collab on the AI margin story.",
    }
    assert inbound_needs_reply(msg) is True


def test_build_patch_resurfaces_done_deal_to_engaged() -> None:
    card = {
        "id": 1,
        "list_id": "done",
        "email_thread": [{"message_id": "a", "from": "Asher", "body": "live link"}],
    }
    merged = card["email_thread"] + [{
        "message_id": "b",
        "from": "Pratham",
        "email": "pratham@example.com",
        "date": "2026-07-08T10:00:00+00:00",
        "body": "Can we do another collab next month?",
    }]
    payload, meta = build_card_thread_patch(card, merged, thread_id="tid123")
    assert meta["resurfaced"] is True
    assert meta["latest_inbound"] is True
    assert payload["list_id"] == RESURFACE_STAGE_DONE
    assert payload["new_reply_at"]
    assert payload["needs_reply"] is True
    assert payload["deal_state"] == "returning_collab"
    assert payload["gmail_thread_id"] == "tid123"


def test_build_patch_resurfaces_paid_out_to_invoice_sent() -> None:
    card = {
        "id": 2,
        "list_id": "paid-out",
        "email_thread": [{"message_id": "a", "from": "Asher", "body": "paid"}],
    }
    merged = card["email_thread"] + [{
        "message_id": "b",
        "from": "Client",
        "email": "client@example.com",
        "date": "2026-07-08T10:00:00+00:00",
        "body": "Can you send the invoice again?",
    }]
    payload, meta = build_card_thread_patch(card, merged, thread_id="tid456")
    assert meta["resurfaced"] is True
    assert payload["list_id"] == RESURFACE_STAGE_PAID


def test_build_patch_leaves_closed_deal_alone_without_new_inbound() -> None:
    msg = {"message_id": "a", "from": "Asher", "body": "done"}
    card = {"id": 1, "list_id": "paid-out", "email_thread": [msg]}
    payload, meta = build_card_thread_patch(card, [msg], thread_id="tid123")
    assert meta["resurfaced"] is False
    assert "list_id" not in payload
    assert "new_reply_at" not in payload


def test_build_patch_active_deal_sets_new_reply_without_stage_move() -> None:
    card = {
        "id": 2,
        "list_id": "invoice-sent",
        "email_thread": [{"message_id": "a", "from": "Asher", "body": "invoice"}],
    }
    merged = card["email_thread"] + [{
        "message_id": "b",
        "from": "Client",
        "email": "client@example.com",
        "body": "paid today",
    }]
    payload, meta = build_card_thread_patch(card, merged, thread_id="tid456")
    assert meta["resurfaced"] is False
    assert meta["latest_inbound"] is True
    assert payload["new_reply_at"]
    assert "list_id" not in payload


def test_closed_resurface_stages_include_done() -> None:
    assert "done" in CLOSED_RESURFACE_STAGES
    assert "paid-out" in CLOSED_RESURFACE_STAGES


def test_resurface_stage_for_card() -> None:
    assert resurface_stage_for_card("done") == RESURFACE_STAGE_DONE
    assert resurface_stage_for_card("paid-out") == RESURFACE_STAGE_PAID


def test_match_cards_includes_closed_thread_owner() -> None:
    done_card = {"id": 99, "list_id": "done", "gmail_thread_id": "thread-a", "email": "lead@example.com"}
    active_card = {"id": 1, "list_id": "trash", "gmail_thread_id": "thread-a", "email": "lead@example.com"}
    cards_by_thread = {"thread-a": active_card}
    closed_cards_by_thread = {"thread-a": [done_card]}
    fresh = [{
        "from": "Lead",
        "email": "lead@example.com",
        "body": "Want to collab again",
        "date": "2026-07-09T10:00:00+00:00",
    }]
    matched = match_cards_for_thread(
        fresh,
        "thread-a",
        cards_by_thread,
        {"lead@example.com": [done_card, active_card]},
        closed_cards_by_thread=closed_cards_by_thread,
    )
    assert str(done_card["id"]) in matched
    assert str(active_card["id"]) in matched