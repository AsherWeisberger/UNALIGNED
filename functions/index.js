const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');

admin.initializeApp();
const db = admin.firestore();

const SENDERS = {
  robert: {
    id: 'robert',
    name: 'Robert Scoble',
    email: 'scobleizer@gmail.com',
    type: 'gmail_oauth',
    secretDoc: 'gmail_oauth',
    fallbackSecretDoc: 'robert_gmail',
  },
  sam: {
    id: 'sam',
    name: 'Sam Levin',
    email: 'UnalignedX@gmail.com',
    type: 'smtp',
    secretDoc: 'sam_gmail',
  },
  asher: {
    id: 'asher',
    name: 'Asher',
    email: 'AsherUnaligned@gmail.com',
    type: 'smtp',
    secretDoc: 'asher_gmail',
  },
};

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

async function sendViaRobert(to, subject, body, cc, attachments, threadId, replyHeaders) {
  try {
    const auth = await getRobertGmailAuth();
    const gmail = google.gmail({ version: 'v1', auth });
    const raw = makeMime(to, cc, subject, body, SENDERS.robert, attachments, replyHeaders);
    const result = await gmail.users.messages.send({
      userId: 'me',
      resource: threadId ? { ...raw, threadId } : raw,
    });
    return result.data.id;
  } catch (err) {
    console.warn('Robert OAuth send failed, falling back to SMTP:', err.message);
    return sendViaSmtp({ ...SENDERS.robert, type: 'smtp', secretDoc: SENDERS.robert.fallbackSecretDoc }, to, subject, body, cc, attachments, replyHeaders);
  }
}

// ── SMTP senders (App Passwords) ───────────────────────
const smtpTransporters = {};

async function getSmtpTransporter(sender) {
  if (smtpTransporters[sender.id]) return smtpTransporters[sender.id];

  const snap = await db.collection('_secrets').doc(sender.secretDoc).get();
  if (!snap.exists) throw new Error(`${sender.name} Gmail credentials not found`);

  const { email, app_password } = snap.data();
  smtpTransporters[sender.id] = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: email, pass: app_password },
  });
  return smtpTransporters[sender.id];
}

async function sendViaSmtp(sender, to, subject, body, cc, attachments, replyHeaders) {
  const t = await getSmtpTransporter(sender);
  const snap = await db.collection('_secrets').doc(sender.secretDoc).get();
  const { email } = snap.data();
  const mail = {
    from: `"${sender.name}" <${email || sender.email}>`,
    to,
    cc: cc || undefined,
    subject,
    text: body,
    attachments: attachments || [],
  };
  if (replyHeaders?.inReplyTo) mail.inReplyTo = replyHeaders.inReplyTo;
  if (replyHeaders?.references) mail.references = replyHeaders.references;
  await t.sendMail(mail);
  return 'sent via SMTP';
}

// ── Shared ──────────────────────────────────────────
async function getThreadReplyHeaders(threadId) {
  if (!threadId) return {};
  try {
    const auth = await getRobertGmailAuth();
    const gmail = google.gmail({ version: 'v1', auth });
    const result = await gmail.users.threads.get({
      userId: 'me',
      id: threadId,
      format: 'metadata',
      metadataHeaders: ['Message-ID', 'References'],
      fields: 'messages(id,payload/headers)',
    });
    const messages = result.data.messages || [];
    const last = messages[messages.length - 1];
    const headers = last?.payload?.headers || [];
    const headerValue = name => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
    const messageId = headerValue('Message-ID');
    const references = headerValue('References');
    if (!messageId) return {};
    return {
      inReplyTo: messageId,
      references: [references, messageId].filter(Boolean).join(' '),
    };
  } catch (err) {
    console.warn('Could not load Gmail thread headers:', err.message);
    return {};
  }
}

function threadHeaderLines(replyHeaders) {
  if (!replyHeaders?.inReplyTo) return [];
  return [
    `In-Reply-To: ${replyHeaders.inReplyTo}`,
    `References: ${replyHeaders.references || replyHeaders.inReplyTo}`,
  ];
}

