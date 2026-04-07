"""
UNALIGNED Gmail Thread Rescrape + Rich Backfill
Fetches full email threads from Gmail for all existing Supabase cards,
re-runs AI extraction for rich WHO/WHAT/WHY/VALUE/TIMELINE descriptions,
stores full email thread + rich description as JSON in the description field.

Usage:
    python3 rescrape_threads.py [--dry-run] [--limit N] [--resume]
"""

import os
import sys
import json
import time
import base64
import re
from datetime import datetime
from collections import defaultdict

# ── Setup ────────────────────────────────────────────────────────────────────────
_log_file = '/tmp/rescrape_live.log'

import logging as _logging
_logging.basicConfig(level=_logging.INFO, format='%(message)s',
                     handlers=[_logging.FileHandler(_log_file), _logging.StreamHandler(sys.stdout)])
_logger = _logging.getLogger()
def print(*args, **kwargs):
    msg = ' '.join(str(a) for a in args)
    _logger.info(msg)

# ── Supabase ──────────────────────────────────────────────────────────────────
from supabase import create_client
creds = json.load(open(os.path.expanduser('~/.config/supabase/credentials.json')))
supabase = create_client(creds['project_url'], creds['service_role_key'])

# ── Gmail Auth ────────────────────────────────────────────────────────────────────
TOKEN_FILE = os.path.expanduser('~/.config/google-credentials/gmail-token.json')
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

def get_gmail_service():
    creds_g = Credentials.from_authorized_user_file(TOKEN_FILE, [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send'
    ])
    if creds_g and creds_g.expired and creds_g.refresh_token:
        creds_g.refresh(Request())
        with open(TOKEN_FILE, 'w') as f:
            f.write(creds_g.to_json())
    return build('gmail', 'v1', credentials=creds_g)

def get_email_body(msg_data):
    body = ""
    payload = msg_data.get('payload', {})
    if 'data' in payload.get('body', {}):
        body = base64.urlsafe_b64decode(payload['body']['data']).decode('utf-8', errors='replace')
    else:
        for part in payload.get('parts', []):
            if part.get('body', {}).get('data'):
                body = base64.urlsafe_b64decode(part['body']['data']).decode('utf-8', errors='replace')
                break
    return body

def fetch_gmail_thread(service, thread_id):
    """Fetch all messages in a Gmail thread."""
    try:
        thread = service.users().threads().get(
            userId='me', id=thread_id,
            metadataHeaders=['Subject', 'From', 'Date', 'To']
        ).execute()
        messages = thread.get('messages', [])
        thread_emails = []
        for msg in messages:
            headers = {h['name'].lower(): h['value'] for h in msg.get('payload', {}).get('headers', [])}
            body = get_email_body(msg)
            msg_date = headers.get('date', '')
            thread_emails.append({
                'from': headers.get('from', ''),
                'to':   headers.get('to',   ''),
                'subject': headers.get('subject', ''),
                'date': msg_date,
                'body': body[:8000],
                'snippet': msg.get('snippet', ''),
            })
        return thread_emails
    except Exception as e:
        print(f"   ⚠ Thread fetch error: {e}")
        return []

def fetch_single_email(service, msg_id):
    """Fetch a single email by ID."""
    try:
        msg = service.users().messages().get(userId='me', id=msg_id, format='full').execute()
        headers = {h['name'].lower(): h['value'] for h in msg.get('payload', {}).get('headers', [])}
        return {
            'from':    headers.get('from',    ''),
            'to':      headers.get('to',      ''),
            'subject': headers.get('subject', ''),
            'date':    headers.get('date',    ''),
            'body':    get_email_body(msg)[:8000],
            'snippet': msg.get('snippet', ''),
        }
    except Exception as e:
        print(f"   ⚠ Email fetch error: {e}")
        return {}

# ── AI Extraction ──────────────────────────────────────────────────────────────
import openai
OPENAI_KEY = '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'
openai_client = openai.OpenAI(api_key=OPENAI_KEY)

