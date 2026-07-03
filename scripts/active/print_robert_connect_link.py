#!/usr/bin/env python3
"""Print Robert's public team connect link and ready-to-post X copy."""

from __future__ import annotations

import os

CONNECT_BASE = os.environ.get(
    "ROBERT_CONNECT_BASE",
    "https://agentdashboard.cloud/connect",
)

TWEET_OPTIONS = [
    (
        "Warm / open",
        "Working on something you think Robert's audience would love? "
        "Reach his team here — we read everything and route the best fits to his desk:\n"
        f"{CONNECT_BASE}",
    ),
    (
        "Short pin",
        "Partner with Robert's team on projects, ideas, and things worth a look:\n"
        f"{CONNECT_BASE}",
    ),
    (
        "Not salesy",
        "If you've got a partnership, project, or something cool you want us to see — "
        "drop your details for Robert's team:\n"
        f"{CONNECT_BASE}",
    ),
]


def main() -> int:
    print(CONNECT_BASE)
    print()
    print("Robert can post any of these on X:")
    print()
    for label, text in TWEET_OPTIONS:
        print(f"--- {label} ---")
        print(text)
        print()
    print("Dashboard: Company OS → Organs → Robert's desk")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())