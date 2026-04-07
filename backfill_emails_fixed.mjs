#!/usr/bin/env node
/**
 * backfill_emails_fixed.mjs
 * Re-extracts email bodies for all 769 cards in _email_data subcollection
 * using recursive MIME part traversal (handles nested multipart/alternative)
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { google } from 'googleapis';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync(process.env.HOME + '/.config/google-credentials/firebase-service-account.json'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

function extractBody(payload) {
    if (!payload) return '';
    // text/plain — the gold standard
    if (payload.mimeType === 'text/plain' && payload.body?.data) {
        try { return Buffer.from(payload.body.data, 'base64').toString('utf-8'); } catch(e) { return ''; }
    }
    // text/html — strip tags as fallback for body
    if (payload.mimeType === 'text/html' && payload.body?.data) {
        try {
            const html = Buffer.from(payload.body.data, 'base64').toString('utf-8');
            return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        } catch(e) { return ''; }
    }
    // Recurse into nested parts
    if (payload.parts) {
        for (const part of payload.parts) {
            const result = extractBody(part);
            if (result) return result;
        }
    }
    return '';
}

function parseEmail(msgData) {
    if (!msgData) return null;
    const payload = msgData.payload || {};
    const headers = {};
    if (payload.headers) {
        for (const h of payload.headers) headers[h.name.toLowerCase()] = h.value;
    }
    const fromRaw = headers.from || '';
    const emailMatch = fromRaw.match(/<([^>]+)>/);
    return {
        from: fromRaw.replace(/<[^>]+>/, '').trim() || emailMatch?.[1] || fromRaw,
        email: emailMatch?.[1] || fromRaw,
        subject: headers.subject || '',
        date: headers.date || '',
        body: extractBody(payload).slice(0, 8000),
        snippet: msgData.snippet || '',
        gmail_thread_id: msgData.threadId || ''
    };
}

async function main() {
    const gmailSnap = await db.doc('_secrets/gmail_oauth').get();
    const gmailData = gmailSnap.data();
    const oauth2 = new google.auth.OAuth2(gmailData.client_id, gmailData.client_secret);
    oauth2.setCredentials({ refresh_token: gmailData.refresh_token, access_token: gmailData.token });
    const gmail = google.gmail({ version: 'v1', auth: oauth2 });

    // Get all cards needing email data
    const doc = await db.doc('boards/shared-board').get();
    const allCards = doc.data().cards || {};
    const needsData = Object.entries(allCards)
        .filter(([cid, card]) => card.email && String(card.email).includes('@'));

    // Check subcollection and find those needing body re-fetch
    const subSnap = await db.collection('boards/shared-board/_email_data').get();
    const subData = {};
    subSnap.forEach(d => subData[d.id] = d.data());

    // Find cards whose subcollection doc has no body or empty body
    const needsRefetch = needsData.filter(([cid]) => {
        const sd = subData[cid];
        return !sd || !(sd.body && sd.body.length > 0);
    });

    console.log(`Need to re-fetch: ${needsRefetch.length} / ${needsData.length} cards`);
    if (needsRefetch.length === 0) {
        console.log('All email bodies already populated!');
        return;
    }

    let fetched = 0, saved = 0, notFound = 0, batch = [];

    for (let i = 0; i < needsRefetch.length; i++) {
        const [cid, card] = needsRefetch[i];
        const addr = String(card.email || '').trim();
        try {
            const { data: listData } = await gmail.users.messages.list({
                userId: 'me', q: addr, maxResults: 3
            });
            const msgs = listData.messages || [];
            let email = null;
            if (msgs.length) {
                for (const m of msgs) {
                    try {
                        const { data: msgData } = await gmail.users.messages.get({
                            userId: 'me', id: m.id, format: 'full'
                        });
                        email = parseEmail(msgData);
                        if (email && email.body) break;
                    } catch(e) {}
                }
            }
            if (email) {
                fetched++;
                batch.push({ cid, email });
            } else { notFound++; }
        } catch(e) { notFound++; }

        process.stdout.write(`\r  ${i+1}/${needsRefetch.length} | fetched:${fetched} | saved:${saved} | notFound:${notFound}   `);

        // Save in batches of 20
        if (batch.length >= 20) {
            await Promise.all(batch.map(async ({ cid, email }) => {
                try {
                    await db.doc(`boards/shared-board/_email_data/${cid}`).set(email, { merge: true });
                    saved++;
                } catch(e) { console.error('\nSave error:', cid, e.message); }
            }));
            batch = [];
        }
    }

    // Flush remaining
    if (batch.length) {
        await Promise.all(batch.map(async ({ cid, email }) => {
            try {
                await db.doc(`boards/shared-board/_email_data/${cid}`).set(email, { merge: true });
                saved++;
            } catch(e) {}
        }));
    }

    console.log(`\n\nDone! Fetched:${fetched} | Saved:${saved} | NotFound:${notFound}`);

    // Verify
    const verifySnap = await db.collection('boards/shared-board/_email_data').get();
    let withBody = 0;
    verifySnap.forEach(d => { if (d.data().body && d.data().body.length > 0) withBody++; });
    console.log(`Subcollection: ${verifySnap.size} docs | with body: ${withBody}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
