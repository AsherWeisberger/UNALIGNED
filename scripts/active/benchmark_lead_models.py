#!/usr/bin/env python3
"""
Benchmark local Ollama models for UNALIGNED Gmail lead extraction.

This intentionally tests the exact extraction prompt/schema used by scraper_v4.
It is not a generic leaderboard; it measures which installed model behaves best
for Robert/Sam lead triage.
"""

from __future__ import annotations

import argparse
import asyncio
import importlib.util
import json
import time
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRAPER_PATH = ROOT / "scripts" / "active" / "scraper_v4.py"
REPORT_PATH = ROOT / "docs" / "local-llm-lead-benchmark.md"
JSON_PATH = ROOT / "docs" / "local-llm-lead-benchmark.json"


@dataclass(frozen=True)
class Case:
    id: str
    kind: str
    sender: str
    subject: str
    body: str
    expected: bool
    required_quote: str = ""
    expected_intent: str = ""


CASES: list[Case] = [
    Case(
        "lead_sponsor_budget",
        "lead",
        "Maya Chen <maya@spatialdemo.com>",
        "Sponsoring Robert Scoble's AI demo series",
        "Hi Robert, I'm Maya from SpatialDemo. We want to sponsor two segments in your AI demo series next month. Our budget is $15,000 and we'd like to discuss creative control and timeline this week.",
        True,
        "We want to sponsor two segments in your AI demo series next month. Our budget is $15,000",
        "sponsorship",
    ),
    Case(
        "lead_podcast_guest",
        "lead",
        "Evan Brooks <evan@frontierpod.com>",
        "Robert as guest on Frontier Builders",
        "Robert, we'd like to book you as a guest for Frontier Builders to discuss AI agents and the future of consumer hardware. Recording slots are open June 4 or June 6, and we can send prep notes today.",
        True,
        "we'd like to book you as a guest",
        "interview",
    ),
    Case(
        "lead_intro_partner",
        "lead",
        "Priya Shah <priya@venturebridge.com>",
        "Intro to a possible Unaligned sponsor",
        "I want to introduce you to the CMO at VantaGrid. They are actively looking for creator partnerships in AI infrastructure and asked specifically whether Robert Scoble has Q3 sponsorship inventory.",
        True,
        "asked specifically whether Robert Scoble has Q3 sponsorship inventory",
        "intro",
    ),
    Case(
        "lead_demo_request",
        "lead",
        "Luis Romero <luis@neuraldesk.ai>",
        "Demo request for Robert",
        "Could we show Robert our new multi-agent desktop next week? We think it fits Unaligned's agent coverage and we are open to a paid launch segment if the product is a fit.",
        True,
        "we are open to a paid launch segment",
        "sponsorship",
    ),
    Case(
        "lead_collaboration_clear",
        "lead",
        "Nina Park <nina@glassforge.com>",
        "Collaboration around smart glasses launch",
        "We are launching smart glasses for field technicians and want to collaborate with Robert on a hands-on launch video. We can provide demo units, engineering access, and paid media support.",
        True,
        "want to collaborate with Robert on a hands-on launch video",
        "collaboration",
    ),
    Case(
        "junk_newsletter",
        "junk",
        "Daily AI Digest <news@digest.example>",
        "10 AI stories you missed",
        "Here are this week's biggest AI stories, funding rounds, and product launches. Subscribe for more and forward this newsletter to a friend.",
        False,
    ),
    Case(
        "junk_seo",
        "junk",
        "Backlinks Team <seo@rankboost.example>",
        "Collaboration opportunity",
        "Dear website owner, we can improve your rankings with high authority backlinks. Let's connect about sponsored guest posts and link insertions.",
        False,
    ),
    Case(
        "junk_job_app",
        "junk",
        "Avery Miller <avery@example.com>",
        "Application for assistant role",
        "I am applying for the assistant role I saw online. My resume is attached and I am available for interviews this week.",
        False,
    ),
    Case(
        "junk_receipt",
        "junk",
        "Stripe <receipts@stripe.com>",
        "Your receipt from Notion",
        "Your payment of $96.00 to Notion was successful. This receipt is for your records.",
        False,
    ),
    Case(
        "junk_generic_cold",
        "junk",
        "Caleb Ross <caleb@salesboost.example>",
        "Quick question",
        "I help founders grow revenue with AI automation. Would you be open to a quick call next week to explore synergies?",
        False,
    ),
    Case(
        "maybe_vague_networking",
        "maybe",
        "Dana Lee <dana@signalroom.com>",
        "Would love to connect",
        "Robert, I have followed your work for years and would love to connect sometime. I think there may be some overlap with what we are building.",
        False,
    ),
    Case(
        "maybe_press_release",
        "maybe",
        "Press Team <press@launchwire.example>",
        "Press release: new AI platform",
        "LaunchWire announces a new AI platform for enterprises. Please see the attached press release and let us know if you need anything else.",
        False,
    ),
]


