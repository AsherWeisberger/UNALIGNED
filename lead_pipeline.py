#!/usr/bin/env python3
"""
UNALIGNED Lead Pipeline
Gmail → AI Extract → Dedup → Kanban Import → AI Reply Draft

Usage:
    python3 lead_pipeline.py                    # Full pipeline
    python3 lead_pipeline.py --gmail-only       # Gmail scrape only
    python3 lead_pipeline.py --draft-only        # Draft replies for existing leads
    python3 lead_pipeline.py --import-only      # Import leads without re-scraping
"""
import os
import sys
import json
import base64
import re
import time
import pickle
import logging as _logging

# File logging so we can tail progress
_log_file = os.path.expanduser('~/.config/google-credentials/pipeline_live.log')
_logging.basicConfig(
    level=_logging.INFO,
    format='%(message)s',
    handlers=[
        _logging.FileHandler(_log_file),
        _logging.StreamHandler(sys.stdout)
    ]
)
_logger = _logging.getLogger()

# Override print to also go to file
_print = print
def print(*args, **kwargs):
    msg = ' '.join(str(a) for a in args)
    _logger.info(msg)


def save_checkpoint(stage, data, checkpoint_file=None):
    """Save pipeline state to checkpoint file for resume capability."""
    if checkpoint_file is None:
        checkpoint_file = os.path.expanduser('~/.config/google-credentials/pipeline_checkpoint.pkl')
    try:
        with open(checkpoint_file, 'wb') as f:
            pickle.dump({'stage': stage, 'data': data, 'timestamp': time.time()}, f)
    except Exception:
        pass


def load_checkpoint(checkpoint_file=None):
    """Load pipeline state from checkpoint file."""
    if checkpoint_file is None:
        checkpoint_file = os.path.expanduser('~/.config/google-credentials/pipeline_checkpoint.pkl')
    try:
        if os.path.exists(checkpoint_file):
            with open(checkpoint_file, 'rb') as f:
                return pickle.load(f)
    except Exception:
        pass
    return None


import httplib2
import http.server
import threading
import urllib.request
import urllib.parse
import subprocess
from datetime import datetime, timedelta
from collections import defaultdict

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# ─── SUPABASE CONFIG ───────────────────────────────────────────────────────────

SUPABASE_URL = "https://hbnpwphxjurvtydezwgh.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhibnB3cGh4anVydnR5ZGV6d2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTQ1MzIsImV4cCI6MjA5MDk5MDUzMn0.p5E48__GlGqjC17Z28q8fYFK-qV8CmiidYIP02vGe4s"
SUPABASE_TABLE = "cards"

# ─── SUPABASE HELPER ────────────────────────────────────────────────────────────

def supabase_request(method, path, data=None, return_repr=False):
    """Make a request to the Supabase REST API using urllib."""
    url = SUPABASE_URL + path
    prefer = 'return=representation' if return_repr else 'return=minimal'
    headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': prefer,
    }
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read())
        return result


# ─── CONFIG ───────────────────────────────────────────────────────────────────

# Gmail OAuth
CLIENT_SECRET_FILE=os.path.expanduser("~/.config/google-credentials/client_secret.json")
TOKEN_FILE=os.path.expanduser("~/.config/google-credentials/gmail-token.json")
# Board column for new leads
LEAD_DEFAULT_LIST = "discovery"

# Gmail search keywords - narrowed to actual business leads only
# Excludes: security alerts, receipts, calendar invites, newsletters, notifications
BUSINESS_SIGNALS = [
    'partnership', 'collab', 'collaboration', 'advertis', 'sponsor',
    'interview', 'podcast', 'x post', 'twitter', 'campaign',
    'paid', 'rate', 'proposal', 'deal', 'offer', 'dm me',
    'featured', 'promotion', 'brand deal', 'affiliate',
    'content creation', 'social media post', 'paid collab',
    'sponsored', 'speaker', 'guest', 'appear', 'media kit',
    'rouser', 'creator', 'influencer', 'outreach', 'pitch'
]

# Noise patterns to exclude at the Gmail query level
NOISE_QUERY = '-is:newsletter -from:notification -from:noreply -from:no-reply -subject:security -subject:alert -subject:receipt -subject:order -subject:delivery -subject:calendar -subject:verify -subject:sign-in -subject:payment -subject:confirmation -subject:"new sign-in"'

# How far back to search (days)
EMAIL_LOOKBACK_DAYS = 365

# OpenAI
OPENAI_API_KEY=os.getenv("OPENAI_API_KEY", "sk-proj-ruAA")


# ─── GMAIL AUTH ───────────────────────────────────────────────────────────────

def get_gmail_service():
    """Get Gmail service with refresh-token auth"""
    creds = None

    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, [
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.send'
        ])

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open(TOKEN_FILE, 'w') as f:
                f.write(creds.to_json())
        else:
            print("❌ No valid Gmail token. Run scrape_gmail.py first to authenticate.")
            return None

    return build('gmail', 'v1', credentials=creds)


# ─── GMAIL SCRAPING ────────────────────────────────────────────────────────────

def get_email_body(msg_data):
    """Extract decoded body from email"""
    body = ""
    payload = msg_data.get('payload', {})

    if 'data' in payload.get('body', {}):
        body = payload['body']['data']
    else:
        for part in payload.get('parts', []):
            if part.get('body', {}).get('data'):
                body = part['body']['data']
                break

    if body:
        try:
            body = base64.urlsafe_b64decode(body).decode('utf-8', errors='replace')
        except:
            pass

    return body


def fetch_gmail_thread(service, thread_id):
    """Fetch all messages in a Gmail thread, oldest-first (first email from lead at top)."""
    try:
        import email
        from email.utils import parsedate_to_datetime
        thread = service.users().threads().get(
            userId='me', id=thread_id, metadataHeaders=['Subject', 'From', 'Date', 'To']
        ).execute()
        messages = thread.get('messages', [])
        thread_emails = []
        for msg in messages:
            headers = {h['name'].lower(): h['value'] for h in msg.get('payload', {}).get('headers', [])}
            raw_date = headers.get('date', '')
            try:
                dt = parsedate_to_datetime(raw_date)
                sort_key = dt.timestamp()
            except Exception:
                sort_key = 0
            thread_emails.append({
                'from': headers.get('from', ''),
                'subject': headers.get('subject', ''),
                'date': raw_date,
                'snippet': msg.get('snippet', ''),
                '_sort_key': sort_key,
            })
        thread_emails.sort(key=lambda x: x.get('_sort_key', 0))
        for msg in thread_emails:
            msg.pop('_sort_key', None)
        return thread_emails
    except Exception as e:
        return []


