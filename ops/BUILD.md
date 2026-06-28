# UNALIGNED Ops — Local Build Brief (for Claude Code)

You are building a self-managed lead and deal operations system that runs entirely on Ash's Mac. Nothing depends on any external agent platform. There are exactly two model calls: a local model on MLX for the high-volume 90%, and the Anthropic Claude API for the judgment-heavy 10%. Lead data lives in Ash's existing Supabase project. A local orchestrator daemon manages the whole loop.

Build the repo described below, splitting the embedded code and prompts into the files named. Execute the build sequence in order and run each verification step before moving on.

---

## 1. Architecture

```
Gmail (existing scraper)  ->  Supabase `cards` board  <->  Local Orchestrator (this build)
                                                              |- Local 32B (MLX)  = 90% volume
                                                              |- Claude API       = 10% brain
                                                          drafts written to cards.draft_reply (status=pending)
                                                              -> human approves/sends in the dashboard
```

- The existing scraper keeps feeding Gmail leads into Supabase `cards`. Do not rebuild it. The orchestrator picks up leads already on the board.
- The orchestrator never sends email. It writes drafts to `cards.draft_reply` with `draft_reply_status = "pending"`. A human approves and sends from the dashboard.
- The local 32B handles triage, classification, board updates, and routine drafts. Claude handles final client drafts, gray-area scam calls, negotiation replies on real-money deals, and briefs.

## 2. Repo layout

```
unaligned-ops/
  .env                 # secrets (create from .env.example, never commit)
  .env.example
  requirements.txt
  config.py            # loads env + settings
  board.py             # Supabase cards access (PROVIDED, already in this kit)
  models.py            # local MLX call + Claude API call
  router.py            # the 90/10 gate
  agents.py            # triage / deal_desk / tracker / qa functions
  orchestrator.py      # the daemon that manages the loop
  robert-review.html   # Robert's nightly review page (front end, PROVIDED in this kit)
  notify.py            # nightly digest: texts Robert the review link
  x_bridge.py          # X DM intake -> cards (lead_source=X), PROVIDED in this kit
  X_INTEGRATION.md     # the X bridge + heartbeat + Medic watch + structural fixes spec
  prompts/
    triage.md
    deal_desk.md
    brief_maker.md
    tracker.md
    qa.md
    reply_engines.md
  memory/
    CANONICAL.md         # current pricing, payment, stages, negotiation + recency policy (load into the brain)
    PROOF.md             # reach + roster proof points
    ARCHITECTURE_AND_SECURITY.md  # the system design + the security fixes (RLS, repo, Funnel)
  com.unaligned.ops.plist   # launchd service (optional, for always-on)
```

Memory: prepend `memory/CANONICAL.md` to every agent's system prompt (and `memory/PROOF.md` for the Deal Desk) so the brain always operates on current truth. These files reflect the 2026-06-25 session and supersede stale numbers in any older memory files. SOUL.md and USER.md (Hermes persona and the about-Ash file) did not change this session; carry them forward as-is.

`board.py` is already written and included in this kit. Copy it in as-is.

## 3. Prerequisites

```bash
# 1. Python env
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 2. MLX local model server (the 90% brain). Qwen3 32B 4-bit on a 48GB M4 Max.
pip install mlx-lm
# Raise the GPU memory ceiling so the model + context fit comfortably:
sudo sysctl iogpu.wired_limit_mb=40960
# Serve the local model on :8080. "OpenAI-compatible" here means the API WIRE FORMAT only
# (so any OpenAI-style client can call it) — it is your local Qwen on the Mac, NOT the OpenAI
# service. No OpenAI account, key, or network call is involved. Local LLM + Claude only.
mlx_lm.server --model mlx-community/Qwen3-32B-4bit --port 8080
# (Swap the model id for the current best 32B MLX build if a newer one exists.)
```

