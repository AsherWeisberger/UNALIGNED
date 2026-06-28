import json
from pathlib import Path

import router
import board  # noqa: F401  (used by callers / future agents)

BASE = Path(__file__).parent
PROMPTS = BASE / "prompts"
MEMORY = BASE / "memory"


def _read(path):
    try:
        return path.read_text()
    except FileNotFoundError:
        return ""


# CANONICAL is prepended to every agent's system prompt (current truth);
# PROOF (reach/roster) is added for the Deal Desk.
_CANONICAL = _read(MEMORY / "CANONICAL.md")
_PROOF = _read(MEMORY / "PROOF.md")
# Reply Engines is NOT its own agent. It is the shared drafting playbook the
# agents draft WITH, loaded as a module fragment into any agent that writes a reply.
_REPLY_ENGINES = _read(PROMPTS / "reply_engines.md")


def _p(name):
    return (PROMPTS / f"{name}.md").read_text()


def _system(name, *, with_proof=False):
    parts = []
    if _CANONICAL:
        parts.append(_CANONICAL)
    if with_proof and _PROOF:
        parts.append(_PROOF)
    parts.append(_p(name))
    return "\n\n---\n\n".join(parts)


# Machine-readable verdict the orchestrator gates on. The prose triage card is
# still produced (and logged); this block is appended so code can act on it.
_TRIAGE_VERDICT_SPEC = """

After your triage card, output one final line of strict JSON (no markdown fence) with exactly these keys:
{"is_lead": true|false, "scam": "clear"|"caution"|"likely_scam", "action": "auto_draft"|"draft_and_flag"|"do_not_engage", "stage": "first-touch"|"engaged"|"rates-sent", "one_line": "<your one line read>"}
The JSON must be the last thing you output."""


def _last_json(text):
    """Return the last balanced {...} object parsed from text, or None."""
    if not text:
        return None
    depth, end = 0, -1
    for i in range(len(text) - 1, -1, -1):
        c = text[i]
        if c == "}":
            if depth == 0:
                end = i
            depth += 1
        elif c == "{":
            depth -= 1
            if depth == 0 and end != -1:
                try:
                    parsed = json.loads(text[i:end + 1])
                    if isinstance(parsed, dict):
                        return parsed
                except (json.JSONDecodeError, ValueError):
                    end = -1
    return None


def _extract_verdict(text):
    """Pull the trailing JSON verdict out of the triage output. Fail safe: if it
    cannot be parsed, treat as caution / draft_and_flag so a human always looks."""
    verdict = {"is_lead": True, "scam": "caution", "action": "draft_and_flag",
               "stage": "engaged", "one_line": ""}
    parsed = _last_json(text)
    if parsed:
        verdict.update({k: parsed[k] for k in verdict if k in parsed})
    return verdict


def triage(card):
    """90% job: classify + scam-gate a lead. Runs on the local model.
    Returns {'text': <prose triage card>, 'verdict': {is_lead, scam, action, stage, one_line}}."""
    system = _system("triage") + _TRIAGE_VERDICT_SPEC
    user = "Lead card JSON:\n" + json.dumps(card, ensure_ascii=False)[:6000]
    # The local model is a reasoning model; give it room so thinking does not eat
    # the whole budget and leave the answer empty.
    out, _ = router.run("triage", system, user, max_tokens=3000)
    return {"text": out, "verdict": _extract_verdict(out)}


def _pricing_block(pricing):
    """Render the live pricing_tiers rows as plain text for the Deal Desk prompt."""
    if not pricing:
        return "Live pricing unavailable this run. Do not quote a number; ask for scope and flag for Ash."
    lines = []
    for row in pricing:
        name = row.get("name") or row.get("tier") or "?"
        price = row.get("price")
        kind = row.get("kind") or ""
        lines.append(f"- {name} ({kind}): {price}")
    return "LIVE RATE CARD (pricing_tiers, authoritative, quote from this):\n" + "\n".join(lines)


# Output contract. email_body is the ONLY client-facing text and must be send-ready
# on its own (no assessment, no notes). Everything else routes to the log / card fields
# and feeds the approval console's "why" panel. NEVER mix internal reasoning into email_body.
_DEAL_DESK_CONTRACT = """

OUTPUT CONTRACT. Return one strict JSON object as the LAST thing you output, no markdown fence, exactly these keys:
{"subject": "<email subject line>", "email_body": "<the full send-ready reply in Asher's voice, signed, the ONLY client-facing text, nothing internal>", "assessment": "<your internal read: fit, risks, why this draft, what to watch. NEVER goes to the client>", "recommended_action": "auto_send"|"draft_and_flag"|"do_not_engage"|"qualify", "mapped_tier": "<tier name from the live rate card, or empty if none quoted>", "estimated_value": "<dollar figure or short value note, or empty>", "suggested_stage": "first-touch"|"engaged"|"rates-sent"|"negotiating"}
email_body must read as a finished email and contain zero internal reasoning. Keep all analysis in assessment. No hyphens or em dashes anywhere."""


def deal_desk_draft(card, *, recency, pricing=None, hard_pushback=False):
    """10% job: draft the client reply. Runs on Claude.
    recency in {'new','lapsed','active'} drives the rate rule in the prompt.
    pricing: live pricing_tiers rows (injected so the draft uses real numbers).

    Returns a structured dict:
      {subject, email_body, assessment, recommended_action, mapped_tier,
       estimated_value, suggested_stage, model, parse_ok, raw}
    email_body is the ONLY client-facing text. If parsing fails, parse_ok is False
    and email_body is '' so a blob can never land in the client-facing field."""
    # Reply Engines is the shared drafting module: load it into the Deal Desk's context.
    system = _system("deal_desk", with_proof=True)
    if _REPLY_ENGINES:
        system += "\n\n--- REPLY ENGINES (shared drafting playbook, draft WITH these) ---\n" + _REPLY_ENGINES
    system += _DEAL_DESK_CONTRACT
    user = (
        f"Client recency: {recency}. Hard pushback: {hard_pushback}.\n\n"
        f"{_pricing_block(pricing)}\n\n"
        f"Lead card JSON:\n{json.dumps(card, ensure_ascii=False)[:8000]}"
    )
    raw, model = router.run("client_draft", system, user, escalate=True, max_tokens=1800)
    parsed = _last_json(raw)
    result = {
        "subject": "", "email_body": "", "assessment": "",
        "recommended_action": "draft_and_flag", "mapped_tier": "",
        "estimated_value": "", "suggested_stage": "engaged",
        "model": model, "parse_ok": False, "raw": raw,
    }
    if parsed and isinstance(parsed.get("email_body"), str) and parsed["email_body"].strip():
        for k in ("subject", "email_body", "assessment", "recommended_action",
                  "mapped_tier", "estimated_value", "suggested_stage"):
            if k in parsed and parsed[k] is not None:
                result[k] = parsed[k] if isinstance(parsed[k], str) else str(parsed[k])
        result["parse_ok"] = True
    else:
        # Could not isolate a clean email_body. Keep the raw as assessment for the log,
        # leave email_body empty so nothing unverified can reach the client-facing field.
        result["assessment"] = (raw or "").strip()
    return result


def tracker_sweep(open_cards):
    """Daily 90% job: punch list of what needs attention. Local, escalate nudges that matter."""
    system = _system("tracker")
    user = "Open deals JSON:\n" + json.dumps(open_cards, ensure_ascii=False)[:12000]
    out, _ = router.run("tracker", system, user, max_tokens=3200)
    return out