def _fetch_one_email(args, retries=3):
    """Worker: fetch metadata for one email (for parallel execution). Retries on transient errors."""
    msg_id = args['id']
    thread_id = args.get('threadId', msg_id)
    service = args['service']

    import time
    for attempt in range(retries):
        try:
            msg_data = service.users().messages().get(
                userId='me', id=msg_id, format='metadata',
                metadataHeaders=['Subject', 'From', 'Date', 'To']
            ).execute()
            headers = msg_data.get('payload', {}).get('headers', [])
            header_dict = {h['name'].lower(): h['value'] for h in headers}
            return {
                'id': msg_id,
                'subject': header_dict.get('subject', '(no subject)'),
                'from': header_dict.get('from', ''),
                'to': header_dict.get('to', ''),
                'date': header_dict.get('date', ''),
                'body': '',
                'snippet': msg_data.get('snippet', ''),
                'keywords': [],
                'gmail_thread_id': thread_id,
            }
        except Exception:
            if attempt < retries - 1:
                time.sleep(0.5 * (attempt + 1))
            else:
                return None


def scrape_gmail(service, days_back=730):
    """Scrape Gmail for business-lead emails (partnerships, interviews, ads, etc)"""
    cutoff = datetime.now() - timedelta(days=days_back)
    since = cutoff.strftime('%Y/%m/%d')

    signal_query = ' OR '.join(f'({s})' for s in BUSINESS_SIGNALS)
    query = f'after:{since} ({signal_query}) {NOISE_QUERY}'

    print(f"📧 Gmail query: {query}")

    all_messages = []
    page_token = None
    total_pages = 0
    while True:
        results = service.users().messages().list(
            userId='me', q=query, maxResults=500, pageToken=page_token
        ).execute()
        msgs = results.get('messages', [])
        if msgs:
            all_messages.extend(msgs)
            total_pages += 1
            print(f"   Page {total_pages}: +{len(msgs)} messages (total: {len(all_messages)})")
        page_token = results.get('nextPageToken')
        if not page_token:
            break

    messages = all_messages
    print(f"   ✅ Total: {len(messages)} matching emails across {total_pages} pages")
    print(f"   📥 Fetching headers in parallel (20 concurrent)...")

    BACKUP_FILE = os.path.expanduser('~/.config/google-credentials/scraped_emails_backup.json')

    work_items = [{'id': m['id'], 'threadId': m.get('threadId', m['id']), 'service': service} for m in messages]

    from concurrent.futures import ThreadPoolExecutor, as_completed
    CONCURRENCY = 5

    def _save_backup(emails_list):
        try:
            with open(BACKUP_FILE, 'w') as f:
                json.dump(emails_list, f, default=str)
        except Exception:
            pass

    import signal
    _saved_emails = []
    def _signal_handler(sig, frame):
        _save_backup(_saved_emails)
        print(f"\n   💾 Backup saved ({len(_saved_emails)} emails) on interrupt.")
        sys.exit(0)
    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    emails = []
    errors = 0
    done = 0

    with ThreadPoolExecutor(max_workers=CONCURRENCY) as executor:
        for result in executor.map(_fetch_one_email, work_items, chunksize=10):
            if result:
                emails.append(result)
                _saved_emails = emails
            else:
                errors += 1
            done += 1
            if done % 100 == 0:
                _save_backup(emails)
                print(f"   Fetched {done}/{len(messages)} email headers...")

    print(f"   ✅ Fetched {len(emails)} email headers ({errors} errors)")
    _save_backup(emails)
    print(f"   💾 Backup saved ({len(emails)} emails) to {BACKUP_FILE}")

    save_checkpoint('scraped', emails)
    return emails


# ─── AI LEAD EXTRACTION ───────────────────────────────────────────────────────

def filter_relevant_leads(emails):
    """Use AI to filter only actual business leads from noise"""
    if not OPENAI_API_KEY:
        print("⚠ No OpenAI API key — using keyword-based relevance filter")
        return keyword_filter_leads(emails)

    try:
        import openai
        client = openai.OpenAI(api_key=OPENAI_API_KEY)
    except ImportError:
        print("⚠ openai package not installed — using keyword filter")
        return keyword_filter_leads(emails)

    print(f"   Filtering {len(emails)} emails for business relevance...")

    relevant = []
    KEYWORD_SIGNALS = [
        'podcast', 'interview', 'sponsor', 'sponsorship', 'partner', 'partnership',
        'collab', 'collaborate', 'deal', 'proposal', 'media kit', 'advertising',
        'advertise', 'brand deal', 'speak', 'speaking', 'x post', 'twitter post',
        'content deal', 'affiliate', 'pr campaign', 'ad campaign', 'paid post',
        'youtube', 'video', 'webinar', 'event', 'conference', 'keynote', 'guest',
        'blog post', 'newsletter', 'promote', 'promotion', 'product launch',
        'scoble', 'unaligned', 'scobalizer'
    ]
    for email in emails:
        text = (email.get('subject','') + ' ' + email.get('from','') + ' ' + email.get('snippet','')).lower()
        if any(kw in text for kw in KEYWORD_SIGNALS):
            relevant.append(email)

    print(f"   ✅ {len(relevant)} emails matched keywords ({len(emails)-len(relevant)} filtered out)")
    save_checkpoint('filtered', relevant)
    return relevant


def keyword_filter_leads(emails):
    """Fallback keyword-based relevance filter"""
    relevant = []
    for email in emails:
        subject = email.get('subject', '').lower()
        sender = email.get('from', '').lower()
        body = (email.get('snippet', '') + email.get('body', '')).lower()

        noise_patterns = [
            'security alert', 'sign-in', 'new sign-in', 'verify your account',
            'receipt', 'order confirmation', 'delivery notification',
            'calendar invite', 'meeting invite', 'google calendar',
            'linkedin notification', 'linkedin alert', 'linkedin digest',
            'newsletter', 'unsubscribe', 'subscription confirmation',
            'password reset', 'two-step', '2-step', 'no-reply',
            'no_reply', 'noreply', 'notification', 'system'
        ]

        is_noise = any(noise in sender or noise in subject for noise in noise_patterns)

        has_signal = any(sig in body or sig in subject for sig in [
            'partnership', 'collab', 'interview', 'podcast', 'sponsor',
            'paid', 'proposal', 'deal', 'advertis', 'campaign', 'x post',
            'twitter', 'media kit', 'speaker', 'content', 'brand deal',
            'featured', 'promotion', 'rate', 'dm me', 'outreach'
        ])

        if not is_noise and has_signal:
            relevant.append(email)

    return relevant


# ─── CARD ID COUNTER ─────────────────────────────────────────────────────────

def get_current_card_id_counter():
    """Get next card ID number by querying max existing id from Supabase.
    Cards use integer IDs in Supabase (board prepends 'c_' for display).
    """
    try:
        max_num = 1000
        offset = 0
        while True:
            result = supabase_request('GET', f'/rest/v1/{SUPABASE_TABLE}?select=id&order=id.desc&limit=1000&offset={offset}')
            if not result:
                break
            for card in result:
                card_id = card.get('id')
                # Handle both integer IDs (Supabase native) and legacy string IDs
                if isinstance(card_id, int):
                    if card_id > max_num:
                        max_num = card_id
                elif isinstance(card_id, str):
                    if card_id.startswith('c_'):
                        try:
                            num = int(card_id[2:])
                            if num > max_num:
                                max_num = num
                        except ValueError:
                            pass
            if len(result) < 1000:
                break
            offset += 1000
        return max_num + 1
    except Exception as e:
        print(f"   ⚠ Could not get card counter from Supabase: {e}")
        return 1001


