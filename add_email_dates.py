#!/usr/bin/env python3
"""
Look up original email date from Gmail for every Kanban card.
Stores emailDate on each card and updates the UI to show it next to lead source.
"""
import os, sys, json, base64, re, time, warnings
warnings.filterwarnings('ignore')

os.environ['OPENAI_API_KEY'] = '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'

import firebase_admin
from firebase_admin import credentials as fb_credentials
from firebase_admin import firestore
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from datetime import datetime

TOKEN_FILE = os.path.expanduser("~/.openclaw/workspace/UNALIGNED/gmail_token.json")
FIREBASE_SERVICE_ACCOUNT = os.path.expanduser("~/.config/google-credentials/firebase-service-account.json")

def get_gmail_service():
    creds = Credentials.from_authorized_user_file(TOKEN_FILE, [
        'https://www.googleapis.com/auth/gmail.readonly',
    ])
    if not creds.valid and creds.expired and creds.refresh_token:
        creds.refresh(Request())
        with open(TOKEN_FILE, 'w') as f:
            f.write(creds.to_json())
    return build('gmail', 'v1', credentials=creds)

def get_email_date(service, email_addr):
    """Find the most recent email from a sender and return its internal date."""
    if not email_addr or '@' not in email_addr:
        return None
    
    try:
        # Search full message text for this sender address (covers inbound emails from them)
        # Don't restrict date range — some contacts emailed years ago
        query = email_addr
        results = service.users().messages().list(
            userId='me', q=query, maxResults=5
        ).execute()
        
        msgs = results.get('messages', [])
        if not msgs:
            return None
        
        # Get the most recent message
        msg = service.users().messages().get(
            userId='me', id=msgs[0]['id'], format='metadata',
            metadataHeaders=['Date', 'From', 'Subject']
        ).execute()
        
        headers = {h['name'].lower(): h['value'] for h in msg.get('payload', {}).get('headers', [])}
        date_str = headers.get('date', '')
        
        if not date_str:
            return None
        
        # Parse RFC 2822 date format
        # e.g. "Mon, 31 Mar 2025 09:15:00 -0700"
        from email.utils import parsedate_to_datetime
        dt = parsedate_to_datetime(date_str)
        return dt.strftime('%m/%d')
        
    except Exception as e:
        return None

def main():
    print("📧 Looking up original email dates from Gmail...\n")
    
    cred = fb_credentials.Certificate(FIREBASE_SERVICE_ACCOUNT)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    
    service = get_gmail_service()
    
    doc_ref = db.document("boards/shared-board")
    doc = doc_ref.get()
    if not doc.exists:
        print("❌ No board found")
        return
    
    all_cards = doc.to_dict().get('cards', {})
    print(f"Total cards: {len(all_cards)}\n")
    
    updated = 0
    skipped = 0
    failed = 0
    
    # Save every N updates
    CHECKPOINT_INTERVAL = 50
    save_needed = False
    
    for cid, card in all_cards.items():
        email = card.get('email', '')
        
        if not email or '@' not in email:
            skipped += 1
            continue
        
        # Check if already has emailDate
        if card.get('emailDate'):
            skipped += 1
            continue
        
        print(f"[{cid}] {email:<40} ...", end="", flush=True)
        
        email_date = get_email_date(service, email)
        
        if email_date:
            all_cards[cid]['emailDate'] = email_date
            updated += 1
            save_needed = True
            print(f"  [{cid}] {email:<40} ... ✅ {email_date}", flush=True)
        else:
            failed += 1
            print(f" ⚠️  not found", flush=True)
        
        # Checkpoint save
        if updated % CHECKPOINT_INTERVAL == 0 and save_needed:
            print(f"\n  💾 Saving checkpoint ({updated} so far)...")
            doc_ref.update({'cards': all_cards})
            save_needed = False
        
        time.sleep(0.3)
    
    # Final save
    if save_needed or updated > 0:
        print(f"\n\n💾 Saving {updated} email dates to Firestore...")
        doc_ref.update({'cards': all_cards})
    
    print(f"\n{'='*55}")
    print(f"✅ Updated:  {updated}")
    print(f"⏭️  Skipped:  {skipped} (no email or already set)")
    print(f"❌ Failed:   {failed}")
    print(f"📊 Total:    {len(all_cards)}")

if __name__ == '__main__':
    main()