def load_scraper():
    spec = importlib.util.spec_from_file_location("scraper_v4_active", SCRAPER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load {SCRAPER_PATH}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def build_prompt() -> str:
    parts: list[str] = []
    for i, c in enumerate(CASES, 1):
        parts.extend(
            [
                f"\n{'=' * 60}",
                f"EMAIL {i}/{len(CASES)}",
                f"{'=' * 60}",
                "── EMAIL ──────────────────────────────────────────",
                f"id:      {c.id}",
                f"from:    {c.sender}",
                "date:    May 7, 2026",
                f"subject: {c.subject}",
                f"snippet: {c.body}",
            ]
        )
    return "\n".join(parts)


def score_leads(leads: list[dict], seconds: float) -> dict:
    expected_ids = {c.id for c in CASES if c.expected}
    expected_by_id = {c.id: c for c in CASES}
    returned_ids = {str(lead.get("email_id", "")).strip() for lead in leads if isinstance(lead, dict)}

    true_positive = len(expected_ids & returned_ids)
    false_positive = len(returned_ids - expected_ids)
    false_negative = len(expected_ids - returned_ids)

    evidence_hits = 0
    intent_hits = 0
    required_field_errors = 0
    valid_priorities = {"hot", "warm", "cold"}
    valid_intents = {"partnership", "sponsorship", "interview", "collaboration", "intro", "other"}

    for lead in leads:
        if not isinstance(lead, dict):
            required_field_errors += 1
            continue
        eid = str(lead.get("email_id", "")).strip()
        case = expected_by_id.get(eid)
        required = ["email_id", "title", "notes", "evidence", "date", "intent", "priority", "reply_hook"]
        if any(not str(lead.get(k, "")).strip() for k in required):
            required_field_errors += 1
        if str(lead.get("priority", "")).lower() not in valid_priorities:
            required_field_errors += 1
        if str(lead.get("intent", "")).lower() not in valid_intents:
            required_field_errors += 1
        if case and case.required_quote and case.required_quote.lower() in str(lead.get("evidence", "")).lower():
            evidence_hits += 1
        if case and case.expected_intent and case.expected_intent == str(lead.get("intent", "")).lower():
            intent_hits += 1

    precision = true_positive / max(true_positive + false_positive, 1)
    recall = true_positive / max(true_positive + false_negative, 1)
    f1 = 2 * precision * recall / max(precision + recall, 1e-9)
    evidence_rate = evidence_hits / max(true_positive, 1)
    intent_rate = intent_hits / max(true_positive, 1)

    # Weighted toward "no slop": false positives and bad evidence hurt hard.
    score = (
        precision * 35
        + recall * 25
        + evidence_rate * 20
        + intent_rate * 10
        + max(0, 1 - required_field_errors / max(len(leads), 1)) * 10
    )
    if false_positive:
        score -= false_positive * 12
    if seconds > 60:
        score -= min((seconds - 60) / 10, 10)

    return {
        "score": round(score, 2),
        "seconds": round(seconds, 2),
        "returned": sorted(returned_ids),
        "expected": sorted(expected_ids),
        "true_positive": true_positive,
        "false_positive": false_positive,
        "false_negative": false_negative,
        "precision": round(precision, 3),
        "recall": round(recall, 3),
        "f1": round(f1, 3),
        "evidence_rate": round(evidence_rate, 3),
        "intent_rate": round(intent_rate, 3),
        "required_field_errors": required_field_errors,
    }


async def run_model(scraper, model: str, host: str, num_ctx: int, keep_alive: str) -> dict:
    client = {
        "provider": "ollama",
        "host": host.rstrip("/"),
        "model": model,
        "num_ctx": num_ctx,
        "keep_alive": keep_alive,
    }
    started = time.time()
    error = ""
    leads: list[dict] = []
    try:
        parsed = await scraper.llm_json(
            client,
            scraper.EXTRACT_SYSTEM,
            build_prompt(),
            temperature=0,
            max_tokens=4096,
            timeout=300,
        )
        if isinstance(parsed, list):
            leads = parsed
        else:
            error = f"Model returned {type(parsed).__name__}, not a list."
    except Exception as exc:
        error = repr(exc)

    seconds = time.time() - started
    result = score_leads(leads, seconds)
    result.update({"model": model, "error": error, "leads": leads})
    if error:
        result["score"] = 0
    return result


def write_reports(results: list[dict], models: list[str]):
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    ordered = sorted(results, key=lambda r: r["score"], reverse=True)
    JSON_PATH.write_text(json.dumps({"models": models, "cases": [c.__dict__ for c in CASES], "results": ordered}, indent=2))

    lines = [
        "# Local LLM Lead Benchmark",
        "",
        "This benchmark tests installed Ollama models against the same structured extraction prompt/schema used by `scripts/active/scraper_v4.py`.",
        "",
        f"- Cases: {len(CASES)} total ({sum(c.expected for c in CASES)} real leads, {sum(not c.expected for c in CASES)} rejects)",
        "- Scoring favors precision, recall, direct evidence quotes, correct intent, required fields, and speed.",
        "- A false positive is penalized heavily because junk on the board is worse than a slower run.",
        "",
        "## Results",
        "",
        "| Rank | Model | Score | Precision | Recall | Evidence | Intent | False + | False - | Seconds |",
        "|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for idx, r in enumerate(ordered, 1):
        lines.append(
            f"| {idx} | `{r['model']}` | {r['score']} | {r['precision']} | {r['recall']} | "
            f"{r['evidence_rate']} | {r['intent_rate']} | {r['false_positive']} | {r['false_negative']} | {r['seconds']} |"
        )
    lines.extend(["", "## Notes", ""])
    for r in ordered:
        lines.append(f"### `{r['model']}`")
        if r["error"]:
            lines.append(f"- Error: `{r['error']}`")
        lines.append(f"- Returned IDs: `{', '.join(r['returned']) or 'none'}`")
        lines.append(f"- Missing expected IDs: `{', '.join(sorted(set(r['expected']) - set(r['returned']))) or 'none'}`")
        extra = sorted(set(r["returned"]) - set(r["expected"]))
        lines.append(f"- False positives: `{', '.join(extra) or 'none'}`")
        lines.append("")
    REPORT_PATH.write_text("\n".join(lines))


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", default="gemma4:31b,qwen3-coder:30b,qwen3.6:35b-a3b")
    parser.add_argument("--host", default="http://127.0.0.1:11434")
    parser.add_argument("--num-ctx", type=int, default=32768)
    parser.add_argument("--keep-alive", default="2h")
    args = parser.parse_args()

    models = [m.strip() for m in args.models.split(",") if m.strip()]
    scraper = load_scraper()
    results = []
    for model in models:
        print(f"Benchmarking {model}...")
        result = await run_model(scraper, model, args.host, args.num_ctx, args.keep_alive)
        print(f"  score={result['score']} precision={result['precision']} recall={result['recall']} seconds={result['seconds']}")
        if result["error"]:
            print(f"  error={result['error']}")
        results.append(result)
    write_reports(results, models)
    print(f"Wrote {REPORT_PATH}")
    print(f"Wrote {JSON_PATH}")


if __name__ == "__main__":
    asyncio.run(main())
