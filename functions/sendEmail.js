const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { google } = require('googleapis');
const base64 = require('base64-js');

admin.initializeApp();

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
];

// Use Application Default Credentials (ADC) — the service account attached to this Firebase project
// This avoids needing to manage OAuth tokens in the function
async function getGmailClient() {
  const auth = new google.auth.GoogleAuth({
    scopes: SCOPES,
    credentials: {
      // This gets auto-populated when deployed to Firebase with the project's service account
      // In local emulator, use GOOGLE_APPLICATION_CREDENTIALS env var
    },
  });
  return google.gmail({ version: 'v1', auth });
}

function createMimeMessage(sender, to, subject, body) {
  // Simple MIME construction
  const lines = [
    `From: ${sender}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    body,
  ];
  const raw = Buffer.from(lines.join('\r\n')).toString('base64url');
  return { raw };
}

exports.sendEmail = functions.https.onCall(async (data, context) => {
  // Allow only authenticated users (Firebase Auth)
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in to send emails');
  }

  const { to, subject, body, threadId, inReplyTo } = data;

  if (!to || !subject || !body) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing to, subject, or body');
  }

  try {
    const gmail = await getGmailClient();
    const from = 'me'; // Gmail API resolves this to the authenticated user

    const message = createMimeMessage(from, to, subject, body);
    const sendParams = { userId: 'me', resource: message };

    if (threadId) sendParams.threadId = threadId;
    if (inReplyTo) sendParams.inReplyTo = inReplyTo;

    const result = await gmail.users.messages.send(sendParams);
    return { success: true, messageId: result.data.id };
  } catch (err) {
    console.error('sendEmail error:', err.message);
    throw new functions.https.HttpsError('internal', 'Failed to send email: ' + err.message);
  }
});