# ─── CARD BATCH WRITER ───────────────────────────────────────────────────────

def _write_card_batch(cards):
    """Write a batch of cards to Supabase using POST. Returns (imported, skipped)."""
    try:
        next_id = get_current_card_id_counter()
        new_cards = []

        for lead in cards:
            full_email = format_original_email(lead.get('original_email', {}))
            priority = lead.get('priority', 'warm')
            label_map = {'hot': '🔥 Hot', 'warm': '🌡️ Warm', 'cold': '❄️ Cold'}
            urgency = lead.get('follow_up_urgency', 'medium')
            days = {'high': 1, 'medium': 3, 'low': 7}.get(urgency, 3)
            due = (datetime.now() + timedelta(days=days)).strftime('%Y-%m-%d')

            card_id = next_id

            card = {
                'id': card_id,
                'title': lead.get('title', build_card_title(lead)),
                'list_id': LEAD_DEFAULT_LIST,
                'labels': [label_map.get(priority, label_map['warm'])],
                'description': lead.get('description', lead.get('intent', '')),
                'checklist': [],
                'activity': [{'user': 'Lead Pipeline', 'initials': 'LP', 'action': 'imported from Gmail', 'time': datetime.now().isoformat()}],
                'assignee': '',
                'due_date': due,
                'created_by': 'Lead Pipeline',
                'created_at': datetime.now().isoformat(),
                'contact_name': lead.get('contactName', lead.get('contact_name', '')),
                'email': lead.get('email', lead.get('email_address', '')),
                'phone': lead.get('phone', ''),
                'business_name': lead.get('businessName', lead.get('company_name', '')),
                'job_title': lead.get('jobTitle', ''),
                'lead_source': lead.get('leadSource', 'GMAIL'),
                'estimated_value': str(lead.get('estimatedValue', lead.get('estimated_value', '') or '')),
                'priority': priority,
                'intent': lead.get('intent', ''),
                'email_id': lead.get('email_id', ''),
                'gmail_thread_id': full_email.get('gmail_thread_id', ''),
                'original_email': [{
                    'cached': True,
                    'from': full_email.get('from', ''),
                    'email': full_email.get('email', ''),
                    'subject': full_email.get('subject', ''),
                    'date': full_email.get('date', ''),
                    'snippet': full_email.get('snippet', ''),
                    'gmail_thread_id': full_email.get('gmail_thread_id', ''),
                }],
                'draft_reply': '',
                'draft_reply_status': 'pending',
            }

            new_cards.append(card)
            next_id += 1

        if new_cards:
            supabase_request('POST', f'/rest/v1/{SUPABASE_TABLE}', data=new_cards, return_repr=True)

        return len(new_cards), 0
    except Exception as e:
        print(f"   ⚠ Supabase write error: {e}")
        return 0, len(cards)


def stream_import_leads(emails, existing_emails):
    """Stream extract leads and import to Kanban as batches finish.

    Imports in chunks of 20 cards per Supabase write for efficiency.
    Saves checkpoint after each chunk so we can resume if interrupted.
    """
    print(f"   Streaming extraction + import for {len(emails)} emails...")

    BATCH_SIZE = 20
    batch = []
    total_imported = 0
    skipped_dup = 0
    seen = set()

    def save_extraction_cp():
        save_checkpoint('extracted', {
            'imported': total_imported,
            'skipped': skipped_dup,
            'seen': list(seen),
            '_filtered_emails': emails,
        })

    save_extraction_cp()

    for lead in extract_leads_with_ai_stream(emails):
        batch.append(lead)
        seen.add(lead.get('email', '').lower().strip())

        if len(batch) >= BATCH_SIZE:
            imported, skipped = _write_card_batch(batch)
            total_imported += imported
            skipped_dup += skipped
            print(f"   ✅ Imported batch: {imported} new | Total: {total_imported} imported")
            save_extraction_cp()
            batch = []

    if batch:
        imported, skipped = _write_card_batch(batch)
        total_imported += imported
        save_extraction_cp()

    print(f"\n✅ Streaming import done: {total_imported} new leads imported, {skipped_dup} duplicates skipped")
    return total_imported


def get_existing_kanban_emails():
    """Get set of emails already in Supabase cards table for dedup."""
    try:
        emails = set()
        offset = 0
        while True:
            result = supabase_request('GET', f'/rest/v1/{SUPABASE_TABLE}?select=email&limit=1000&offset={offset}')
            if not result:
                break
            for card in result:
                email_addr = card.get('email', '').strip().lower()
                if email_addr and '@' in email_addr:
                    emails.add(email_addr)
            if len(result) < 1000:
                break
            offset += 1000
        print(f"   📋 Found {len(emails)} emails already in Kanban")
        return emails
    except Exception as e:
        print(f"   ⚠ Could not fetch existing Kanban emails: {e}")
        return set()


def _leads_to_cards(all_leads, emails_map):
    """Convert AI leads + email dicts into Kanban card dicts, yield one by one."""
    for lead in all_leads:
        email = emails_map.get(lead.get('email_id', ''), lead.get('original_email', {}))

        title = lead.get('title', '')
        name = lead.get('contact_name', '')
        company = lead.get('company_name', '')
        if not title:
            if name and company and company not in name:
                title = f"{name} — {company}"
            elif name:
                title = name
            else:
                title = email.get('subject', 'New Lead')[:60]

        description = lead.get('description', '')
        if not description:
            intent = lead.get('intent', '')
            body = email.get('body', '') or email.get('snippet', '')
            description = f"WHAT: {intent}\n\nORIGINAL EMAIL:\n{body[:1000]}"

        priority = lead.get('priority', 'warm')
        if priority not in ('hot', 'warm', 'cold'):
            priority = 'warm'

        body_text = (email.get('body', '') + email.get('snippet', ''))
        phone = lead.get('phone', '')
        if not phone:
            ph = re.search(r'(\+?1?[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}', body_text)
            phone = ph.group(0) if ph else ''

        email_addr = lead.get('email', lead.get('email_address', ''))
        contact_name = lead.get('contact_name', '')
        if not contact_name and email_addr:
            name_match = re.match(r'([^@]+)@', email_addr)
            if name_match:
                raw = name_match.group(1).replace('.', ' ').replace('_', ' ')
                contact_name = ' '.join(w.capitalize() for w in raw.split() if len(w) > 1)

        yield {
            'title': title,
            'description': description,
            'priority': priority,
            'contactName': contact_name,
            'email': email_addr,
            'phone': phone,
            'businessName': lead.get('company_name', ''),
            'jobTitle': lead.get('job_title', ''),
            'estimatedValue': str(lead.get('estimated_value', '')),
            'leadSource': 'GMAIL',
            'intent': lead.get('intent', ''),
            'follow_up_urgency': lead.get('urgency', 'medium'),
            'email_id': lead.get('email_id', email.get('id', '')),
            'original_email': [email],
            'linkedin_url': lead.get('linkedin_url', ''),
            'website': lead.get('website', ''),
            'location': lead.get('location', ''),
            'draft_reply': '',
            'draft_reply_status': 'pending',
        }


