const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

let db;
function getDb() {
  if (!db) {
    if (!admin.apps.length) admin.initializeApp();
    db = admin.firestore();
  }
  return db;
}

function getGoogle() {
  return require('googleapis').google;
}

const PRICING_PDF_DIR = path.join(__dirname, 'pricing');
const PRICING_PDF_CANONICAL_BASE = 'https://asherweisberger.github.io/UNALIGNED';
const PRICING_PDF_VERSION = '20260628';
const PRICING_PDF_PACKS = {
  single: {
    file: 'SINGLE_TIER.pdf',
    filename: 'UNALIGNED SINGLE TIER PRICING 2026.pdf',
    url: `${PRICING_PDF_CANONICAL_BASE}/docs/SINGLE_TIER.pdf?v=${PRICING_PDF_VERSION}`,
  },
  duo: {
    file: 'DUO_BUNDLE.pdf',
    filename: 'UNALIGNED DUO BUNDLE PRICING 2026.pdf',
    url: `${PRICING_PDF_CANONICAL_BASE}/docs/DUO_BUNDLE.pdf?v=${PRICING_PDF_VERSION}`,
  },
  multi: {
    file: 'MULTI_TIER.pdf',
    filename: 'UNALIGNED MULTI TIER PRICING 2026.pdf',
    url: `${PRICING_PDF_CANONICAL_BASE}/docs/MULTI_TIER.pdf?v=${PRICING_PDF_VERSION}`,
  },
};

async function loadPricingPdfAttachment(pack) {
  const meta = PRICING_PDF_PACKS[pack] || PRICING_PDF_PACKS.single;
  const filePath = path.join(PRICING_PDF_DIR, meta.file);
  if (fs.existsSync(filePath)) {
    const local = fs.readFileSync(filePath);
    if (local.length > 2500 && local.slice(0, 4).toString() === '%PDF') {
      return { filename: meta.filename, content: local, contentType: 'application/pdf' };
    }
  }
  const resp = await fetch(meta.url, { headers: { 'Cache-Control': 'no-cache' } });
  if (!resp.ok) throw new Error(`Could not load pricing PDF: ${meta.file} (${resp.status})`);
  const content = Buffer.from(await resp.arrayBuffer());
  if (content.length < 2500 || content.slice(0, 4).toString() !== '%PDF') {
    throw new Error(`Pricing PDF looks invalid: ${meta.file}`);
  }
  return { filename: meta.filename, content, contentType: 'application/pdf' };
}

const SENDERS = {
  robert: {
    id: 'robert',
    name: 'Robert Scoble',
    email: 'scobleizer@gmail.com',
    secretDoc: 'gmail_oauth',
    fallbackSecretDoc: 'robert_gmail',
  },
  sam: {
    id: 'sam',
    name: 'Sam Levin',
    email: 'UnalignedX@gmail.com',
    secretDoc: 'sam_gmail',
  },
  asher: {
    id: 'asher',
    name: 'Asher',
    email: 'AsherUnaligned@gmail.com',
    secretDoc: 'asher_gmail',
  },
};

// ── Gmail OAuth (Robert) ────────────────────────────────
let cachedRobertAuth = null;

async function getRobertGmailAuth() {
  if (cachedRobertAuth) return cachedRobertAuth;

  const snap = await getDb().collection('_secrets').doc('gmail_oauth').get();
  if (!snap.exists) throw new Error('Gmail credentials not found');

  const { token, refresh_token, client_id, client_secret } = snap.data();
  const oauth2 = new (getGoogle().auth.OAuth2)(client_id, client_secret);

  if (!token || token.length < 50) {
    console.log('Refreshing Robert access token...');
    oauth2.setCredentials({ refresh_token });
    const { credentials } = await oauth2.refreshAccessToken();
    await getDb().collection('_secrets').doc('gmail_oauth').set({ token: credentials.access_token }, { merge: true });
    cachedRobertAuth = oauth2;
  } else {
    oauth2.setCredentials({ access_token: token, refresh_token });
    cachedRobertAuth = oauth2;
  }
  return cachedRobertAuth;
}

async function sendViaGmail(sender, to, subject, body, cc, attachments, threadId, replyHeaders) {
  try {
    const auth = await getRobertGmailAuth();
    const gmail = getGoogle().gmail({ version: 'v1', auth });
    const raw = makeMime(to, cc, subject, body, sender, attachments, replyHeaders);
    const result = await gmail.users.messages.send({
      userId: 'me',
      resource: threadId ? { ...raw, threadId } : raw,
    });
    return result.data.id;
  } catch (err) {
    console.warn(`Gmail OAuth send failed for ${sender.id}:`, err.message);
    const fallbackDoc = sender.fallbackSecretDoc || sender.secretDoc;
    if (!fallbackDoc) throw err;
    return sendViaSmtp({ ...sender, secretDoc: fallbackDoc }, to, subject, body, cc, attachments, replyHeaders);
  }
}

// ── SMTP senders (App Passwords) ───────────────────────
const smtpTransporters = {};

async function getSmtpTransporter(sender) {
  if (smtpTransporters[sender.id]) return smtpTransporters[sender.id];

  const snap = await getDb().collection('_secrets').doc(sender.secretDoc).get();
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
  const snap = await getDb().collection('_secrets').doc(sender.secretDoc).get();
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
    const gmail = getGoogle().gmail({ version: 'v1', auth });
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

async function verifySendEmailAuth(req) {
  const auth = String(req.headers.authorization || '');
  const sendSnap = await getDb().collection('_secrets').doc('send_email').get();
  if (sendSnap.exists && sendSnap.data().token) {
    return auth === `Bearer ${sendSnap.data().token}`;
  }
  const ingestSnap = await getDb().collection('_secrets').doc('lead_ingest').get();
  if (ingestSnap.exists && ingestSnap.data().token) {
    return auth === `Bearer ${ingestSnap.data().token}`;
  }
  console.warn('sendEmail: no token configured in _secrets/send_email — rejecting request');
  return false;
}

exports.sendEmail = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  if (!(await verifySendEmailAuth(req))) {
    res.status(401).json({ error: 'Invalid or missing bearer token' });
    return;
  }

  const { to, subject, body, cc, from, attachPdf, pricingPdfPack, threadId } = req.body || {};

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
      const pack = ['single', 'duo', 'multi'].includes(pricingPdfPack) ? pricingPdfPack : 'single';
      attachments = [await loadPricingPdfAttachment(pack)];
    }

    messageId = await sendViaGmail(sender, to, subject, body, ccList, attachments, threadId, replyHeaders);

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
    const secretSnap = await getDb().collection('_secrets').doc('lead_ingest').get();
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
    const blockedBlob = `${senderEmail} ${senderHandle} ${senderName} ${subject} ${preview}`.toLowerCase();
    if (
      senderEmail.toLowerCase() === 'boardy@boardy.ai' ||
      senderEmail.toLowerCase().endsWith('@boardy.ai') ||
      /^boardy$/i.test(senderHandle.replace(/^@/, '')) ||
      /\bboardy\s*ai\b/i.test(blockedBlob) ||
      /^boardy\b/i.test(senderName)
    ) {
      return res.status(200).json({ ok: true, skipped: true, reason: 'blocked_sender' });
    }
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

// ── Collaborator feedback (public form, token per collab) ───────────────

const FEEDBACK_PUBLIC_ORIGINS = [
  'https://unaligned-fc556.firebaseapp.com',
  'https://unaligned-fc556.web.app',
  'https://asherweisberger.github.io',
  'https://agentdashboard.cloud',
  'https://www.agentdashboard.cloud',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
];

