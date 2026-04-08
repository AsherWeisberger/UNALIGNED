#!/usr/bin/env python3
"""
Backfill original_email JSONB from Gmail threads — full bodies, no noise.
Only processes deal-related labels. Filters newsletters/bulk sender noise.
"""
import os, sys, json, base64, re, time, urllib.request, urllib.parse, urllib.error
import httpx
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone, timedelta

TOKEN_FILE = '/Users/asherweisberger/.config/google-credentials/gmail-token.json'
SUPABASE_URL = 'https://hbnpwphxjurvtydezwgh.supabase.co'
SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhibnB3cGh4anVydnR5ZGV6d2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTQ1MzIsImV4cCI6MjA5MDk5MDUzMn0.p5E48__GlGqjC17Z28q8fYFK-qV8CmiidYIP02vGe4s'
GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'
BATCH_LOG = '/tmp/backfill_v2_progress.json'

# Deal-related labels only — skip GMAIL:review (noise)
GOOD_LABELS = {
    'GMAIL:ai', 'GMAIL:scoble', 'GMAIL:startup', 'GMAIL:partnership',
    'GMAIL:interview', 'GMAIL:deal', 'GMAIL:unaligned', 'GMAIL:tech',
    'GMAIL:marketing', 'GMAIL:invest', 'GMAIL:feature', 'GMAIL:launch',
    'GMAIL:exclusive', 'GMAIL:opportunity',
}

# Noise patterns — skip these senders
NOISE_EMAIL_KEYWORDS = {
    'noreply', 'no-reply', 'no_reply', 'newsletter', 'update', 'updates',
    'digest', 'alert', 'alerts', 'notification', 'notifications', 'unsubscribe',
    'bounce', 'bounces', 'automated', 'auto-', 'system', 'mailer-daemon',
    'no-reply@', 'donotreply', 'do-not-reply', 'notify', 'broadcast',
}
NOISE_DOMAIN_KEYWORDS = {
    'mailchimp', 'sendgrid', 'substack', 'beehiiv', 'convertkit',
    'mailgun', 'amazonses', 'sparkpost', 'postmark', 'sendinblue',
    'luma-mail', 'luma-email', 'eventbrite', 'meetup', 'calendly',
}
NOISE_SUBJECT_KEYWORDS = {
    'newsletter', 'update', 'digest', 'weekly', 'monthly', 'daily digest',
    'click here to unsubscribe', 'this email was sent to', 'view in browser',
    'view online', 'manage subscription', 'unsubscribe from', 'email not displaying',
}
def is_noise_email(email_addr):
    if not email_addr:
        return False
    ea = email_addr.lower()
    local = ea.split('@')[0] if '@' in ea else ea
    if any(kw in local for kw in NOISE_EMAIL_KEYWORDS):
        return True
    if any(kw in ea for kw in NOISE_DOMAIN_KEYWORDS):
        return True
    return False


def is_noise_subject(subject):
    if not subject:
        return False
    sub = subject.lower()
    if any(kw in sub for kw in NOISE_SUBJECT_KEYWORDS):
        return True
    # Newsletter-style subject starts
    starts = ['re: you', 're: upcoming', 're: monthly', 're: weekly',
              're: daily', 're: yearly', 'thanks for subscribing',
              'confirm your', 'verify your', 'you are invited',
              'you are registered', 'upcoming event']
    if any(sub.startswith(s) for s in starts):
        return True
    return False


def is_noise(email_addr, subject):
    """Return True if this looks like a newsletter/bulk email, not a real lead email."""
    if is_noise_email(email_addr):
        return True
    if is_noise_subject(subject):
        return True
    return False


