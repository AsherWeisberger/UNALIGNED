#!/usr/bin/env python3
"""
Re-enrich ALL Kanban cards — overwrites descriptions with rich WHO/WHAT/VALUE/WHY format.
Fetches original Gmail emails, runs AI extraction, writes back to Firestore.
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

TOKEN_FILE = os.path.expanduser("~/.openclaw/workspace/UNALIGNED/gmail_token.json")
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
    if not email_addr or '@' not in email_addr:
        return None, None, None
    try:
        # Try exact sender match
        query = f'from:{email_addr} after:2025/10/01'
        results = service.users().messages().list(userId='me', q=query, maxResults=3).execute()
        msgs = results.get('messages', [])
        for m in msgs:
            headers = get_headers(service, m['id'])
            from_hdr = headers.get('from', '')
            if email_addr.lower() in from_hdr.lower():
                body = get_email_body(service, m['id'])
                return m['id'], headers, body
        # Fallback: grab first match
        if msgs:
            m = msgs[0]
            headers = get_headers(service, m['id'])
            body = get_email_body(service, m['id'])
            return m['id'], headers, body
    except Exception as e:
        print(f"  [search error: {e}]")
    return None, None, None

def enrich_card(service, card, openai_client):
    email_addr = card.get('email', '')
    msg_id, headers, body = find_email_by_sender(service, email_addr)
    
    if not msg_id:
        return None, "no email in Gmail"

    subject = headers.get('subject', card.get('title', ''))
    from_hdr = headers.get('from', email_addr)
    date_hdr = headers.get('date', '')
    
    # Parse name and email from From header
    name_match = re.match(r'"?([^"]+)"?\s*<(.+?)>', from_hdr)
    if name_match:
        sender_name = name_match.group(1).strip()
        sender_email = name_match.group(2).strip()
    else:
        sender_name = email_addr
        sender_email = email_addr

    email_data = {
        'id': msg_id,
        'subject': subject,
        'from': from_hdr,
        'date': date_hdr,
        'snippet': body[:500] if body else '',
        'body': body[:8000],
    }

    prompt = lp.build_extraction_prompt([email_data])

    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a lead qualification assistant. Always respond with valid JSON array."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            max_tokens=800,
            timeout=30.0
        )

        result_text = response.choices[0].message.content
        if "```json" in result_text:
            result_text = result_text.split("```json")[1].split("```")[0]
        elif "```" in result_text:
            result_text = result_text.split("```")[1].split("```")[0]

        leads = json.loads(result_text)
        if not leads:
            return None, "no lead parsed"

        lead = leads[0]
        
        # Build rich description in WHO/WHAT/VALUE/WHY format
        who = lead.get('description', '')
        
        # If AI didn't produce proper WHO/WHAT, try to extract from its output
        # Otherwise use what we have
        description = lead.get('description', '')
        
        # Ensure VALUE line exists
        if 'VALUE:' not in description and 'VALUE:' not in str(lead):
            val = lead.get('estimated_value', '')
            if val:
                description += f"\nVALUE: ${val:,.0f}"
            else:
                description += "\nVALUE: TBD"

        updates = {
            'description': description,
            'title': lead.get('title', card.get('title', '')),
            'intent': lead.get('intent', card.get('intent', '')),
        }
        
        # Update contact name if we found a better one
        if sender_name and sender_name != email_addr and not card.get('contactName'):
            updates['contactName'] = sender_name
        
        priority = lead.get('priority', card.get('priority', ''))
        if priority in ('hot', 'warm', 'cold'):
            updates['priority'] = priority

        ev = lead.get('estimated_value')
        if ev:
            updates['estimatedValue'] = str(ev)

        return updates, "success"

    except json.JSONDecodeError as e:
        return None, f"json error: {e}"
    except Exception as e:
        return None, f"error: {e}"

def main():
    print("🔄 Full Description Refresh — WHO/WHAT/VALUE/WHY for all cards\n")
    
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
    
    all_cards = doc.to_dict().get('cards', {})
    print(f"Total cards: {len(all_cards)}\n")
    print(f"{'Card ID':<10} {'Title':<50} {'Status':<20}")
    print("-" * 82)
    
    updated = 0
    skipped = 0
    failed = 0
    
    for cid, card in all_cards.items():
        title = card.get('title', '')[:47]
        email_addr = card.get('email', '')
        
        if not email_addr or '@' not in email_addr:
            print(f"{cid:<10} {title:<50} {'⚠ no email':<20}")
            skipped += 1
            continue
        
        print(f"{cid:<10} {title:<50} 🔍 fetching...", end="", flush=True)
        
        result = enrich_card(service, card, client)
        if result is None:
            updates, status = None, "no email found"
        else:
            updates, status = result
        
        if updates:
            all_cards[cid].update(updates)
            updated += 1
            new_title = updates.get('title', title)[:47]
            print(f"\r{cid:<10} {new_title:<50} ✅ {status:<15}")
        else:
            failed += 1
            print(f"\r{cid:<10} {title:<50} ⚠ {status:<15}")
        
        time.sleep(0.3)
    
    # Write back to Firestore
    print(f"\n\n💾 Saving {updated} updates to Firestore...")
    doc_ref.update({'cards': all_cards})
    
    print(f"\n{'='*55}")
    print(f"✅ Updated:  {updated}")
    print(f"⚠ Skipped:  {skipped} (no email)")
    print(f"❌ Failed:   {failed}")
    print(f"📊 Total:    {len(all_cards)}")

if __name__ == '__main__':
    main()
