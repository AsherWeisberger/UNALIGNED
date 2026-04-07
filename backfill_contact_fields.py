#!/usr/bin/env python3
"""
Backfill contact fields from original_email JSONB into cards table columns.

The pipeline stored contact data in original_email[i].email / original_email[i].from
but left the cards columns (email, phone, business_name, etc.) empty.
This script extracts the data from original_email and patches the card rows.

Usage:
    python3 backfill_contact_fields.py [--dry-run] [--limit N]
"""
import os, sys, json, re
from datetime import datetime

sys.path.insert(0, '/Users/asherweisberger/.openclaw/workspace/UNALIGNED')

SUPABASE_TABLE = "cards"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhibnB3cGh4anVydnR5ZGV6d2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTQ1MzIsImV4cCI6MjA5MDk5MDUzMn0.p5E48__GlGqjC17Z28q8fYFK-qV8CmiidYIP02vGe4s"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhibnB3cGh4anVydnR5ZGV6d2doIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTQxNDUzMiwiZXhwIjoyMDkwOTkwNTMyfQ.kAoOUyyqIsPGtbrBhQNEf9Zcb6FX4kq72XdpdJqf0L0"
BASE_URL = "https://hbnpwphxjurvtydezwgh.supabase.co"

STATE_FILE = '/tmp/contact_backfill_state.json'

def supabase_req(method, path, data=None, params=None):
    import urllib.request
    url = f"{BASE_URL}{path}"
    if params:
        url += "?" + params
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, method=method, headers={
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    })
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def load_state():
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except:
        return {"processed": [], "updated": 0, "skipped": 0}

def save_state(state):
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f)

def extract_contact_from_email(email_obj):
    """Extract contact fields from a single original_email entry."""
    email_addr = email_obj.get('email', '')
    from_raw = email_obj.get('from', '')
    
    # Parse "Name <email@domain.com>" format
    name = from_raw
    if '<' in from_raw and '>' in from_raw:
        name = re.sub(r'<[^>]+>', '', from_raw).strip()
    elif '<' in from_raw:
        name = from_raw.split('<')[0].strip()
    
    # Fallback: extract name from email address username
    if not name and email_addr:
        name = email_addr.split('@')[0].replace('.', ' ').replace('_', ' ')
        name = ' '.join(w.capitalize() for w in name.split() if len(w) > 1)
    
    # Extract phone from snippet/body
    snippet = email_obj.get('snippet', '') or ''
    body = email_obj.get('body', '') or ''
    text = snippet + ' ' + body
    phone_match = re.search(r'(\+?1?[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}', text)
    phone = phone_match.group(0) if phone_match else ''
    
    return {
        'email': email_addr,
        'contact_name': name,
        'phone': phone,
    }

def run_backfill(dry_run=False, limit=None):
    state = load_state()
    print(f"\n=== Backfill Contact Fields ===")
    print(f"Mode: {'DRY RUN' if dry_run else 'LIVE'}")
    print(f"State: {state['updated']} updated, {state['skipped']} skipped so far\n")
    
    # Fetch all cards with original_email (paginated)
    all_cards = []
    for offset in range(0, 100000, 1000):
        rows = supabase_req('GET', f'/rest/v1/{SUPABASE_TABLE}',
            params=f"select=id,contact_name,email,phone,business_name,original_email,website,location&original_email=not.is.null&original_email=neq.%5B%5D&limit=1000&offset={offset}"
        )
        if not rows:
            break
        all_cards.extend(rows)
        if len(rows) < 1000:
            break
        if limit and len(all_cards) >= limit:
            all_cards = all_cards[:limit]
            break
        print(f"  Fetched {len(all_cards)} cards so far...")
    
    print(f"  Total cards with original_email: {len(all_cards)}")
    
    if limit:
        all_cards = all_cards[:limit]
    
    # Filter to those needing backfill
    needs_update = [c for c in all_cards 
                    if str(c['id']) not in state['processed'] 
                    and not c.get('email')]  # email column is empty
    
    print(f"  Cards needing email backfill: {len(needs_update)}")
    
    updated = state.get('updated', 0)
    skipped = state.get('skipped', 0)
    processed = list(state.get('processed', []))
    
    for card in needs_update:
        emails = card.get('original_email') or []
        if not emails:
            skipped += 1
            processed.append(str(card['id']))
            continue
        
        # Use first email in thread as the lead's contact
        primary_email = emails[0]
        fields = extract_contact_from_email(primary_email)
        
        patch = {
            'email': fields['email'],
        }
        
        # Only update contact_name if it's empty or generic
        existing_name = card.get('contact_name', '') or ''
        if not existing_name or existing_name.lower() in ('unknown', 'n/a', ''):
            patch['contact_name'] = fields['contact_name']
        
        # Only update phone if empty
        if not card.get('phone') and fields['phone']:
            patch['phone'] = fields['phone']
        
        print(f"  Card {card['id']}: email='{patch.get('email','')}' name='{patch.get('contact_name', existing_name)}' phone='{patch.get('phone','')}'")
        
        if dry_run:
            print(f"    [DRY RUN] would patch: {patch}")
        else:
            try:
                result = supabase_req('PATCH', f'/rest/v1/{SUPABASE_TABLE}',
                    data=patch,
                    params=f"id=eq.{card['id']}&limit=1"
                )
                print(f"    [OK] patched")
            except Exception as e:
                print(f"    [ERROR] {e}")
        
        updated += 1
        processed.append(str(card['id']))
        
        # Save state every 20 cards
        if updated % 20 == 0:
            save_state({"processed": processed, "updated": updated, "skipped": skipped})
            print(f"  [STATE SAVED] {updated} updated so far")
    
    # Final state save
    save_state({"processed": processed, "updated": updated, "skipped": skipped})
    print(f"\n=== Done ===")
    print(f"  Updated: {updated}")
    print(f"  Skipped: {skipped}")
    print(f"  Total processed: {len(processed)}")

if __name__ == '__main__':
    dry_run = '--dry-run' in sys.argv
    limit = None
    for arg in sys.argv[1:]:
        if arg.isdigit():
            limit = int(arg)
    run_backfill(dry_run=dry_run, limit=limit)