def get_token():
    with open(TOKEN_FILE) as f:
        data = json.load(f)
    expiry_raw = data.get("expiry") or data.get("token_expiry")
    refresh = True
    if expiry_raw:
        try:
            expiry_clean = expiry_raw.replace("Z", "+00:00")
            expiry_dt = datetime.fromisoformat(expiry_clean)
            if datetime.now(timezone.utc) < expiry_dt - timedelta(minutes=5):
                refresh = False
        except Exception:
            pass
    if refresh:
        print("Refreshing Gmail token …")
        resp = httpx.post(
            data["token_uri"],
            data={
                "client_id": data["client_id"],
                "client_secret": data["client_secret"],
                "refresh_token": data["refresh_token"],
                "grant_type": "refresh_token",
            }, timeout=30,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Token refresh failed: {resp.status_code} {resp.text}")
        token_data = resp.json()
        data["token"] = token_data["access_token"]
        expires_in = token_data.get("expires_in", 3600)
        data["expiry"] = (datetime.utcnow().replace(tzinfo=timezone.utc) + timedelta(seconds=expires_in)).isoformat()
        with open(TOKEN_FILE, "w") as f:
            json.dump(data, f, indent=2)
        print("Token refreshed.")
    return data["token"]


def gmail_request(path, token, params=None):
    url = f"{GMAIL_BASE}{path}"
    if params:
        url += '?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def html_to_text(html):
    """Strip HTML tags, decode entities, collapse whitespace."""
    if not html:
        return ''
    # Remove scripts and styles
    html = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL | re.IGNORECASE)
    # Replace block elements with newlines
    html = re.sub(r'<(br|p|div|li|tr|h[1-6])[^>]*>', '\n', html, flags=re.IGNORECASE)
    # Strip remaining tags
    text = re.sub(r'<[^>]+>', ' ', html)
    # Decode common HTML entities
    text = re.sub(r'&nbsp;', ' ', text)
    text = re.sub(r'&amp;', '&', text)
    text = re.sub(r'&lt;', '<', text)
    text = re.sub(r'&gt;', '>', text)
    text = re.sub(r'&quot;', '"', text)
    text = re.sub(r'&#39;', "'", text)
    text = re.sub(r'&[a-z]+;', ' ', text)
    # Collapse whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def format_email(msg):
    headers = {h['name'].lower(): h['value'] for h in msg.get('payload', {}).get('headers', [])}
    from_raw = headers.get('from', '')
    em_match = re.search(r'<([^>]+)>', from_raw)
    email_addr = em_match.group(1) if em_match else from_raw
    from_name = re.sub(r'<[^>]+>', '', from_raw).strip() or email_addr
    subject = headers.get('subject', '')

    body = ''
    payload = msg.get('payload', {})
    if 'parts' in payload:
        for part in payload['parts']:
            mt = part.get('mimeType', '')
            bd = part.get('body', {})
            if mt == 'text/plain' and 'data' in bd:
                body = base64.urlsafe_b64decode(bd['data']).decode('utf-8', errors='replace')
                break
            elif mt == 'text/html' and 'data' in bd and not body:
                html = base64.urlsafe_b64decode(bd['data']).decode('utf-8', errors='replace')
                body = html_to_text(html)
    elif 'data' in payload:
        mt = payload.get('mimeType', '')
        bd = payload.get('body', {})
        if mt == 'text/html' and 'data' in bd:
            html = base64.urlsafe_b64decode(bd['data']).decode('utf-8', errors='replace')
            body = html_to_text(html)
        elif 'data' in bd:
            body = base64.urlsafe_b64decode(bd['data']).decode('utf-8', errors='replace')

    # Filter noise from thread emails
    if is_noise(email_addr, subject):
        return None

    return {
        'from': from_name,
        'email': email_addr,
        'subject': subject,
        'date': headers.get('date', ''),
        'body': body[:15000],
        'snippet': msg.get('snippet', '')[:500],
        'gmail_thread_id': msg.get('threadId', ''),
        'message_id': msg.get('id', ''),
    }


def msg_date(m):
    hdrs = {h['name'].lower(): h['value'] for h in m.get('payload', {}).get('headers', [])}
    try:
        return parsedate_to_datetime(hdrs.get('date', '')).timestamp()
    except Exception:
        return 0


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


def save_progress(done_ids):
    with open(BATCH_LOG, 'w') as f:
        json.dump(list(done_ids), f)


def load_progress():
    if os.path.exists(BATCH_LOG):
        with open(BATCH_LOG) as f:
            return set(json.load(f))
    return set()


def main():
    print("🚀 BACKFILL v2 — full Gmail thread bodies, noise filtered\n")

    token = get_token()
    print("✅ Token loaded\n")

    done_ids = load_progress()
    print(f"📂 Resuming: {len(done_ids)} cards already done\n")

    # Load all cards from Supabase
    all_cards = []
    offset = 0
    while True:
        url = f"{SUPABASE_URL}/rest/v1/cards?select=id,email,lead_source,gmail_thread_id&limit=1000&offset={offset}"
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

    # Filter to deal-related labels only (skip GMAIL:review noise)
    good = [c for c in all_cards if c.get('lead_source') in GOOD_LABELS]
    print(f"   Deal-related cards (excl. GMAIL:review): {len(good)}\n")

    # Filter to needs
    needs = []
    for c in good:
        cid = c['id']
        if cid in done_ids:
            continue
        if not c.get('gmail_thread_id'):
            continue
        needs.append(c)

    print(f"   Cards to process: {len(needs)}\n")

    saved = len(done_ids)
    total = len(needs)
    skipped_noise = 0
    errors = 0

    for i, card in enumerate(needs):
        card_id = card['id']
        if i > 0 and i % 50 == 0:
            print(f"   [{i}/{total}] saved: {saved}, noise_skipped: {skipped_noise}, errors: {errors}")

        thread_id = card.get('gmail_thread_id')
        if not thread_id:
            continue

        try:
            thread_data = gmail_request(f'/threads/{thread_id}', token, {'format': 'full'})
            thread_msgs = thread_data.get('messages', [])
            thread_msgs.sort(key=msg_date)

            formatted = []
            for m in thread_msgs:
                email_obj = format_email(m)
                if email_obj is None:
                    skipped_noise += 1
                    continue
                formatted.append(email_obj)

            if formatted:
                supabase_patch(f'/rest/v1/cards?id=eq.{card_id}', {'original_email': formatted})
                done_ids.add(card_id)
                saved += 1
                save_progress(list(done_ids))
                s = formatted[0].get('subject', '')[:38]
                print(f"   [{i+1}/{total}] ✅ {card_id}: {len(formatted)} clean msgs ({s})")
            else:
                # All emails in thread were noise — mark done anyway
                done_ids.add(card_id)
                save_progress(list(done_ids))
                print(f"   [{i+1}/{total}] ⏭ {card_id}: all emails were noise, skipping")

            time.sleep(0.1)

        except HTTPError as e:
            errors += 1
            print(f"   [{i+1}/{total}] ❌ HTTP {e.code}")
            if e.code == 401:
                print("   Token expired! Re-authenticate Gmail.")
                break
            time.sleep(2)
        except Exception as e:
            errors += 1
            print(f"   [{i+1}/{total}] ❌ {e}")
            time.sleep(1)

    print(f"\n✅ DONE! {saved}/{total} cards backfilled")
    print(f"   Noise skipped: {skipped_noise}")
    print(f"   Errors: {errors}")


if __name__ == '__main__':
    main()
