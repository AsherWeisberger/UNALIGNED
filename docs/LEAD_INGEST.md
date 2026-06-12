# Lead Ingestion API

Any AI system or integration can push leads into the UNALIGNED board through this endpoint. Leads land in the **New** stage and show up in the dashboard within one refresh.

```
POST https://us-central1-unaligned-fc556.cloudfunctions.net/ingestLead
Authorization: Bearer <token>
Content-Type: application/json
```

The token lives in Firestore at `_secrets/lead_ingest` (field `token`). A local copy is in `~/Desktop/UNALIGNED/lead-ingest-token.txt`. Rotate by writing a new value to the Firestore doc — no redeploy needed.

## Payload

| Field | Required | Notes |
|---|---|---|
| `source` | yes | One of `email`, `instagram_dm`, `twitter_dm`, `linkedin`, `other`. Aliases accepted: `ig`, `instagram`, `x`, `twitter`, `gmail`. |
| `preview` | yes | Text snippet of the message. Becomes the lead description. |
| `senderName` | one of these three | Display name of the person reaching out |
| `senderEmail` | one of these three | Email if known |
| `senderHandle` | one of these three | e.g. `@handle` for DMs |
| `externalId` | recommended | Stable id from the source platform (message id, thread id). Enables dedupe. |
| `subject` | no | Used as the lead title; DMs without one fall back to "Name via source". |
| `company` | no | Brand or business name |
| `receivedAt` | no | ISO timestamp from the source; defaults to now |
| `priority` | no | `low`, `normal`, `high`, `urgent`; defaults to `normal` |
| `assignedTo` | no | `asher`, `sammy`, or `robert` |
| `estimatedValue` | no | Number, dollars |

## Dedupe

If `externalId` is provided, the lead is keyed as `source:externalId` (stored in `cards.email_id`, same column the Gmail scrapers use). Posting the same key again **updates** the existing lead (preview, priority, title, and marks new activity) instead of creating a duplicate. Response says which happened: `{"ok":true,"action":"created"|"updated","id":...}`.

## Example

```bash
curl -X POST https://us-central1-unaligned-fc556.cloudfunctions.net/ingestLead \
  -H "Authorization: Bearer $LEAD_INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "instagram_dm",
    "externalId": "ig-thread-84921",
    "senderName": "Jane Doe",
    "senderHandle": "@janedoe",
    "company": "Acme AI",
    "preview": "Hey Robert, we would love to sponsor a post about our launch",
    "priority": "high"
  }'
```

## Errors

- `401` — missing or wrong bearer token
- `400` — bad `source`, missing `preview`, or no sender field at all
- `405` — anything but POST
- `500` — Supabase write failed (message included)

Ingested leads get `lead_source: ingest-<source>` and `created_by: ingest-api`, so they are easy to find and filter.
