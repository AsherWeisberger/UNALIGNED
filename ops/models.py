import json
import urllib.request

import config

# Per-process usage tally. A fresh `--once` run starts at zero; the orchestrator
# reads this after the run and accumulates it into ops_health (the daily totals).
RUN_USAGE = {"local_tokens": 0, "claude_input": 0, "claude_output": 0}


def claude_spend(input_tokens, output_tokens):
    """Dollar cost of a Claude call from the configured per-million rates."""
    return (input_tokens / 1_000_000.0) * config.CLAUDE_PRICE_IN \
        + (output_tokens / 1_000_000.0) * config.CLAUDE_PRICE_OUT


def _post(url, headers, payload, timeout=180):
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(), headers=headers, method="POST"
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def local_complete(system, user, temperature=0.3, max_tokens=1200):
    """The 90% brain: local model via an OpenAI-compatible server (MLX or Ollama)."""
    url = config.LOCAL_MODEL_BASE.rstrip("/") + "/chat/completions"
    payload = {
        "model": config.LOCAL_MODEL_NAME,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    data = _post(url, {"Content-Type": "application/json"}, payload)
    usage = data.get("usage") or {}
    RUN_USAGE["local_tokens"] += int(usage.get("total_tokens") or 0)
    return data["choices"][0]["message"]["content"]


def claude_complete(system, user, temperature=0.4, max_tokens=1600):
    """The 10% brain: Claude via the Anthropic API.
    Note: newer models (e.g. Opus 4.8) deprecate `temperature`, so we do not send it."""
    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "Content-Type": "application/json",
        "x-api-key": config.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
    }
    payload = {
        "model": config.CLAUDE_MODEL,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }
    data = _post(url, headers, payload)
    usage = data.get("usage") or {}
    RUN_USAGE["claude_input"] += int(usage.get("input_tokens") or 0)
    RUN_USAGE["claude_output"] += int(usage.get("output_tokens") or 0)
    return "".join(b.get("text", "") for b in data.get("content", []))
