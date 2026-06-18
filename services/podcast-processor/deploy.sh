#!/usr/bin/env bash
# Deploy podcast-processor til Cloud Run.
# Kræver: gcloud CLI, projekt sat (gcloud config set project …)
set -euo pipefail

REGION="${REGION:-europe-west1}"
SERVICE="${SERVICE:-podcast-processor}"

cd "$(dirname "$0")"

echo "Deploying ${SERVICE} to ${REGION}..."

gcloud run deploy "${SERVICE}" \
  --source . \
  --region "${REGION}" \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --timeout 900 \
  --min-instances 0 \
  --max-instances 3

echo ""
echo "Done. Kopiér service URL til PODCAST_PROCESSOR_URL i Vercel."
echo "Sæt også PODCAST_NOTIFY_URL (sendPodcastNotification trigger URL) på Cloud Run:"
echo "  gcloud run services update ${SERVICE} --region ${REGION} --update-env-vars PODCAST_NOTIFY_URL=...,INTERNAL_API_SECRET=..."
