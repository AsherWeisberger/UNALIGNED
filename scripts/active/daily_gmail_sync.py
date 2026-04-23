#!/usr/bin/env python3
"""
Daily Gmail Reply Sync — 9 AM Automation
Checks Gmail for replies to all leads in the Kanban board and updates cards.
Runs every morning at 9 AM via cron.
"""
import os
import sys
import json
import base64
import re
import time
import pickle
import logging
from datetime import datetime, timedelta

# ─── LOGGING ────────────────────────────────────────────────────────────────
_LOG_FILE = os.path.expanduser('~/.config/google-credentials/daily_sync.log')
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(message)s',
                    handlers=[logging.FileHandler(_LOG_FILE), logging.StreamHandler(sys.stdout)])
def log(msg): logging.info(msg)

# ─── GMAIL AUTH ─────────────────────────────────────────────────────────────
CLIENT_SECRET_FILE = os.path.expanduser('~/.config/google-credentials/client_secret.json')
TOKEN_FILE = os.path.expanduser('~/.config/google-credentials/gmail-token.json')

import google.auth.transport.requests
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']

def get_gmail_service():
    creds = None
    if os.path.exists(TOKEN_FILE):
        try:
            creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
        except Exception:
            creds = None

    if not creds:
        log("No token found — need to run one-time OAuth setup")
        flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET_FILE, SCOPES)
        creds = flow.run_local_server(port=0)
        with open(TOKEN_FILE, 'w') as f:
            f.write(creds.to_json())
        log("OAuth complete! Token saved.")

    # Refresh if expired (automatically uses refresh_token from file)
    if creds.expired and creds.refresh_token:
        log("Token expired — refreshing...")
        try:
            creds.refresh(google.auth.transport.requests.Request())
            with open(TOKEN_FILE, 'w') as f:
                f.write(creds.to_json())
            log("Token refreshed!")
        except Exception as e:
            log(f"Refresh failed: {e} — need new OAuth")
            flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET_FILE, SCOPES)
            creds = flow.run_local_server(port=0)
            with open(TOKEN_FILE, 'w') as f:
                f.write(creds.to_json())

    return build('gmail', 'v1', credentials=creds)

# ─── SUPABASE ──────────────────────────────────────────────────────────────
SUPABASE_URL = "https://hbnpwphxjurvtydezwgh.supabase.co"
# Using the anon key (public, safe for client-side use)
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhibnB3cGh4anVydnR5ZGV6d2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTQ1MzIsImV4cCI6MjA5MDk5MDUzMn0.p5E48__GlGqjC17Z28q8fYFK-qV8CmiidYIP02vGe4s"

import urllib.request

def supabase_request(method, path, data=None):
    url = SUPABASE_URL + path
    headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
    }
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())

def load_all_cards():
    """Load all cards from Supabase (paginated)."""
    all_cards = []
    for offset in range(0, 100000, 1000):
        result = supabase_request('GET', f'/rest/v1/cards?select=*&limit=1000&offset={offset}')
        if isinstance(result, list):
            all_cards.extend(result)
            if len(result) < 1000:
                break
        else:
            break
    log(f"Loaded {len(all_cards)} cards from Supabase")
    return all_cards

def upsert_card(card_id, updates):
    """Update a card in Supabase using PATCH (partial update).
    Email thread data goes into the original_email JSONB column.
    """
    # Map camelCase JS keys to snake_case DB columns
    key_map = {
        'emailDate': 'email_date',
        'leadSource': 'lead_source',
        'businessName': 'business_name',
        'contactName': 'contact_name',
        'jobTitle': 'job_title',
        'estimatedValue': 'estimated_value',
        'draftReply': 'draft_reply',
        'draftReplyStatus': 'draft_reply_status',
        'emailId': 'email_id',
        'gmailThreadId': 'gmail_thread_id',
        'linkedinUrl': 'linkedin_url',
        'createdBy': 'created_by',
        'dueDate': 'due_date',
        'listId': 'list_id',
        'originalEmail': 'original_email',
    }
    db_updates = {}
    for k, v in updates.items():
        db_key = key_map.get(k, k)
        if isinstance(v, (dict, list)):
            db_updates[db_key] = json.dumps(v)
        else:
            db_updates[db_key] = v
    if db_updates:
        try:
            supabase_request('PATCH', f'/rest/v1/cards?id=eq.{card_id}', db_updates)
        except Exception as e:
            log(f"  ERROR updating card {card_id}: {e}")

def extract_email_addresses(text):
    """Extract all email addresses from text."""
    if not text: return set()
    return set(re.findall(r'<([^>]+)>|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})',
                          text, re.IGNORECASE))

def extract_headers(payload, name):
    """Extract header value from Gmail payload."""
    for h in payload.get('headers', []):
        if h['name'].lower() == name.lower():
            return h['value']
    return ''

def decode_body(payload):
    """Extract text body from Gmail message payload."""
    body = ''
    if 'parts' in payload:
        for part in payload['parts']:
            if part.get('mimeType') == 'text/plain' and 'body' in part and 'data' in part['body']:
                try:
                    body = base64.urlsafe_b64decode(part['body']['data']).decode('utf-8', errors='replace')
                    break
                except: pass
    elif 'body' in payload and 'data' in payload['body']:
        try:
            body = base64.urlsafe_b64decode(payload['body']['data']).decode('utf-8', errors='replace')
        except: pass
    return body