function feedbackCors(req, res) {
  const origin = String(req.headers.origin || '');
  if (FEEDBACK_PUBLIC_ORIGINS.some((o) => origin === o || origin.startsWith(o))) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

async function getSupabaseService() {
  const secretSnap = await getDb().collection('_secrets').doc('lead_ingest').get();
  if (!secretSnap.exists) throw new Error('Supabase service secret not configured');
  const data = secretSnap.data();
  const supabase_url = data.supabase_url;
  const supabase_key = data.supabase_service_key || data.supabase_service_role_key || data.supabase_key;
  if (!supabase_url || !supabase_key) throw new Error('Supabase URL/key missing on lead_ingest secret');
  if (String(supabase_key).includes('"role":"anon"')) {
    console.warn('lead_ingest secret uses anon key; desk intake RPC will be used as fallback');
  }
  const sb = (path, opts = {}) => fetch(`${supabase_url}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: supabase_key,
      Authorization: `Bearer ${supabase_key}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  return sb;
}

function feedbackToken(value) {
  const token = String(value || '').trim();
  if (!/^[a-zA-Z0-9_-]{12,64}$/.test(token)) return null;
  return token;
}

function feedbackScore(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  if (i < min || i > max) return null;
  return i;
}

async function loadFeedbackRow(sb, token) {
  const rpc = await sb('rpc/collab_feedback_by_token', {
    method: 'POST',
    body: JSON.stringify({ p_token: token }),
  });
  if (rpc.ok) {
    const rows = await rpc.json();
    if (Array.isArray(rows) && rows[0]) return rows[0];
  }

  const load = await sb(`collab_feedback?token=eq.${encodeURIComponent(token)}&select=*&limit=1`, { method: 'GET' });
  const rows = await load.json();
  if (!load.ok) throw new Error(`Supabase read failed: ${load.status}`);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function submitFeedbackRow(sb, token, patch) {
  const rpc = await sb('rpc/collab_feedback_submit', {
    method: 'POST',
    body: JSON.stringify({
      p_token: token,
      p_patch: {
        ...patch,
        responses: patch.responses || {},
      },
    }),
  });
  if (rpc.ok) {
    const ok = await rpc.json();
    if (ok === true) return;
    if (ok === false) throw new Error('Feedback link not found');
  } else {
    const detail = await rpc.text();
    if (detail.includes('expired')) throw new Error('expired');
    if (detail.includes('already_submitted')) throw new Error('already_submitted');
  }

  const update = await sb(`collab_feedback?token=eq.${encodeURIComponent(token)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
  if (!update.ok) {
    const detail = await update.text();
    throw new Error(`Supabase update failed: ${update.status} ${detail.slice(0, 200)}`);
  }
}

const COLLAB_FEEDBACK_BASE = process.env.COLLAB_FEEDBACK_BASE
  || 'https://asherweisberger.github.io/UNALIGNED/feedback.html';

function feedbackTierFromIntent(intent) {
  const match = String(intent || '').match(/tier\s*(\d+)/i);
  return match ? `Tier ${match[1]}` : '';
}

function feedbackSourceChannel(card) {
  const source = String(card.lead_source || '').toLowerCase();
  if (source.includes('twitter') || source.startsWith('x') || source.includes('x_dm')) return 'x';
  if (card.gmail_thread_id) return 'gmail';
  return 'other';
}

function feedbackContactHandle(card) {
  const emailId = String(card.email_id || '');
  if (emailId.includes(':')) {
    const handle = emailId.split(':').slice(1).join(':').trim();
    if (handle && !handle.startsWith('thread:')) {
      return handle.startsWith('@') ? handle : `@${handle}`;
    }
  }
  const title = String(card.title || '').trim();
  if (title.startsWith('@')) return title.split(/\s+/)[0];
  return '';
}

function feedbackThreadKey(card) {
  if (card.gmail_thread_id) return String(card.gmail_thread_id);
  return String(card.email_id || '').trim();
}

function feedbackInviteFromCard(card) {
  return {
    card_id: Number(card.id),
    brand: String(card.business_name || card.title || '').trim(),
    contact_name: String(card.contact_name || '').trim(),
    contact_email: String(card.email || '').trim() || null,
    contact_handle: feedbackContactHandle(card),
    thread_key: feedbackThreadKey(card),
    source_channel: feedbackSourceChannel(card),
    deliverable: String(card.intent || '').trim(),
    tier: feedbackTierFromIntent(card.intent),
  };
}

async function findPendingFeedbackInvite(sb, cardId) {
  const load = await sb(
    `collab_feedback?card_id=eq.${encodeURIComponent(cardId)}&status=eq.pending&select=id,token,expires_at,brand,contact_name&order=created_at.desc&limit=1`,
    { method: 'GET' },
  );
  const rows = await load.json();
  if (!load.ok) throw new Error(`Supabase read failed: ${load.status}`);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

exports.createCollabFeedbackLink = functions.https.onRequest(async (req, res) => {
  feedbackCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  try {
    const body = req.body || {};
    const cardId = Number(body.cardId || body.card_id || 0);
    if (!Number.isFinite(cardId) || cardId <= 0) {
      return res.status(400).json({ ok: false, error: 'cardId is required' });
    }

    const sb = await getSupabaseService();
    const cardLoad = await sb(`cards?id=eq.${encodeURIComponent(cardId)}&select=*&limit=1`, { method: 'GET' });
    const cards = await cardLoad.json();
    if (!cardLoad.ok) throw new Error(`Supabase card read failed: ${cardLoad.status}`);
    const card = Array.isArray(cards) && cards[0] ? cards[0] : null;
    if (!card) return res.status(404).json({ ok: false, error: 'Card not found' });

    const forceNew = Boolean(body.forceNew || body.force_new);
    if (!forceNew) {
      const pending = await findPendingFeedbackInvite(sb, cardId);
      if (pending?.token) {
        return res.json({
          ok: true,
          existing: true,
          link: `${COLLAB_FEEDBACK_BASE}?t=${pending.token}`,
          inviteId: pending.id,
          brand: pending.brand || '',
          contactName: pending.contact_name || '',
        });
      }
    }

    const fields = feedbackInviteFromCard(card);
    const token = require('crypto').randomBytes(18).toString('base64url');
    const expiresAt = new Date(Date.now() + 90 * 86400000).toISOString();
    const insert = await sb('collab_feedback', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        token,
        ...fields,
        status: 'pending',
        expires_at: expiresAt,
      }),
    });
    const created = await insert.json();
    if (!insert.ok) {
      throw new Error(`Supabase insert failed: ${insert.status} ${JSON.stringify(created).slice(0, 200)}`);
    }
    const row = Array.isArray(created) && created[0] ? created[0] : null;
    return res.json({
      ok: true,
      existing: false,
      link: `${COLLAB_FEEDBACK_BASE}?t=${token}`,
      inviteId: row?.id || null,
      brand: fields.brand,
      contactName: fields.contact_name,
      cardId,
    });
  } catch (err) {
    console.error('createCollabFeedbackLink error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

const ROBERT_CONNECT_BASE = process.env.ROBERT_CONNECT_BASE
  || 'https://asherweisberger.github.io/UNALIGNED/connect';

const DESK_TOPIC_TYPES = new Set(['collaboration', 'partnership', 'sync', 'something_cool', 'other']);
const DESK_CONTACT_PREFS = new Set(['email', 'x', 'whatsapp', 'signal', 'phone', 'other']);

function deskCleanText(value, maxLen) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function deskEmail(value) {
  const email = deskCleanText(value, 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function deskHandle(value) {
  const raw = deskCleanText(value, 80).replace(/^@+/, '');
  if (!raw) return '';
  return `@${raw.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40)}`;
}

function deskPhone(value) {
  return deskCleanText(value, 40).replace(/[^\d+().\-\s]/g, '').trim();
}

function deskIntakeUnavailableDetail(status, detail) {
  const text = String(detail || '');
  if (status >= 500 || text.includes('522') || text.includes('Connection timed out')) {
    return 'Supabase is temporarily unreachable — try again in a few minutes';
  }
  if (text.includes('PGRST205') || text.includes('Could not find the table')) {
    return 'Desk intake table is not set up yet — run ops/sql/robert_desk_intake.sql in Supabase';
  }
  return '';
}

async function submitDeskIntakeRow(sb, row) {
  const rpc = await sb('rpc/robert_desk_intake_submit', {
    method: 'POST',
    body: JSON.stringify({ p_row: row }),
  });
  if (rpc.ok) {
    const id = await rpc.json();
    if (id) return { id };
  } else {
    const detail = await rpc.text();
    const retryDirect = rpc.status >= 500
      || detail.includes('PGRST202')
      || detail.includes('PGRST205')
      || detail.includes('Could not find');
    if (!retryDirect) {
      throw new Error(`Supabase RPC failed: ${rpc.status} ${detail.slice(0, 200)}`);
    }
  }

  const insert = await sb('robert_desk_intake', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  const raw = await insert.text();
  let created = null;
  try {
    created = raw ? JSON.parse(raw) : null;
  } catch (_) {
    created = raw;
  }
  if (!insert.ok) {
    const detail = typeof created === 'string' ? created : JSON.stringify(created);
    const friendly = deskIntakeUnavailableDetail(insert.status, detail);
    if (friendly) throw new Error(friendly);
    throw new Error(`Supabase insert failed: ${insert.status} ${detail.slice(0, 200)}`);
  }
  const saved = Array.isArray(created) && created[0] ? created[0] : null;
  return { id: saved?.id || null };
}

function deskContactDetail(body = {}, contactPreference = '') {
  const raw = deskCleanText(body.contact_detail || body.contactDetail, 160);
  if (raw) return raw;
  if (contactPreference === 'x') return deskHandle(body.x_handle || body.xHandle);
  if (['whatsapp', 'signal', 'phone'].includes(contactPreference)) return deskPhone(body.whatsapp);
  return '';
}

function normalizeDeskSubmission(body = {}) {
  if (body.company_website) return { error: 'Rejected' };
  const firstName = deskCleanText(body.first_name || body.firstName, 80);
  const lastName = deskCleanText(body.last_name || body.lastName, 80);
  const company = deskCleanText(body.company, 120);
  const name = deskCleanText(body.name, 120) || deskCleanText(`${firstName} ${lastName}`.trim(), 120);
  const message = deskCleanText(body.message, 4000);
  const topicType = String(body.topic_type || body.topicType || '').toLowerCase();
  const contactPreference = String(body.contact_preference || body.contactPreference || '').toLowerCase();
  const contactDetail = deskContactDetail(body, contactPreference);
  let email = deskEmail(body.email);
  let xHandle = '';
  let whatsapp = '';

  if (!firstName || firstName.length < 1) return { error: 'First name is required' };
  if (!lastName || lastName.length < 1) return { error: 'Last name is required' };
  if (!name || name.length < 2) return { error: 'Name is required' };
  if (!DESK_TOPIC_TYPES.has(topicType)) return { error: 'Pick what you want to talk about' };
  if (!DESK_CONTACT_PREFS.has(contactPreference)) return { error: 'Pick your preferred way to be contacted' };

  if (contactPreference === 'email') {
    email = deskEmail(contactDetail || body.email);
    if (!email) return { error: 'Enter the email address you want us to use' };
  } else {
    if (!email) return { error: 'A valid backup email is required' };
    if (contactPreference === 'x') {
      xHandle = deskHandle(contactDetail);
      if (!xHandle || xHandle.length < 3) return { error: 'Enter your X handle' };
    } else if (['whatsapp', 'signal', 'phone'].includes(contactPreference)) {
      whatsapp = deskPhone(contactDetail);
      if (!whatsapp || whatsapp.replace(/\D/g, '').length < 7) return { error: 'Enter a valid phone number' };
    } else if (contactPreference === 'other') {
      if (!contactDetail || contactDetail.length < 3) return { error: 'Tell us how to reach you' };
    }
  }

  if (!message || message.length < 12) return { error: 'Tell us a bit more (at least a sentence)' };

  const storedContactDetail = contactPreference === 'email'
    ? email
    : contactPreference === 'x'
      ? xHandle
      : ['whatsapp', 'signal', 'phone'].includes(contactPreference)
        ? whatsapp
        : contactDetail;

  return {
    row: {
      name,
      email,
      x_handle: xHandle,
      whatsapp,
      contact_preference: contactPreference,
      topic_type: topicType,
      message,
      status: 'new',
      source: deskCleanText(body.source, 40) || 'connect_form',
      referrer: deskCleanText(body.referrer, 500),
      responses: {
        topic_type: topicType,
        contact_preference: contactPreference,
        contact_detail: storedContactDetail,
        company,
        first_name: firstName,
        last_name: lastName,
        submitted_from: deskCleanText(body.source, 40) || 'connect_form',
      },
    },
  };
}

exports.robertDeskIntake = functions.https.onRequest(async (req, res) => {
  feedbackCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  try {
    if (req.method === 'GET') {
      return res.json({
        ok: true,
        link: ROBERT_CONNECT_BASE,
        headline: "Reach Robert's team",
        subhead: 'Partnerships, projects, and ideas worth a look.',
      });
    }
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'GET or POST only' });

    const parsed = normalizeDeskSubmission(req.body || {});
    if (parsed.error) return res.status(400).json({ ok: false, error: parsed.error });

    const sb = await getSupabaseService();
    const saved = await submitDeskIntakeRow(sb, parsed.row);
    return res.json({ ok: true, submitted: true, id: saved.id || null });
  } catch (err) {
    console.error('robertDeskIntake error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

const COLLAB_SCOPE_BASE = process.env.COLLAB_SCOPE_BASE
  || 'https://asherweisberger.github.io/UNALIGNED/scope.html';

const FALLBACK_SCOPE_CATALOG = [
  { id: 1, name: 'Retweet', price: 1295, short: 'RT', items: ['1 retweet or repost'] },
  { id: 10, name: 'X Comment + Like', price: 1995, short: 'COMMENT', items: ['1 strategic X comment from Robert', 'Like included'] },
  { id: 2, name: 'Quote Repost', price: 2195, short: 'QUOTE', items: ['1 quote repost', "Robert's original take (≤3 sentences)"] },
  { id: 3, name: 'Custom X Post', price: 2495, short: 'CUSTOM X', items: ['1 custom-written X post'] },
  { id: 4, name: 'Narrative Thread', price: 2995, short: 'THREAD', items: ['1 thread (main + 2 replies)'] },
  { id: 5, name: 'Content Core', price: 3495, short: 'CORE', items: ['1 custom X post', '1 LinkedIn post', 'Newsletter feature'] },
  { id: 6, name: 'Growth Bundle', price: 4495, short: 'GROWTH', items: ['1 custom X post', '1 LinkedIn post', '1 retweet', 'Newsletter feature'] },
  { id: 7, name: 'Maximum Impact', price: 6495, short: 'MAX', items: ['2 custom X posts', '1 LinkedIn post', '2 retweets', 'Newsletter feature', 'Strategy sync'] },
];

function scopeCleanText(value, maxLen) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

async function loadScopeCatalog(sb) {
  try {
    const load = await sb('pricing_tiers?select=id,name,price,short,items,sort_order,is_active&is_active=eq.true&order=sort_order.asc,id.asc', { method: 'GET' });
    const rows = await load.json();
    if (!load.ok || !Array.isArray(rows) || !rows.length) return FALLBACK_SCOPE_CATALOG;
    return rows.map((row) => ({
      id: Number(row.id),
      name: String(row.name || '').trim(),
      price: Number(row.price || 0),
      short: String(row.short || '').trim(),
      items: Array.isArray(row.items) ? row.items.map(String) : [],
    })).filter((row) => row.id && row.name && row.price > 0);
  } catch (err) {
    console.warn('loadScopeCatalog:', err.message);
    return FALLBACK_SCOPE_CATALOG;
  }
}

async function loadScopeRow(sb, token) {
  const rpc = await sb('rpc/collab_scope_by_token', {
    method: 'POST',
    body: JSON.stringify({ p_token: token }),
  });
  if (rpc.ok) {
    const rows = await rpc.json();
    if (Array.isArray(rows) && rows[0]) return rows[0];
  }
  const load = await sb(`collab_scope_intake?token=eq.${encodeURIComponent(token)}&select=*&limit=1`, { method: 'GET' });
  const rows = await load.json();
  if (!load.ok) throw new Error(`Supabase read failed: ${load.status}`);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function submitScopeRow(sb, token, patch) {
  const rpc = await sb('rpc/collab_scope_submit', {
    method: 'POST',
    body: JSON.stringify({ p_token: token, p_patch: patch }),
  });
  if (rpc.ok) {
    const ok = await rpc.json();
    if (ok === true) return;
    if (ok === false) throw new Error('Scope link not found');
  } else {
    const detail = await rpc.text();
    if (detail.includes('expired')) throw new Error('expired');
    if (detail.includes('already_submitted')) throw new Error('already_submitted');
  }
  const update = await sb(`collab_scope_intake?token=eq.${encodeURIComponent(token)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
  if (!update.ok) {
    const detail = await update.text();
    throw new Error(`Supabase update failed: ${update.status} ${detail.slice(0, 200)}`);
  }
}

async function findPendingScopeInvite(sb, cardId) {
  const load = await sb(
    `collab_scope_intake?card_id=eq.${encodeURIComponent(cardId)}&status=eq.pending&select=id,token,expires_at,brand,contact_name&order=created_at.desc&limit=1`,
    { method: 'GET' },
  );
  const rows = await load.json();
  if (!load.ok) throw new Error(`Supabase read failed: ${load.status}`);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

function scopeAnswersFromBody(body = {}) {
  const answers = body.answers && typeof body.answers === 'object' ? body.answers : body;
  const tierId = Number(answers.tier_id || answers.tierId || 0);
  const tierName = scopeCleanText(answers.tier_name || answers.tierName, 120);
  const tierPrice = Number(answers.tier_price || answers.tierPrice || 0);
  const scopeDetails = scopeCleanText(answers.scope_details || answers.scopeDetails, 8000);
  const whatPromoting = scopeCleanText(answers.what_promoting || answers.whatPromoting, 4000);
  if (!tierId || !tierName || !(tierPrice > 0)) return { error: 'Select a valid package' };
  if (!whatPromoting || scopeDetails.length < 20) return { error: 'Add what you are promoting and scope details' };
  const briefSnapshot = answers.brief_snapshot && typeof answers.brief_snapshot === 'object'
    ? answers.brief_snapshot
    : {
      tier_id: tierId,
      tier_name: tierName,
      tier_price: tierPrice,
      tier_short: scopeCleanText(answers.tier_short || answers.tierShort, 40),
      tier_items: Array.isArray(answers.tier_items || answers.tierItems) ? (answers.tier_items || answers.tierItems) : [],
      what_promoting: whatPromoting,
      narrative_angle: scopeCleanText(answers.narrative_angle || answers.narrativeAngle, 4000),
      scope_details: scopeDetails,
      assets_url: scopeCleanText(answers.assets_url || answers.assetsUrl, 500),
      launch_timing: scopeCleanText(answers.launch_timing || answers.launchTiming, 300),
      must_include: scopeCleanText(answers.must_include || answers.mustInclude, 3000),
      must_avoid: scopeCleanText(answers.must_avoid || answers.mustAvoid, 3000),
      additional_notes: scopeCleanText(answers.additional_notes || answers.additionalNotes, 4000),
    };
  return {
    patch: {
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      tier_id: tierId,
      tier_name: tierName,
      tier_price: tierPrice,
      tier_short: scopeCleanText(answers.tier_short || answers.tierShort, 40),
      tier_items: Array.isArray(answers.tier_items || answers.tierItems) ? (answers.tier_items || answers.tierItems) : [],
      what_promoting: whatPromoting,
      narrative_angle: scopeCleanText(answers.narrative_angle || answers.narrativeAngle, 4000),
      scope_details: scopeDetails,
      assets_url: scopeCleanText(answers.assets_url || answers.assetsUrl, 500),
      launch_timing: scopeCleanText(answers.launch_timing || answers.launchTiming, 300),
      must_include: scopeCleanText(answers.must_include || answers.mustInclude, 3000),
      must_avoid: scopeCleanText(answers.must_avoid || answers.mustAvoid, 3000),
      additional_notes: scopeCleanText(answers.additional_notes || answers.additionalNotes, 4000),
      brief_snapshot: briefSnapshot,
      responses: answers,
    },
    briefSnapshot,
  };
}

async function applyScopeToCard(sb, cardId, invite, parsed) {
  if (!cardId || !parsed?.briefSnapshot) return;
  const cardLoad = await sb(`cards?id=eq.${encodeURIComponent(cardId)}&select=id,description,estimated_value,list_id,intent&limit=1`, { method: 'GET' });
  const cards = await cardLoad.json();
  if (!cardLoad.ok || !Array.isArray(cards) || !cards[0]) return;
  const card = cards[0];
  let description = {};
  try {
    description = card.description ? JSON.parse(card.description) : {};
  } catch (err) {
    description = {};
  }
  const snap = parsed.briefSnapshot;
  const tierLabel = `Tier ${snap.tier_id} · ${snap.tier_name}`;
  const leadSummary = [
    `${invite.brand || 'Partner'} selected ${snap.tier_name} (${snap.tier_price}) via scope form.`,
    snap.what_promoting,
    snap.scope_details,
  ].filter(Boolean).join(' ');
  description.operator_memory = {
    ...(description.operator_memory || {}),
    summary: {
      ...(description.operator_memory?.summary || {}),
      lead_summary: leadSummary.slice(0, 1200),
      company: invite.brand || description.operator_memory?.summary?.company || '',
      contact_name: invite.contact_name || description.operator_memory?.summary?.contact_name || '',
      asked_for: snap.tier_name,
      current_status: 'scope submitted — ready for brief',
      launch_timing: snap.launch_timing || '',
      quoted_rate: String(snap.tier_price),
      payment_status: description.operator_memory?.summary?.payment_status || '',
      next_action: 'Review scope form submission and draft brief or send invoice.',
      pricing_signal: true,
      brief_signal: true,
    },
    analysis: {
      stage: card.list_id || 'engaged',
      needs_reply: false,
      reason: 'Collaborator submitted structured scope form with package selection.',
      reply_type: 'scope-received',
      safe_to_auto_send: false,
      escalation: [],
    },
    scope_intake: snap,
    updated_at: new Date().toISOString(),
  };
  const fields = {
    description: JSON.stringify(description),
    estimated_value: String(snap.tier_price),
    intent: tierLabel,
  };
  if (['new'].includes(String(card.list_id || '').toLowerCase())) {
    fields.list_id = 'first-touch';
  }
  await sb(`cards?id=eq.${encodeURIComponent(cardId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(fields),
  });
}

exports.createCollabScopeLink = functions.https.onRequest(async (req, res) => {
  feedbackCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  try {
    const body = req.body || {};
    const cardId = Number(body.cardId || body.card_id || 0);
    if (!Number.isFinite(cardId) || cardId <= 0) {
      return res.status(400).json({ ok: false, error: 'cardId is required' });
    }
    const sb = await getSupabaseService();
    const cardLoad = await sb(`cards?id=eq.${encodeURIComponent(cardId)}&select=*&limit=1`, { method: 'GET' });
    const cards = await cardLoad.json();
    if (!cardLoad.ok) throw new Error(`Supabase card read failed: ${cardLoad.status}`);
    const card = Array.isArray(cards) && cards[0] ? cards[0] : null;
    if (!card) return res.status(404).json({ ok: false, error: 'Card not found' });

    const forceNew = Boolean(body.forceNew || body.force_new);
    if (!forceNew) {
      const pending = await findPendingScopeInvite(sb, cardId);
      if (pending?.token) {
        return res.json({
          ok: true,
          existing: true,
          link: `${COLLAB_SCOPE_BASE}?t=${pending.token}`,
          inviteId: pending.id,
          brand: pending.brand || '',
          contactName: pending.contact_name || '',
        });
      }
    }

    const fields = feedbackInviteFromCard(card);
    const token = require('crypto').randomBytes(18).toString('base64url');
    const expiresAt = new Date(Date.now() + 60 * 86400000).toISOString();
    const insert = await sb('collab_scope_intake', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        token,
        ...fields,
        status: 'pending',
        expires_at: expiresAt,
      }),
    });
    const created = await insert.json();
    if (!insert.ok) {
      throw new Error(`Supabase insert failed: ${insert.status} ${JSON.stringify(created).slice(0, 200)}`);
    }
    const row = Array.isArray(created) && created[0] ? created[0] : null;
    return res.json({
      ok: true,
      existing: false,
      link: `${COLLAB_SCOPE_BASE}?t=${token}`,
      inviteId: row?.id || null,
      brand: fields.brand,
      contactName: fields.contact_name,
      cardId,
    });
  } catch (err) {
    console.error('createCollabScopeLink error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

exports.collabScopeIntake = functions.https.onRequest(async (req, res) => {
  feedbackCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  try {
    const sb = await getSupabaseService();
    const catalog = await loadScopeCatalog(sb);

    if (req.method === 'GET' && !feedbackToken(req.query?.token)) {
      return res.json({ ok: true, catalog, link: COLLAB_SCOPE_BASE });
    }

    const token = feedbackToken(req.query?.token || req.body?.token);
    if (!token) return res.status(400).json({ ok: false, error: 'Invalid or missing token' });

    const row = await loadScopeRow(sb, token);
    if (!row) return res.status(404).json({ ok: false, error: 'Scope link not found' });
    if (row.expires_at && Date.parse(row.expires_at) < Date.now()) {
      return res.status(410).json({ ok: false, error: 'This scope link has expired' });
    }

    if (req.method === 'GET') {
      return res.json({
        ok: true,
        catalog,
        invite: {
          brand: row.brand || '',
          contactName: row.contact_name || '',
          contactEmail: row.contact_email || '',
          status: row.status || 'pending',
          submittedAt: row.submitted_at || null,
          tierName: row.tier_name || '',
          tierPrice: row.tier_price || null,
        },
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'GET or POST only' });
    if (row.status === 'submitted') {
      return res.status(409).json({ ok: false, error: 'Scope already submitted. Thank you.' });
    }

    const parsed = scopeAnswersFromBody(req.body || {});
    if (parsed.error) return res.status(400).json({ ok: false, error: parsed.error });

    try {
      await submitScopeRow(sb, token, parsed.patch);
    } catch (submitErr) {
      if (submitErr.message === 'expired') {
        return res.status(410).json({ ok: false, error: 'This scope link has expired' });
      }
      if (submitErr.message === 'already_submitted') {
        return res.status(409).json({ ok: false, error: 'Scope already submitted. Thank you.' });
      }
      throw submitErr;
    }

    if (row.card_id) {
      await applyScopeToCard(sb, row.card_id, row, parsed).catch((err) => {
        console.warn('applyScopeToCard:', err.message);
      });
    }

    return res.json({ ok: true, submitted: true });
  } catch (err) {
    console.error('collabScopeIntake error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

exports.collabFeedback = functions.https.onRequest(async (req, res) => {
  feedbackCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  try {
    const token = feedbackToken(req.query?.token || req.body?.token);
    if (!token) return res.status(400).json({ ok: false, error: 'Invalid or missing token' });

    const sb = await getSupabaseService();
    const row = await loadFeedbackRow(sb, token);
    if (!row) return res.status(404).json({ ok: false, error: 'Feedback link not found' });
    if (row.expires_at && Date.parse(row.expires_at) < Date.now()) {
      return res.status(410).json({ ok: false, error: 'This feedback link has expired' });
    }

    if (req.method === 'GET') {
      return res.json({
        ok: true,
        invite: {
          brand: row.brand || '',
          contactName: row.contact_name || '',
          deliverable: row.deliverable || '',
          tier: row.tier || '',
          status: row.status || 'pending',
          submittedAt: row.submitted_at || null,
        },
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'GET or POST only' });
    if (row.status === 'submitted') {
      return res.status(409).json({ ok: false, error: 'Feedback already submitted. Thank you.' });
    }

    const body = req.body || {};
    const answers = body.answers && typeof body.answers === 'object' ? body.answers : body;
    const patch = {
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      overall_score: feedbackScore(answers.overall_score, 1, 10),
      process_score: feedbackScore(answers.process_score, 1, 10),
      robert_score: feedbackScore(answers.robert_score, 1, 10),
      communication_score: feedbackScore(answers.communication_score, 1, 10),
      nps: feedbackScore(answers.nps, 0, 10),
      would_again: ['yes', 'maybe', 'no'].includes(String(answers.would_again || '').toLowerCase())
        ? String(answers.would_again).toLowerCase() : null,
      went_well: String(answers.went_well || '').trim().slice(0, 4000),
      improve: String(answers.improve || '').trim().slice(0, 4000),
      public_ok: Boolean(answers.public_ok),
      testimonial: String(answers.testimonial || '').trim().slice(0, 2000),
      responses: answers,
    };

    const missing = ['overall_score', 'process_score', 'robert_score', 'communication_score', 'nps', 'would_again']
      .filter((key) => patch[key] == null);
    if (missing.length) {
      return res.status(400).json({ ok: false, error: `Missing or invalid: ${missing.join(', ')}` });
    }

    try {
      await submitFeedbackRow(sb, token, patch);
    } catch (submitErr) {
      if (submitErr.message === 'expired') {
        return res.status(410).json({ ok: false, error: 'This feedback link has expired' });
      }
      if (submitErr.message === 'already_submitted') {
        return res.status(409).json({ ok: false, error: 'Feedback already submitted. Thank you.' });
      }
      throw submitErr;
    }
    return res.json({ ok: true, submitted: true });
  } catch (err) {
    console.error('collabFeedback error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Hosted Brief Maker API ─────────────────────────────────────────────

const BRIEF_FUNCTION_ORIGIN = 'https://us-central1-unaligned-fc556.cloudfunctions.net';
const BRIEF_GOOGLE_SECRET_DOCS = ['brief_google_oauth', 'gmail_oauth'];
const BRIEF_LLM_SECRET_DOCS = ['brief_llm'];
const BRIEF_LOCAL_PROXY = {
  baseUrl: line(process.env.BRIEF_LOCAL_BASE_URL || ''),
  token: line(process.env.BRIEF_LOCAL_TOKEN || ''),
};

function line(value) {
  return String(value || '').trim();
}

function slugFilename(value) {
  return line(value).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Robert_Brief';
}

function briefSendJson(res, status, payload) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.status(status).json(payload);
}

function briefHtmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractGoogleDocId(url) {
  const match = String(url || '').match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : '';
}

function extractJsonBlock(text) {
  const raw = line(text).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    return JSON.parse(raw);
  } catch (err) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Could not parse model JSON response.');
  }
}

function cleanSentence(value) {
  const text = line(value).replace(/\s+/g, ' ').replace(/[.\s]+$/g, '');
  return text ? `${text}.` : '';
}

function cleanPoints(values, limit = 6) {
  const out = [];
  for (const item of values || []) {
    const cleaned = cleanSentence(item);
    if (cleaned && !out.includes(cleaned)) out.push(cleaned);
    if (out.length >= limit) break;
  }
  return out;
}

function firstMatchingLine(lines, patterns) {
  for (const current of lines || []) {
    const lowered = String(current || '').toLowerCase();
    if (patterns.some(pattern => new RegExp(pattern, 'i').test(lowered))) return current;
  }
  return '';
}

function collectMatchingLines(lines, patterns, limit = 6) {
  const out = [];
  for (const current of lines || []) {
    const lowered = String(current || '').toLowerCase();
    if (patterns.some(pattern => new RegExp(pattern, 'i').test(lowered))) out.push(current);
    if (out.length >= limit) break;
  }
  return out;
}

function inferCompanyName(title, lines) {
  const cleanTitle = line(title);
  if (cleanTitle) {
    const firstPart = cleanTitle.split(/[|:•]/)[0].trim();
    if (firstPart.split(/\s+/).filter(Boolean).length <= 6) return firstPart;
  }
  const companyLine = firstMatchingLine(lines, ['\\bcompany\\b', '\\bclient\\b', '\\bbrand\\b']);
  if (companyLine.includes(':')) return line(companyLine.split(':').slice(1).join(':'));
  return cleanTitle || 'Company';
}

function extractHandles(text) {
  return String(text || '').match(/@[\w.]+/g) || [];
}

function inferDeliverableType(lines) {
  const joined = (lines || []).join(' ').toLowerCase();
  if (joined.includes('quote repost') || joined.includes('quote + repost')) return 'Quote repost';
  if (joined.includes('dedicated thread') || joined.includes('thread')) return 'Dedicated thread';
  if (joined.includes('linkedin')) return 'LinkedIn post';
  if (joined.includes('custom post')) return 'Custom post';
  if (joined.includes('post')) return 'Custom post';
  return '';
}

async function getSecretDoc(docIds) {
  for (const docId of docIds) {
    const snap = await getDb().collection('_secrets').doc(docId).get();
    if (snap.exists) return { id: docId, data: snap.data() || {} };
  }
  return null;
}

let cachedBriefAuth = null;

async function getBriefGoogleAuth() {
  if (cachedBriefAuth) return cachedBriefAuth;
  const secret = await getSecretDoc(BRIEF_GOOGLE_SECRET_DOCS);
  if (!secret) throw new Error('Hosted Brief Maker Google auth is not configured.');
  const { token, refresh_token, client_id, client_secret } = secret.data;
  if (!refresh_token || !client_id || !client_secret) {
    throw new Error('Hosted Brief Maker Google auth is missing refresh token or client credentials.');
  }
  const oauth2 = new (getGoogle().auth.OAuth2)(client_id, client_secret);
  oauth2.setCredentials({
    access_token: token || undefined,
    refresh_token,
  });
  try {
    const { credentials } = await oauth2.refreshAccessToken();
    if (credentials?.access_token) {
      oauth2.setCredentials({
        access_token: credentials.access_token,
        refresh_token,
      });
      await getDb().collection('_secrets').doc(secret.id).set({ token: credentials.access_token }, { merge: true });
    }
  } catch (err) {
    throw new Error(`Hosted Brief Maker Google auth refresh failed: ${err.message}`);
  }
  cachedBriefAuth = oauth2;
  return cachedBriefAuth;
}

async function getDocsService() {
  return getGoogle().docs({ version: 'v1', auth: await getBriefGoogleAuth() });
}

async function getCalendarService() {
  return getGoogle().calendar({ version: 'v3', auth: await getBriefGoogleAuth() });
}

async function readGoogleDocSource(sourceUrl) {
  const documentId = extractGoogleDocId(sourceUrl);
  if (!documentId) throw new Error('Could not read the Google Doc link.');
  const service = await getDocsService();
  const doc = await service.documents.get({ documentId });
  const body = doc.data.body?.content || [];
  const lines = [];
  const links = [];
  for (const block of body) {
    const para = block.paragraph;
    if (!para) continue;
    const parts = [];
    for (const element of para.elements || []) {
      const textRun = element.textRun || {};
      const content = textRun.content || '';
      if (content) parts.push(content);
      const url = textRun.textStyle?.link?.url;
      if (url) links.push({ text: line(content), href: url });
    }
    const lineText = parts.join('').trim();
    if (lineText) lines.push(lineText);
  }
  return {
    title: line(doc.data.title) || lines[0] || 'Robert Brief',
    source_url: sourceUrl,
    lines: lines.slice(0, 1200),
    links: links.slice(0, 80),
  };
}

async function readPublicNotionSource(sourceUrl) {
  const resp = await fetch(sourceUrl, { redirect: 'follow' });
  if (!resp.ok) throw new Error(`Could not read the Notion page. ${resp.status}`);
  const html = await resp.text();
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  const bodyText = briefHtmlToText(html);
  const rawLinks = [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]).filter(Boolean);
  const links = rawLinks
    .map(href => {
      const normalized = href.startsWith('/') ? new URL(href, sourceUrl).toString() : href;
      return { text: '', href: normalized };
    })
    .filter(item => /^https?:/i.test(item.href))
    .slice(0, 80);
  const lines = bodyText.split(/(?<=[.?!])\s+|\s{2,}/).map(item => item.trim()).filter(Boolean);
  return {
    title: line(titleMatch ? titleMatch[1] : '') || lines[0] || 'Robert Brief',
    source_url: sourceUrl,
    lines: lines.slice(0, 1200),
    links,
  };
}

async function readSourceByUrl(sourceUrl) {
  if (/docs\.google\.com\/document/i.test(sourceUrl)) return readGoogleDocSource(sourceUrl);
  if (/notion\.(so|site)/i.test(sourceUrl)) return readPublicNotionSource(sourceUrl);
  throw new Error('Paste a public Notion page or Google Doc link.');
}

async function expandReferenceSources(source, maxRefs = 3) {
  const refs = [];
  for (const link of source.links || []) {
    const href = line(link.href);
    if (!href || href === source.source_url) continue;
    if (!/docs\.google\.com\/document|notion\.(so|site)/i.test(href)) continue;
    refs.push(href);
    if (refs.length >= maxRefs) break;
  }
  const referenced = [];
  for (const ref of refs) {
    try {
      const child = await readSourceByUrl(ref);
      referenced.push({
        url: ref,
        title: child.title,
        text: (child.lines || []).slice(0, 120).join('\n'),
      });
    } catch (err) {
      referenced.push({ url: ref, title: '', text: `Could not load linked reference: ${err.message}` });
    }
  }
  return referenced;
}

function buildBriefPrompt(source) {
  const referenceText = (source.references || []).map(ref => `REFERENCE: ${ref.title || ref.url}\n${ref.text}`).join('\n\n');
  return `Extract a Robert Scoble sponsorship brief from the source below.

Return valid JSON only. No markdown. No explanation. No invented facts.
Use short confident prose. No hyphens or em dashes.

Return exactly this JSON:
{
  "title": "",
  "company_name": "",
  "about_company": "",
  "core_idea": "",
  "how_it_works": "",
  "announcement": "",
  "deliverable_type": "",
  "go_live": "",
  "go_live_note": "",
  "angles_or_accuracy_requirements": [],
  "where_it_lives": [["Label", "Value"]],
  "status_note": [],
  "why_alignednews": "",
  "drafts": [
    {"label": "Option 1. Core angle. Recommended", "text": ""},
    {"label": "Option 2. Why now angle", "text": ""},
    {"label": "Option 3. Operator angle", "text": ""}
  ],
  "must_include": {
    "tag": "",
    "link": "",
    "hashtags": ""
  },
  "submit_url": ""
}

Match locked client accuracy language word for word.
Drafts should end with CTA and required tags when present.

SOURCE TITLE:
${source.title}

SOURCE URL:
${source.source_url}

PRIMARY SOURCE:
${line(source.source_text).slice(0, 12000)}

LINKED REFERENCES:
${referenceText.slice(0, 12000)}
`;
}

async function queryHostedBriefModel(source) {
  const secret = await getSecretDoc(BRIEF_LLM_SECRET_DOCS);
  if (!secret) throw new Error('Hosted Brief Maker model config is not set in Firestore _secrets/brief_llm.');
  const { base_url, api_key, model } = secret.data;
  if (!base_url || !model) throw new Error('Hosted Brief Maker model config is missing base_url or model.');
  const url = `${String(base_url).replace(/\/$/, '')}/chat/completions`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(api_key ? { Authorization: `Bearer ${api_key}` } : {}),
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are a precise JSON extraction engine.' },
        { role: 'user', content: buildBriefPrompt(source) },
      ],
      temperature: 0.1,
      max_tokens: 1400,
    }),
  });
  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`Hosted Brief Maker model call failed: ${resp.status} ${detail.slice(0, 200)}`);
  }
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content || '';
  const parsed = extractJsonBlock(content);
  parsed._hosted_model = {
    base_url: String(base_url).replace(/\/$/, ''),
    model,
  };
  return parsed;
}

function buildHeuristicBriefPayload(source) {
  const lines = source.lines || [];
  const title = line(source.title) || 'Robert Brief';
  const company = inferCompanyName(title, lines);
  const introLines = lines.filter(item => item !== title).slice(0, 8);
  const summary = introLines.join(' ').trim();
  const aboutLine = firstMatchingLine(lines, ['\\bwhat (it|they) do\\b', '\\babout\\b', '\\boverview\\b', '\\bproduct\\b']) || summary;
  const coreIdea = firstMatchingLine(lines, ['\\bcore idea\\b', '\\bmoat\\b', '\\bwhy it matters\\b', '\\bwhy now\\b']) || summary;
  const howItWorks = firstMatchingLine(lines, ['\\bhow it works\\b', '\\bworkflow\\b', '\\bsolution\\b', '\\bmechanic\\b']) || summary;
  const announcement = firstMatchingLine(lines, ['\\blaunch\\b', '\\bannounce\\b', '\\bseries [a-z]\\b', '\\bshipping\\b']) || summary;
  const goLive = firstMatchingLine(lines, ['\\bgo live\\b', '\\bposting window\\b', '\\bpost on\\b', '\\bpublish\\b', '\\blive on\\b']);
  const accuracy = collectMatchingLines(lines, ['\\bmust say\\b', '\\bexact\\b', '\\bdo not say\\b', '\\bnon.?negotiable\\b', '\\baccuracy\\b'], 6);
  const angles = collectMatchingLines(lines, ['\\bangle\\b', '\\bhook\\b', '\\bpositioning\\b', '\\bwhy it matters\\b'], 6);
  const statusNotes = collectMatchingLines(lines, ['\\breview\\b', '\\bapproval\\b', '\\bwait for\\b', '\\bblocker\\b', '\\binvoice\\b', '\\bcreative direction\\b'], 6);
  const disclosure = collectMatchingLines(lines, ['paid partnership', 'made with ai', 'not financial advice', '\\bad\\b', '\\bsponsored\\b'], 4);
  const assetLines = collectMatchingLines(lines, ['\\basset\\b', '\\bdrive\\b', '\\bvideo\\b', '\\bstills\\b', '\\bvisual\\b'], 4);
  const tags = [...new Set(lines.flatMap(extractHandles))].slice(0, 6);
  const urls = [...new Set([
    ...(source.links || []).map(item => line(item.href)).filter(Boolean),
    ...((source.source_text || '').match(/https?:\/\/[^\s)>\]]+/g) || []),
  ])];
  const website = urls.find(u => !/notion\.(so|site)|docs\.google\.com/i.test(u)) || source.source_url;
  const quotePost = urls.find(u => /x\.com|twitter\.com/i.test(u)) || '';
  const submitUrl = urls.find(u => /fillout\.com|forms\./i.test(u)) || '';
  const deliverableType = inferDeliverableType(lines);
  const hashtags = (((source.source_text || '').match(/#[A-Za-z0-9_]+/g) || []).join(' ')).trim();

  return {
    title: `${company} x UNALIGNED x ROBERT SCOBLE`,
    subtitle: 'For Robert. Built from the source brief.',
    filename: slugFilename(company || title),
    company_name: company,
    about_company: cleanSentence(aboutLine || `${company} is the company behind this campaign`),
    core_idea: cleanSentence(coreIdea || summary),
    how_it_works: cleanSentence(howItWorks || summary),
    announcement: cleanSentence(announcement || summary),
    deliverable_type: deliverableType,
    go_live: line(goLive),
    go_live_note: cleanSentence(statusNotes[0] || 'Confirm the exact posting window before going live'),
    angles_or_accuracy_requirements: cleanPoints(accuracy.length ? accuracy : angles, 6),
    where_it_lives: [
      website ? ['Website', website] : null,
      tags[0] ? ['Company X', tags[0]] : null,
      tags[1] ? ['Founder X', tags[1]] : null,
      quotePost ? ['Post to quote', quotePost] : null,
      assetLines[0] ? ['Assets', assetLines[0]] : null,
    ].filter(Boolean),
    status_note: cleanPoints([goLive, ...disclosure, ...statusNotes, ...assetLines], 8),
    why_alignednews: cleanSentence(`This fits AlignedNews because Robert can frame ${company} through the broader AI shift, not just the product launch`),
    drafts: [
      { label: 'Option 1. Core angle. Recommended', text: cleanSentence(summary || `${company} is worth watching right now`) },
      { label: 'Option 2. Why now angle', text: '' },
      { label: 'Option 3. Operator angle', text: '' },
    ],
    must_include: {
      tag: tags[0] || '',
      link: website || '',
      hashtags,
    },
    submit_url: submitUrl,
    source_url: source.source_url,
    source_text: source.source_text,
  };
}

function mergeBriefPayload(base, llmPayload) {
  if (!llmPayload) return base;
  const merged = { ...base };
  for (const field of [
    'title', 'company_name', 'about_company', 'core_idea', 'how_it_works',
    'announcement', 'deliverable_type', 'go_live', 'go_live_note',
    'why_alignednews', 'submit_url',
  ]) {
    const value = line(llmPayload[field]);
    if (value) merged[field] = value;
  }
  for (const field of ['angles_or_accuracy_requirements', 'where_it_lives', 'status_note', 'drafts']) {
    if (Array.isArray(llmPayload[field]) && llmPayload[field].length) merged[field] = llmPayload[field];
  }
  merged.must_include = {
    ...(base.must_include || {}),
    ...Object.fromEntries(
      Object.entries(llmPayload.must_include || {}).filter(([, value]) => line(value))
    ),
  };
  if (llmPayload._hosted_model) merged.hosted_model = llmPayload._hosted_model;
  return merged;
}

async function importBriefSourcePayload(sourceUrl) {
  const source = await readSourceByUrl(sourceUrl);
  const references = await expandReferenceSources({
    ...source,
    source_text: (source.lines || []).slice(0, 240).join('\n'),
  });
  const enrichedSource = {
    ...source,
    source_text: (source.lines || []).slice(0, 320).join('\n'),
    references,
  };
  const heuristic = buildHeuristicBriefPayload(enrichedSource);
  let finalPayload = heuristic;
  try {
    const llmPayload = await queryHostedBriefModel(enrichedSource);
    finalPayload = mergeBriefPayload(heuristic, llmPayload);
  } catch (err) {
    finalPayload.model_warning = err.message;
  }
  return {
    ok: true,
    payload: finalPayload,
    source: {
      title: source.title || finalPayload.title,
      url: sourceUrl,
      references: references.map(ref => ref.url),
    },
  };
}

async function proxyBriefLocal(path, body) {
  if (!BRIEF_LOCAL_PROXY.baseUrl || !BRIEF_LOCAL_PROXY.token) return null;
  const target = `${BRIEF_LOCAL_PROXY.baseUrl.replace(/\/$/, '')}${path}`;
  const resp = await fetch(target, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${BRIEF_LOCAL_PROXY.token}`,
    },
    body: JSON.stringify(body || {}),
  });
  const text = await resp.text();
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch (err) {
    parsed = { ok: false, error: text || `Local brief proxy returned ${resp.status}` };
  }
  return {
    ok: resp.ok,
    status: resp.status,
    body: parsed,
  };
}

function buildHostedBriefDocText(payload) {
  const sections = [];
  const companyName = line(payload.company_name);
  sections.push(line(payload.title) || 'UNALIGNED Robert Brief');
  if (line(payload.subtitle)) sections.push(line(payload.subtitle));

  const addSection = (heading, values) => {
    const cleanValues = (values || []).filter(Boolean);
    if (!cleanValues.length) return;
    sections.push('', heading, ...cleanValues);
  };

  addSection(companyName ? `ABOUT ${companyName}` : 'ABOUT THE COMPANY', [line(payload.about_company)]);
  addSection('THE CORE IDEA', [line(payload.core_idea)]);
  addSection('HOW IT WORKS / THE ANNOUNCEMENT', [line(payload.how_it_works), line(payload.announcement)].filter(Boolean));
  addSection('ANGLES OR HARD ACCURACY REQUIREMENTS', (payload.angles_or_accuracy_requirements || []).map(line));
  const whereLines = [];
  for (const item of payload.where_it_lives || []) {
    if (Array.isArray(item) && item.length >= 2) whereLines.push(`${line(item[0])}: ${line(item[1])}`);
  }
  if (line(payload.must_include?.hashtags)) whereLines.push(`Hashtags: ${line(payload.must_include.hashtags)}`);
  addSection('WHERE IT LIVES', whereLines);
  addSection('STATUS NOTE', [
    line(payload.deliverable_type) ? `Deliverable: ${line(payload.deliverable_type)}` : '',
    line(payload.go_live) ? `Go live: ${line(payload.go_live)}` : '',
    line(payload.go_live_note),
    ...(payload.status_note || []).map(line),
  ]);
  addSection('WHY IT MATTERS FOR ALIGNEDNEWS', [line(payload.why_alignednews)]);
  const draftLines = [];
  for (const draft of payload.drafts || []) {
    if (line(draft.label)) draftLines.push(line(draft.label));
    if (line(draft.text)) draftLines.push(line(draft.text));
    draftLines.push('');
  }
  while (draftLines.length && !draftLines[draftLines.length - 1]) draftLines.pop();
  addSection('POST TO PUBLISH', draftLines);
  if (line(payload.submit_url)) sections.push('', `After posting, submit the live post URL here: ${line(payload.submit_url)}`);
  return `${sections.join('\n').trim()}\n`;
}

function buildHostedBriefRequests(text) {
  const requests = [{ insertText: { location: { index: 1 }, text } }];
  const sectionTitles = new Set([
    'ABOUT THE COMPANY',
    'THE CORE IDEA',
    'HOW IT WORKS / THE ANNOUNCEMENT',
    'ANGLES OR HARD ACCURACY REQUIREMENTS',
    'WHERE IT LIVES',
    'STATUS NOTE',
    'WHY IT MATTERS FOR ALIGNEDNEWS',
    'POST TO PUBLISH',
  ]);
  let index = 1;
  const lines = text.split(/\n/).map(line => `${line}\n`);
  lines.forEach((raw, i) => {
    const start = index;
    index += raw.length;
    const stripped = raw.replace(/\n$/, '');
    if (i === 0) {
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: start, endIndex: index },
          paragraphStyle: { namedStyleType: 'TITLE' },
          fields: 'namedStyleType',
        },
      });
    } else if (i === 1 && stripped) {
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: start, endIndex: index },
          paragraphStyle: { namedStyleType: 'SUBTITLE' },
          fields: 'namedStyleType',
        },
      });
    } else if (sectionTitles.has(stripped) || stripped.startsWith('ABOUT ')) {
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: start, endIndex: index },
          paragraphStyle: { namedStyleType: 'HEADING_2' },
          fields: 'namedStyleType',
        },
      });
    } else if (stripped.startsWith('Option ')) {
      requests.push({
        updateTextStyle: {
          range: { startIndex: start, endIndex: index - 1 },
          textStyle: { bold: true },
          fields: 'bold',
        },
      });
    }
  });
  return requests;
}