`requirements.txt`:
```
requests>=2.31
```
(Everything else uses the Python standard library. The Anthropic call is plain HTTPS, no SDK required.)

`.env.example`:
```
SUPABASE_URL=https://hbnpwphxjurvtydezwgh.supabase.co
SUPABASE_ANON_KEY=eyJ...your-anon-key...
ANTHROPIC_API_KEY=sk-ant-...your-key...
CLAUDE_MODEL=claude-sonnet-4-6        # set to your strongest available general Claude model
LOCAL_MODEL_BASE=http://127.0.0.1:8080/v1
LOCAL_MODEL_NAME=qwen3-32b
POLL_SECONDS=120
```

## 4. Code

### config.py
```python
import os
from pathlib import Path

_env = Path(__file__).parent / ".env"
if _env.exists():
    for line in _env.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6")
LOCAL_MODEL_BASE = os.environ.get("LOCAL_MODEL_BASE", "http://127.0.0.1:8080/v1")
LOCAL_MODEL_NAME = os.environ.get("LOCAL_MODEL_NAME", "qwen3-32b")
POLL_SECONDS = int(os.environ.get("POLL_SECONDS", "120"))
```

### models.py
```python
import json, urllib.request
import config

def _post(url, headers, payload, timeout=180):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                 headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())

def local_complete(system, user, temperature=0.3, max_tokens=1200):
    """The 90% brain: local 32B via the MLX OpenAI-compatible server."""
    url = config.LOCAL_MODEL_BASE.rstrip("/") + "/chat/completions"
    payload = {"model": config.LOCAL_MODEL_NAME,
               "messages": [{"role": "system", "content": system},
                            {"role": "user", "content": user}],
               "temperature": temperature, "max_tokens": max_tokens}
    data = _post(url, {"Content-Type": "application/json"}, payload)
    return data["choices"][0]["message"]["content"]

def claude_complete(system, user, temperature=0.4, max_tokens=1600):
    """The 10% brain: Claude via the Anthropic API."""
    url = "https://api.anthropic.com/v1/messages"
    headers = {"Content-Type": "application/json",
               "x-api-key": config.ANTHROPIC_API_KEY,
               "anthropic-version": "2023-06-01"}
    payload = {"model": config.CLAUDE_MODEL, "max_tokens": max_tokens,
               "temperature": temperature, "system": system,
               "messages": [{"role": "user", "content": user}]}
    data = _post(url, headers, payload)
    return "".join(b.get("text", "") for b in data.get("content", []))
```

### router.py
```python
import models

# Tasks that always go to Claude (the judgment-heavy 10%).
ESCALATE_TASKS = {"client_draft", "scam_gray", "negotiation", "brief"}

def run(task, system, user, *, escalate=False, low_confidence=False,
        temperature=0.3, max_tokens=1400):
    """Route to Claude for the 10%, local for everything else."""
    if escalate or low_confidence or task in ESCALATE_TASKS:
        return models.claude_complete(system, user, temperature, max_tokens), "claude"
    return models.local_complete(system, user, temperature, max_tokens), "local"
```

### agents.py
```python
import json
from pathlib import Path
import router, board

PROMPTS = Path(__file__).parent / "prompts"

def _p(name):
    return (PROMPTS / f"{name}.md").read_text()

def triage(card):
    """90% job: classify + scam-gate a lead. Runs on the local model."""
    system = _p("triage")
    user = "Lead card JSON:\n" + json.dumps(card, ensure_ascii=False)[:6000]
    out, _ = router.run("triage", system, user)
    return out  # expect a triage summary + recommended action

def deal_desk_draft(card, *, recency, hard_pushback=False):
    """10% job: draft the client reply. Runs on Claude.
    recency in {'new','lapsed','active'} drives the rate rule in the prompt."""
    system = _p("deal_desk") + "\n\nCurrent rate card and floors are read from Supabase pricing_tiers; query before quoting."
    user = (f"Client recency: {recency}. Hard pushback: {hard_pushback}.\n"
            f"Lead card JSON:\n{json.dumps(card, ensure_ascii=False)[:8000]}")
    out, model = router.run("client_draft", system, user, escalate=True, max_tokens=1600)
    return out, model

def tracker_sweep(open_cards):
    """Daily 90% job: punch list of what needs attention. Local, escalate nudges that matter."""
    system = _p("tracker")
    user = "Open deals JSON:\n" + json.dumps(open_cards, ensure_ascii=False)[:12000]
    out, _ = router.run("tracker", system, user, max_tokens=1800)
    return out
```

