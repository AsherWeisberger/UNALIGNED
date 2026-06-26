#!/usr/bin/env python3
"""
Daily Gmail Reply Sync — 9 AM Automation
Checks Gmail for replies to all leads in the Kanban board and updates cards.
Runs every morning at 9 AM via cron.

Optimized 2026-06-23: instead of O(n) per-card Gmail searches, we now do O(1)
query for recent mail TO our addresses and match against card emails.
"""
import os
import sys
import json
import base64
import re
import time
import pickle
import logging
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

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
SUPABASE_KEY = os.getenv('SUPABASE_ANON_KEY', 'eyJhbL...Ge4s')

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
    """Update a card in Supabase using PATCH (partial update)."""
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
            log(f"  ERROR updating card {card_id}: HTTP Error 400")

_extracted_from_addresses = {}

def extract_email_addresses(text):
    """Extract all email addresses from text."""
    if not text:
        return []
    found = []
    for match in re.findall(r'<([^>]+)>|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})', text, re.IGNORECASE):
        email = (match[0] or match[1] or '').strip().lower()
        if email:
            found.append(email)
    seen = set()
    unique = []
    for email in found:
        if email in seen:
            continue
        seen.add(email)
        unique.append(email)
    return unique

def extract_headers(payload, name):
    for h in payload.get('headers', []):
        if h['name'].lower() == name.lower():
            return h['value']
    return ''

def decode_body(payload):
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

def _parse_rfc_date(raw: str) -> str:
    if not raw:
        return ''
    try:
        return parsedate_to_datetime(raw).astimezone(timezone.utc).isoformat()
    except Exception:
        return raw

def format_gmail_email(msg):
    headers = {}
    for h in msg.get('payload', {}).get('headers', []):
        headers[h['name'].lower()] = h['value']

    from_raw = headers.get('from', '')
    email_match = re.search(r'<([^>]+)>', from_raw)
    email_addr = email_match.group(1) if email_match else from_raw
    from_name = re.sub(r'<[^>]+>', '', from_raw).strip()
    to_list = extract_email_addresses(headers.get('to', ''))
    cc_list = extract_email_addresses(headers.get('cc', ''))
    reply_to_list = extract_email_addresses(headers.get('reply-to', ''))

    body = decode_body(msg['payload'])

    return {
        'from': from_name or email_addr,
        'email': email_addr,
        'to': to_list,
        'cc': cc_list,
        'reply_to': reply_to_list,
        'subject': headers.get('subject', ''),
        'date': _parse_rfc_date(headers.get('date', '')),
        'body': body[:2000],
        'snippet': msg.get('snippet', ''),
        'gmail_thread_id': msg.get('threadId', ''),
        'message_id': msg.get('id', ''),
    }

def message_key(em):
    if not isinstance(em, dict):
        return ''
    mid = (em.get('message_id') or '').strip()
    if mid:
        return mid
    return '||'.join([
        (em.get('gmail_thread_id') or '').strip(),
        (em.get('date') or '').strip(),
        (em.get('from') or '').strip().lower(),
        (em.get('subject') or '').strip().lower(),
        (em.get('body') or '').strip()[:300],
    ])

def message_richness(em):
    if not isinstance(em, dict):
        return 0
    score = 0
    for field in ('to', 'cc', 'reply_to'):
        value = em.get(field)
        if value:
            score += 1
    if em.get('message_id'):
        score += 1
    return score

def fetch_gmail_thread(service, thread_id, max_msgs=50):
    try:
        thread = service.users().threads().get(userId='me', id=thread_id,
            fields='messages(payload/headers,id,threadId,snippet,internalDate)').execute()
        msgs = thread.get('messages', [])
        return [format_gmail_email(m) for m in msgs[-max_msgs:]]
    except Exception as e:
        log(f"  Error fetching thread {thread_id}: {e}")
        return []

# ─── NEW OPTIMIZED SYNC LOGIC ──────────────────────────────────────────────

# Our UNALIGNED sending aliases (used to find incoming replies)
UNALIGNED_TO_ADDRS = [
    'haris@unaligned.ai',
]