def extract_leads_with_ai_stream(emails):
    """Extract leads from ALL emails in ONE API call, yielding one by one for streaming import."""
    if not emails:
        return

    import openai
    client = openai.OpenAI(api_key=OPENAI_API_KEY)
    emails_map = {e['id']: e for e in emails}

    def _extract_batch(batch):
        prompt = build_extraction_prompt(batch)
        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a lead qualification assistant. Extract structured data from emails. You MUST respond with ONLY a valid JSON array — nothing else. No markdown, no explanation, no text before or after. The array must use double quotes for all keys and string values."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=8000,
                timeout=120.0
            )
            result_text = response.choices[0].message.content
            if "```json" in result_text:
                result_text = result_text.split("```json")[1].split("```")[0]
            elif "```" in result_text:
                result_text = result_text.split("```")[1].split("```")[0]
            return json.loads(result_text)
        except Exception as e:
            return []

    from concurrent.futures import ThreadPoolExecutor, as_completed
    CONCURRENT_EXTRACT = 5
    BATCH_SIZE = min(45, len(emails))
    chunks = [emails[i:i+BATCH_SIZE] for i in range(0, len(emails), BATCH_SIZE)]

    print(f"   🔄 Extracting {len(emails)} leads in {len(chunks)} parallel batches (~{BATCH_SIZE} emails each)...")
    all_leads = []
    errors = 0

    with ThreadPoolExecutor(max_workers=CONCURRENT_EXTRACT) as executor:
        futures = {executor.submit(_extract_batch, chunk): chunk for chunk in chunks}
        for future in as_completed(futures):
            result = future.result()
            if result:
                all_leads.extend(result)
            else:
                errors += 1
            time.sleep(0.2)

    if not all_leads and errors == len(chunks):
        print(f"   ⚠ All parallel batches failed — trying sequential 20-email batches...")
        all_leads = []
        for chunk in [emails[i:i+20] for i in range(0, len(emails), 20)]:
            leads = _extract_batch(chunk)
            if leads:
                all_leads.extend(leads)
            time.sleep(0.5)

    print(f"   ✅ Extracted {len(all_leads)} leads from {len(emails)} emails")

    # Regex fallback for emails AI missed
    extracted_ids = {l.get('email_id') for l in all_leads if l.get('email_id')}
    for email in emails:
        if email['id'] not in extracted_ids:
            lead = regex_extract_lead(email)
            lead['original_email'] = email
            all_leads.append(lead)

    for card in _leads_to_cards(all_leads, emails_map):
        yield card

    save_checkpoint('extracted', {
        'imported': 0,
        'skipped': 0,
        'seen': [],
        '_filtered_emails': emails,
    })


def build_extraction_prompt(batch):
    """Build prompt for lead extraction — professional lead data for B2B sales"""
    emails_text = []
    for i, email in enumerate(batch):
        emails_text.append(f"""
EMAIL {i+1}:
- ID: {email['id']}
- Subject: {email['subject']}
- From: {email['from']}
- Date: {email['date']}
- Snippet: {email['snippet']}
- Body: {email.get('body', '')[:3000]}
---
""")

    return f"""You are a senior B2B lead qualification analyst. For each email, extract and return a JSON object with ALL of these fields. Every field must be filled — use your best inference rather than leaving anything null.

**contact_name** = Full name of the sender. Look in From header and email body. Format: "First Last". If you can't find a name, extract from email address (e.g. "john.smith" → "John Smith").

**email_address** = Sender's email address. Extract from From header or signature.

**phone** = Phone number if found in email body or signature. Include country code if present. Null if not found.

**company_name** = Company or organization they represent. Extract from email domain, signature, or body. This is critical — do not leave null.

**job_title** = Their job title or role (e.g. "Founder", "CEO", "Head of Partnerships", "VP Marketing"). Null if not stated.

**title** = Card title format: "ACTION | Company" — e.g. "Podcast guest invite | TechCrunch" or "Sponsorship proposal | Anthropic" or "Partnership discussion | NVIDIA". Max 60 chars. This goes on the Kanban card.

**description** = Rich lead summary (4-6 sentences, this is the main card content):
WHO: [Full name], [Job Title] at [Company]. [One sentence about them personally — their role, background, or what they're known for].
COMPANY: [Company name]. [One sentence about the company — what they do, their size/reach if mentioned, notable products or news].
WHAT: [EXACTLY what they want from the recipient — specific ask, proposal, or opportunity. Be verbatim where possible].
VALUE: [Dollar amounts, budget, equity, or valuation mentioned. If nothing stated, write "TBD — budget not disclosed"].
TIMELINE: [When they want a response or action — deadline, urgency, or "flexible"].
WHY THEM: [Why they specifically chose this person to reach out to — their stated reason or your inference].

Example: "WHO: Marcus Reid, Founder at LumenXR. Previously led spatial computing at Apple.
COMPANY: LumenXR. Early-stage startup building AR glasses for industrial use, raised $4M seed.
WHAT: Wants Robert Scoble to review their developer kit and post his honest reaction on X/Twitter. Offering $2,500 for 3 posts.
VALUE: $2,500 USD for sponsored content.
TIMELINE: Ideally within 2 weeks before their press embargo lifts.
WHY THEM: Specifically cited Robert's spatial computing coverage as why they reached out."

**priority** = "hot" if: (a) money/budget is stated and they're ready to move, (b) deadline is within 48h, (c) they explicitly say "ready to pay" or "let's do this". "warm" if genuine interest with a real ask but no urgent timeline. "cold" if vague outreach, introduction request, or no specific action described.

**estimated_value** = Dollar amount if any number, budget, or compensation is mentioned (e.g. 5000, 15000, 100000). Null if no monetary value stated.

**intent** = One sentence — THE specific action they want. "Schedule a 30-min call" is better than "discuss partnership". "Pay $5K for 3 sponsored posts" is better than "monetization opportunity".

**urgency** = "high" if they mention a deadline, embargo, event date, or say "ASAP"/"urgent". Otherwise "medium". "low" if they say "when you have time" or "no rush".

**linkedin_url** = LinkedIn profile URL if found in email body or signature. Null if not present.

**website** = Company website if found in email body, signature, or can be inferred from company name. Null if not found.

**location** = City, state, or country if mentioned in signature or body. Helps prioritize geographically relevant leads. Null if not stated.

Emails:
{"".join(emails_text)}

Return a JSON array of lead objects with ALL fields populated. Do not omit any field. No markdown, no explanation — just the JSON array."""