function makeMime(to, cc, subject, body, sender, attachments, replyHeaders) {
  if (attachments && attachments.length) {
    const boundary = `unaligned_${Date.now()}`;
    const lines = [
      `From: "${sender.name}" <${sender.email}>`,
      `To: ${to}`,
      cc ? `Cc: ${cc}` : null,
      `Subject: ${subject}`,
      ...threadHeaderLines(replyHeaders),
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
      body,
      '',
    ].filter(line => line !== null);

    for (const attachment of attachments) {
      lines.push(
        `--${boundary}`,
        `Content-Type: ${attachment.contentType || 'application/octet-stream'}; name="${attachment.filename}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${attachment.filename}"`,
        '',
        Buffer.from(attachment.content).toString('base64').replace(/(.{76})/g, '$1\r\n'),
        ''
      );
    }

    lines.push(`--${boundary}--`);
    return { raw: Buffer.from(lines.join('\r\n')).toString('base64url') };
  }

  const lines = [
    `From: "${sender.name}" <${sender.email}>`,
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    `Subject: ${subject}`,
    ...threadHeaderLines(replyHeaders),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    body,
  ].filter(line => line !== null);
  return { raw: Buffer.from(lines.join('\r\n')).toString('base64url') };
}

function normalizeSender(from) {
  const raw = String(from || '').trim().toLowerCase();

  if (
    raw.includes('asher') ||
    raw.includes('asherunaligned') ||
    raw.includes('asherweisberger')
  ) {
    return SENDERS.asher;
  }

  if (
    raw.includes('sam') ||
    raw.includes('unalignedx') ||
    raw.includes('samlevin')
  ) {
    return SENDERS.sam;
  }

  if (
    !raw ||
    raw.includes('robert') ||
    raw.includes('scoble') ||
    raw.includes('scobelizer') ||
    raw.includes('scobleizer')
  ) {
    return SENDERS.robert;
  }

  throw new Error(`Unknown sender: ${from}`);
}

