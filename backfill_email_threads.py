#!/usr/bin/env python3
"""Backfill original_email from Gmail threads — direct HTTP, incremental saves."""
import os, sys, json, base64, re, time, urllib.request, urllib.parse
from email.utils import parsedate_to_datetime
from urllib.error import HTTPError

TOKEN_FILE = '/Users/asherweisberger/.config/google-credentials/gmail-token.json'
SUPABASE_URL = 'https://hbnpwphxjurvtydezwgh.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhibnB3cGh4anVydnR5ZGV6d2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTQ1MzIsImV4cCI6MjA5MDk5MDUzMn0.p5E48__GlGqjC17Z28q8fYFK-qV8CmiidYIP02vGe4s'
GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'
BATCH_LOG = '/tmp/backfill_progress.json'


def get_token():
    with open(TOKEN_FILE) as f:
        return json.load(f)['token']


def gmail_request(path, token, params=None):
    """Make an authenticated Gmail API call via direct HTTP."""
    url = f"{GMAIL_BASE}{path}"
    if params:
        url += '?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def supabase_patch(where, data):
    body = json.dumps(data).encode()
    url = f"{SUPABASE_URL}{where}"
    req = urllib.request.Request(url, data=body, headers={
        'apikey': SUPABASE_ANON,
        'Authorization': f'Bearer {SUPABASE_ANON}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
    }, method='PATCH')
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.status


def format_email(msg):
    headers = {h['name'].lower(): h['value'] for h in msg.get('payload', {}).get('headers', [])}
    from_raw = headers.get('from', '')
    em_match = re.search(r'<([^>]+)>', from_raw)
    email_addr = em_match.group(1) if em_match else from_raw
    from_name = re.sub(r'<[^>]+>', '', from_raw).strip() or email_addr

    body = ''
    payload = msg.get('payload', {})
    if 'parts' in payload:
        for part in payload['parts']:
            if part.get('mimeType') == 'text/plain' and 'data' in part:
                body = base64.urlsafe_b64decode(part['data']).decode('utf-8', errors='replace')
                break
    elif 'data' in payload:
        body = base64.urlsafe_b64decode(payload['data']).decode('utf-8', errors='replace')

    return {
        'from': from_name,
        'email': email_addr,
        'subject': headers.get('subject', ''),
        'date': headers.get('date', ''),
        'body': body[:8000],
        'snippet': msg.get('snippet', ''),
        'gmail_thread_id': msg.get('threadId', ''),
        'message_id': msg.get('id', ''),
        'cached': True,
    }


def msg_date(m):
    hdrs = {h['name'].lower(): h['value'] for h in m.get('payload', {}).get('headers', [])}
    try:
        return parsedate_to_datetime(hdrs.get('date', '')).timestamp()
    except Exception:
        return 0


def save_progress(done_ids):
    with open(BATCH_LOG, 'w') as f:
        json.dump(list(done_ids), f)


def load_progress():
    if os.path.exists(BATCH_LOG):
        with open(BATCH_LOG) as f:
            return set(json.load(f))
    return set()


def main():
    print("🚀 BACKFILL (direct HTTP) — incremental saves\n")

    token = get_token()
    print("✅ Token loaded")

    done_ids = load_progress()
    print(f"📂 Resuming: {len(done_ids)} cards already done\n")

    # Load all cards from Supabase
    all_cards = []
    offset = 0
    while True:
        url = f"{SUPABASE_URL}/rest/v1/cards?select=id,description,original_email,email&order=id.asc&limit=1000&offset={offset}"
        req = urllib.request.Request(url, headers={'apikey': SUPABASE_ANON, 'Authorization': f'Bearer {SUPABASE_ANON}'})
        with urllib.request.urlopen(req) as r:
            cards = json.loads(r.read())
        if not cards:
            break
        all_cards.extend(cards)
        if len(cards) < 1000:
            break
        offset += 1000
    print(f"   Total cards: {len(all_cards)}\n")

    # Filter to cards needing backfill
    needs = []
    for c in all_cards:
        cid = c['id']
        if cid in done_ids:
            continue
        oe = c.get('original_email')
        if oe and isinstance(oe, list) and len(oe) > 0 and oe[0].get('gmail_thread_id'):
            continue
        desc = c.get('description') or ''
        if isinstance(desc, str) and desc.startswith('{'):
            try:
                parsed = json.loads(desc)
                et = parsed.get('email_thread') or []
                if et:
                    needs.append((cid, c.get('email') or '', et))
            except Exception:
                pass

    print(f"   Cards to process: {len(needs)}\n")

    saved = len(done_ids)
    total = len(all_cards)

    for i, (card_id, lead_email, et) in enumerate(needs):
        if i > 0 and i % 50 == 0:
            print(f"   [{i}/{len(needs)}] saved so far: {saved}")

        first = et[0]
        subject = first.get('subject', '') or ''
        from_addr = first.get('from') or ''

        # Build Gmail search
        clean = re.sub(r'^(RE:|FW:|FWD?:)\s*', '', subject, flags=re.IGNORECASE)
        words = re.findall(r'\b[a-zA-Z0-9]{4,}\b', clean)
        stop = {'the', 'and', 'for', 'with', 'from', 'this', 'that', 'have', 'been',
                'will', 'would', 'could', 'should', 'your', 'you', 'are', 'was',
                'about', 'just', 'here', 'there', 'what', 'when', 'where', 'been'}
        key = [w for w in words if w.lower() not in stop][:5]
        query = ' '.join(f'"{w}"' for w in key) if key else f'"{clean[:50]}"'

        if lead_email:
            query += f' from:{lead_email}'
        else:
            em_match = re.search(r'<([^>]+)>', from_addr)
            if em_match:
                query += f' from:{em_match.group(1)}'

        query += ' after:2025/04/06'

        try:
            result = gmail_request('/messages', token, {'q': query, 'maxResults': 2})
            msgs = result.get('messages', [])

            if msgs:
                # Get first message to find thread
                msg_data = gmail_request(f'/messages/{msgs[0]["id"]}', token, {'format': 'full'})
                thread_id = msg_data.get('threadId', '')

                if thread_id:
                    thread_data = gmail_request(f'/threads/{thread_id}', token, {'format': 'full'})
                    thread_msgs = thread_data.get('messages', [])
                    thread_msgs.sort(key=msg_date)
                    formatted = [format_email(m) for m in thread_msgs]

                    supabase_patch(f'/rest/v1/cards?id=eq.{card_id}', {'original_email': formatted})
                    done_ids.add(card_id)
                    saved += 1
                    save_progress(list(done_ids))

                    s = subject[:38]
                    print(f"   [{i+1}/{len(needs)}] ✅ {card_id}: {len(formatted)} msgs ({s})")
                else:
                    print(f"   [{i+1}/{len(needs)}] ⚠️ no threadId ({subject[:38]})")
            else:
                print(f"   [{i+1}/{len(needs)}] ❌ no Gmail match ({subject[:38]})")

            time.sleep(0.1)

        except HTTPError as e:
            print(f"   [{i+1}/{len(needs)}] ❌ HTTP {e.code} ({subject[:38]})")
            if e.code == 401:
                print("   Token expired! Re-authenticate Gmail.")
                break
            time.sleep(2)
        except Exception as e:
            print(f"   [{i+1}/{len(needs)}] ❌ {e} ({subject[:38]})")
            time.sleep(1)

    print(f"\n✅ DONE! {saved}/{total} cards backfilled")


if __name__ == '__main__':
    main()
