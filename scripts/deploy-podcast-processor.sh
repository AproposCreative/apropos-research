#!/usr/bin/env bash
# Deploy podcast-processor til Cloud Run med env fra .env.local
set -eo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env.local ]]; then
  echo "Manglende .env.local"
  exit 1
fi

eval "$(node -e "
const fs=require('fs');
const dotenv=require('dotenv');
const env=dotenv.parse(fs.readFileSync('.env.local'));
const keys=[
  'FIREBASE_ADMIN_PROJECT_ID','FIREBASE_ADMIN_CLIENT_EMAIL','FIREBASE_ADMIN_PRIVATE_KEY',
  'FIREBASE_STORAGE_BUCKET','NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET','CRON_SECRET',
  'WEBFLOW_API_TOKEN','WEBFLOW_SITE_ID','WEBFLOW_ARTICLES_COLLECTION_ID',
  'PODCAST_NOTIFY_URL','NEWSLETTER_ARTICLE_BASE_URL','INTERNAL_API_SECRET'
];
for (const k of keys) {
  const v=env[k];
  if (v==null) continue;
  const esc=String(v).replace(/'/g, \"'\\\\''\");
  console.log(\`export \${k}='\${esc}'\`);
}
")"

PROJECT="${FIREBASE_ADMIN_PROJECT_ID:-apropos-magazine-6004a}"
REGION="${REGION:-europe-west1}"
SERVICE="${SERVICE:-podcast-processor}"
BUCKET="${FIREBASE_STORAGE_BUCKET:-${NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:-}}"
NOTIFY_URL="${PODCAST_NOTIFY_URL:-https://us-central1-${PROJECT}.cloudfunctions.net/sendPodcastNotification}"
SECRET="${INTERNAL_API_SECRET:-${CRON_SECRET:-}}"

if [[ -z "${FIREBASE_ADMIN_CLIENT_EMAIL:-}" || -z "${FIREBASE_ADMIN_PRIVATE_KEY:-}" || -z "$BUCKET" ]]; then
  echo "Manglende FIREBASE_ADMIN_* eller bucket i .env.local"
  exit 1
fi

SA_FILE="$(mktemp)"
ENV_FILE="$(mktemp)"
trap 'rm -f "$SA_FILE" "$ENV_FILE"' EXIT

node -e "
const fs=require('fs');
const k=process.env.FIREBASE_ADMIN_PRIVATE_KEY;
fs.writeFileSync(process.argv[1], JSON.stringify({
  type:'service_account',
  project_id:process.env.FIREBASE_ADMIN_PROJECT_ID,
  private_key:k.includes('\\\\n')?k.replace(/\\\\n/g,'\\n'):k,
  client_email:process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  token_uri:'https://oauth2.googleapis.com/token',
}));
" "$SA_FILE"

export CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE="$SA_FILE"
export GOOGLE_APPLICATION_CREDENTIALS="$SA_FILE"

PK_ONELINE="$(printf '%s' "$FIREBASE_ADMIN_PRIVATE_KEY" | tr '\n' '|' | sed 's/|/\\n/g')"

PROJECT="$PROJECT" BUCKET="$BUCKET" NOTIFY_URL="$NOTIFY_URL" SECRET="$SECRET" PK_ONELINE="$PK_ONELINE" \
FIREBASE_ADMIN_CLIENT_EMAIL="$FIREBASE_ADMIN_CLIENT_EMAIL" \
NEWSLETTER_ARTICLE_BASE_URL="${NEWSLETTER_ARTICLE_BASE_URL:-https://www.aproposmagazine.com}" \
WEBFLOW_API_TOKEN="${WEBFLOW_API_TOKEN:-}" WEBFLOW_SITE_ID="${WEBFLOW_SITE_ID:-}" \
WEBFLOW_ARTICLES_COLLECTION_ID="${WEBFLOW_ARTICLES_COLLECTION_ID:-}" \
node -e "
const fs=require('fs');
const env={
  FIREBASE_ADMIN_PROJECT_ID: process.env.PROJECT,
  FIREBASE_ADMIN_CLIENT_EMAIL: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  FIREBASE_ADMIN_PRIVATE_KEY: process.env.PK_ONELINE,
  FIREBASE_STORAGE_BUCKET: process.env.BUCKET,
  PODCAST_STORAGE_BUCKET: process.env.BUCKET,
  PODCAST_NOTIFY_URL: process.env.NOTIFY_URL,
  INTERNAL_API_SECRET: process.env.SECRET,
  NEWSLETTER_ARTICLE_BASE_URL: process.env.NEWSLETTER_ARTICLE_BASE_URL,
};
if (process.env.WEBFLOW_API_TOKEN) env.WEBFLOW_API_TOKEN=process.env.WEBFLOW_API_TOKEN;
if (process.env.WEBFLOW_SITE_ID) env.WEBFLOW_SITE_ID=process.env.WEBFLOW_SITE_ID;
if (process.env.WEBFLOW_ARTICLES_COLLECTION_ID) env.WEBFLOW_ARTICLES_COLLECTION_ID=process.env.WEBFLOW_ARTICLES_COLLECTION_ID;
const yaml=['---'];
for (const [k,v] of Object.entries(env)) {
  if (!v) continue;
  yaml.push(k + ': ' + JSON.stringify(String(v)));
}
fs.writeFileSync(process.argv[1], yaml.join('\\n') + '\\n');
" "$ENV_FILE"

echo "Deployer ${SERVICE} → ${PROJECT} (${REGION})…"

gcloud run deploy "$SERVICE" \
  --project="$PROJECT" \
  --source="$ROOT/services/podcast-processor" \
  --region="$REGION" \
  --allow-unauthenticated \
  --memory=1Gi \
  --cpu=1 \
  --timeout=900 \
  --min-instances=0 \
  --max-instances=3 \
  --env-vars-file="$ENV_FILE" \
  --quiet

URL="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
echo ""
echo "PODCAST_PROCESSOR_URL=${URL}"
echo "PODCAST_NOTIFY_URL=${NOTIFY_URL}"
