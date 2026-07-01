# sendEmail API token setup

After deploying `functions/index.js`, set a shared bearer token in Firestore:

1. Firebase console → Firestore → `_secrets` → `send_email`
2. Field: `token` = same value as `lead_ingest.token` (or generate a new random string)

3. In Company OS, paste the token when prompted (stored as `v4_api_token` in localStorage).

Deploy functions:
```bash
cd "/Users/asherweisberger/Desktop/UNALIGNED/MASTER FILES"
firebase deploy --only functions:sendEmail
```