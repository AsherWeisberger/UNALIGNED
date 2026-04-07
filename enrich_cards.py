#!/usr/bin/env python3
"""
Re-enrich existing Kanban cards with AI-extracted descriptions.
Searches Gmail by sender email address, fetches full body, runs extraction.
"""
import os, sys, json, base64, re, time, warnings
warnings.filterwarnings('ignore')

os.environ['OPENAI_API_KEY'] = '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'
sys.path.insert(0, '/Users/asherweisberger/.openclaw/workspace/UNALIGNED')

import lead_pipeline as lp
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
import firebase_admin
from firebase_admin import credentials as fb_credentials
from firebase_admin import firestore
from datetime import datetime, timedelta

TOKEN_FILE = os.path.expanduser("~/.config/google-credentials/gmail-token.json")
FIREBASE_SERVICE_ACCOUNT = os.path.expanduser("~/.config/google-credentials/firebase-service-account.json")

def get_gmail_service():
    creds = Credentials.from_authorized_user_file(TOKEN_FILE, [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send'
    ])
    if not creds.valid and creds.expired and creds.refresh_token:
        creds.refresh(Request())
        with open(TOKEN_FILE, 'w') as f:
            f.write(creds.to_json())
    return build('gmail', 'v1', credentials=creds)

def get_email_body(service, msg_id):
    try:
        msg = service.users().messages().get(userId='me', id=msg_id, format='full').execute()
        payload = msg.get('payload', {})
        body = ""
        if 'data' in payload.get('body', {}):
            body = payload['body']['data']
        else:
            for part in payload.get('parts', []):
                if part.get('body', {}).get('data'):
                    body = part['body']['data']
                    break
        if body:
            try:
                return base64.urlsafe_b64decode(body).decode('utf-8', errors='replace')
            except:
                pass
        return msg.get('snippet', '')
    except:
        return ""

def get_headers(service, msg_id):
    try:
        msg = service.users().messages().get(
            userId='me', id=msg_id, format='metadata',
            metadataHeaders=['From', 'Subject', 'Date', 'To']
        ).execute()
        return {h['name'].lower(): h['value'] for h in msg.get('payload', {}).get('headers', [])}
    except:
        return {}

def find_email_by_sender(service, email_addr):
    """Find the most recent email from a specific sender"""
    try:
        query = f'from:{email_addr} after:2026/01/01'
        results = service.users().messages().list(userId='me', q=query, maxResults=1).execute()
        msgs = results.get('messages', [])
        if msgs:
            return msgs[0]['id']
    except:
        pass
    return None

def enrich_card(service, card, openai_client):
    """Enrich a single card"""
    email_addr = card.get('email', '')
    if not email_addr:
        return None
    
    # Find email in Gmail
    msg_id = find_email_by_sender(service, email_addr)
    if not msg_id:
        # Try without "from:" prefix (just the address)
        msg_id = find_email_by_sender(service, email_addr.replace('@', ''))
    
    if not msg_id:
        return None
    
    headers = get_headers(service, msg_id)
    body = get_email_body(service, msg_id)
    snippet = body[:500] if body else card.get('description', '')[:500]
    
    email = {
        'id': msg_id,
        'subject': headers.get('subject', card.get('title', '')),
        'from': headers.get('from', email_addr),
        'date': headers.get('date', ''),
        'snippet': snippet,
        'body': body[:8000],
    }
    
    prompt = lp.build_extraction_prompt([email])
    
    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a lead qualification assistant. Always respond with valid JSON array."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            max_tokens=2000,
            timeout=30.0
        )
        
        result_text = response.choices[0].message.content
        if "```json" in result_text:
            result_text = result_text.split("```json")[1].split("```")[0]
        elif "```" in result_text:
            result_text = result_text.split("```")[1].split("```")[0]
        
        leads = json.loads(result_text)
        if not leads:
            return None
        
        lead = leads[0]
        label_map = {
            'hot': {'name': '🔥 Hot', 'color': 'red'},
            'warm': {'name': '🌡️ Warm', 'color': 'yellow'},
            'cold': {'name': '❄️ Cold', 'color': 'blue'}
        }
        days_map = {'high': 1, 'medium': 3, 'low': 7}
        
        updates = {}
        
        if lead.get('title'):
            updates['title'] = lead['title']
        if lead.get('description'):
            updates['description'] = lead['description']
        if lead.get('intent'):
            updates['intent'] = lead['intent']
        
        cn = lead.get('contact_name', '')
        if cn and not card.get('contactName'):
            updates['contactName'] = cn
        
        ph = lead.get('phone', '')
        if ph and not card.get('phone'):
            updates['phone'] = ph
        
        co = lead.get('company_name', '')
        if co and not card.get('businessName'):
            updates['businessName'] = co
        
        priority = lead.get('priority', '')
        if priority in ('hot', 'warm', 'cold'):
            updates['priority'] = priority
            updates['labels'] = [label_map[priority]]
        
        ev = lead.get('estimated_value')
        if ev:
            updates['estimatedValue'] = str(ev)
        
        ls = lead.get('lead_source', '')
        if ls:
            updates['leadSource'] = ls
        
        urgency = lead.get('urgency', 'medium')
        days = days_map.get(urgency, 3)
        due = datetime.now() + timedelta(days=days)
        updates['dueDate'] = due.strftime('%Y-%m-%d')
        
        return updates
    
    except Exception as e:
        return None

def main():
    print("🚀 Card Re-enrichment — fetching emails + AI extraction\n")
    
    cred = fb_credentials.Certificate(FIREBASE_SERVICE_ACCOUNT)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    
    service = get_gmail_service()
    import openai
    client = openai.OpenAI(api_key=os.environ['OPENAI_API_KEY'])
    
    doc_ref = db.document("boards/shared-board")
    doc = doc_ref.get()
    if not doc.exists:
        print("❌ No board found")
        return
    
    cards = doc.to_dict().get('cards', {})
    print(f"Found {len(cards)} cards\n")
    
    updated = 0
    no_email_found = 0
    already_good = 0
    errors = 0
    
    for cid, card in cards.items():
        title = card.get('title', '')
        email_addr = card.get('email', '')
        desc = card.get('description', '')
        
        # Skip if already has rich description
        if desc.startswith('WHO:'):
            already_good += 1
            continue
        
        print(f"[{cid}] {title[:45]:<45} ... ", end="", flush=True)
        
        updates = enrich_card(service, card, client)
        
        if updates:
            card.update(updates)
            updated += 1
            new_title = updates.get('title', title)
            new_priority = updates.get('priority', card.get('priority', '?'))
            print(f"✅ '{new_title[:35]}' | {new_priority}", flush=True)
        else:
            no_email_found += 1
            print(f"⚠ email not found in Gmail", flush=True)
        
        time.sleep(0.4)
    
    doc_ref.update({'cards': cards})
    
    print(f"\n{'='*55}")
    print(f"✅ Updated:     {updated}")
    print(f"   Skipped (rich desc): {already_good}")
    print(f"   No email found:      {no_email_found}")
    print(f"   Total cards:         {len(cards)}")

if __name__ == '__main__':
    main()