### orchestrator.py
```python
"""The manager. Runs on Ash's Mac. Polls the board, triages, routes, writes drafts.
Never sends. Drafts land in cards.draft_reply with status 'pending' for human approval."""
import time, json, subprocess, sys
import config, board, agents

def needs_processing(card):
    # A lead that is new, or has a fresh inbound reply, and has no pending/approved draft yet.
    stage = (card.get("list_id") or "").lower()
    if stage in ("trash", "dead-leads", "paid-out", "done"):
        return False
    status = (card.get("draft_reply_status") or "").lower()
    return card.get("new_reply_at") or stage == "new" or status in ("", "needs_draft")

def recency_of(card):
    # Plug in real logic: compare last activity date to 30 days. Placeholder: treat prior paid as active.
    # new = no prior campaign; lapsed = prior but >30d; active = movement within 30d.
    return card.get("_recency", "new")

def process_card(card):
    summary = agents.triage(card)                      # local
    # Parse triage output for scam verdict + qualification (define a strict JSON contract in triage.md).
    # If it qualifies and needs a client reply, escalate the draft to Claude:
    draft, model = agents.deal_desk_draft(card, recency=recency_of(card))
    board.update_card(card["id"], {
        "draft_reply": json.dumps({"subject": "", "body": draft}),
        "draft_reply_status": "pending",
    })
    print(f"[{card['id']}] triaged + drafted ({model}); queued for approval")

def loop():
    while True:
        try:
            cards = board.get_cards(filters={"list_id": "in.(new,first-touch,engaged,negotiating)"}, limit=100)
            for c in cards:
                if needs_processing(c):
                    process_card(c)
        except Exception as e:
            print("orchestrator error:", e, file=sys.stderr)
        time.sleep(config.POLL_SECONDS)

if __name__ == "__main__":
    loop()
```

> Note for Claude Code: `board.py` currently exposes a CLI. Add thin importable helpers `get_cards(filters, limit)` and `update_card(card_id, fields)` to `board.py` (same REST calls it already makes) so `agents.py`/`orchestrator.py` can import them. Keep read+update only, no insert/delete.

## 4.5 Integration points (where this wires into the machine)

You (Claude Code) run on Ash's Mac, so you can see the real environment this kit cannot. Discover and confirm every seam, then wire to what you actually find. Do not assume, inspect.

The seams:
- **Supabase:** defined by `board.py` + `.env` (SUPABASE_URL, SUPABASE_ANON_KEY). The board is the `cards` table; reference tables are `pricing_tiers` and `team_users`. Confirm with `python3 board.py sample`.
- **Lead intake:** the existing scraper already writes leads into Supabase `cards`. The orchestrator reads from `cards`, so it is DECOUPLED from the scraper. Do not modify or wire into the scraper, just read the board. Confirm the scraper is still populating cards (check recent `created_at`).
- **Local model:** MLX server at `http://127.0.0.1:8080/v1` (LOCAL_MODEL_BASE). Confirm port 8080 is free.
- **Claude (10% brain):** Anthropic API via ANTHROPIC_API_KEY. Confirm the key works with one test call.
- **Memory:** drop the `memory/` files into `~/.hermes/memories/` and let `CANONICAL.md` take precedence over older files. Confirm that path exists.
- **Dashboard (optional, separate task):** the Company OS repo (AsherWeisberger/UNALIGNED, AI-DESIGN branch) currently redirects to the Mac LLM. To finish the migration, modify it to read Supabase directly and drop the redirect. Only do this if Ash asks.

