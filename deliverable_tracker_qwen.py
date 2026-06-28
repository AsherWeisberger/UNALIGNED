#!/usr/bin/env python3
"""
UNALIGNED Deliverable Tracker — local fulfillment classifier for Hermes.
Companion to heartbeat_qwen.py. Targets qwen3.6:35b-a3b via Ollama. 100% local.

The Heartbeat answers "how do we talk to this person?" (intake).
The Tracker answers "did we deliver what we sold?" (fulfillment).

It takes an inbound email on an ACTIVE deal, plus that deal's SPEC, and decides
whether the email reports a fulfillment problem, what the fix is, and a holding
reply for the client. Built from the Marketing Guys RT-vs-QRT case.

Usage:
  python3 deliverable_tracker_qwen.py email.txt --spec spec.json
  echo "<email>" | python3 deliverable_tracker_qwen.py --spec spec.json

spec.json example (one per booked deal, stored on the Kanban card):
{
  "client": "Marketing Guys",
  "deliverable": "QRT",            // QRT | RT | thread | amplification | video
  "own_commentary_required": true, // QRT means Robert's words, not a bare RT
  "tags": ["@marketingguys"],
  "disclosure_required": true,
  "link_submitted": false,
  "paid": true,
  "posted_url": "https://x.com/Scobleizer/status/...",
  "status": "posted"              // booked | posted | verified | disputed
}
"""

import sys, json, urllib.request

MODEL = "qwen3.6:35b-a3b"
OLLAMA_URL = "http://localhost:11434/api/chat"

SYSTEM = """You are the Deliverable Tracker for Unaligned, managing fulfillment of tech creator Robert Scoble's PAID, already-booked collaborations. You are given (a) the deal SPEC (what was sold and agreed) and (b) an inbound email from the client on that active deal. You decide whether the email reports a fulfillment problem, what Robert must do to fix it, and a short holding reply for the client. You NEVER send anything.

Think before you answer. Reason through the email against the spec step by step, THEN fill the JSON, putting that reasoning in the "reasoning" field first. Compare what was SOLD (the spec) to what the client says was DELIVERED.

ISSUE TYPES to detect:
   - "wrong_deliverable": delivered the wrong format, e.g. a plain RT (retweet) when the spec sold a QRT (quote repost with Robert's own commentary). This is the Marketing Guys case.
   - "missing_link": client is waiting on the live post URL we have not submitted.
   - "no_disclosure": a required paid-partnership disclosure is missing from the post.
   - "missing_tags": required @tags are not on the post.
   - "timing": post is late or off-schedule.
   - "payment": payment or receipt issue.
   - "none": the email reports no fulfillment problem (e.g. a thank-you or a normal update).

KEY DISTINCTION: a QRT (quote repost) requires Robert's OWN commentary added to the repost. A bare RT (retweet) is NOT a QRT and does not satisfy a QRT booking. If the spec says QRT and the client reports an RT, that is "wrong_deliverable", severity high.

SEVERITY: "high" if the client is owed work they paid for and have not received (wrong/missing deliverable, no disclosure). "medium" for timing or tags. "low" for informational.

ACTION ROUTING:
   - any unresolved fulfillment problem => action "fix-deliverable" and escalate_to_human true (Robert must do the actual fix).
   - "none" => action "auto-acknowledge" if it is a simple thank-you/update.

STANDING RULES for the holding reply line:
   - No hyphens or em dashes. Use periods and commas.
   - Acknowledge specifically, confirm the exact fix, do not over-promise timing.
   - Never imply the client is wrong if the spec supports them.
"""

