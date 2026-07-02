from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from googleapiclient.errors import HttpError

from gmail_delta_sync import resolve_thread_id_for_card


class _Resp:
    def __init__(self, status: int) -> None:
        self.status = status


def _http_error(status: int) -> HttpError:
    return HttpError(resp=_Resp(status), content=b"not found")


def test_resolve_uses_stored_thread_when_it_exists() -> None:
    service = MagicMock()
    service.users().threads().get().execute.return_value = {"id": "abc"}
    card = {"gmail_thread_id": "abc", "email": "lead@example.com"}
    thread_id, source, stale = resolve_thread_id_for_card(service, card)
    assert thread_id == "abc"
    assert source == "stored"
    assert stale is False


def test_resolve_falls_back_to_email_when_stored_thread_missing() -> None:
    service = MagicMock()
    service.users().threads().get().execute.side_effect = _http_error(404)
    service.users().messages().list().execute.return_value = {
        "messages": [{"threadId": "new-thread"}],
    }
    card = {"gmail_thread_id": "dead-thread", "email": "lead@example.com"}
    thread_id, source, stale = resolve_thread_id_for_card(service, card)
    assert thread_id == "new-thread"
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