#!/usr/bin/env node
/**
 * Phase 2: Batch-write ALL email data to _email_data subcollection.
 * UI reads from subcollection — card doc is never touched for email data.
 * This bypasses the 1MB card doc limit entirely.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { google } from 'googleapis';

const BOARD = 'boards/shared-board';
const EMAIL_CACHE = 'boards/shared-board/_email_data';

initializeApp({ credential: cert(process.env.HOME + '/.config/google-credentials/firebase-service-account.json') });
const db = getFirestore();

function parseEmail(msgData) {
  if (!msgData) return null;
  const payload = msgData.payload || {};
  const headers = {};
  if (payload.headers) { for (const h of payload.headers) headers[h.name.toLowerCase()] = h.value; }
  let body = '';
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
  const s = (headers.subject || '').toLowerCase();
  if (s.includes('bounce') || s.includes('auto-reply') || s.includes('out of office') || s.includes('delivery failed')) return null;
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

async function main() {
  // Init Gmail
  const gmailSnap = await db.doc('_secrets/gmail_oauth').get();
  const gmailData = gmailSnap.data();
  if (!gmailData) { console.error('No Gmail OAuth'); process.exit(1); }
  const oauth2 = new google.auth.OAuth2(gmailData.client_id, gmailData.client_secret);
  oauth2.setCredentials({ refresh_token: gmailData.refresh_token, access_token: gmailData.token });
  oauth2.on('tokens', async (tokens) => {
    if (tokens.access_token) await db.doc('_secrets/gmail_oauth').update({ token: tokens.access_token });
  });
  const gmail = google.gmail({ version: 'v1', auth: oauth2 });

  // Get all cards needing email data
  const doc = await db.doc(BOARD).get();
  const allCards = doc.data().cards || {};
  
  // Find which card IDs already have subcollection data
  console.log('Checking existing subcollection docs...');
  let existingIds = new Set();
  try {
    const snap = await db.collection(EMAIL_CACHE).select().get();
    snap.forEach(d => existingIds.add(d.id));
  } catch(e) {}
  console.log(`Subcollection already has: ${existingIds.size} emails`);
  
  // Cards needing email data (either no subcollection doc, or subcollection doc exists but card has no ref)
  const needsData = Object.entries(allCards).filter(([cid, card]) => {
    if (!card.email || !String(card.email).includes('@')) return false;
    return !existingIds.has(cid); // Only if no subcollection doc
  });
  console.log(`Need to fetch email for: ${needsData.length} cards`);
  
  if (needsData.length === 0) {
    console.log('All done! All cards have email data in subcollection.');
    return;
  }

  let fetched = 0, notFound = 0, saved = 0;
  
  // Process in batches of 20 (Gmail parallel limit)
  for (let i = 0; i < needsData.length; i += 20) {
    const batch = needsData.slice(i, i + 20);
    
    const results = await Promise.all(batch.map(async ([cid, card]) => {
      const addr = String(card.email || '').trim();
      if (!addr.includes('@')) return { cid, email: null };
      try {
        const { data: listData } = await gmail.users.messages.list({
          userId: 'me', q: 'from:' + addr + ' newer_than:90d', maxResults: 3
        });
        const msgs = listData.messages || [];
        if (!msgs.length) return { cid, email: null };
        
        for (const m of msgs) {
          try {
            const { data: msgData } = await gmail.users.messages.get({
              userId: 'me', id: m.id, format: 'full'
            });
            const email = parseEmail(msgData);
            if (!email) continue;
            return { cid, email };
          } catch(e) {}
        }
        return { cid, email: null };
      } catch(e) { return { cid, email: null }; }
    }));
    
    // Write to subcollection in batches of 5 (Firestore write limit)
    for (let j = 0; j < results.length; j += 5) {
      const writeBatch = results.slice(j, j + 5);
      const writes = writeBatch.map(({ cid, email }) => {
        if (email) {
          fetched++;
          return db.doc(EMAIL_CACHE + '/' + cid).set(email).then(() => { saved++; }).catch(e => console.log('Save err:', cid, e.message));
        } else {
          notFound++;
          return Promise.resolve();
        }
      });
      await Promise.all(writes);
    }
    
    const progress = Math.min(i + 20, needsData.length);
    process.stdout.write(`\r  ${progress}/${needsData.length} | fetched: ${fetched} | notFound: ${notFound} | saved: ${saved}   `);
  }
  
  console.log('\n\nDone!');
  console.log('  Fetched:', fetched, '| Not found:', notFound, '| Saved:', saved);
  
  // Final count
  const snap = await db.collection(EMAIL_CACHE).select().get();
  console.log('  Total emails in subcollection:', snap.size);
  
  // Also check doc size is healthy
  const doc2 = await db.doc(BOARD).get();
  console.log('  Card doc size:', (JSON.stringify(doc2.data()).length / 1024).toFixed(0), 'KB');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
