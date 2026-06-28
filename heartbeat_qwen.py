#!/usr/bin/env python3
"""
UNALIGNED Heartbeat — local email classifier for Hermes.
Targets qwen3.6:35b-a3b via Ollama. 100% local. Reasoning-first, strict JSON.

Usage:
  echo "<email text>" | python3 heartbeat_qwen.py
  python3 heartbeat_qwen.py path/to/email.txt
  python3 heartbeat_qwen.py --history "prior thread context..." path/to/email.txt

Returns one JSON object on stdout. Nothing auto-sends. "suggest only" mode.
"""

import sys, json, urllib.request

MODEL = "qwen3.6:35b-a3b"
OLLAMA_URL = "http://localhost:11434/api/chat"

SYSTEM = """You are the intake classifier ("Heartbeat") for Unaligned, the team managing tech creator Robert Scoble's paid collaborations. Asher is Client Services Manager; Sam Levin is Business Partner. You read one inbound email (with prior thread context if provided) and decide (1) is it safe to engage, and (2) how to talk to them. You NEVER send anything. You classify and recommend only.

Think before you answer. Reason through the email step by step, THEN fill the JSON. Put that reasoning in the "reasoning" field as the first thing you write. Your verdict must follow from your reasoning, not from keyword matching. Be most careful and most verbose in your reasoning when you are LEAST sure.

PROCESS, in this exact order:

1) ANALYZE: who they are (agency / brand / operator / individual / unknown), what they want, whether they would be PAYING Unaligned (good) or asking Unaligned to pay/promote THEM (usually not a fit), and history (new / warm / long-standing).

2) SCAM GATE (runs before tone, non-negotiable). Reason about whether signals combine into a scam, do not judge one keyword in isolation. Red flags:
   - lookalike/wrong domain, or sender domain not matching the brand they claim
   - free email (gmail/posteo/etc.) claiming to represent a large/known brand
   - asks for credentials, bank numbers, logins, passwords, or "register/verify on our platform"
   - requests NO paid-partnership disclosure, or any way to hide that money changed hands
   - commission/MLM hook, false urgency, or asks to change account/security settings
   - pressure to move off email to an unfamiliar portal
   Rule: even deep in a thread, keep qualifying lightly until it clears or clearly reads as a scam, then disengage. One strong red flag => not "safe". Two or more, or any credential/payment-data request => "scam".

3) TONE (only if gate is "safe"):
   - "direct": new/unknown, pure business. Brief, clear, sets terms.
   - "friendship": warm rapport or casual repeat contact. Personable, still firm on value.
   - "long-standing": proven paying history (e.g. OMANE, EchonLab). Appreciative, fast, trust-based.

STANDING RULES for any suggested reply line:
   - No hyphens or em dashes. Use periods and commas.
   - Payment in full before or on the day of posting. No Net terms unless explicitly approved.
   - Every paid post carries clear, conspicuous disclosure. Never undisclosed.
   - We get paid; we do not pay creators to promote us.

CONFIDENCE + ESCALATION (you are fully local, escalation means a human reviews):
   - high confidence + safe + routine/known => action "auto-draft"
   - qualify, or new/high-value/unusual, or low confidence => action "draft-and-flag"
   - scam => action "do-not-engage"
   Set "escalate_to_human": true whenever confidence is not "high" or scam_risk is not "safe".
"""

# JSON schema enforced by Ollama so Hermes always gets parseable output.
FORMAT_SCHEMA = {
    "type": "object",
    "properties": {
        "reasoning": {"type": "string"},
        "sender": {"type": "string"},
        "who": {"type": "string", "enum": ["agency", "brand", "operator", "individual", "unknown"]},
        "intent": {"type": "string"},
        "paying_us": {"type": "boolean"},
        "history": {"type": "string", "enum": ["new", "warm", "long-standing"]},
        "scam_risk": {"type": "string", "enum": ["safe", "qualify", "scam"]},
        "red_flags": {"type": "array", "items": {"type": "string"}},
        "tone": {"type": "string", "enum": ["direct", "friendship", "long-standing", "none"]},
        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
        "escalate_to_human": {"type": "boolean"},
        "recommended_action": {"type": "string", "enum": ["auto-draft", "draft-and-flag", "do-not-engage"]},
        "suggested_opening_line": {"type": "string"}
    },
    "required": ["reasoning", "who", "intent", "paying_us", "history", "scam_risk",
                 "red_flags", "tone", "confidence", "escalate_to_human",
                 "recommended_action", "suggested_opening_line"]
}

