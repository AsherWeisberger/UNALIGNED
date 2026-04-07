#!/bin/bash
# ─────────────────────────────────────────────────────────────────
# Setup script for UNALIGNED Pipeline Cloud Function
# Run ONCE: bash cloud_functions/setup_cf.sh
# ─────────────────────────────────────────────────────────────────
set -e

PROJECT_ID="unaligned-fc556"
FUNC_NAME="run-pipeline"
REGION="us-central1"
WORKDIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== UNALIGNED Pipeline CF Setup ==="

# 1. Upload Gmail token to Cloud Storage (accessible by Cloud Function SA)
echo "1/4 — Uploading Gmail OAuth token to GCS..."
GCS_TOKEN_URI="gs://${PROJECT_ID}-configs/gmail-token.json"
TOKEN_FILE="$HOME/.config/google-credentials/gmail-token.json"
if [ ! -f "$TOKEN_FILE" ]; then
    echo "ERROR: Gmail token not found at $TOKEN_FILE"
    exit 1
fi
gsutil cp "$TOKEN_FILE" "$GCS_TOKEN_URI" 2>/dev/null || {
    # Bucket might not exist — create it
    gsutil mb -p "$PROJECT_ID" -l "$REGION" "gs://${PROJECT_ID}-configs" 2>/dev/null || true
    gsutil cp "$TOKEN_FILE" "$GCS_TOKEN_URI"
}
echo "   Token uploaded to $GCS_TOKEN_URI"

# 2. Upload Firebase service account to GCS
echo "2/4 — Uploading Firebase service account to GCS..."
GCS_SA_URI="gs://${PROJECT_ID}-configs/firebase-sa.json"
SA_FILE="$HOME/.config/google-credentials/firebase-service-account.json"
if [ ! -f "$SA_FILE" ]; then
    echo "ERROR: Firebase SA not found at $SA_FILE"
    exit 1
fi
gsutil cp "$SA_FILE" "$GCS_SA_URI" 2>/dev/null || {
    gsutil cp "$SA_FILE" "$GCS_SA_URI"
}
echo "   SA uploaded to $GCS_SA_URI"

# 3. Set OpenAI key as Cloud Function env var
echo "3/4 — Setting OPENAI_API_KEY..."
if [ -z "$OPENAI_API_KEY" ]; then
    echo "WARNING: OPENAI_API_KEY env var not set. Pipeline AI features will be limited."
    echo "   Set it with: export OPENAI_API_KEY='sk-...'"
fi

# 4. Deploy Cloud Function
echo "4/4 — Deploying Cloud Function..."
cd "$WORKDIR/cloud_functions/run_pipeline"

gcloud functions deploy "$FUNC_NAME" \
    --gen2 \
    --runtime=python311 \
    --region="$REGION" \
    --source="./run_pipeline" \
    --entry-point=run_pipeline \
    --trigger-http \
    --allow-unauthenticated \
    --set-env-vars="OPENAI_API_KEY=${OPENAI_API_KEY:-},GCS_TOKEN_URI=${GCS_TOKEN_URI},GCS_SA_URI=${GCS_SA_URI},PROJECT_ID=${PROJECT_ID}" \
    --memory=512MB \
    --timeout=300s \
    --min-instances=0 \
    --max-instances=1

echo ""
echo "=== Cloud Function deployed! ==="
FUNC_URL=$(gcloud functions describe "$FUNC_NAME" --region="$REGION" --format="value(httpsTrigger.url)" 2>/dev/null)
echo "Function URL: $FUNC_URL"

# 5. Create Cloud Scheduler job (9am M-F)
echo ""
echo "=== Setting up Cloud Scheduler (9am M-F)...==="
gcloud scheduler jobs create http "unaligned-pipeline-daily" \
    --location="$REGION" \
    --schedule="0 9 * * 1-5" \
    --uri="$FUNC_URL" \
    --http-method=POST \
    --description="UNALIGNED Gmail Lead Pipeline — 9am weekdays"

echo ""
echo "✅ All done! Pipeline will fire at 9am Mon-Fri."
echo "   Test it now: curl -X POST \"$FUNC_URL\""
