#!/usr/bin/env python3
"""Shared local LLM client for UNALIGNED pipelines (Qwen via Ollama)."""

from __future__ import annotations

import json
import os
import re
from typing import Any

import httpx

# Default: local Qwen on Mac Studio. Set LLM_BACKEND=anthropic only for explicit API fallback.
LLM_BACKEND = os.environ.get("LLM_BACKEND", "local").strip().lower()
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434/api/chat")
LOCAL_MODEL = os.environ.get("LOCAL_MODEL", "qwen3.8:27b-mlx")
# Unload the model this long after the last call so it stops holding ~21GB idle.
# Per-request keep_alive overrides the server default (which was set to -1 = never
# unload). Raise OLLAMA_KEEP_ALIVE (e.g. "10m") if cold-load latency bothers you.
OLLAMA_KEEP_ALIVE = os.environ.get("OLLAMA_KEEP_ALIVE", "60s")

OPERATOR_FRAMEWORK = """\
OPERATOR FRAMEWORK (apply before writing — this is Asher's own voice and judgment):

VOICE RULES:
- Never use hyphens or em dashes (-, the long dash, or the short dash). Use periods, commas, or
  sentence breaks instead. Rewrite compound phrases to avoid hyphenation (e.g. "long term partner"
  not the hyphenated form). Dashes read as AI and are off brand.
- Sound like a real person, not a corporate template. No filler, no AI tells, no overpolished fluff.

TONE — write in the tone given on the TONE line below:
- direct: new or unknown, pure business. Brief, clear, set terms (rate, payment before posting).
  Do not over-warm a stranger.
- friendship: warm rapport or repeat contact. Personable but firm on value.
- long_standing: proven history (e.g. OMANE, EchonLab). Appreciative, fast, trust based, less
  re-explaining. Skip the cold intro and talk like you already know them.

RESPONSE STRUCTURE (how to lay the reply out — this is the house style):
- Open with one or two warm sentences: confirm fit and that we want to do it. Get to business by
  the second paragraph.
- When the reply carries scope, pricing, payment terms, or several inputs, break it into short
  labeled sections so it is scannable on a phone. Use a plain capitalized label on its own line,
  then bullet lines under it starting with "- ". Do NOT use markdown asterisks or bold; this is a
  plain text email, asterisks show up literally.
- Typical sections, in this order, include only the ones that apply:
    Scope — one bullet per deliverable, named plainly (e.g. "- Thread 1: LingBot-VLA 2.0").
    Pricing — one bullet per deliverable WITH its rate, then a bullet for the total. Note if media
      is client provided so there is no production add on.
    How we work — payment in full before content goes live; fastest is Stripe, bank transfer at a
      flat $5 fee or card at a 3% processing fee; draft goes over for approval before it posts.
    To move forward — the short list of what you need back from them (confirm the price, send go
      live timing, send billing details or assets). One bullet each.
- Never split a rate from its deliverable. Every price names what it buys.
- Close with one short forward motion line, then the signature. No long marketing wrap up.
- Keep it tight: one idea per paragraph, bullets for any list of two or more, readable on a phone.
- For a simple reply (a payment thank you, a quick yes, a scheduling confirmation) skip the sections
  and keep it to a few short sentences. Only structure when there is real scope or pricing to lay out.
"""

LONG_STANDING_PARTNERS = {
    "omane", "echonlab", "echon lab", "polyai", "poly ai",
    "ahacreator", "aha creator", "eezycollab", "arcgrowth", "arc growth",
}

OURS = (
    "unalignedx@", "samlevin@", "scobleizer@", "asherweisberger@",
    "robert scoble", "sam levin",
)


def no_dashes(text: str | None) -> str:
    if not text:
        return text or ""
    text = str(text).replace("—", ". ").replace("–", ". ")
    return re.sub(r"\s+-\s+", ". ", text)


def _thread_list(card: dict[str, Any]) -> list[dict[str, Any]]:
    thread = card.get("email_thread") or card.get("original_email") or []
    if isinstance(thread, str):
        try:
            thread = json.loads(thread)
        except Exception:
            return []
    return thread if isinstance(thread, list) else []