## Step 0: Discover and confirm (do FIRST, before building anything)
1. Inventory the machine: find the existing lead scraper and confirm it writes to Supabase `cards`. Locate `~/.hermes/memories`. Locate the Company OS repo. Check the Python version and that port 8080 is free.
2. Confirm connections: run `python3 board.py sample` (reads cards), one local model test call, one Claude API test call.
3. Report what you found, the real paths and any mismatch with this brief, and wait for Ash to confirm before building. Inspect, do not assume.

## 5. Build sequence (do in order, verify each)

1. Scaffold the repo and `.env` from `.env.example`. Verify `python3 -c "import config"` loads with no error.
2. Add `get_cards` / `update_card` importable helpers to `board.py`. Verify: `python3 -c "import board; print(len(board.get_cards(limit=3)))"` returns a number.
3. Start the MLX server. Verify: `curl -s http://127.0.0.1:8080/v1/models` returns the model.
4. Implement `models.py`. Verify both: a local completion returns text, and a Claude completion returns text (one cheap test call each).
5. Implement `router.py`, `agents.py`. Verify `agents.triage(sample_card)` returns a sensible classification on the local model.
6. Implement `orchestrator.py`. Run one manual pass (not the loop) against 1 to 2 real cards. Confirm a draft lands in `cards.draft_reply` with status `pending` and nothing was sent.
7. Wrap as a launchd service (`com.unaligned.ops.plist`) so it runs on a schedule. Start with `POLL_SECONDS=300`.
8. X integration: follow `X_INTEGRATION.md`. Run its schema change, wire `x_bridge.py` after the scraper's sync step, add the scraper heartbeat and the temp-validate-swap, and give the Medic the X-watch rules. This is what gets X leads onto the board and keeps the scrape failing loud instead of silent.

## 6. The 90/10 rule (cost control)

Local model handles: triage, classification, board updates, stage moves, obvious spam/scam, routine low-stakes drafts.
Escalate to Claude: final client-facing drafts, gray-area scam calls, negotiation replies on real-money deals, brief generation. Low volume, so the API cost is pennies. Keep the gate honest and the Claude spend stays tiny.

## 7. Verification checklist

- [ ] MLX server answers on :8080
- [ ] board.get_cards / update_card work against Supabase (read + update only)
- [ ] A reversible test write to a `trash` card succeeds and is reverted
- [ ] Local triage returns a classification
- [ ] Claude draft returns a client reply in Asher's voice, no hyphens or em dashes
- [ ] A processed card shows draft_reply + status pending, nothing sent
- [ ] launchd job runs on schedule and survives a reboot

## 8. Security

- `.env` holds secrets. Never commit it. Add to `.gitignore`.
- The Supabase anon key is read+update on `cards` and read on `pricing_tiers`. It cannot insert or hard-delete (RLS). Keep it that way.
- Drafts never auto-send. Sending is always a human action.

---

## 9. Robert review link + nightly digest

Robert approves posts from one phone-friendly link, texted to him once each evening. `robert-review.html` is the front end (included in this kit). Wire it up:

**The review page reads live from Supabase.**
- It lists cards where `brief_status = 'awaiting_robert'`. Each shows the brand, the drafted post, the quote or caption options, the disclosure, and the posting date.
- Serve it as a tokenized, no-login page. Mint a signed token (per evening, or a stable signed link); the page reads its token, queries Supabase for the awaiting-Robert briefs, and renders them. Token expires after the night.

