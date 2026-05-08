#!/usr/bin/env python3
"""
Build a private, local-only lead benchmark from real UNALIGNED data.

Output goes under .private/ and is ignored by git. Labels are weak by default:
- board_positive: existing Supabase cards are treated as real leads
- gmail_reject_query: messages matching obvious junk queries and not on the board

Use this to compare models on real inbox texture without committing private email
content to GitHub.
"""

from __future__ import annotations

import argparse
import asyncio
import importlib.util
import json
import re
from pathlib import Path

import httpx


ROOT = Path(__file__).resolve().parents[2]
SCRAPER_PATH = ROOT / "scripts" / "active" / "scraper_v4.py"
DEFAULT_OUTPUT = ROOT / ".private" / "lead-benchmark" / "goldset.jsonl"
DEFAULT_REVIEW = ROOT / ".private" / "lead-benchmark" / "review.md"

POSITIVE_STAGES = {
    "new",
    "first-touch",
    "engaged",
    "rates-sent",
    "negotiating",
    "invoice-sent",
    "deal-won",
    "done",
    "paid-out",
}

NEGATIVE_QUERY = (
    'after:{after} ('
    'from:noreply OR from:no-reply OR subject:receipt OR subject:invoice '
    'OR subject:newsletter OR subject:digest OR subject:unsubscribe '
    'OR subject:"press release" OR subject:"job application" '
    'OR subject:backlinks OR subject:SEO OR subject:"guest post"'
    ')'
)


def load_scraper():
    spec = importlib.util.spec_from_file_location("scraper_v4_active", SCRAPER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load {SCRAPER_PATH}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def clean_text(value: object, limit: int = 2400) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text[:limit]


def parse_description(raw: object) -> dict:
    if isinstance(raw, dict):
        return raw
    if not raw:
        return {}
    try:
        parsed = json.loads(str(raw))
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def normalize_thread(raw: object) -> list[dict]:
    if isinstance(raw, list):
        return [m for m in raw if isinstance(m, dict)]
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, list) else []
        except Exception:
            return []
    return []


def thread_body(thread: list[dict], fallback: str = "") -> str:
    if not thread:
        return clean_text(fallback)
    parts = []
    for msg in thread[:5]:
        sender = msg.get("from", "")
        date = msg.get("date", "")
        body = clean_text(msg.get("body", ""), 900)
        if body:
            parts.append(f"[{sender} | {date}] {body}")
    return clean_text("\n".join(parts), 3600)


def fetch_cards(scraper, limit: int) -> list[dict]:
    rows: list[dict] = []
    for offset in range(0, max(limit * 3, 1000), 1000):
        resp = httpx.get(
            f"{scraper.SUPABASE_URL}/rest/v1/cards"
            "?select=email_id,gmail_thread_id,list_id,title,contact_name,email,business_name,"
            "description,date_received,intent,priority,email_thread,original_email"
            f"&limit=1000&offset={offset}",
            headers=scraper._sb_headers(),
            timeout=30,
        )
        resp.raise_for_status()
        batch = resp.json()
        if not isinstance(batch, list) or not batch:
            break
        rows.extend(batch)
        if len(batch) < 1000:
            break
    return rows


def positive_cases(cards: list[dict], limit: int) -> list[dict]:
    cases = []
    seen = set()
    for card in cards:
        email_id = str(card.get("email_id") or "").strip()
        if not email_id or email_id in seen:
            continue
        if str(card.get("list_id") or "") not in POSITIVE_STAGES:
            continue
        desc = parse_description(card.get("description"))
        thread = normalize_thread(card.get("email_thread")) or normalize_thread(card.get("original_email"))
        body = thread_body(thread, desc.get("rich_description") or card.get("title"))
        if not body:
            continue
        cases.append(
            {
                "id": email_id,
                "kind": "real_board_positive",
                "sender": card.get("email") or card.get("contact_name") or "",
                "subject": card.get("title") or "",
                "body": body,
                "expected": True,
                "required_quote": clean_text(desc.get("evidence"), 220),
                "expected_intent": str(card.get("intent") or desc.get("intent") or "").lower(),
                "label_source": "board_positive_weak",
            }
        )
        seen.add(email_id)
        if len(cases) >= limit:
            break
    return cases


async def negative_cases(scraper, token: str, existing_ids: set[str], after: str, limit: int) -> list[dict]:
    query = NEGATIVE_QUERY.format(after=after)
    emails = await scraper.fetch_all_metadata(token, query)
    emails = [e for e in emails if e.get("id") not in existing_ids]
    conversations = await scraper.fetch_all_conversations(emails[: limit * 2], token)
    cases = []
    for email in emails:
        if len(cases) >= limit:
            break
        eid = email.get("id")
        convo = conversations.get(eid, [])
        body = thread_body(convo, email.get("snippet", ""))
        if not body:
            continue
        cases.append(
            {
                "id": eid,
                "kind": "real_gmail_negative",
                "sender": email.get("from", ""),
                "subject": email.get("subject", ""),
                "body": body,
                "expected": False,
                "required_quote": "",
                "expected_intent": "",
                "label_source": "gmail_reject_query_weak",
            }
        )
    return cases


def write_review(cases: list[dict], path: Path):
    lines = [
        "# Private Lead Benchmark Review",
        "",
        "This file is local-only. Use it to correct weak labels before treating this as a gold set.",
        "",
        "For each case, edit the `Human label` line to exactly one of:",
        "",
        "- `LEAD` - should become/continue as a board card",
        "- `MAYBE` - needs human judgment or more context; benchmark ignores these later",
        "- `REJECT` - should not become a board card",
        "",
    ]
    for idx, case in enumerate(cases, 1):
        suggested = "LEAD" if case["expected"] else "REJECT"
        if case.get("kind") == "real_board_positive" and not case.get("required_quote"):
            suggested = "MAYBE"
        lines.extend(
            [
                f"## {idx}. {suggested} - {case['id']}",
                f"- Human label: {suggested}",
                f"- Suggested label: {suggested}",
                f"- Source: `{case['label_source']}`",
                f"- From: {case['sender']}",
                f"- Subject: {case['subject']}",
                f"- Expected intent: `{case.get('expected_intent') or ''}`",
                f"- Required quote: {case.get('required_quote') or ''}",
                "",
                "```text",
                clean_text(case["body"], 1200),
                "```",
                "",
            ]
        )
    path.write_text("\n".join(lines))


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--positive-limit", type=int, default=50)
    parser.add_argument("--negative-limit", type=int, default=75)
    parser.add_argument("--after", default="2026/04/01")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--review", type=Path, default=DEFAULT_REVIEW)
    args = parser.parse_args()

    scraper = load_scraper()
    scraper.validate_supabase()
    token = scraper.get_gmail_token()
    cards = fetch_cards(scraper, args.positive_limit)
    existing_ids = {str(c.get("email_id")) for c in cards if c.get("email_id")}

    positives = positive_cases(cards, args.positive_limit)
    negatives = await negative_cases(scraper, token, existing_ids, args.after, args.negative_limit)
    cases = positives + negatives

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w") as f:
        for case in cases:
            f.write(json.dumps(case, ensure_ascii=False) + "\n")
    write_review(cases, args.review)

    print(f"Wrote {len(cases)} private cases: {len(positives)} positives, {len(negatives)} negatives")
    print(f"Cases: {args.output}")
    print(f"Review: {args.review}")


if __name__ == "__main__":
    asyncio.run(main())