async function createHostedBriefDoc(payload) {
  let finalPayload = payload || {};
  const sourceUrl = line(finalPayload.source_url || finalPayload.notion_url);
  if (sourceUrl && !line(finalPayload.title)) {
    finalPayload = (await importBriefSourcePayload(sourceUrl)).payload;
  }
  const title = line(finalPayload.title);
  if (!title) throw new Error('Brief title is required.');
  const service = await getDocsService();
  const created = await service.documents.create({ requestBody: { title } });
  const documentId = created.data.documentId;
  const text = buildHostedBriefDocText(finalPayload);
  const requests = buildHostedBriefRequests(text);
  await service.documents.batchUpdate({
    documentId,
    requestBody: { requests },
  });
  return {
    ok: true,
    documentId,
    title,
    url: `https://docs.google.com/document/d/${documentId}/edit`,
    sourceUrl,
  };
}

function parseCalendarWindow(payload) {
  const dateValue = line(payload.calendar_date);
  const startValue = line(payload.calendar_start);
  const endValue = line(payload.calendar_end);
  if (!dateValue || !startValue) throw new Error('Calendar date and start time are required.');
  const startAt = new Date(`${dateValue}T${startValue}:00-04:00`);
  const endAt = endValue ? new Date(`${dateValue}T${endValue}:00-04:00`) : new Date(startAt.getTime() + 30 * 60000);
  return { startAt, endAt: endAt > startAt ? endAt : new Date(startAt.getTime() + 30 * 60000) };
}

