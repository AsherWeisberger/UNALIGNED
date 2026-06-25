const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');

admin.initializeApp();
const db = admin.firestore();
const runtimeConfig = typeof functions.config === 'function' ? functions.config() : {};

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

async function sendViaGmail(sender, to, subject, body, cc, attachments, threadId, replyHeaders) {
  try {
    const auth = await getRobertGmailAuth();
    const gmail = google.gmail({ version: 'v1', auth });
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

// ── Hosted Brief Maker API ─────────────────────────────────────────────

const BRIEF_FUNCTION_ORIGIN = 'https://us-central1-unaligned-fc556.cloudfunctions.net';
const BRIEF_GOOGLE_SECRET_DOCS = ['brief_google_oauth', 'gmail_oauth'];
const BRIEF_LLM_SECRET_DOCS = ['brief_llm'];
const BRIEF_LOCAL_PROXY = {
  baseUrl: line(runtimeConfig?.brief?.local_base_url || ''),
  token: line(runtimeConfig?.brief?.local_token || ''),
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
    const snap = await db.collection('_secrets').doc(docId).get();
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
  const oauth2 = new google.auth.OAuth2(client_id, client_secret);
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
      await db.collection('_secrets').doc(secret.id).set({ token: credentials.access_token }, { merge: true });
    }
  } catch (err) {
    throw new Error(`Hosted Brief Maker Google auth refresh failed: ${err.message}`);
  }
  cachedBriefAuth = oauth2;
  return cachedBriefAuth;
}

async function getDocsService() {
  return google.docs({ version: 'v1', auth: await getBriefGoogleAuth() });
}

async function getCalendarService() {
  return google.calendar({ version: 'v3', auth: await getBriefGoogleAuth() });
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
