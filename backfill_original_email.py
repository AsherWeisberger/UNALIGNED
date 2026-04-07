#!/usr/bin/env python3
"""Backfill originalEmail field for existing Kanban cards using stored email_id."""
import os, re, base64

def format_email(msg_data):
    if not msg_data:
        return {}
    headers = {h['name'].lower(): h['value'] for h in msg_data.get('payload', {}).get('headers', [])}
    body = ''
    payload = msg_data.get('payload', {})
    if 'parts' in payload:
        for part in payload['parts']:
            if part.get('mimeType') == 'text/plain' and 'data' in part:
                import base64 as b64
                body = b64.urlsafe_b64decode(part['data']).decode('utf-8', errors='replace')
                break
    elif 'data' in payload:
        import base64 as b64
        body = b64.urlsafe_b64decode(payload['data']).decode('utf-8', errors='replace')
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
        'snippet': msg_data.get('snippet', ''),
        'gmail_thread_id': msg_data.get('threadId', ''),
    }

def get_gmail_service():
    import google.auth
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build
    token_file = os.path.expanduser('~/.config/google-credentials/gmail-token.json')
    creds = Credentials.from_authorized_user_file(token_file, ['https://www.googleapis.com/auth/gmail.readonly'])
    if not creds.valid:
        if creds.refresh_token:
            creds.refresh(Request())
    return build('gmail', 'v1', credentials=creds)

def main():
    BOARD_DOC = 'boards/shared-board'

    # Init Firestore with service account
    import firebase_admin
    from firebase_admin import credentials as fb_creds, firestore as fb_firestore
    sa_path = os.path.expanduser('~/.config/google-credentials/firebase-service-account.json')
    if not firebase_admin._apps:
        firebase_admin.initialize_app(fb_creds.Certificate(sa_path))
    db = fb_firestore.Client()

    # Init Gmail
    service = get_gmail_service()
    if not service:
        return

    doc_ref = db.document(BOARD_DOC)
    doc = doc_ref.get()
    if not doc.exists:
        print("Board not found")
        return

    all_cards = doc.to_dict().get('cards', {})
    print(f"Total cards: {len(all_cards)}")

    to_backfill = [(cid, card) for cid, card in all_cards.items()
                   if card.get('email_id') and not card.get('originalEmail')]
    print(f"Cards needing backfill: {len(to_backfill)}")
    if not to_backfill:
        print("Nothing to do.")
        return

    updated = 0
    errors = 0
    for cid, card in to_backfill:
        email_id = card.get('email_id')
        if not email_id:
            continue
        try:
            msg = service.users().messages().get(userId='me', id=email_id, format='full').execute()
            orig = format_email(msg)
            if orig.get('from'):
                all_cards[cid]['originalEmail'] = orig
                updated += 1
                print(f"  [{updated}] {cid}: {orig.get('from','')} — {orig.get('subject','')[:60]}")
            else:
                print(f"  [SKIP] {cid}: no from field")
        except Exception as e:
            errors += 1
            print(f"  [ERR] {cid}: {str(e)[:80]}")

    if updated:
        print(f"\nSaving {updated} updates to Firestore...")
        doc_ref.update({'cards': all_cards})
        print(f"Done! {updated} cards updated, {errors} errors.")

if __name__ == '__main__':
    main()
