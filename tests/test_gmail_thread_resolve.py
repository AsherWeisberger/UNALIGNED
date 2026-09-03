from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from googleapiclient.errors import HttpError

from gmail_delta_sync import lookup_thread_id_by_email_multi, resolve_thread_id_for_card, thread_matches_card


class _Resp:
    def __init__(self, status: int) -> None:
        self.status = status


def _http_error(status: int) -> HttpError:
    return HttpError(resp=_Resp(status), content=b"not found")


def test_resolve_uses_stored_thread_when_its_contact_matches(monkeypatch: pytest.MonkeyPatch) -> None:
    service = MagicMock()
    import gmail_delta_sync as mod

    monkeypatch.setattr(mod, "fetch_thread", lambda _service, _thread_id, **_kwargs: [
        {"date": "2026-07-09T12:00:00+00:00", "from": "lead@example.com", "to": "asher@example.com"},
    ])
    card = {"gmail_thread_id": "abc", "email": "lead@example.com"}
    thread_id, source, stale = resolve_thread_id_for_card(service, card)
    assert thread_id == "abc"
    assert source == "stored"
    assert stale is False


def test_resolve_falls_back_to_email_when_stored_thread_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    service = MagicMock()
    service.users().messages().list().execute.return_value = {
        "messages": [{"threadId": "new-thread"}],
    }
    import gmail_delta_sync as mod

    monkeypatch.setattr(mod, "fetch_thread", lambda _service, thread_id, **_kwargs: [
        {"date": "2026-07-09T12:00:00+00:00", "from": "lead@example.com", "to": "asher@example.com"},
    ] if thread_id == "new-thread" else [])
    card = {"gmail_thread_id": "dead-thread", "email": "lead@example.com"}
    thread_id, source, stale = resolve_thread_id_for_card(service, card)
    assert thread_id == "new-thread"
    assert source == "email_lookup"
    assert stale is True


def test_thread_match_rejects_a_team_address_card_with_an_unrelated_subject() -> None:
    card = {
        "email": "scobleizer@gmail.com",
        "business_name": "Humanoid",
        "title": "Re: Humanoid x Robert Scoble",
    }
    fresh = [{
        "date": "2026-07-09T12:00:00+00:00",
        "from": "newsletter@example.com",
        "to": "scobleizer@gmail.com",
        "subject": "The Ultimate Cookout Debate",
    }]
    assert thread_matches_card(fresh, card) is False


def test_resolve_unlinks_a_live_but_mismatched_stored_thread(monkeypatch: pytest.MonkeyPatch) -> None:
    service = MagicMock()
    import gmail_delta_sync as mod

    monkeypatch.setattr(mod, "fetch_thread", lambda _service, _thread_id, **_kwargs: [{
        "date": "2026-07-09T12:00:00+00:00",
        "from": "newsletter@example.com",
        "to": "scobleizer@gmail.com",
        "subject": "The Ultimate Cookout Debate",
    }])
    card = {
        "gmail_thread_id": "wrong-thread",
        "email": "scobleizer@gmail.com",
        "business_name": "Humanoid",
        "title": "Re: Humanoid x Robert Scoble",
    }
    thread_id, source, stale = resolve_thread_id_for_card(service, card)
    assert thread_id == ""
    assert source == ""
    assert stale is True


def test_lookup_prefers_newer_thread_over_longer_stale_one() -> None:
    old_msgs = [
        {"date": "2026-06-29T22:34:48+00:00", "from": "lead@example.com", "to": "a@b.com", "participants": ["lead@example.com"]},
    ] * 30
    new_msgs = [
        {"date": "2026-07-08T01:22:21+00:00", "from": "lead@example.com", "to": "a@b.com", "participants": ["lead@example.com"]},
        {"date": "2026-07-07T21:22:21+00:00", "from": "a@b.com", "to": "lead@example.com", "participants": ["lead@example.com"]},
    ]
    service = MagicMock()

    def _list(**kwargs):
        return {"messages": [{"threadId": "old-thread"}, {"threadId": "new-thread"}]}

    def _fetch(_service, thread_id):
        if thread_id == "old-thread":
            return old_msgs
        if thread_id == "new-thread":
            return new_msgs
        return []

    service.users().messages().list().execute.side_effect = _list
    import gmail_delta_sync as mod

    original_fetch = mod.fetch_thread
    mod.fetch_thread = lambda _svc, tid: _fetch(_svc, tid)
    try:
        thread_id, _mailbox = lookup_thread_id_by_email_multi([("primary", service)], "lead@example.com")
    finally:
        mod.fetch_thread = original_fetch
    assert thread_id == "new-thread"


def test_resolve_prefers_email_lookup_when_stored_thread_is_a_short_fork(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = MagicMock()
    service.users().messages().list().execute.return_value = {
        "messages": [{"threadId": "live-thread"}],
    }
    import gmail_delta_sync as mod

    stored_rows = [
        {"date": f"2026-06-{day:02d}T12:00:00+00:00", "from": "lead@example.com", "to": "a@b.com"}
        for day in range(1, 21)
    ]

    def _fetch(_service, thread_id, **_kwargs):
        if thread_id == "fork-thread":
            return [{"date": "2026-06-17T12:00:00+00:00", "from": "lead@example.com", "to": "a@b.com"}]
        if thread_id == "live-thread":
            return [
                {"date": "2026-07-10T12:00:00+00:00", "from": "lead@example.com", "to": "a@b.com"},
                {"date": "2026-07-10T11:00:00+00:00", "from": "a@b.com", "to": "lead@example.com"},
            ]
        return []

    monkeypatch.setattr(mod, "fetch_thread", _fetch)
    monkeypatch.setattr(mod, "fetch_thread_from_mailboxes", lambda _mailboxes, tid: (_fetch(None, tid), "primary", service))
    card = {
        "gmail_thread_id": "fork-thread",
        "email": "lead@example.com",
        "email_thread": stored_rows,
    }
    thread_id, source, stale = resolve_thread_id_for_card(service, card)
    assert thread_id == "live-thread"
    assert source == "email_lookup"
    assert stale is True


def test_resolve_clears_stale_flag_when_no_replacement() -> None:
    service = MagicMock()
    service.users().threads().get().execute.side_effect = _http_error(404)
    service.users().messages().list().execute.return_value = {"messages": []}
    card = {"gmail_thread_id": "dead-thread", "email": "lead@example.com"}
    thread_id, source, stale = resolve_thread_id_for_card(service, card)
    assert thread_id == ""
    assert source == ""
    assert stale is True