async function createHostedCalendarHold(payload) {
  const title = line(payload.calendar_title || payload.title);
  if (!title) throw new Error('Calendar title is required.');
  const { startAt, endAt } = parseCalendarWindow(payload);
  const service = await getCalendarService();
  const event = await service.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: title,
      description: [
        line(payload.subtitle),
        '',
        line(payload.go_live) ? `Go live: ${line(payload.go_live)}` : '',
        line(payload.go_live_note),
        line(payload.doc_url) ? `Brief doc: ${line(payload.doc_url)}` : '',
      ].filter(Boolean).join('\n'),
      start: { dateTime: startAt.toISOString(), timeZone: 'America/New_York' },
      end: { dateTime: endAt.toISOString(), timeZone: 'America/New_York' },
    },
  });
  return {
    ok: true,
    eventId: event.data.id,
    htmlLink: event.data.htmlLink,
    title,
  };
}

exports.importBriefSource = functions.https.onRequest(async (req, res) => {
  if (req.method === 'OPTIONS') return briefSendJson(res, 204, {});
  if (req.method !== 'POST') return briefSendJson(res, 405, { ok: false, error: 'POST only' });
  try {
    const proxied = await proxyBriefLocal('/import-source-brief', req.body || {});
    if (proxied) return briefSendJson(res, proxied.ok ? 200 : proxied.status || 400, proxied.body);
    const sourceUrl = line(req.body?.source_url || req.body?.notion_url);
    if (!sourceUrl) throw new Error('Source URL is required.');
    const result = await importBriefSourcePayload(sourceUrl);
    return briefSendJson(res, 200, result);
  } catch (err) {
    console.error('importBriefSource error:', err.message);
    return briefSendJson(res, 400, { ok: false, error: err.message });
  }
});

