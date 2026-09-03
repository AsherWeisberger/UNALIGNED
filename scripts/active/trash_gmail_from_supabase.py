#!/usr/bin/env python3
"""
Move to Gmail Trash the threads for leads that were trashed in the workspace.

When a lead is trashed in the ALIGNED workspace, its card's list_id becomes
'trash' in Supabase. This script finds those cards and, for each one that has a
Gmail thread id, moves that Gmail thread into the Gmail Trash via the Gmail API.

Requires a Gmail token with the gmail.modify scope. The FIRST run opens a
browser for a one-time consent; after that it runs unattended (cron-friendly).

Run once to authorize:
    python3 scripts/active/trash_gmail_from_supabase.py

Then add it to the daily cron after the sync/pipeline steps.

Notes:
- threads().trash() is idempotent — re-trashing an already-trashed thread is a
  no-op — and we also keep a local processed list to avoid redundant API calls.
- Trashing is reversible from Gmail's Trash for ~30 days.
- Uses the public anon Supabase key (read-only here), same as daily_gmail_sync.
"""
import argparse
import json
import os
import sys
import logging
import urllib.request
import urllib.error

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(message)s')
def log(msg): logging.info(msg)

import google.auth.transport.requests
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

CLIENT_SECRET_FILE = os.path.expanduser('~/.config/google-credentials/client_secret.json')
MODIFY_TOKEN_FILE  = os.path.expanduser('~/.config/google-credentials/gmail-modify-token.json')
PROCESSED_FILE     = os.path.expanduser('~/.config/google-credentials/gmail_trashed_threads.json')

# gmail.modify is the narrowest scope that allows moving a thread to Trash.
SCOPES = ['https://www.googleapis.com/auth/gmail.modify']

SUPABASE_URL = "https://hbnpwphxjurvtydezwgh.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhibnB3cGh4anVydnR5ZGV6d2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTQ1MzIsImV4cCI6MjA5MDk5MDUzMn0.p5E48__GlGqjC17Z28q8fYFK-qV8CmiidYIP02vGe4s"


def get_gmail_service():
    """Return an authorized Gmail service, or None if not authorized yet.

    A browser consent prompt is only opened in an interactive terminal, so an
    unattended cron run never hangs — it just skips until someone authorizes
    once by running this script manually.
    """
    creds = None
    if os.path.exists(MODIFY_TOKEN_FILE):
        try:
            creds = Credentials.from_authorized_user_file(MODIFY_TOKEN_FILE, SCOPES)
        except Exception:
            creds = None

    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(google.auth.transport.requests.Request())
        except Exception as e:
            log(f"Token refresh failed ({e}) — re-authorizing")
            creds = None

    if not creds or not creds.valid:
        if not sys.stdin.isatty():
            log("Not authorized for gmail.modify yet and not interactive — skipping. "
                "Run this script once in a terminal to grant consent.")
            return None
        log("Opening browser for one-time Gmail consent (gmail.modify)…")
        flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET_FILE, SCOPES)
        creds = flow.run_local_server(port=0)

    with open(MODIFY_TOKEN_FILE, 'w') as f:
        f.write(creds.to_json())
    return build('gmail', 'v1', credentials=creds)


def supabase_get(path):
    req = urllib.request.Request(
        SUPABASE_URL + path,
        headers={'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}'},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def load_trashed_cards():
    """All cards currently in the Trash list that carry a Gmail thread id."""
    rows = []
    for offset in range(0, 100000, 1000):
        chunk = supabase_get(
            "/rest/v1/cards?select=id,gmail_thread_id,contact_name,business_name"
            "&list_id=eq.trash&gmail_thread_id=not.is.null"
            f"&limit=1000&offset={offset}"
        )
        if not isinstance(chunk, list) or not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < 1000:
            break
    return rows


def main():
    ap = argparse.ArgumentParser(description="Move trashed leads' Gmail threads to Gmail Trash.")
    ap.add_argument('--limit', type=int, default=0, help='Only process the first N (0 = all). Good for a first test.')
    ap.add_argument('--dry-run', action='store_true', help='List what would be trashed without touching Gmail.')
    args = ap.parse_args()

    processed = set()
    if os.path.exists(PROCESSED_FILE):
        try:
            processed = set(json.load(open(PROCESSED_FILE)))
        except Exception:
            processed = set()

    rows = load_trashed_cards()
    todo = [r for r in rows if str(r.get('gmail_thread_id')) not in processed]
    if args.limit > 0:
        todo = todo[:args.limit]
    log(f"{len(rows)} trashed cards with a Gmail thread; {len(todo)} to process this run")
    if not todo:
        return

    if args.dry_run:
        for r in todo:
            log(f"  [dry-run] would trash {r.get('gmail_thread_id')} — "
                f"{r.get('business_name') or r.get('contact_name') or '?'}")
        return

    service = get_gmail_service()
    if service is None:
        return
    trashed = 0
    for r in todo:
        tid = str(r.get('gmail_thread_id'))
        label = r.get('business_name') or r.get('contact_name') or tid
        try:
            service.users().threads().trash(userId='me', id=tid).execute()
            processed.add(tid)
            trashed += 1
            log(f"  🗑  trashed Gmail thread {tid} — {label}")
        except Exception as e:
            msg = str(e)
            if '404' in msg or 'notFound' in msg or 'Requested entity was not found' in msg:
                # Thread isn't in this mailbox (e.g. an X lead or other account) — skip for good.
                processed.add(tid)
                log(f"  –  skip {tid} ({label}): not found in this mailbox")
            else:
                log(f"  ❌ {tid} ({label}): {e}")

    with open(PROCESSED_FILE, 'w') as f:
        json.dump(sorted(processed), f)
    log(f"Done. Moved {trashed} Gmail thread(s) to Trash.")


if __name__ == '__main__':
    main()