def extract_rich_description(thread_emails, contact_name='', intent=''):
    """Re-extract rich WHO/WHAT/WHY/VALUE/TIMELINE from full email thread."""
    thread_text = []
    for i, email in enumerate(thread_emails):
        thread_text.append(f"EMAIL {i+1} ({email.get('date','')[:22]}):")
        thread_text.append(f"From: {email.get('from','')}")
        thread_text.append(f"Subject: {email.get('subject','')}")
        thread_text.append(f"Body: {email.get('body','')[:3000]}")
        thread_text.append("---\n")

    prompt = f"""You are a senior B2B lead qualification analyst. Analyze this email conversation and produce a rich lead summary.

**description** = Rich lead summary (4-6 sentences):
WHO: [Full name], [Job Title] at [Company]. [One sentence about them personally — their role, background, or what they're known for].
COMPANY: [Company name]. [One sentence about the company — what they do, their size/reach if mentioned, notable products or news].
WHAT: [EXACTLY what they want from the recipient — specific ask, proposal, or opportunity. Be verbatim where possible].
VALUE: [Dollar amounts, budget, equity, or valuation mentioned. If nothing stated, write "TBD — budget not disclosed"].
TIMELINE: [When they want a response or action — deadline, urgency, or "flexible"].
WHY THEM: [Why they specifically chose this person to reach out to — their stated reason or your inference].

**intent** = One sentence — THE specific action they want. "Schedule a 30-min call" is better than "discuss partnership". "Pay $5K for 3 sponsored posts" is better than "monetization opportunity".

**priority** = "hot" if money/budget stated and ready to move, deadline within 48h, or explicit "ready to pay". "warm" if genuine interest with real ask. "cold" if vague outreach or no specific action.

**estimated_value** = Dollar amount if any monetary value stated. Null if no money mentioned.

Email conversation:
{"".join(thread_text)}

Return ONLY a valid JSON object with fields: description, intent, priority, estimated_value. No markdown."""

    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You MUST respond with ONLY a valid JSON object — nothing else."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            max_tokens=800,
            timeout=60.0
        )
        result_text = response.choices[0].message.content.strip()
        # Strip markdown wrappers
        for marker in ['```json', '```']:
            if marker in result_text:
                result_text = result_text.split(marker)[1].split('```')[0].strip()
        parsed = json.loads(result_text)
        return {
            'description': str(parsed.get('description', '')),
            'intent': str(parsed.get('intent', intent or '')),
            'priority': str(parsed.get('priority', '')),
            'estimated_value': parsed.get('estimated_value'),
        }
    except Exception as e:
        print(f"   ⚠ AI error: {e}")
        return {'description': '', 'intent': intent or '', 'priority': '', 'estimated_value': None}

# ── JSON envelope helpers ────────────────────────────────────────────────────
def is_json_desc(desc):
    """True if description field already contains our JSON envelope."""
    if not desc:
        return False
    s = str(desc).strip()
    return s.startswith('{') and s.endswith('}')

def make_json_desc(rich, thread_emails):
    """Build a JSON envelope: {rich_description, email_thread}"""
    return json.dumps({
        'rich_description': rich.get('description', '') or '',
        'email_thread': thread_emails,
        'intent': rich.get('intent') or '',
        'priority': rich.get('priority') or '',
        'estimated_value': rich.get('estimated_value'),
    }, ensure_ascii=False)

def parse_json_desc(desc):
    """Parse a JSON envelope description, return (rich_desc, thread_emails)."""
    try:
        obj = json.loads(str(desc))
        return obj.get('rich_description', ''), obj.get('email_thread', [])
    except Exception:
        return str(desc), []

# ── State file for resume ─────────────────────────────────────────────────────
STATE_FILE = '/tmp/rescrape_state.json'

def load_state():
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except Exception:
        return {'processed': [], 'failed': [], 'updated': 0}

def save_state(state):
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f)