# Real few-shot examples from this week teach Qwen YOUR judgment.
FEWSHOT = [
    {"role": "user", "content": "EMAIL:\nFrom hi@omane.media: Hi Robert, the Latitude campaign is live, please amplify ASAP, 1000 USD, here is the post link."},
    {"role": "assistant", "content": json.dumps({
        "reasoning": "Sender is hi@omane.media, an agency we have an established paying history with across Nitrosend, Viktor, Mora and Get Supers. Clear paid deliverable (amplification, 1000 USD) on a live campaign. No red flags: real domain, they pay us, no credential or disclosure-dodging asks. Routine and known, so high confidence.",
        "sender": "hi@omane.media", "who": "agency", "intent": "amplification quote tweet for Latitude launch",
        "paying_us": True, "history": "long-standing", "scam_risk": "safe", "red_flags": [],
        "tone": "long-standing", "confidence": "high", "escalate_to_human": False,
        "recommended_action": "auto-draft",
        "suggested_opening_line": "On it, Ori. Robert is lined up to amplify and we will send the live link as soon as it posts."})},
    {"role": "user", "content": "EMAIL:\nFrom michael.turner@posteo.com claiming to work with Skillshare. Wants Robert to register on a platform called Impact, switch his account to a brand account, and verify via a separate link. Offers 42 percent commission."},
    {"role": "assistant", "content": json.dumps({
        "reasoning": "Three independent signals only make sense together as a credential-harvest funnel: a free posteo.com address claiming to represent Skillshare (real Skillshare uses skillshare.com), pressure to register/verify on an external platform and a separate link, and a 42 percent commission hook. No single keyword is the tell; the combination is. This is not borderline.",
        "sender": "michael.turner@posteo.com", "who": "individual", "intent": "get Robert to register and verify on a third-party platform",
        "paying_us": True, "history": "warm", "scam_risk": "scam",
        "red_flags": ["free email claiming a big brand", "register/verify on external platform", "separate verification link", "commission hook"],
        "tone": "none", "confidence": "high", "escalate_to_human": True,
        "recommended_action": "do-not-engage", "suggested_opening_line": ""})},
    {"role": "user", "content": "EMAIL:\nFrom Shubh@eagle.ai: paid amplification for EAGLE next week, but one requirement is the post must NOT include a paid partnership disclosure."},
    {"role": "assistant", "content": json.dumps({
        "reasoning": "Domain matches the brand and they would pay us, so not an impersonation scam. But the no-disclosure requirement is a real problem: it is an FTC and platform violation and a credibility risk for Robert. The right move is not to refuse outright but to renegotiate toward a compliant, disclosed structure. New and high value, so do not auto-commit.",
        "sender": "Shubh@eagle.ai", "who": "brand", "intent": "paid amplification for EAGLE launch",
        "paying_us": True, "history": "new", "scam_risk": "qualify",
        "red_flags": ["requests no paid-partnership disclosure"],
        "tone": "direct", "confidence": "medium", "escalate_to_human": True,
        "recommended_action": "draft-and-flag",
        "suggested_opening_line": "Great to meet you, and thanks for the context on EAGLE. I want to be upfront on one thing so we start clean. Every paid placement with Robert carries the required disclosure."})}
]

def classify(email_text, history=""):
    user = f"PRIOR THREAD CONTEXT:\n{history}\n\nEMAIL:\n{email_text}" if history else f"EMAIL:\n{email_text}"
    messages = [{"role": "system", "content": SYSTEM}, *FEWSHOT, {"role": "user", "content": user}]
    payload = {
        "model": MODEL,
        "messages": messages,
        "stream": False,
        "format": FORMAT_SCHEMA,   # schema-constrained JSON
        "think": True,             # Qwen reasoning mode on for the gate
        "options": {"temperature": 0.2, "num_ctx": 8192}
    }
    req = urllib.request.Request(OLLAMA_URL, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        resp = json.loads(r.read())
    content = resp.get("message", {}).get("content", "{}")
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {"error": "non-JSON output", "raw": content}

def main():
    args = sys.argv[1:]
    history = ""
    if "--history" in args:
        i = args.index("--history")
        history = args[i + 1]
        del args[i:i + 2]
    if args:
        with open(args[0]) as f:
            email_text = f.read()
    else:
        email_text = sys.stdin.read()
    print(json.dumps(classify(email_text, history), indent=2))

if __name__ == "__main__":
    main()
