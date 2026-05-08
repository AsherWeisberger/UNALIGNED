#!/usr/bin/env node

const http = require('http');
const path = require('path');
const { readFileSync } = require('fs');
const { spawn } = require('child_process');
const { createRequire } = require('module');

const root = path.resolve(__dirname, '../..');
const functionsRequire = createRequire(path.join(root, 'functions/package.json'));
const { initializeApp, cert } = functionsRequire('firebase-admin/app');
const { getFirestore } = functionsRequire('firebase-admin/firestore');
const { google } = functionsRequire('googleapis');

const EXPECTED_EMAIL = 'asherunaligned@gmail.com';
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
];

function loadClientSecret() {
  const clientPath = path.join(process.env.HOME, '.config/google-credentials/client_secret.json');
  const raw = JSON.parse(readFileSync(clientPath, 'utf8'));
  const config = raw.installed || raw.web;
  if (!config?.client_id || !config?.client_secret) {
    throw new Error(`Invalid Google OAuth client secret at ${clientPath}`);
  }
  return config;
}

function app() {
  const serviceAccountPath = path.join(process.env.HOME, '.config/google-credentials/firebase-service-account.json');
  initializeApp({ credential: cert(serviceAccountPath) });
  return getFirestore();
}

function openBrowser(url) {
  try {
    spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
  } catch {
    // The URL is printed below, so opening the browser is just a convenience.
  }
}

async function main() {
  const db = app();
  const client = loadClientSecret();

  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
  const oauth2 = new google.auth.OAuth2(client.client_id, client.client_secret, redirectUri);

  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent select_account',
    scope: SCOPES,
  });

  console.log('');
  console.log('Authorize Asher Gmail OAuth');
  console.log('1. Sign into AsherUnaligned@gmail.com in the browser that opens.');
  console.log('2. Approve Gmail send permission.');
  console.log('3. Come back here after the success page appears.');
  console.log('');
  console.log(authUrl);
  console.log('');
  openBrowser(authUrl);

  const code = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for Google OAuth callback.')), 10 * 60 * 1000);
    server.on('request', (req, res) => {
      const url = new URL(req.url, redirectUri);
      if (url.pathname !== '/oauth2callback') {
        res.writeHead(404).end('Not found');
        return;
      }
      const error = url.searchParams.get('error');
      if (error) {
        clearTimeout(timeout);
        res.writeHead(400, { 'Content-Type': 'text/plain' }).end(`Google returned error: ${error}`);
        reject(new Error(`Google OAuth error: ${error}`));
        return;
      }
      const authCode = url.searchParams.get('code');
      clearTimeout(timeout);
      res.writeHead(200, { 'Content-Type': 'text/html' }).end('<h1>Asher Gmail connected.</h1><p>You can close this tab.</p>');
      resolve(authCode);
    });
  }).finally(() => server.close());

  if (!code) throw new Error('No OAuth code returned by Google.');

  const { tokens } = await oauth2.getToken(code);
  oauth2.setCredentials(tokens);
  if (!tokens.refresh_token) {
    throw new Error('Google did not return a refresh token. Re-run this script and make sure you approve consent for the Asher account.');
  }

  let email = 'AsherUnaligned@gmail.com';
  try {
    const userInfo = await oauth2.request({ url: 'https://www.googleapis.com/oauth2/v2/userinfo' });
    email = userInfo.data?.email || email;
  } catch {
    // The stored token still works for Gmail send; the email is only for human verification.
  }

  if (email.toLowerCase() !== EXPECTED_EMAIL) {
    throw new Error(`Authorized ${email}, but expected AsherUnaligned@gmail.com. No Firebase secret was written.`);
  }

  await db.collection('_secrets').doc('asher_gmail_oauth').set({
    email,
    client_id: client.client_id,
    client_secret: client.client_secret,
    refresh_token: tokens.refresh_token,
    token: tokens.access_token || '',
    token_expiry: tokens.expiry_date || null,
    updated_at: new Date().toISOString(),
  }, { merge: true });

  console.log('');
  console.log('Asher Gmail OAuth saved to Firebase: _secrets/asher_gmail_oauth');
}

main().catch((err) => {
  console.error('');
  console.error(`Setup failed: ${err.message}`);
  process.exit(1);
});