# ── Main ────────────────────────────────────────────────────────────────────────
def run_rescrape(dry_run=False, limit=None, resume=False):
    print("\n=== UNALIGNED Gmail Thread Rescrape ===")
    print(f"Mode: {'DRY RUN' if dry_run else 'LIVE'} | {'resume' if resume else 'from start'}\n")

    state = load_state()
    if resume:
        print(f"📋 Resuming — {len(state['processed'])} already processed, {len(state['failed'])} failed")

    # 1. Fetch all cards
    print("📋 Fetching all cards from Supabase...")
    resp = supabase.table('cards').select(
        'id,email_id,gmail_thread_id,intent,description,contact_name,business_name'
    ).execute()
    all_cards = resp.data
    print(f"   {len(all_cards)} cards total")

    gmail_cards = [c for c in all_cards if c.get('email_id')]
    print(f"   {len(gmail_cards)} Gmail-sourced")

    # Skip already-processed cards on resume
    if resume:
        gmail_cards = [c for c in gmail_cards if str(c['id']) not in state['processed']]
        print(f"   {len(gmail_cards)} remaining after resume filter")

    if limit:
        gmail_cards = gmail_cards[:limit]

    if not gmail_cards:
        print("Nothing to process.")
        return

    # 2. Connect Gmail
    print("\n🔑 Connecting to Gmail...")
    service = get_gmail_service()

    # 3. Group by thread for efficiency
    by_thread = defaultdict(list)
    for c in gmail_cards:
        tid = c.get('gmail_thread_id') or c.get('email_id')
        by_thread[tid].append(c)

    print(f"   {len(by_thread)} unique threads to fetch\n")

    updated = state.get('updated', 0)
    failed = list(state.get('failed', []))
    processed = list(state.get('processed', []))

    for thread_id, thread_cards in by_thread.items():
        card = thread_cards[0]
        card_id = card['id']
        msg_id  = card['email_id']

        # Fetch thread
        thread_emails = []
        if thread_id and thread_id != msg_id:
            thread_emails = fetch_gmail_thread(service, thread_id)
        if not thread_emails:
            email = fetch_single_email(service, msg_id)
            if email.get('body'):
                thread_emails = [email]

        if not thread_emails:
            print(f"   ⚠ Could not fetch card {card_id} — added to failed")
            failed.append(str(card_id))
            time.sleep(0.3)
            continue

        # AI re-extraction
        rich = extract_rich_description(
            thread_emails,
            contact_name=card.get('contact_name', ''),
            intent=card.get('intent', '')
        )

        # Build payload
        json_desc = make_json_desc(rich, thread_emails)

        patch_data = {
            'description': json_desc,
        }
        if rich.get('intent'):
            patch_data['intent'] = rich['intent']
        if rich.get('priority') in ('hot', 'warm', 'cold'):
            patch_data['priority'] = rich['priority']
        if rich.get('estimated_value'):
            patch_data['estimated_value'] = str(rich['estimated_value'])

        if dry_run:
            rd, te = parse_json_desc(json_desc)
            print(f"\n  Card {card_id} ({card.get('contact_name','?')})")
            print(f"  Thread emails: {len(te)}")
            print(f"  Rich desc[:200]: {rd[:200]}")
            updated += 1
        else:
            try:
                r = supabase.table('cards').update(patch_data).eq('id', card_id).execute()
                if r.data:
                    updated += 1
                    processed.append(str(card_id))
                    state['updated'] = updated
                    state['processed'] = processed
                    save_state(state)
                    if updated % 25 == 0:
                        print(f"   ✅ {updated}/{len(gmail_cards)} updated — {len(thread_emails)} emails in thread")
                else:
                    failed.append(str(card_id))
                    print(f"   ⚠ Update failed card {card_id}")
            except Exception as e:
                failed.append(str(card_id))
                print(f"   ⚠ Error card {card_id}: {e}")

        time.sleep(0.3)

        if limit and len(processed) + len(failed) >= limit:
            break

    state['failed'] = failed
    save_state(state)

    print(f"\n{'='*50}")
    print(f"Done! {updated} updated, {len(failed)} failed out of {len(processed)+len(failed)} processed")
    print(f"Failed card IDs: {failed[:20]}{'...' if len(failed)>20 else ''}")
    if dry_run:
        print("This was a DRY RUN — no changes written.")


if __name__ == '__main__':
    dry_run = '--dry-run' in sys.argv
    resume  = '--resume'  in sys.argv
    limit   = None
    for arg in sys.argv[1:]:
        if arg.startswith('--limit='):
            limit = int(arg.split('=')[1])
    run_rescrape(dry_run=dry_run, resume=resume, limit=limit)

