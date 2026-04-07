#!/usr/bin/env node
/**
 * Backfill originalEmail for ALL Kanban cards.
 * - Cards WITH email_id: re-fetch that exact message
 * - Cards WITHOUT email_id: search Gmail by contact email to find the original
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BOARD_DOC = 'boards/shared-board';
const BATCH_SIZE = 200;

const saPath = join(process.env.HOME, '.config/google-credentials/firebase-service-account.json');
initializeApp({ credential: cert(saPath) });
const db = getFirestore();

async function initGmail() {
  const gmailSnap = await db.doc('_secrets/gmail_oauth').get();
  const gmailData = gmailSnap.data();
  if (!gmailData) throw new Error('No Gmail OAuth data');
  const oauth2 = new google.auth.OAuth2(gmailData.client_id, gmailData.client_secret);
  oauth2.setCredentials({ refresh_token: gmailData.refresh_token, access_token: gmailData.token });
  oauth2.on('tokens', async (tokens) => {
    if (tokens.access_token) await db.doc('_secrets/gmail_oauth').update({ token: tokens.access_token });
  });
  return google.gmail({ version: 'v1', auth: oauth2 });
}

function parseEmail(msgData) {
  if (!msgData) return null;
  const headers = {};
  for (const h of (msgData.payload?.headers || [])) headers[h.name.toLowerCase()] = h.value;
  let body = '';
  const payload = msgData.payload || {};
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        body = Buffer.from(part.body.data, 'base64').toString('utf8');
        break;
      }
    }
  } else if (payload.body?.data) {
    body = Buffer.from(payload.body.data, 'base64').toString('utf8');
  }
  const fromRaw = headers.from || '';
  const emailMatch = fromRaw.match(/<([^>]+)>/);
  const emailAddr = emailMatch ? emailMatch[1] : fromRaw;
  const fromName = fromRaw.replace(/<[^>]+>/, '').trim();
  return {
    from: fromName || emailAddr,
    email: emailAddr,
    subject: headers.subject || '',
    date: headers.date || '',
    body: body.slice(0, 8000),
    snippet: msgData.snippet || '',
    gmail_thread_id: msgData.threadId || '',
  };
}

async function fetchById(gmail, emailId) {
  const msg = await gmail.users.messages.get({ userId: 'me', id: emailId, format: 'full' });
  return parseEmail(msg.data);
}

async function searchGmailBySender(gmail, emailAddr) {
  try {
    const query = `from:${emailAddr} newer_than:90d`;
    const res = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: 5 });
    const msgs = (res.data.messages || []).slice(0, 3);
    for (const m of msgs) {
      const msg = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' });
      const parsed = parseEmail(msg.data);
      // Filter out auto-replies, bounces, etc.
      const subject = (parsed.subject || '').toLowerCase();
      if (subject.includes('bounce') || subject.includes('auto-reply') || subject.includes('out of office') || subject.includes('delivery failed')) continue;
      return parsed;
    }
  } catch(e) {}
  return null;
}

async function main() {
  const gmail = await initGmail();
  console.log('Fetching board...');
  const doc = await db.doc(BOARD_DOC).get();
  if (!doc.exists) { console.error('Board not found'); return; }

  const allCards = doc.data().cards || {};
  const total = Object.keys(allCards).length;
  console.log(`Total cards: ${total}`);

  let hasEmailId = 0, noEmailId = 0, hasOrig = 0;
  for (const card of Object.values(allCards)) {
    if (card.originalEmail) hasOrig++;
    else if (card.email_id) hasEmailId++;
    else noEmailId++;
  }
  console.log(`Has originalEmail: ${hasOrig}`);
  console.log(`Missing originalEmail (have email_id): ${hasEmailId}`);
  console.log(`Missing originalEmail (no email_id): ${noEmailId}`);

  // Build update map
  const updates = {};
  let fetched = 0, errors = 0;

  // 1. Cards with email_id but no originalEmail
  for (const [cid, card] of Object.entries(allCards)) {
    if (card.originalEmail || !card.email_id) continue;
    try {
      const orig = await fetchById(gmail, card.email_id);
      if (orig?.from) {
        updates[cid] = orig;
        fetched++;
        if (fetched <= 10) console.log(`  [by_id] ${cid}: ${orig.from}`);
      }
    } catch(e) { errors++; }
  }

  // 2. Cards without email_id — search by contact email
  for (const [cid, card] of Object.entries(allCards)) {
    if (card.originalEmail) continue;
    const contactEmail = card.email || '';
    if (!contactEmail || !contactEmail.includes('@')) continue;
    try {
      const orig = await searchGmailBySender(gmail, contactEmail);
      if (orig?.from) {
        updates[cid] = orig;
        fetched++;
        if (fetched <= 10 || fetched % 50 === 0) console.log(`  [search] ${cid}: ${orig.from} (${contactEmail})`);
      }
    } catch(e) { errors++; }
  }

  console.log(`\nFetched: ${fetched}, Errors: ${errors}`);

  if (Object.keys(updates).length === 0) {
    console.log('Nothing to update.');
    return;
  }

  // Save in batches of 200
  const keys = Object.keys(updates);
  console.log(`Saving ${keys.length} cards in batches of ${BATCH_SIZE}...`);
  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const batch = keys.slice(i, i + BATCH_SIZE);
    const batchUpdate = {};
    for (const cid of batch) {
      allCards[cid].originalEmail = updates[cid];
    }
    await db.doc(BOARD_DOC).update({ cards: allCards });
    console.log(`  Saved batch ${Math.floor(i/BATCH_SIZE)+1}: cards ${i+1}-${Math.min(i+BATCH_SIZE, keys.length)}`);
  }

  // Verify
  const doc2 = await db.doc(BOARD_DOC).get();
  const cards2 = doc2.data().cards || {};
  const withOrig = Object.values(cards2).filter(c => c.originalEmail).length;
  console.log(`\nDone! Cards with originalEmail: ${withOrig}/${total}`);
}

main().catch(e => { console.error(e); process.exit(1); });