FORMAT_SCHEMA = {
    "type": "object",
    "properties": {
        "reasoning": {"type": "string"},
        "client": {"type": "string"},
        "spec_deliverable": {"type": "string"},
        "client_reports_delivered": {"type": "string"},
        "issue": {"type": "string", "enum": ["wrong_deliverable", "missing_link", "no_disclosure", "missing_tags", "timing", "payment", "none"]},
        "severity": {"type": "string", "enum": ["high", "medium", "low"]},
        "matches_spec": {"type": "boolean"},
        "action_for_robert": {"type": "string"},
        "recommended_action": {"type": "string", "enum": ["fix-deliverable", "auto-acknowledge"]},
        "escalate_to_human": {"type": "boolean"},
        "holding_reply_to_client": {"type": "string"}
    },
    "required": ["reasoning", "client", "spec_deliverable", "client_reports_delivered",
                 "issue", "severity", "matches_spec", "action_for_robert",
                 "recommended_action", "escalate_to_human", "holding_reply_to_client"]
}

FEWSHOT = [
    {"role": "user", "content": "SPEC:\n{\"client\":\"Marketing Guys\",\"deliverable\":\"QRT\",\"own_commentary_required\":true,\"paid\":true,\"status\":\"posted\"}\n\nEMAIL:\nFrom hello@marketingguys.ai: I checked Robert's account and he did a standard RT rather than a QRT. The booking and payment were for a QRT, please have him get the quote tweet up soon."},
    {"role": "assistant", "content": json.dumps({
        "reasoning": "Spec sold a QRT, which requires Robert's own commentary on the repost. The client reports Robert posted a plain RT, which does not satisfy a QRT. Payment was made for the QRT, so they are owed work they have not received. This is a wrong_deliverable at high severity. The fix is Robert posting an actual quote tweet with his own take, correct tags, and disclosure; an email alone does not resolve it.",
        "client": "Marketing Guys", "spec_deliverable": "QRT", "client_reports_delivered": "RT",
        "issue": "wrong_deliverable", "severity": "high", "matches_spec": False,
        "action_for_robert": "Post a real quote tweet of the launch post with your own commentary, tag @marketingguys, disclosure on. The bare RT does not count as the paid QRT.",
        "recommended_action": "fix-deliverable", "escalate_to_human": True,
        "holding_reply_to_client": "Thanks for flagging, Phillip. You are right, that went up as an RT. Robert is posting the full quote repost with his own take now and we will send the live link shortly."})},
    {"role": "user", "content": "SPEC:\n{\"client\":\"OMANE\",\"deliverable\":\"amplification\",\"paid\":true,\"posted_url\":\"https://x.com/Scobleizer/status/123\",\"status\":\"posted\"}\n\nEMAIL:\nFrom hi@omane.media: Tysm! Got the link, looks great."},
    {"role": "assistant", "content": json.dumps({
        "reasoning": "Spec sold an amplification, the post is live with a submitted URL, and the client is simply thanking us. No mismatch and nothing owed. This is an informational thank-you, so no fulfillment problem.",
        "client": "OMANE", "spec_deliverable": "amplification", "client_reports_delivered": "amplification posted",
        "issue": "none", "severity": "low", "matches_spec": True,
        "action_for_robert": "None. Deliverable confirmed.",
        "recommended_action": "auto-acknowledge", "escalate_to_human": False,
        "holding_reply_to_client": "Glad it landed well. Appreciate you, and we will line up the next one."})}
]

def track(email_text, spec):
    user = f"SPEC:\n{json.dumps(spec)}\n\nEMAIL:\n{email_text}"
    messages = [{"role": "system", "content": SYSTEM}, *FEWSHOT, {"role": "user", "content": user}]
    payload = {"model": MODEL, "messages": messages, "stream": False,
               "format": FORMAT_SCHEMA, "think": True,
               "options": {"temperature": 0.2, "num_ctx": 8192}}
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
    spec = {}
    if "--spec" in args:
        i = args.index("--spec")
        with open(args[i + 1]) as f:
            spec = json.load(f)
        del args[i:i + 2]
    email_text = open(args[0]).read() if args else sys.stdin.read()
    print(json.dumps(track(email_text, spec), indent=2))

if __name__ == "__main__":
    main()
