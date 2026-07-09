from __future__ import annotations

from gmail_delta_sync import thread_matches_card


def test_team_address_card_requires_a_matching_deal_subject() -> None:
    card = {
        "email": "scobleizer@gmail.com",
        "business_name": "Humanoid",
        "title": "Re: Humanoid x Robert Scoble",
    }
    unrelated = [{
        "from": "newsletter@example.com",
        "to": "scobleizer@gmail.com",
        "subject": "The Ultimate Cookout Debate",
    }]
    assert thread_matches_card(unrelated, card) is False


def test_outside_contact_is_a_stronger_match_than_the_subject() -> None:
    card = {
        "email": "ivan@example.com",
        "business_name": "Humanoid",
        "title": "Re: Humanoid x Robert Scoble",
    }
    fresh = [{
        "from": "Ivan <ivan@example.com>",
        "to": "scobleizer@gmail.com",
        "subject": "Quick update",
    }]
    assert thread_matches_card(fresh, card) is True
