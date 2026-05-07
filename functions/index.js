const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');

admin.initializeApp();
const db = admin.firestore();

// ── Gmail OAuth (Robert) ────────────────────────────────
let cachedRobertAuth = null;

async function getRobertGmailAuth() {
  if (cachedRobertAuth) return cachedRobertAuth;

  const snap = await db.collection('_secrets').doc('gmail_oauth').get();
  if (!snap.exists) throw new Error('Gmail credentials not found');

  const { token, refresh_token, client_id, client_secret } = snap.data();
  const oauth2 = new google.auth.OAuth2(client_id, client_secret);

  if (!token || token.length < 50) {
    console.log('Refreshing Robert access token...');
    oauth2.setCredentials({ refresh_token });
    const { credentials } = await oauth2.refreshAccessToken();
    await db.collection('_secrets').doc('gmail_oauth').set({ token: credentials.access_token }, { merge: true });
    cachedRobertAuth = oauth2;
  } else {
    oauth2.setCredentials({ access_token: token, refresh_token });
    cachedRobertAuth = oauth2;
  }
  return cachedRobertAuth;
}

async function sendViaRobert(to, subject, body, cc) {
  const auth = await getRobertGmailAuth();
  const gmail = google.gmail({ version: 'v1', auth });
  const raw = makeMime(to, cc, subject, body);
  const result = await gmail.users.messages.send({ userId: 'me', resource: raw });
  return result.data.id;
}

// ── Sam SMTP (App Password) ───────────────────────────
let samTransporter = null;

async function getSamTransporter() {
  if (samTransporter) return samTransporter;

  const snap = await db.collection('_secrets').doc('sam_gmail').get();
  if (!snap.exists) throw new Error('Sam Gmail credentials not found');

  const { email, app_password } = snap.data();
  samTransporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: email, pass: app_password },
  });
  return samTransporter;
}

async function sendViaSam(to, subject, body, cc, attachments) {
  const t = await getSamTransporter();
  const snap = await db.collection('_secrets').doc('sam_gmail').get();
  const { email } = snap.data();
  await t.sendMail({
    from: `"Sam Levin" <${email}>`,
    to,
    cc: cc || undefined,
    subject,
    text: body,
    attachments: attachments || [],
  });
  return 'sent via SMTP';
}

// ── Shared ──────────────────────────────────────────
function makeMime(to, cc, subject, body) {
  const lines = [
    `To: ${to}`,
    `Cc: ${cc || ''}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    body,
  ];
  return { raw: Buffer.from(lines.join('\r\n')).toString('base64url') };
}

exports.sendEmail = functions.https.onRequest(async (req, res) => {
  const allowedOrigins = new Set([
    'https://unaligned-fc556.web.app',
    'https://unaligned.io',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
  ]);
  const origin = req.get('origin') || '';
  if (allowedOrigins.has(origin)) res.set('Access-Control-Allow-Origin', origin);
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-UNALIGNED-ADMIN-TOKEN');

  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const expectedToken = process.env.SEND_EMAIL_ADMIN_TOKEN || functions.config()?.send_email?.admin_token;
  const providedToken = req.get('x-unaligned-admin-token') || '';
  if (!expectedToken) {
    res.status(503).json({ error: 'Send email is not configured securely' });
    return;
  }
  if (providedToken !== expectedToken) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { to, subject, body, cc, from, attachPdf } = req.body || {};

  if (!to || !subject || !body) {
    res.status(400).json({ error: 'Missing to, subject, or body' });
    return;
  }

  try {
    const defaultCC = 'UnalignedX@gmail.com';
    const effectiveCC = cc || defaultCC;
    let messageId;

    let attachments = [];
    if (attachPdf) {
      const pdfUrl = 'https://unaligned-fc556.web.app/Unaligned_Partnership_Packages.pdf';
      const pdfResp = await fetch(pdfUrl);
      if (pdfResp.ok) {
        const pdfBuffer = Buffer.from(await pdfResp.arrayBuffer());
        attachments = [{ filename: 'Unaligned_Partnership_Packages.pdf', content: pdfBuffer, contentType: 'application/pdf' }];
      }
    }

    if (from === 'sam' || from === 'unalignedx') {
      messageId = await sendViaSam(to, subject, body, effectiveCC, attachments);
    } else {
      messageId = await sendViaRobert(to, subject, body, effectiveCC);
    }

    res.json({ success: true, messageId });
  } catch (err) {
    console.error('sendEmail error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