def email_dict_to_lead(email):
    """Basic regex extraction as fallback"""
    lead = regex_extract_lead(email)
    lead['original_email'] = email
    return lead


def regex_extract_lead(email):
    """Fallback extraction using regex when AI unavailable"""
    subject = email.get('subject', '')
    sender = email.get('from', '')
    body = email.get('body', '')
    snippet = email.get('snippet', '')
    search_text = (subject + ' ' + sender + ' ' + body + ' ' + snippet).lower()

    email_match = re.search(r'[\w.+-]+@[\w-]+\.[\w.-]+', sender)
    email_address = email_match.group(0) if email_match else ''

    name_match = re.search(r'^([^<]+)\s*<', sender)
    contact_name = name_match.group(1).strip().strip('"') if name_match else ''

    domain_match = re.search(r'@([\w-]+)\.', email_address)
    company_name = ''
    if domain_match:
        domain = domain_match.group(1)
        company_name = domain.capitalize()

    phone_match = re.search(r'(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}', search_text)
    phone = phone_match.group(0) if phone_match else ''

    money_matches = re.findall(r'\$[\d,]+(?:\.\d{2})?(?:K|M|B)?|\d+(?:,\d{3})*(?:\.\d{2})?\s*(?:dollars|usd|k\b|million|billion)', search_text, re.IGNORECASE)
    estimated_value = None
    if money_matches:
        val = money_matches[0].replace('$', '').replace(',', '')
        try:
            val_num = float(re.sub(r'[a-zA-Z]', '', val))
            if 'k' in money_matches[0].lower():
                val_num *= 1000
            elif 'm' in money_matches[0].lower():
                val_num *= 1000000
            estimated_value = val_num
        except:
            pass

    priority = 'warm'
    if any(w in search_text for w in ['urgent', 'asap', 'deadline', 'today', 'immediately', 'hours left']):
        priority = 'hot'
    elif any(w in search_text for w in ['no rush', 'whenever', 'when you get a chance', 'someday']):
        priority = 'cold'

    lead_source = 'GMAIL'
    intent = email.get('snippet', '')[:300]
    if not intent:
        intent = email.get('body', '')[:300]

    return {
        'priority': priority,
        'contact_name': contact_name,
        'email_address': email_address,
        'phone': phone,
        'company_name': company_name,
        'estimated_value': estimated_value,
        'intent': intent,
        'lead_source': 'GMAIL',
        'follow_up_urgency': 'medium',
        'email_id': email.get('id', ''),
        'subject': subject,
        'original_email': email
    }


# ─── KANBAN DEDUP ──────────────────────────────────────────────────────────────

def get_existing_leads_from_kanban():
    """Get existing lead email addresses from Supabase cards table."""
    try:
        emails = set()
        offset = 0
        while True:
            result = supabase_request('GET', f'/rest/v1/{SUPABASE_TABLE}?select=email&limit=1000&offset={offset}')
            if not result:
                break
            for card in result:
                email_addr = card.get('email', '')
                if email_addr:
                    emails.add(email_addr.lower())
            if len(result) < 1000:
                break
            offset += 1000

        print(f"   Found {len(emails)} existing leads in Kanban")
        return emails
    except Exception as e:
        print(f"   ⚠ Could not fetch existing leads: {e}")
        return set()


def deduplicate_leads(leads, existing_emails):
    """Remove leads already in Kanban"""
    new_leads = []
    skipped = 0

    for lead in leads:
        email = lead.get('email_address', '').lower()
        if email and email in existing_emails:
            skipped += 1
            continue

        seen = [l.get('email_address', '').lower() for l in new_leads]
        if email and email in seen:
            skipped += 1
            continue

        new_leads.append(lead)

    if skipped:
        print(f"   Skipped {skipped} duplicates")
    return new_leads


# ─── KANBAN IMPORT ─────────────────────────────────────────────────────────────

def format_original_email(email):
    """Extract the relevant fields from a Gmail message dict for the card's original_email field."""
    if not email:
        return {}
    headers = {}
    for h in email.get('payload', {}).get('headers', []):
        headers[h['name'].lower()] = h['value']

    body = ''
    payload = email.get('payload', {})
    if 'parts' in payload:
        for part in payload['parts']:
            if part.get('mimeType') == 'text/plain' and 'data' in part:
                body = base64.urlsafe_b64decode(part['data']).decode('utf-8', errors='replace')
                break
    elif 'data' in payload:
        body = base64.urlsafe_b64decode(payload['data']).decode('utf-8', errors='replace')

    from_raw = headers.get('from', '')
    email_match = re.search(r'<([^>]+)>', from_raw)
    email_addr = email_match.group(1) if email_match else from_raw
    from_name = re.sub(r'<[^>]+>', '', from_raw).strip()

    return {
        'from': from_name or email_addr,
        'email': email_addr,
        'subject': headers.get('subject', ''),
        'date': headers.get('date', ''),
        'body': body[:8000],
        'snippet': email.get('snippet', ''),
        'gmail_thread_id': email.get('threadId', ''),
    }


def import_leads_to_kanban(leads):
    """Import new leads as cards in Supabase cards table."""
    if not leads:
        print("\n✅ No new leads to import")
        return []

    next_id = get_current_card_id_counter()
    new_cards = []
    imported = []

    for lead in leads:
        card_id = next_id
        next_id += 1

        full_email = format_original_email(lead.get('original_email', {}))
        card = {
            'id': card_id,
            'title': lead.get('title', build_card_title(lead)),
            'list_id': LEAD_DEFAULT_LIST,
            'labels': [build_priority_label(lead.get('priority', 'warm'))],
            'description': lead.get('description', lead.get('intent', '')),
            'checklist': [],
            'activity': [{
                'user': 'Lead Pipeline',
                'initials': 'LP',
                'action': 'imported from Gmail',
                'time': datetime.now().isoformat()
            }],
            'assignee': '',
            'due_date': build_due_date(lead),
            'created_by': 'Lead Pipeline',
            'created_at': datetime.now().isoformat(),
            'contact_name': lead.get('contactName', lead.get('contact_name', '')),
            'email': lead.get('email', lead.get('email_address', '')),
            'phone': lead.get('phone', ''),
            'business_name': lead.get('businessName', lead.get('company_name', '')),
            'lead_source': lead.get('leadSource', lead.get('lead_source', 'GMAIL')),
            'estimated_value': lead.get('estimatedValue', str(lead.get('estimated_value', '')) if lead.get('estimated_value') else ''),
            'priority': lead.get('priority', 'warm'),
            'intent': lead.get('intent', ''),
            'email_id': lead.get('email_id', ''),
            'gmail_thread_id': lead.get('original_email', {}).get('gmail_thread_id', ''),
            'original_email': [{
                'cached': True,
                'from': full_email.get('from', ''),
                'email': full_email.get('email', ''),
                'subject': full_email.get('subject', ''),
                'date': full_email.get('date', ''),
                'snippet': full_email.get('snippet', ''),
                'gmail_thread_id': full_email.get('gmail_thread_id', ''),
            }],
            'draft_reply': '',
            'draft_reply_status': 'pending'
        }

        new_cards.append(card)
        imported.append(card)

    if new_cards:
        supabase_request('POST', f'/rest/v1/{SUPABASE_TABLE}', data=new_cards, return_repr=True)

    print(f"\n✅ Imported {len(imported)} new leads to Kanban (Backlog)")
    return imported