def check_gmail_for_lead_replies_optimized(service, cards, checkpoint_file):
    """
    Optimized flow:
    1. Build a set of lead emails from our card list (for matching)
       and a reverse map: email -> [card_ids]
    2. Query Gmail ONCE for recent mail sent TO our addresses in the last N days
    3. For each incoming message, check if sender matches a lead email
    4. Fetch full threads only for matched leads
    5. Batch update cards
    """
    checkpoint = {}
    if os.path.exists(checkpoint_file):
        with open(checkpoint_file, 'rb') as f:
            checkpoint = pickle.load(f)

    # Step 1: Build reverse lookup from lead email -> card
    lead_email_to_cards = {}   # email -> [card dict]
    for card in cards:
        email = (card.get('email') or '').strip()
        if not email or '@' not in email:
            continue
        # Also check contact_name and title as fallback lookups
        lead_email_to_cards.setdefault(email, []).append(card)

    log(f"Tracking {len(lead_email_to_cards)} unique lead emails across {len(cards)} cards")

    # Step 2: Query our sent mail for messages TO our addresses in the last N days
    # This captures both direct replies to us AND any forward/reply chain.
    # We use 'sent:' search because we sent initial outreach and reply chains
    # will be under sent. But actually we want INCOMING replies...
    # The best approach: query for messages to our addresses in last N days
    # and also match by card's gmail_thread_id from existing thread data.

    days_back = 7  # look back 7 days for new mail
    since_date_str = (datetime.now() - timedelta(days=days_back)).strftime('%Y/%m/%d')

    # Build search query: messages to our addresses in the last N days
    # Gmail supports multiple domains with OR
    to_clause = ' OR '.join([f'to:"{a}"' for a in UNALIGNED_TO_ADDRS])
    search_query = f'({to_clause}) newer:{since_date_str}'

    log(f"Gmail query: {search_query}")

    try:
        search_result = service.users().messages().list(
            userId='me',
            q=search_query,
            maxResults=500  # get as many as possible
        ).execute()
    except Exception as e:
        log(f"Gmail search error: {e}")
        return 0

    found_messages = search_result.get('messages', [])
    log(f"Found {len(found_messages)} recent messages to our addresses")

    # Step 3 & 4: For each found message, check if sender is a known lead
    # Group by thread to avoid duplicate fetches
    cards_to_update = {}   # card_id -> {'emails': [...], 'thread_data': [...]}
    processed_threads = set()

    for msg_ref in found_messages:
        thread_id = msg_ref['threadId']

        # Quick dedup per thread
        if thread_id in processed_threads:
            continue

        try:
            full_thread = service.users().threads().get(
                userId='me', id=thread_id,
                fields='messages(payload/headers,id,threadId,snippet,internalDate)'
            ).execute()
        except:
            continue

        messages = full_thread.get('messages', [])
        thread_emails = [format_gmail_email(m) for m in messages[-50:]]

        # Check each message's FROM address to see if it matches a known lead
        leading_matches = {}  # card_id -> list of matching emails
        for em in thread_emails:
            sender_email = (em.get('email') or '').lower()
            if not sender_email:
                continue

            # Check direct match against lead emails
            if sender_email in lead_email_to_cards:
                for card in lead_email_to_cards[sender_email]:
                    cid = card['id']
                    leading_matches.setdefault(cid, []).append(em)

        # Also check by matching Gmail thread_id with existing card thread_ids
        for card in cards:
            if card['id'] in leading_matches:
                continue  # already matched above
            card_thread_id = card.get('gmail_thread_id') or ''
            if card_thread_id and thread_id == card_thread_id:
                cid = card['id']
                leading_matches.setdefault(cid, []).extend(thread_emails)

        # Also check the 'from' names — some leads might have updated emails
        for em in thread_emails:
            from_name = (em.get('from') or '').lower()
            for email, card_list in lead_email_to_cards.items():
                if email in leading_matches:
                    continue
                # Partial name match as fallback
                sender_addr = em.get('email', '').lower()
                if not sender_addr:
                    continue
                for card in card_list:
                    contact_name = (card.get('contact_name') or card.get('title') or '').lower().replace(' ', '')
                    # Compare first name or last name portions
                    if from_name and len(from_name) > 3:
                        parts = [p for p in re.split(r'[@,\s]', sender_addr) if p]
                        contact_parts_no_tld = [contact_name]
                        if from_name in contact_name or any(p.lower() in contact_name for p in parts):
                            cid = card['id']
                            leading_matches.setdefault(cid, []).append(em)

        # Batch upsert matched threads per card
        for card_id, thread_msgs in leading_matches.items():
            if not thread_msgs:
                continue
            # Deduplicate by message_key
            seen_keys = set()
            unique_msgs = []
            for em in thread_msgs:
                k = message_key(em)
                if k in seen_keys or not k:
                    continue
                seen_keys.add(k)
                unique_msgs.append(em)

            # Find a contact name by matching email addresses
            sender_email = unique_msgs[0].get('email', '').lower() if unique_msgs else ''
            contact_name = None
            if sender_email and sender_email in lead_email_to_cards:
                c = lead_email_to_cards[sender_email][0]
                contact_name = c.get('contact_name') or c.get('title')
            existing_cn = cards_to_update.get(card_id, {}).get('contact_name')
            cards_to_update[card_id] = {
                'emails': unique_msgs,
                'contact_name': contact_name or existing_cn or sender_email,
            }

    # Step 5: Write updates to Supabase
    updated_count = 0
    for card_id, data in cards_to_update.items():
        if not data['emails']:
            continue
        thread_id = data['emails'][0].get('gmail_thread_id', '') if data['emails'] else ''

        all_existing_msgs = []
        for em in data['emails']:
            # Merge with any existing original_email from card
            all_existing_msgs.append(em)

        # Merge: prefer messages that preserve header participants
        merged = {}
        for em in all_existing_msgs:
            k = message_key(em)
            if not k:
                continue
            prev = merged.get(k)
            if not prev:
                merged[k] = dict(em)
            elif message_richness(em) >= message_richness(prev):
                merged[k] = dict(em)
            else:
                for field in ('to', 'cc', 'reply_to', 'replyTo'):
                    if not merged[k].get(field) and em.get(field):
                        merged[k][field] = em[field]

        unique_list = list(merged.values())[-30:]  # cap at 30
        for em in unique_list:
            b = em.get('body')
            if isinstance(b, str) and len(b) > 2000:
                em['body'] = b[:2000]

        card_contacts = cards_to_update[card_id]['contact_name'] or '?'
        upsert_card(card_id, {
            'originalEmail': unique_list,
            'gmailThreadId': thread_id,
            'emailDate': unique_list[0]['date'] if unique_list else '',
        })
        # Find contact name from card list for logging
        for em in data['emails']:
            sender = (em.get('from') or '').lower()
            for email, c_list in lead_email_to_cards.items():
                if email.lower() == sender:
                    for c in c_list:
                        label = c.get('contact_name') or c.get('title') or email
                        log(f"  ✅ Updated card {card_id} — {label} — {len(unique_list)} emails")
                        break
            break

        updated_count += 1

        # Update checkpoint for all lead emails in this thread
        for em in data['emails']:
            e = (em.get('email') or '').strip()
            if e:
                checkpoint[e] = datetime.now().isoformat()

    # Save checkpoint
    with open(checkpoint_file, 'wb') as f:
        pickle.dump(checkpoint, f)

    log(f"\n=== Sync complete: {updated_count} cards updated with new Gmail activity ===")
    return updated_count