**On approve (Robert taps Approve + an option):**
1. Write back to Supabase: store the chosen option, set `brief_status = 'approved'`, move the card toward scheduling.
2. Push to the calendar: create or confirm the Google Calendar event on the posting date with the Google Doc brief linked, plus the brand, deliverable, and Paid Partnership reminder. Payment gate holds, a new collaboration only gets a confirmed event once paid in full.
3. Flag it for Asher on the board so it reads "approved, ready to post."
On Edits: store the note, set `brief_status = 'edits_requested'`, notify Asher to revise. On No: set `brief_status = 'declined'`, flag for follow up.

**notify.py (nightly digest):** a cron at 6:00pm PT (configurable). Check the board for any `brief_status = 'awaiting_robert'`. If there are any, mint the signed link and text it to Robert through your SMS provider (Twilio or similar). If none, send nothing, one ping a day, never empty. For a rare rush, Asher texts the same link by hand.

**Brief Maker's part:** when it finishes a brief, it writes the Google Doc, sets `brief_status = 'awaiting_robert'` on the card, and stops. The calendar push happens on Robert's approval, not before. Add a `brief_status` column to `cards` if it does not exist.

Build it after step 6: stand up the review page reading Supabase, the approve handler (write back + calendar push + flag), and the notify.py cron. Verify: open the review link, approve a test brief, confirm the calendar event is created with the Doc linked and the card flips to approved.

## Appendix A: System prompts

Save each block as `prompts/<name>.md`. These are the agent brains. The deterministic prompts (triage, tracker) run on the local model; deal_desk, brief_maker, and the qa holding-reply run on Claude. All drafted content must avoid hyphens and em dashes and sound like Asher: direct, human, premium, no filler.

The full canonical prompts are the ones built in the design session. Paste them in here as files:
- `triage.md` — Inbox Triage: analyze, scam-gate first (lookalike domains like oauth-signin.com / mail.skillshare / tradeifytoken.co, free email claiming a big brand, credential/bank asks, requests for no disclosure, MLM/urgency; the Skillshare "Michael Turner" thread is the disengage example; two-tier gate: strong signals route to review with no draft, soft signals get a cautious qualifying reply), then tone (direct/friendship/long-standing). Output a strict triage card: sender, what they want, classification (pays us / wants pay or promo / unclear), new-or-existing + priority, intent type, scam verdict (clear/caution/likely scam) with reason, recommended action (auto draft / draft and flag / do not engage). Stages live in list_id; place the lead correctly. Draft replies in Asher's voice and sign his block. Never invent sender details.
- `deal_desk.md` — Deal Desk: read live tiers from pricing_tiers; recency rule (new + lapsed >30d = new price; active <=30d = loyalty lock at the pre-raise floor, 14-day window); negotiation floor confidential (concede only to the per-tier old price under hard pushback, never on premium formats, framed as a one-time exception); payment before live; Asher voice + signature; updates list_id and draft_reply on the board.
- `brief_maker.md` — Brief Maker: source-first (read the Notion/Doc fully; Notion needs a headless browser), QRT format (the [COMPANY] [CAMPAIGN] QRT x UNALIGNED x ROBERT SCOBLE structure) and the Retweet format (grey header #323237, blue instruction box, 3-step only), video bullets Problem/Solution/Stack/Results/Why It Matters, disclosure toggles, AlignedNews tie-in, payment-gated calendar booking.
- `tracker.md` — Pipeline Tracker: daily sweep; gone quiet, went live (hand to QA), payment pending, deliverables due; draft nudges with reply engines; Tuesday optimal, 5 to 7 day lead.
- `qa.md` — Deliverable QA: at go-live compare sold vs delivered (wrong deliverable, missing disclosure, posted unpaid, missing links/tags); issue, severity, exact fix, holding reply for approval.
- `reply_engines.md` — the 14 reply engines + Asher voice rules + the tier reference + the signature block.

The full text of each prompt is already included as files in `prompts/` in this kit. Use them as-is. They are the IP; do not paraphrase them down. The Medic (self-healing) agent is optional for a local build; add it later if you want fleet self-repair.