def build_card_title(lead):
    """Build descriptive card title"""
    name = lead.get('contact_name', 'Unknown')
    company = lead.get('company_name', '')
    subject = lead.get('subject', '')

    if company and company not in name:
        return f"{name} — {company}"
    elif name:
        return name
    elif subject:
        return subject[:80]
    else:
        return "New Lead"


def build_priority_label(priority):
    """Map priority to label"""
    mapping = {
        'hot': {'name': '🔥 Hot', 'color': 'red'},
        'warm': {'name': '🌡️ Warm', 'color': 'yellow'},
        'cold': {'name': '❄️ Cold', 'color': 'blue'}
    }
    return mapping.get(priority, mapping['warm'])


def build_due_date(lead):
    """Calculate due date based on urgency"""
    urgency = lead.get('follow_up_urgency', 'medium')
    days = {'high': 1, 'medium': 3, 'low': 7}.get(urgency, 3)
    due = datetime.now() + timedelta(days=days)
    return due.strftime('%Y-%m-%d')


# ─── AI REPLY DRAFTER ─────────────────────────────────────────────────────────

def build_reply_prompt(lead, company_context=""):
    """Build prompt for reply drafting"""
    email = lead.get('original_email', {})

    return f"""You are an assistant drafting a first-response email for a sales/business inquiry.

SENDER INFO:
- Name: {lead.get('contact_name', 'Unknown')}
- Company: {lead.get('company_name', 'Unknown')}
- Email: {lead.get('email_address', '')}
- Phone: {lead.get('phone', 'Not provided')}
- What they want: {lead.get('intent', 'See email below')}

ORIGINAL EMAIL:
- Subject: {email.get('subject', '')}
- From: {email.get('from', '')}
- Date: {email.get('date', '')}
- Body: {email.get('body', email.get('snippet', ''))[:2000]}

COMPANY CONTEXT:
{company_context}

TASK:
Write a professional, warm, and concise first-response email. The tone should be:
- Friendly and personable (not corporate robot)
- Genuinely interested in their inquiry
- Clear about next steps
- Not pushy or salesy
- If you don't have pricing, say "I'd love to learn more about your needs first" rather than ignoring the question

Format your response as JSON with this structure:
{{"subject": "email subject line", "body": "full email body with proper line breaks"}}

Do NOT include any text outside the JSON."""


def draft_reply_for_lead(lead, company_context=""):
    """Draft a reply for a single lead using AI"""
    if not OPENAI_API_KEY:
        return build_fallback_reply(lead)

    try:
        import openai
        client = openai.OpenAI(api_key=OPENAI_API_KEY)

        prompt = build_reply_prompt(lead, company_context)

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a professional sales assistant. Always respond with valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=2000,
        )

        result_text = response.choices[0].message.content

        if "```json" in result_text:
            result_text = result_text.split("```json")[1].split("```")[0]
        elif "```" in result_text:
            result_text = result_text.split("```")[1].split("```")[0]

        reply_data = json.loads(result_text)
        return {
            'subject': reply_data.get('subject', f"Re: {lead.get('subject', '')}"),
            'body': reply_data.get('body', ''),
            'status': 'drafted'
        }

    except Exception as e:
        print(f"   ⚠ Reply draft error for {lead.get('email_address', 'unknown')}: {e}")
        return build_fallback_reply(lead)


def build_fallback_reply(lead):
    """Build a basic reply when AI unavailable"""
    name = lead.get('contact_name', 'there')
    subject = f"Re: {lead.get('subject', 'your message')}"
    body = f"""Hi {name},

Thanks for reaching out — I really appreciate you getting in touch.

I've received your message and would love to learn more about what you're looking for. I'll review your inquiry and get back to you shortly with some thoughts.

In the meantime, feel free to check out what we're building at unaligned.io.

Best,
Robert Scoble
Founder, Unaligned
+1-425-205-1921"""

    return {'subject': subject, 'body': body, 'status': 'drafted'}


def enrich_threads_for_leads(service, imported_cards):
    """Post-process: fetch full email thread for each lead card in parallel.

    Adds the full conversation history + firstEmailDate to each card's 'thread' field.
    Runs after import so the card IDs are already assigned.
    """
    if not imported_cards:
        return 0, 0

    needs_enrich = [c for c in imported_cards if c.get('gmail_thread_id') and not c.get('thread')]
    if not needs_enrich:
        print(f"   ✅ All {len(imported_cards)} cards already have threads")
        return 0, 0

    print(f"   🔗 Enriching {len(needs_enrich)} cards with threads (10 concurrent)...")

    from concurrent.futures import ThreadPoolExecutor, as_completed

    def _enrich_one(args):
        card_id, thread_id = args['card_id'], args['thread_id']
        thread_messages = fetch_gmail_thread(service, thread_id)
        if not thread_messages:
            return {'card_id': card_id, 'thread': None, 'firstEmailDate': None}
        first_email = thread_messages[0] if thread_messages else None
        return {
            'card_id': card_id,
            'thread': thread_messages,
            'firstEmailDate': first_email.get('date') if first_email else None,
        }

    cards_by_id = {card.get('id') or card.get('email_id'): card for card in imported_cards}
    work_items = [{'card_id': card.get('id') or card.get('email_id'), 'thread_id': card.get('gmail_thread_id')}
                  for card in needs_enrich]

    updated = 0
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(_enrich_one, item): item for item in work_items}
        for future in as_completed(futures):
            result = future.result()
            if result and result['thread']:
                card = cards_by_id.get(result['card_id'])
                if card:
                    card['thread'] = result['thread']
                    if result['firstEmailDate']:
                        card['firstEmailDate'] = result['firstEmailDate']
                    updated += 1

    skipped = len(needs_enrich) - updated
    if skipped:
        print(f"   ⚠ {skipped} cards had no thread ID or failed to fetch")
    print(f"   ✅ Enriched {updated} cards with full email threads")
    return updated, skipped


