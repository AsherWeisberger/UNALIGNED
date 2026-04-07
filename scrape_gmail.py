import os
import json
import base64
import subprocess
import http.server
import threading
import urllib.parse
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# Path to OAuth credentials
CLIENT_SECRET_FILE = os.path.expanduser("~/.config/google-credentials/client_secret.json")
TOKEN_FILE = os.path.expanduser("~/.config/google-credentials/gmail-token.json")

# Scopes - full Gmail access
SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send']

# Keywords to filter for
KEYWORDS = ['scoble', 'unaligned', 'scobalizer']

def get_gmail_service():
    """Create Gmail service using OAuth with proper refresh token handling"""
    creds = None
    
    # Load existing token if available
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    
    # If no valid credentials, run OAuth flow
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                print("Refreshing expired token...")
                creds.refresh(Request())
                with open(TOKEN_FILE, 'w') as token:
                    token.write(creds.to_json())
                print("Token refreshed and saved!")
            except Exception as e:
                print(f"Token refresh failed ({e}) — re-running OAuth flow...")
                creds = None

        if not creds or not creds.valid:
            print("Starting one-time OAuth flow...\n")
            
            # Create flow with localhost redirect
            flow = Flow.from_client_secrets_file(
                CLIENT_SECRET_FILE,
                scopes=SCOPES,
                redirect_uri='http://127.0.0.1:8080/callback'
            )
            
            auth_url, _ = flow.authorization_url(access_type='offline', prompt='consent')
            
            # Open in Chrome
            subprocess.run(["open", "-a", "Google Chrome", auth_url])
            print("Auth URL opened in Chrome.\n")
            
            # Start local server to catch redirect
            code_received = threading.Event()
            auth_code = {'code': None, 'error': None}
            
            class CallbackHandler(http.server.BaseHTTPRequestHandler):
                def do_GET(self):
                    params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
                    auth_code['code'] = params.get('code', [None])[0]
                    auth_code['error'] = params.get('error', [None])[0]
                    self.send_response(200)
                    self.send_header('Content-Type', 'text/html')
                    self.end_headers()
                    self.wfile.write(b"<html><body><h1>Authentication successful!</h1><p>You can close this tab and return to the terminal.</p></body></html>")
                    code_received.set()
                def log_message(self, s, *args):
                    pass  # silence server logs
            
            server = http.server.HTTPServer(('127.0.0.1', 8080), CallbackHandler)
            server_thread = threading.Thread(target=server.handle_request)
            server_thread.start()
            
            print("Waiting for you to authorize in Chrome...")
            code_received.wait(timeout=120)
            server_thread.join()
            server.server_close()
            
            if auth_code['error']:
                print(f"OAuth error: {auth_code['error']}")
                return None
            if not auth_code['code']:
                print("ERROR: No authorization code received.")
                return None
            
            flow.fetch_token(code=auth_code['code'])
            creds = flow.credentials
            
            # Save credentials for next time
            with open(TOKEN_FILE, 'w') as token:
                token.write(creds.to_json())
            print("Credentials saved! Future runs will be headless.")
    service = build('gmail', 'v1', credentials=creds)
    return service

def scrape_gmail():
    """Scrape Gmail for leads"""
    print("Connecting to Gmail...")
    service = get_gmail_service()
    print("Connected!")
    
    # Get messages
    results = service.users().messages().list(userId='me', maxResults=500).execute()
    messages = results.get('messages', [])
    
    print(f"Found {len(messages)} messages")
    
    leads = []
    
    for msg in messages:
        try:
            # Get full message
            msg_data = service.users().messages().get(userId='me', id=msg['id'], format='full').execute()
            
            # Get headers
            headers = msg_data.get('payload', {}).get('headers', [])
            subject = next((h['value'] for h in headers if h['name'].lower() == 'subject'), '')
            sender = next((h['value'] for h in headers if h['name'].lower() == 'from'), '')
            
            # Get body
            body = ''
            if 'data' in msg_data.get('payload', {}).get('body', {}):
                body = msg_data['payload']['body']['data']
            else:
                # Try to get from parts
                for part in msg_data.get('payload', {}).get('parts', []):
                    if part.get('body', {}).get('data'):
                        body = part['body']['data']
                        break
            
            # Decode body if exists
            if body:
                try:
                    body = base64.urlsafe_b64decode(body).decode('utf-8')
                except:
                    pass
            
            # Combine for search
            search_text = (subject + ' ' + sender + ' ' + body).lower()
            
            # Check for keywords
            matched = [k for k in KEYWORDS if k in search_text]
            
            if matched:
                leads.append({
                    'id': msg['id'],
                    'subject': subject,
                    'from': sender,
                    'snippet': msg_data.get('snippet', '')[:200],
                    'keywords': matched
                })
                print(f"✅ Lead found: {matched} - {subject[:50]}...")
        
        except Exception as e:
            print(f"Error: {e}")
            continue
    
    print(f"\n📊 Found {len(leads)} leads from Gmail:")
    print(json.dumps(leads, indent=2))
    return leads

if __name__ == "__main__":
    scrape_gmail()
