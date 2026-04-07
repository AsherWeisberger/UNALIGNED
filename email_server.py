#!/usr/bin/env python3
"""
email_server.py — Local Flask backend for sending emails via Gmail API.
Reads the existing OAuth token from ~/.config/google-credentials/gmail-token.json
so no re-authentication is needed.

Run:   python3 email_server.py
Then open https://unaligned-fc556.firebaseapp.com in your browser.

Endpoints:
  POST /send     — send an email
  GET  /health    — health check (returns token status)
  GET  /auth-url  — get the OAuth authorization URL (for initial setup)
"""

import os, json, base64, time, threading, webbrowser
from flask import Flask, request, jsonify
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# ─── CONFIG ───────────────────────────────────────────────────────────────────
TOKEN_FILE = os.path.expanduser("~/.config/google-credentials/gmail-token.json")
SCOPES = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
]

app = Flask(__name__, static_folder='.')

# ─── GMAIL SERVICE ─────────────────────────────────────────────────────────────
_gmail_service = None
_auth_lock = threading.Lock()

def get_gmail_service():
    global _gmail_service
    if _gmail_service is not None:
        return _gmail_service

    with _auth_lock:
        if _gmail_service is not None:
            return _gmail_service

        creds = None
        if os.path.exists(TOKEN_FILE):
            creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)

        if creds and creds.expired and creds.refresh_token:
            print("[auth] Refreshing expired token...")
            creds.refresh(Request())
            with open(TOKEN_FILE, 'w') as f:
                f.write(creds.to_json())
            print("[auth] Token refreshed successfully.")

        if not creds or not creds.valid:
            print("[auth] No valid credentials. Run with --auth to re-authorize.")
            return None

        _gmail_service = build('gmail', 'v1', credentials=creds)
        return _gmail_service

# ─── SEND EMAIL ────────────────────────────────────────────────────────────────
def create_message(sender, to, subject, body):
    """Create a raw MIME email message."""
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    import email.utils

    msg = MIMEMultipart('alternative')
    msg['to'] = to
    msg['from'] = sender
    msg['subject'] = subject
    msg.attach(MIMEText(body, 'plain'))
    msg.attach(MIMEText(body, 'html'))
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode('utf-8')
    return {'raw': raw}

def send_email(to, subject, body, thread_id=None, in_reply_to=None, references=None):
    service = get_gmail_service()
    if not service:
        raise Exception("No Gmail service available. Check credentials.")

    sender = "me"
    message = create_message(sender, to, subject, body)
    if thread_id:
        message['threadId'] = thread_id

    result = service.users().messages().send(
        userId='me',
        body=message
    ).execute()

    # Add In-Reply-To and References for threading if replying
    if in_reply_to and thread_id:
        try:
            service.users().messages().modify(
                userId='me',
                id=result['id'],
                body={'addLabelIds': [], 'removeLabelIds': []}
            ).execute()
        except:
            pass

    return result

# ─── ROUTES ───────────────────────────────────────────────────────────────────
@app.route('/health')
def health():
    creds = None
    status = "ok"
    token_valid = False

    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
        token_valid = creds.valid if creds else False
        if creds and creds.expired:
            if creds.refresh_token:
                try:
                    creds.refresh(Request())
                    with open(TOKEN_FILE, 'w') as f:
                        f.write(creds.to_json())
                    token_valid = True
                    status = "token refreshed"
                except Exception as e:
                    status = f"refresh failed: {e}"
            else:
                status = "token expired, no refresh token"
        elif creds and creds.valid:
            status = "token valid"
    else:
        status = "no token file"

    return jsonify({
        "status": status,
        "token_valid": token_valid,
        "has_token_file": os.path.exists(TOKEN_FILE),
        "server": "email_server.py",
    })

@app.route('/send', methods=['POST'])
def handle_send():
    data = request.get_json() or {}
    to = data.get('to', '').strip()
    subject = data.get('subject', '').strip()
    body = data.get('body', '').strip()
    thread_id = data.get('threadId') or data.get('thread_id')
    in_reply_to = data.get('inReplyTo') or data.get('in_reply_to')
    references = data.get('references')

    if not to or not subject:
        return jsonify({"error": "to and subject are required"}), 400
    if not body:
        return jsonify({"error": "body is required"}), 400

    try:
        result = send_email(to, subject, body, thread_id, in_reply_to, references)
        return jsonify({"success": True, "messageId": result.get('id', ''), "threadId": result.get('threadId', '')})
    except Exception as e:
        print(f"[send] Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/me')
def me():
    """Get the authenticated user's info."""
    service = get_gmail_service()
    if not service:
        return jsonify({"error": "Not authenticated"}), 401
    profile = service.users().getProfile(userId='me').execute()
    return jsonify(profile)

# ─── AUTH FLOW ─────────────────────────────────────────────────────────────────
def start_auth_flow():
    """Open browser for OAuth authorization."""
    from google_auth_oauthlib.flow import Flow
    from googleapiclient.discovery import build

    CLIENT_SECRET = os.path.expanduser("~/.config/google-credentials/client_secret.json")

    flow = Flow.from_client_secrets_file(
        CLIENT_SECRET,
        scopes=SCOPES,
        redirect_uri="http://localhost:5000/callback"
    )

    auth_url, _ = flow.authorization_url(prompt='consent', access_type='offline')
    print(f"\n[auth] Opening browser for OAuth authorization...")
    print(f"[auth] URL: {auth_url}\n")
    webbrowser.open(auth_url)

    # Simple callback server
    @app.route('/callback')
    def callback():
        code = request.args.get('code')
        if not code:
            return "No code received. Try again.", 400
        flow.fetch_token(code=code)
        with open(TOKEN_FILE, 'w') as f:
            f.write(flow.credentials.to_json())
        global _gmail_service
        _gmail_service = None  # reset so it rebuilds next time
        return "<h1>Authenticated!</h1><p>Close this tab and return to your terminal.</p><script>window.close()</script>"

    print("[auth] After authorizing, the token will be saved automatically.")

# ─── MAIN ─────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == '--auth':
        print("[auth] Starting auth flow...")
        start_auth_flow()
        app.run(port=5000, debug=False)
    else:
        print("Starting email server on http://localhost:5000")
        print("  POST /send   — send an email")
        print("  GET  /health — check auth status")
        print()
        service = get_gmail_service()
        if service:
            profile = service.users().getProfile(userId='me').execute()
            print(f"  ✓ Authenticated as: {profile.get('emailAddress')}")
        else:
            print("  ⚠ No valid Gmail credentials.")
            print("  Run: python3 email_server.py --auth")
        print()
        app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