def enrich_threads_post_import(imported_cards):
    """Standalone thread enrichment — call after pipeline finishes to backfill threads.

    Reuses the original emails from Supabase to get the thread IDs,
    then fetches full thread content from Gmail.
    """
    print(f"\n🔗 Enriching threads for {len(imported_cards)} cards...")

    service = get_gmail_service()
    if not service:
        print("   ❌ Could not connect to Gmail — skipping thread enrichment")
        return 0

    enriched, _ = enrich_threads_for_leads(service, imported_cards)

    if enriched > 0:
        # Write enriched threads back to Supabase using PATCH per card
        for card in imported_cards:
            if card.get('thread'):
                card_id = card.get('id')
                if card_id:
                    update_data = {
                        'thread': card.get('thread', []),
                    }
                    if card.get('firstEmailDate'):
                        update_data['first_email_date'] = card.get('firstEmailDate')
                    try:
                        supabase_request('PATCH', f'/rest/v1/{SUPABASE_TABLE}?id=eq.{card_id}', data=update_data)
                    except Exception as e:
                        print(f"   ⚠ Failed to update thread for card {card_id}: {e}")
        print(f"   ✅ Wrote {enriched} enriched threads to Supabase")

    return enriched


def draft_replies_for_leads(imported_cards, company_context=""):
    """Draft replies for all imported leads and save to Supabase."""
    if not imported_cards:
        print("\n📝 No leads to draft replies for")
        return 0

    print(f"\n📝 Drafting replies for {len(imported_cards)} leads...")

    drafted = 0
    for card in imported_cards:
        lead = {
            'contact_name': card.get('contact_name', card.get('contactName', '')),
            'company_name': card.get('business_name', card.get('businessName', '')),
            'email_address': card.get('email', ''),
            'phone': card.get('phone', ''),
            'subject': card.get('title', ''),
            'original_email': [{
                'subject': card.get('title', ''),
                'from': card.get('email', ''),
                'body': card.get('description', ''),
                'snippet': card.get('description', '')[:500]
            }]
        }

        reply = draft_reply_for_lead(lead, company_context)

        card['draft_reply'] = json.dumps({
            'subject': reply['subject'],
            'body': reply['body'],
            'drafted_at': datetime.now().isoformat()
        })
        card['draft_reply_status'] = reply['status']

        drafted += 1
        print(f"   ✅ Drafted reply for {lead.get('contact_name', 'Unknown')} ({lead.get('email_address', '')})")

        time.sleep(0.3)

    # Save back to Supabase using PATCH per card
    for card in imported_cards:
        card_id = card.get('id')
        if card_id:
            update_data = {
                'draft_reply': card.get('draft_reply', ''),
                'draft_reply_status': card.get('draft_reply_status', 'pending'),
            }
            try:
                supabase_request('PATCH', f'/rest/v1/{SUPABASE_TABLE}?id=eq.{card_id}', data=update_data)
            except Exception as e:
                print(f"   ⚠ Failed to update draft for card {card_id}: {e}")

    print(f"\n✅ Saved {drafted} draft replies to Kanban cards")
    return drafted


# ─── STATUS REPORTER ───────────────────────────────────────────────────────────

def save_pipeline_stats(emails_found, emails_scraped, leads_extracted, new_leads, imported):
    """Write pipeline run stats to Supabase pipeline_stats table."""
    try:
        now = datetime.now()
        run = {
            'timestamp': now.isoformat(),
            'emails_found': emails_found,
            'emails_scraped': emails_scraped,
            'leads_extracted': leads_extracted,
            'new_leads': len(new_leads),
            'imported': len(imported),
            'by_platform': {'GMAIL': len([l for l in new_leads if l.get('lead_source') == 'GMAIL'])},
        }

        try:
            existing = supabase_request('GET', '/rest/v1/pipeline_stats?select=runs,last_run&id=eq.pipeline_stats_global&limit=1')
            if existing and len(existing) > 0:
                stats_doc = existing[0]
                runs = stats_doc.get('runs', [])
                runs.append(run)
                runs = runs[-30:]
                supabase_request('PATCH', '/rest/v1/pipeline_stats?id=eq.pipeline_stats_global', data={'runs': runs, 'last_run': run})
            else:
                supabase_request('POST', '/rest/v1/pipeline_stats', data={'id': 'pipeline_stats_global', 'runs': [run], 'last_run': run})
        except Exception:
            pass

        print(f"   ✅ Stats saved")
    except Exception as e:
        print(f"   ⚠ Stats save failed: {e}")


def print_summary(emails_found, emails_scraped, leads_extracted, new_leads, imported):
    """Print pipeline summary"""
    save_pipeline_stats(emails_found, emails_scraped, leads_extracted, new_leads, imported)

    print("""
╔══════════════════════════════════════════════════════════╗
║              LEAD PIPELINE SUMMARY                       ║
╠══════════════════════════════════════════════════════════╣""")
    print(f"║  Emails matching keywords:        {str(emails_found):>6}           ║")
    print(f"║  Emails fully scraped:            {str(emails_scraped):>6}           ║")
    print(f"║  Leads extracted:                  {str(leads_extracted):>6}           ║")
    print(f"║  New leads (not duplicates):      {str(len(new_leads)):>6}           ║")
    print(f"║  Leads imported to Kanban:         {str(len(imported)):>6}           ║")
    print("""╠══════════════════════════════════════════════════════════╣
║  Next: Review drafts in Kanban and hit send!             ║
╚══════════════════════════════════════════════════════════╝""")


# ─── MAIN PIPELINE ─────────────────────────────────────────────────────────────

def get_last_scraped_at():
    """Read last scraped timestamp from Supabase pipeline_config table so we only fetch new emails."""
    try:
        result = supabase_request('GET', '/rest/v1/pipeline_config?select=last_scraped_at&id=eq._pipeline&limit=1')
        if result and len(result) > 0:
            return result[0].get('last_scraped_at', '')
    except Exception:
        pass
    return ''


def set_last_scraped_at():
    """Save current timestamp so next run only fetches newer emails in Supabase."""
    try:
        now = datetime.now().isoformat()
        try:
            existing = supabase_request('GET', '/rest/v1/pipeline_config?select=id&id=eq._pipeline&limit=1')
            if existing and len(existing) > 0:
                supabase_request('PATCH', '/rest/v1/pipeline_config?id=eq._pipeline', data={'last_scraped_at': now})
            else:
                supabase_request('POST', '/rest/v1/pipeline_config', data={'id': '_pipeline', 'last_scraped_at': now})
        except Exception:
            pass
    except Exception:
        pass