exports.generateBriefDoc = functions.https.onRequest(async (req, res) => {
  if (req.method === 'OPTIONS') return briefSendJson(res, 204, {});
  if (req.method !== 'POST') return briefSendJson(res, 405, { ok: false, error: 'POST only' });
  try {
    const proxied = await proxyBriefLocal('/generate-brief-doc', req.body || {});
    if (proxied) return briefSendJson(res, proxied.ok ? 200 : proxied.status || 400, proxied.body);
    const result = await createHostedBriefDoc(req.body || {});
    return briefSendJson(res, 200, result);
  } catch (err) {
    console.error('generateBriefDoc error:', err.message);
    return briefSendJson(res, 400, { ok: false, error: err.message });
  }
});

exports.createBriefCalendarHold = functions.https.onRequest(async (req, res) => {
  if (req.method === 'OPTIONS') return briefSendJson(res, 204, {});
  if (req.method !== 'POST') return briefSendJson(res, 405, { ok: false, error: 'POST only' });
  try {
    const proxied = await proxyBriefLocal('/create-calendar-hold', req.body || {});
    if (proxied) return briefSendJson(res, proxied.ok ? 200 : proxied.status || 400, proxied.body);
    const result = await createHostedCalendarHold(req.body || {});
    return briefSendJson(res, 200, result);
  } catch (err) {
    console.error('createBriefCalendarHold error:', err.message);
    return briefSendJson(res, 400, { ok: false, error: err.message });
  }
});