def format_gmail_email(msg):
    """Convert Gmail message to our email format."""
    headers = {}
    for h in msg.get('payload', {}).get('headers', []):
        headers[h['name'].lower()] = h['value']

    from_raw = headers.get('from', '')
    email_match = re.search(r'<([^>]+)>', from_raw)
    email_addr = email_match.group(1) if email_match else from_raw
    from_name = re.sub(r'<[^>]+>', '', from_raw).strip()

    body = decode_body(msg['payload'])

    return {
        'from': from_name or email_addr,
        'email': email_addr,
        'subject': headers.get('subject', ''),
        'date': headers.get('date', ''),
        'body': body[:2000],
        'snippet': msg.get('snippet', ''),
        'gmail_thread_id': msg.get('threadId', ''),
        'message_id': msg.get('id', ''),
    }

def fetch_gmail_thread(service, thread_id, max_msgs=50):
    """Fetch all messages in a Gmail thread."""
    try:
        thread = service.users().threads().get(userId='me', id=thread_id,
            fields='messages(payload/headers,id,threadId,snippet,internalDate)').execute()
        msgs = thread.get('messages', [])
        return [format_gmail_email(m) for m in msgs[-max_msgs:]]
    except Exception as e:
        log(f"  Error fetching thread {thread_id}: {e}")
        return []

def check_gmail_for_lead_replies(service, cards, checkpoint_file):
    """
    For each card with an email address, check Gmail for new messages
    from/to that address since last check.
    """
    # Load checkpoint
    checkpoint = {}
    if os.path.exists(checkpoint_file):
        with open(checkpoint_file, 'rb') as f:
            checkpoint = pickle.load(f)

    updated_count = 0
    total_checked = 0

    for card in cards:
        email = (card.get('email') or '').strip()
        if not email or '@' not in email:
            continue

        total_checked += 1
        last_check = checkpoint.get(email)
        since_date = last_check if last_check else (datetime.now() - timedelta(days=7)).isoformat()

        # Search Gmail for messages from/to this address
        query = f'from:{email} OR to:{email}'
        try:
            results = service.users().messages().list(
                userId='me',
                q=query,
                maxResults=20
            ).execute()
        except Exception as e:
            log(f"  Gmail search error for {email}: {e}")
            continue

        messages = results.get('messages', [])
        if not messages:
            continue

        # Get full thread data
        card_thread_ids = set()
        if card.get('gmail_thread_id'):
            card_thread_ids.add(card['gmail_thread_id'])
        if card.get('original_email'):
            for em in (card['original_email'] if isinstance(card['original_email'], list) else [card['original_email']]):
                if isinstance(em, dict) and em.get('gmail_thread_id'):
                    card_thread_ids.add(em['gmail_thread_id'])

        new_thread_data = []
        for msg_ref in messages:
            thread_id = msg_ref['threadId']
            # Skip if we already have this thread
            if thread_id in card_thread_ids:
                continue

            thread_emails = fetch_gmail_thread(service, thread_id)
            if thread_emails:
                new_thread_data.extend(thread_emails)
                card_thread_ids.add(thread_id)

        if new_thread_data:
            # Merge with existing thread
            existing = card.get('original_email') or []
            if isinstance(existing, dict):
                existing = [existing]
            merged = existing + new_thread_data

            # Remove duplicates by message_id
            seen = set()
            unique = []
            for em in merged:
                mid = em.get('message_id', '')
                if mid and mid not in seen:
                    seen.add(mid)
                    unique.append(em)

            # Cap at 30 most recent messages, bodies at 2000 chars, to stay under Supabase limits
            unique = unique[-30:]
            for em in unique:
                if isinstance(em.get('body'), str) and len(em['body']) > 2000:
                    em['body'] = em['body'][:2000]

            try:
                upsert_card(card['id'], {
                    'originalEmail': unique,
                    'gmailThreadId': unique[0]['gmail_thread_id'] if unique else '',
                    'emailDate': unique[0]['date'] if unique else '',
                })
                log(f"  ✅ Updated card {card['id']} — {card.get('contact_name', card.get('title', '?'))} — {len(new_thread_data)} new email(s)")
                updated_count += 1
                checkpoint[email] = datetime.now().isoformat()
            except Exception as e:
                log(f"  ❌ Failed card {card['id']} — {e}")

    # Save checkpoint
    with open(checkpoint_file, 'wb') as f:
        pickle.dump(checkpoint, f)

    log(f"\n=== Sync complete: {updated_count}/{total_checked} leads with new activity ===")
    return updated_count

def main():
    log(f"\n{'='*60}")
    log(f"DAILY GMAIL SYNC — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    log(f"{'='*60}")

    # Load cards from Supabase
    cards = load_all_cards()

    if not cards:
        log("No cards found — exiting")
        return

    # Connect to Gmail
    log("Connecting to Gmail...")
    service = get_gmail_service()
    log("Connected!")

    # Check for replies
    checkpoint_file = os.path.expanduser('~/.config/google-credentials/daily_sync_checkpoint.pkl')
    updated = check_gmail_for_lead_replies(service, cards, checkpoint_file)

    log(f"\nDone! {updated} cards updated with new Gmail activity.")

if __name__ == '__main__':
    main()