function normalizeAddressList(value) {
  return String(value || '')
    .split(',')
    .map(item => {
      const trimmed = item.trim();
      const match = trimmed.match(/<([^<>@\s]+@[^<>\s]+)>/) || trimmed.match(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
      return match ? match[1].trim() : trimmed;
    })
    .filter(Boolean);
}

function senderAddressSet(sender) {
  return new Set([
    sender.email,
    sender.id === 'asher' ? 'asherunaligned@gmail.com' : '',
    sender.id === 'sam' ? 'unalignedx@gmail.com' : '',
    sender.id === 'robert' ? 'scobleizer@gmail.com' : '',
  ].filter(Boolean).map(item => item.toLowerCase()));
}

function hasSenderRecipient(to, sender) {
  const senderAddresses = senderAddressSet(sender);
  return normalizeAddressList(to).some(address => senderAddresses.has(address.toLowerCase()));
}

function effectiveCc(cc, sender, to) {
  const requested = normalizeAddressList(cc);
  const defaults = [SENDERS.robert.email, SENDERS.sam.email, SENDERS.asher.email];
  const recipients = new Set(normalizeAddressList(to).map(item => item.toLowerCase()));
  const senderAddresses = senderAddressSet(sender);
  const seen = new Set();

  return (requested.length ? requested : defaults)
    .filter(address => {
      const normalized = address.toLowerCase();
      if (senderAddresses.has(normalized)) return false;
      if (recipients.has(normalized)) return false;
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .join(',');
}

exports.sendEmail = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { to, subject, body, cc, from, attachPdf, threadId } = req.body || {};

  if (!to || !subject || !body) {
    res.status(400).json({ error: 'Missing to, subject, or body' });
    return;
  }

  try {
    const sender = normalizeSender(from);
    if (hasSenderRecipient(to, sender)) {
      res.status(400).json({ error: `Refusing to send: ${sender.name} is also listed as the recipient.` });
      return;
    }
    const ccList = effectiveCc(cc, sender, to);
    const replyHeaders = await getThreadReplyHeaders(threadId);
    let messageId;

    let attachments = [];
    if (attachPdf) {
      const pdfUrl = 'https://unaligned-fc556.web.app/docs/SINGLE_TIER.pdf';
      const pdfResp = await fetch(pdfUrl);
      if (pdfResp.ok) {
        const pdfBuffer = Buffer.from(await pdfResp.arrayBuffer());
        attachments = [{ filename: 'SINGLE_TIER.pdf', content: pdfBuffer, contentType: 'application/pdf' }];
      }
    }

    if (sender.type === 'smtp') {
      messageId = await sendViaSmtp(sender, to, subject, body, ccList, attachments, replyHeaders);
    } else {
      messageId = await sendViaRobert(to, subject, body, ccList, attachments, threadId, replyHeaders);
    }

    res.json({ success: true, messageId, from: sender.id, threadId: threadId || null });
  } catch (err) {
    console.error('sendEmail error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Lead ingestion API — for AI systems pushing leads from any source ──
// Contract documented in docs/LEAD_INGEST.md. Auth: Bearer token checked
// against _secrets/lead_ingest. Dedupes on (source, externalId) via the
// cards.email_id column, matching how the Gmail scrapers dedupe.

const INGEST_SOURCES = ['email', 'instagram_dm', 'twitter_dm', 'linkedin', 'other'];

function normalizeIngestSource(value) {
  const s = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (INGEST_SOURCES.includes(s)) return s;
  if (s === 'ig' || s === 'instagram') return 'instagram_dm';
  if (s === 'x' || s === 'twitter' || s === 'x_dm') return 'twitter_dm';
  if (s === 'gmail' || s === 'mail') return 'email';
  if (s === 'linkedin_dm') return 'linkedin';
  return null;
}

exports.ingestLead = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const secretSnap = await db.collection('_secrets').doc('lead_ingest').get();
    if (!secretSnap.exists) return res.status(500).json({ error: 'Ingest secret not configured' });
    const { token, supabase_url, supabase_key } = secretSnap.data();

    const auth = String(req.headers.authorization || '');
    if (!token || auth !== `Bearer ${token}`) {
      return res.status(401).json({ error: 'Invalid or missing bearer token' });
    }

    const body = req.body || {};
    const source = normalizeIngestSource(body.source);
    if (!source) {
      return res.status(400).json({ error: `source must be one of: ${INGEST_SOURCES.join(', ')}` });
    }
    const senderName = String(body.senderName || '').trim();
    const senderEmail = String(body.senderEmail || '').trim();
    const senderHandle = String(body.senderHandle || '').trim();
    const preview = String(body.preview || '').trim();
    if (!senderName && !senderEmail && !senderHandle) {
      return res.status(400).json({ error: 'Provide at least one of senderName, senderEmail, senderHandle' });
    }
    if (!preview) return res.status(400).json({ error: 'preview is required' });

    const priority = ['low', 'normal', 'high', 'urgent'].includes(String(body.priority || '').toLowerCase())
      ? String(body.priority).toLowerCase() : 'normal';
    const receivedAt = body.receivedAt && !isNaN(Date.parse(body.receivedAt))
      ? new Date(body.receivedAt).toISOString() : new Date().toISOString();
    const externalId = String(body.externalId || '').trim();
    const dedupeKey = externalId ? `${source}:${externalId}` : null;

    const subject = String(body.subject || '').trim();
    const displayName = senderName || senderHandle || senderEmail;
    const record = {
      title: subject || `${displayName} via ${source.replace('_', ' ')}`,
      list_id: 'new',
      contact_name: displayName,
      email: senderEmail || null,
      business_name: String(body.company || '').trim() || null,
      lead_source: `ingest-${source}`,
      description: preview,
      priority,
      date_received_iso: receivedAt,
      created_by: 'ingest-api',
      assignee: String(body.assignedTo || '').trim() || null,
      estimated_value: body.estimatedValue != null ? String(body.estimatedValue) : null,
      new_reply_at: receivedAt,
      moved_at: receivedAt,
    };
    if (dedupeKey) record.email_id = dedupeKey;

    const sb = (path, opts) => fetch(`${supabase_url}/rest/v1/${path}`, {
      ...opts,
      headers: {
        apikey: supabase_key,
        Authorization: `Bearer ${supabase_key}`,
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
      },
    });

    if (dedupeKey) {
      const existing = await sb(`cards?email_id=eq.${encodeURIComponent(dedupeKey)}&select=id`, { method: 'GET' });
      const rows = await existing.json();
      if (Array.isArray(rows) && rows.length) {
        const update = { description: preview, new_reply_at: receivedAt, priority };
        if (subject) update.title = subject;
        const patch = await sb(`cards?id=eq.${encodeURIComponent(rows[0].id)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify(update),
        });
        if (!patch.ok) throw new Error(`Supabase update failed: ${patch.status}`);
        return res.json({ ok: true, action: 'updated', id: rows[0].id });
      }
    }

    const insert = await sb('cards', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(record),
    });
    if (!insert.ok) {
      const detail = await insert.text();
      throw new Error(`Supabase insert failed: ${insert.status} ${detail.slice(0, 200)}`);
    }
    const created = await insert.json();
    return res.json({ ok: true, action: 'created', id: created[0]?.id ?? null });
  } catch (err) {
    console.error('ingestLead error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});