def check_gmail_for_lead_replies_fallback(service, cards, checkpoint_file):
    """
    Fallback to per-card Gmail search if the optimized approach finds nothing.
    This handles cases where our TO address list is incomplete.
    """
    checkpoint = {}
    if os.path.exists(checkpoint_file) and os.path.getsize(checkpoint_file) > 0:
        try:
            with open(checkpoint_file, 'rb') as f:
                checkpoint = pickle.load(f)
        except:
            checkpoint = {}

    updated_count = 0
    total_checked = 0

    # Only check leads that don't already appear in checkpoint (avoid re-checking old ones)
    newly_unchecked = [c for c in cards if (c.get('email') or '').strip() not in checkpoint]
    if not newly_unchecked:
        log("All previously-known leads have checkpoints; checking last 7 days for all...")
        newly_unchecked = cards

    for card in newly_unchecked[-50:]:  # cap to avoid excessive calls as fallback
        email = (card.get('email') or '').strip()
        if not email or '@' not in email:
            continue

        total_checked += 1
        last_check = checkpoint.get(email)
        since_date = last_check if last_check else (datetime.now() - timedelta(days=7)).isoformat()

        query = f'from:{email} OR to:{email}'
        try:
            results = service.users().messages().list(
                userId='me', q=query, maxResults=20
            ).execute()
        except Exception as e:
            log(f"  Gmail search error for {email}: {e}")
            continue

        messages = results.get('messages', [])
        if not messages:
            continue

        card_thread_ids = set()
        if card.get('gmail_thread_id'):
            card_thread_ids.add(card['gmail_thread_id'])
        if card.get('original_email'):
            for em in (card['original_email'] if isinstance(card['original_email'], list) else [card['original_email']]):
                if isinstance(em, dict) and em.get('gmail_thread_id'):
                    card_thread_ids.add(em['gmail_thread_id'])

        new_thread_data = []
        processed_thread_ids = set()
        for msg_ref in messages:
            thread_id = msg_ref['threadId']
            if thread_id in processed_thread_ids:
                continue
            processed_thread_ids.add(thread_id)

            thread_emails = fetch_gmail_thread(service, thread_id)
            if thread_emails:
                new_thread_data.extend(thread_emails)
                card_thread_ids.add(thread_id)

        if new_thread_data:
            existing = card.get('original_email') or []
            if isinstance(existing, dict):
                existing = [existing]
            merged = {}
            for em in existing:
                if isinstance(em, dict):
                    merged[message_key(em)] = dict(em)
            changed = False
            for em in new_thread_data:
                if not isinstance(em, dict):
                    continue
                key = message_key(em)
                prev = merged.get(key)
                if not prev:
                    merged[key] = em
                    changed = True
                    continue
                next_msg = dict(prev)
                if message_richness(em) >= message_richness(prev):
                    next_msg.update(em)
                else:
                    for field in ('to', 'cc', 'reply_to', 'replyTo'):
                        if not next_msg.get(field) and em.get(field):
                            next_msg[field] = em.get(field)
                if next_msg != prev:
                    merged[key] = next_msg
                    changed = True

            unique = list(merged.values())
            unique = unique[-30:]
            for em in unique:
                if isinstance(em.get('body'), str) and len(em['body']) > 2000:
                    em['body'] = em['body'][:2000]

            try:
                thread_id = unique[0].get('gmail_thread_id', '') if unique else ''
                upsert_card(card['id'], {
                    'originalEmail': unique,
                    'gmailThreadId': thread_id,
                    'emailDate': unique[0]['date'] if unique else '',
                })
                log(f"  ✅ Updated card {card['id']} — {card.get('contact_name', card.get('title', '?'))} — {len(new_thread_data)} thread fetch(es)")
                updated_count += 1
                checkpoint[email] = datetime.now().isoformat()
            except Exception as e:
                log(f"  ❌ Failed card {card['id']} — {e}")

    with open(checkpoint_file, 'wb') as f:
        pickle.dump(checkpoint, f)

    log(f"\n=== Sync complete (fallback): {updated_count}/{total_checked} leads with new activity ===")
    return updated_count


def main():
    log(f"\n{'='*60}")
    log(f"DAILY GMAIL SYNC — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    log(f"{'='*60}")

    cards = load_all_cards()
    if not cards:
        log("No cards found — exiting")
        return

    log("Connecting to Gmail...")
    service = get_gmail_service()
    log("Connected!")

    checkpoint_file = os.path.expanduser('~/.config/google-credentials/daily_sync_checkpoint.pkl')
    updated = check_gmail_for_lead_replies_optimized(service, cards, checkpoint_file)

    if updated == 0 and checkpoint_file and os.path.exists(checkpoint_file):
        # Check if any leads exist — maybe our TO addresses are wrong
        has_leads_with_email = any((c.get('email') or '').strip() for c in cards if '@' in (c.get('email') or ''))
        if has_leads_with_email:
            log("Optimized search found nothing. Falling back to per-card search...")
            updated = check_gmail_for_lead_replies_fallback(service, cards, checkpoint_file)

    log(f"\nDone! {updated} cards updated with new Gmail activity.")


if __name__ == '__main__':
    main()