def run_full_pipeline(company_context="", days_back=30):
    """Run the complete lead pipeline"""
    print("""
🚀 UNALIGNED LEAD PIPELINE
━━━━━━━━━━━━━━━━━━━━━━━━━
""")

    # Step 1: Connect to Gmail
    print("1️⃣ Connecting to Gmail...")
    service = get_gmail_service()
    if not service:
        return
    print("   ✅ Connected")

    # Check for incremental scrape window
    last_scraped = get_last_scraped_at()
    if last_scraped:
        from email.utils import parsedate_to_datetime
        try:
            last_dt = parsedate_to_datetime(last_scraped)
            days_back = max(1, (datetime.now() - last_dt).days + 1)
            print(f"   📅 Incremental scrape: only emails since {last_scraped[:10]}")
        except Exception:
            pass

    # Step 2: Scrape emails
    print(f"\n2️⃣ Scraping Gmail (last {days_back} days)...")
    emails = scrape_gmail(service, days_back=days_back)
    if not emails:
        print("   ❌ No emails found")
        return
    print(f"   ✅ Scraped {len(emails)} emails")
    set_last_scraped_at()

    # Step 3: Filter for business relevance
    print("\n3️⃣ Filtering for business leads only...")
    relevant_emails = filter_relevant_leads(emails)

    if not relevant_emails:
        print("   ❌ No business leads found")
        return

    save_checkpoint('filtered', relevant_emails)

    # Step 4: Get existing emails for dedup
    print("\n4️⃣ Streaming extraction + import...")
    existing_emails = get_existing_kanban_emails()

    # Stream: extract + import in batches as leads come in
    imported = stream_import_leads(relevant_emails, existing_emails)

    # Step 5: Draft replies for newly imported
    print("\n5️⃣ Drafting personalized replies...")
    drafted = draft_replies_for_leads(imported, company_context)

    # Step 6: Enrich cards with full email threads (oldest-first)
    print("\n6️⃣ Fetching full email threads...")
    enrich_threads_post_import(imported)

    # Summary
    print_summary(len([e for e in emails if e.get('keywords')]), len(emails), len(leads), new_leads, len(imported))

    return imported


def run_from_backup():
    """Load from saved JSON backup and run pipeline without re-scraping."""
    backup_file = os.path.expanduser('~/.config/google-credentials/scraped_emails_backup.json')
    if not os.path.exists(backup_file):
        print(f"❌ No backup found at {backup_file}")
        return None

    emails = json.load(open(backup_file))
    print(f"📂 Loaded {len(emails)} emails from backup: {backup_file}")
    print(f"   Step 3: Filtering...")
    relevant = filter_relevant_leads(emails)
    if not relevant:
        print("   ❌ No business leads found")
        return
    save_checkpoint('filtered', relevant)
    print(f"   Step 4: Extracting + streaming import for {len(relevant)} emails...")
    existing_emails = get_existing_kanban_emails()
    imported = stream_import_leads(relevant, existing_emails)
    print("\n5️⃣ Drafting personalized replies...")
    drafted = draft_replies_for_leads(imported, "")
    print("\n6️⃣ Fetching full email threads...")
    enrich_threads_post_import(imported)
    print(f"\n✅ Done! {len(imported)} leads processed from backup.")
    return imported


def run_resume():
    """Resume from last checkpoint instead of re-scraping."""
    cp = load_checkpoint()
    if not cp:
        print("❌ No checkpoint found — run normally first")
        return None

    stage = cp['stage']
    print(f"🔄 Resuming from checkpoint: stage={stage}, timestamp={cp['timestamp']}")

    if stage == 'scraped':
        emails = cp['data']
        print(f"   Loaded {len(emails)} scraped emails")
        print(f"   Step 3: Filtering...")
        relevant = filter_relevant_leads(emails)
        print(f"   Step 4: Extracting + streaming import for {len(relevant)} emails...")
        existing_emails = get_existing_kanban_emails()
        stream_import_leads(relevant, existing_emails)
        return
    elif stage == 'filtered':
        relevant = cp['data']
        print(f"   Loaded {len(relevant)} filtered leads")
        print(f"   Streaming extraction + import...")
        existing_emails = get_existing_kanban_emails()
        stream_import_leads(relevant, existing_emails)
        return
    elif stage == 'extracted':
        cp_data = cp.get('data', {})
        filtered_emails = cp_data.get('_filtered_emails', [])
        imported = cp_data.get('imported', 0)
        skipped = cp_data.get('skipped', 0)
        seen = set(cp_data.get('seen', []))
        print(f"   Resuming from extracted checkpoint: {imported} imported, {skipped} skipped, {len(seen)} seen")
        if not filtered_emails:
            print("   ⚠ No filtered emails in checkpoint — cannot resume. Run full pipeline again.")
            return None
        existing_emails = get_existing_kanban_emails()
        already_handled = seen | existing_emails
        stream_import_leads(filtered_emails, already_handled)
        return
    else:
        print(f"❌ Unknown checkpoint stage: {stage}")
        return None


def run_gmail_only(days_back=30):
    """Scrape Gmail and save leads to JSON (no Kanban write)"""
    print("📧 Gmail-only mode...\n")

    service = get_gmail_service()
    if not service:
        return

    emails = scrape_gmail(service, days_back=days_back)

    output_file = os.path.expanduser("~/.config/google-credentials/gmail_leads.json")
    with open(output_file, 'w') as f:
        json.dump({'leads': emails, 'scraped_at': datetime.now().isoformat()}, f, indent=2, default=str)

    print(f"\n✅ Saved {len(emails)} emails to {output_file}")
    return emails


def run_draft_only(company_context=""):
    """Draft replies for leads already in Supabase that don't have drafts."""
    print("📝 Draft-reply mode — drafting for Kanban leads without replies...\n")

    try:
        result = supabase_request('GET', f'/rest/v1/{SUPABASE_TABLE}?select=*&draft_reply=is.null&email=not.is.null&limit=500')
        if not result:
            print("❌ Could not fetch cards from Supabase")
            return

        cards = result
        needs_draft = [c for c in cards if c.get('email') and not c.get('draft_reply')]

        if not needs_draft:
            print("✅ All leads already have draft replies")
            return

        print(f"   Found {len(needs_draft)} leads needing drafts")
        drafted = draft_replies_for_leads(needs_draft, company_context)
        print(f"✅ Drafted {drafted} replies")
    except Exception as e:
        print(f"❌ Failed to load cards from Supabase: {e}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="UNALIGNED Lead Pipeline")
    parser.add_argument('--gmail-only', action='store_true', help='Scrape Gmail only, save to JSON')
    parser.add_argument('--draft-only', action='store_true', help='Draft replies for existing Kanban leads only')
    parser.add_argument('--resume', action='store_true', help='Resume from last checkpoint (skip re-scrape)')
    parser.add_argument('--from-backup', action='store_true', help='Load from saved JSON backup and run without re-scraping')
    parser.add_argument('--days', type=int, default=EMAIL_LOOKBACK_DAYS, help=f'Days to look back (default: {EMAIL_LOOKBACK_DAYS})')
    parser.add_argument('--context', type=str, default='', help='Company context for reply drafting')
    args = parser.parse_args()

    if args.from_backup:
        run_from_backup()
    elif args.resume:
        run_resume()
    elif args.gmail_only:
        run_gmail_only(days_back=args.days)
    elif args.draft_only:
        run_draft_only(company_context=args.context)
    else:
        run_full_pipeline(company_context=args.context, days_back=args.days)