def resolve_tone(card: dict[str, Any]) -> str:
    """Decide reply tone from relationship depth."""
    name = " ".join(
        str(card.get(k, "") or "") for k in ("business_name", "contact_name", "title", "brand")
    ).lower()
    for partner in LONG_STANDING_PARTNERS:
        if partner in name:
            return "long_standing"
    thread = _thread_list(card)
    our_msgs = sum(
        1 for m in thread
        if isinstance(m, dict) and any(s in str(m.get("from", "")).lower() for s in OURS)
    )
    if our_msgs >= 1 and len(thread) >= 3:
        return "friendship"
    return "direct"


def extract_json_text(text: str) -> str:
    raw = str(text or "").strip()
    if "```" in raw:
        for part in raw.split("```"):
            part = part.strip()
            if part.startswith("json"):
                part = part[4:].strip()
            if part.startswith("{") or part.startswith("["):
                return part
    return raw


def parse_json_response(text: str) -> Any | None:
    raw = extract_json_text(text)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def ollama_chat(
    content: str,
    *,
    json_mode: bool = False,
    max_tokens: int = 512,
    num_ctx: int = 8192,
    temperature: float = 0.3,
) -> str:
    payload: dict[str, Any] = {
        "model": LOCAL_MODEL,
        "messages": [{"role": "user", "content": content}],
        "stream": False,
        "keep_alive": OLLAMA_KEEP_ALIVE,
        "options": {
            "temperature": temperature,
            "num_ctx": num_ctx,
            "num_predict": max_tokens,
        },
    }
    if json_mode:
        payload["format"] = "json"
    r = httpx.post(OLLAMA_URL, json=payload, timeout=300)
    r.raise_for_status()
    return (r.json().get("message", {}) or {}).get("content", "").strip()


async def ollama_chat_async(
    content: str,
    *,
    json_mode: bool = False,
    max_tokens: int = 512,
    num_ctx: int = 8192,
    temperature: float = 0.3,
) -> str:
    payload: dict[str, Any] = {
        "model": LOCAL_MODEL,
        "messages": [{"role": "user", "content": content}],
        "stream": False,
        "keep_alive": OLLAMA_KEEP_ALIVE,
        "options": {
            "temperature": temperature,
            "num_ctx": num_ctx,
            "num_predict": max_tokens,
        },
    }
    if json_mode:
        payload["format"] = "json"
    async with httpx.AsyncClient(timeout=300) as client:
        r = await client.post(OLLAMA_URL, json=payload)
        r.raise_for_status()
        return (r.json().get("message", {}) or {}).get("content", "").strip()


def llm_text(
    content: str,
    *,
    json_mode: bool = False,
    max_tokens: int = 512,
    num_ctx: int = 8192,
    temperature: float = 0.3,
    client: Any = None,
    label: str = "opus",
) -> str:
    """Text completion. Local Qwen by default; optional Anthropic client fallback."""
    if LLM_BACKEND == "local":
        return ollama_chat(
            content,
            json_mode=json_mode,
            max_tokens=max_tokens,
            num_ctx=num_ctx,
            temperature=temperature,
        )
    if client is None:
        raise RuntimeError("Anthropic client required when LLM_BACKEND=anthropic")
    model = "claude-haiku-4-5-20251001" if label == "haiku" else "claude-opus-4-6"
    resp = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": content}],
    )
    return resp.content[0].text.strip()


async def llm_text_async(
    content: str,
    *,
    json_mode: bool = False,
    max_tokens: int = 512,
    num_ctx: int = 16384,
    temperature: float = 0.3,
) -> str:
    if LLM_BACKEND == "local":
        return await ollama_chat_async(
            content,
            json_mode=json_mode,
            max_tokens=max_tokens,
            num_ctx=num_ctx,
            temperature=temperature,
        )
    raise RuntimeError("Async Anthropic fallback not implemented; use LLM_BACKEND=local")


def llm_json(
    prompt: str,
    *,
    max_tokens: int = 700,
    num_ctx: int = 8192,
    temperature: float = 0.3,
) -> dict[str, Any] | list[Any] | None:
    text = ollama_chat(
        prompt,
        json_mode=True,
        max_tokens=max_tokens,
        num_ctx=num_ctx,
        temperature=temperature,
    )
    parsed = parse_json_response(text)
    if isinstance(parsed, (dict, list)):
        return parsed
    return None


def backend_label() -> str:
    if LLM_BACKEND == "local":
        return f"local ({LOCAL_MODEL} via Ollama)"
    return "anthropic"