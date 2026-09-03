#!/usr/bin/env python3
"""Build and inspect Robert Scoble's live X voice profile for UNALIGNED draft sculpting."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "active"))

from robert_voice import (  # noqa: E402
    PROFILE_PATH,
    build_voice_profile,
    load_voice_profile,
    save_voice_profile,
    score_robert_authenticity,
    voice_prompt_block,
)


def render_summary(profile: dict) -> str:
    lines = [
        f"# Robert voice profile (@{profile.get('handle', 'Scobleizer')})",
        f"Generated: {profile.get('generated_at', '—')} · Sample: {profile.get('sample_size', 0)} posts",
        "",
        "## Metrics",
    ]
    metrics = profile.get("metrics") or {}
    lines.append(
        f"- Avg length: {metrics.get('avg_chars', '—')} chars · "
        f"Questions/post: {metrics.get('questions_per_post', '—')} · "
        f"I per post: {metrics.get('first_person_I_per_post', '—')}"
    )
    lines.extend(["", "## Tonalities (from live posts)"])
    for tone in profile.get("tonalities") or []:
        freq = tone.get("frequency")
        pct = f"{round(float(freq) * 100)}%" if freq is not None else "—"
        ex = (tone.get("examples") or [""])[0]
        lines.append(f"### {tone.get('label', tone.get('id'))} ({pct})")
        lines.append(tone.get("description", ""))
        if ex:
            lines.append(f"> {ex}")
        lines.append("")
    lines.extend(["## Style rules"])
    for rule in profile.get("style_rules") or []:
        lines.append(f"- {rule}")
    lines.extend(["", "## Top posts by engagement"])
    for post in (profile.get("top_posts_by_engagement") or [])[:6]:
        lines.append(f"- [{post.get('engagement', 0)} eng] {str(post.get('text', ''))[:200]}")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Robert Scoble voice intel for UNALIGNED")
    sub = parser.add_subparsers(dest="command", required=True)

    refresh_p = sub.add_parser("refresh", help="Rebuild profile from @Scobleizer timeline")
    refresh_p.add_argument("-n", "--max-tweets", type=int, default=100)
    refresh_p.add_argument("--json", action="store_true")

    show_p = sub.add_parser("show", help="Show saved profile summary")
    show_p.add_argument("--json", action="store_true")
    show_p.add_argument("--prompt", action="store_true", help="Print LLM prompt block")

    score_p = sub.add_parser("score", help="Score draft text for Robert authenticity")
    score_p.add_argument("text", help="Draft post copy")
    score_p.add_argument("--json", action="store_true")

    args = parser.parse_args()

    if args.command == "refresh":
        profile = build_voice_profile(max_tweets=args.max_tweets)
        path = save_voice_profile(profile)
        if args.json:
            print(json.dumps(profile, indent=2, ensure_ascii=False))
        else:
            print(render_summary(profile))
            print(f"Saved: {path}")
        return 0

    if args.command == "show":
        if args.prompt:
            print(voice_prompt_block())
            return 0
        profile = load_voice_profile()
        if not PROFILE_PATH.is_file():
            print("No saved profile yet. Run: python3 scripts/active/robert_voice_intel.py refresh", file=sys.stderr)
            return 1
        if args.json:
            print(json.dumps(profile, indent=2, ensure_ascii=False))
        else:
            print(render_summary(profile))
        return 0

    if args.command == "score":
        result = score_robert_authenticity(args.text)
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            print(f"Score: {result['score']}/100 ({result['tier']})")
            if result.get("tonality"):
                print(f"Tonality: {result['tonality']}")
            if result.get("signals"):
                print("Signals:", ", ".join(result["signals"]))
            if result.get("issues"):
                print("Issues:", ", ".join(result["issues"]))
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())