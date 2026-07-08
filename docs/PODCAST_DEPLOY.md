# Podcast Upload — deploy

## Oversigt

1. **Browser** (`/ai?view=podcast`) — upload + artikel-URL
2. **Vercel API** — validate, upload-path, start job, poll status
3. **Behandling (standard)** — ffmpeg + manifest + notify kører **inline på Vercel** (`lib/podcast/run-pipeline.ts`, `maxDuration=300`)
4. **Cloud Run (valgfri)** — `services/podcast-processor` hvis `PODCAST_PROCESSOR_URL` er sat
5. **Eksisterende Firebase Function** — `sendPodcastNotification` (iOS-projekt) → FCM topic `new_podcasts`

## Miljøvariabler

### Vercel (Onkel Ragekniv)

| Variabel | Beskrivelse |
|----------|-------------|
| `PODCAST_PROCESSOR_URL` | Valgfri Cloud Run URL; **uden den** kører pipeline på Vercel |
| `PODCAST_NOTIFY_URL` | Trigger URL fra Firebase Console → `sendPodcastNotification` |
| `PODCAST_NOTIFY_SECRET` | Samme som Firebase secret `PODCAST_NOTIFY_SECRET` (header `X-Apropos-Podcast-Secret`) |
| `PODCAST_STORAGE_BUCKET` | Valgfri; ellers `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` |
| `FIREBASE_ADMIN_*` | Allerede sat til billed-optimering |
| `INTERNAL_API_SECRET` | Bruges til Vercel → Cloud Run og evt. notify-kald |

### Cloud Run

| Variabel | Beskrivelse |
|----------|-------------|
| `FIREBASE_ADMIN_PROJECT_ID` | Firebase project |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Service account |
| `FIREBASE_ADMIN_PRIVATE_KEY` | SA private key |
| `PODCAST_STORAGE_BUCKET` | Storage bucket |
| `PODCAST_NOTIFY_URL` | `sendPodcastNotification` trigger URL |
| `INTERNAL_API_SECRET` | Matcher Vercel |
| `WEBFLOW_API_TOKEN` | Fallback artikel-lookup |
| `WEBFLOW_SITE_ID` | |
| `WEBFLOW_ARTICLES_COLLECTION_ID` | |

## Deploy Cloud Run

```bash
cd services/podcast-processor
gcloud run deploy podcast-processor \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --timeout 900 \
  --set-env-vars "FIREBASE_ADMIN_PROJECT_ID=...,PODCAST_NOTIFY_URL=...,INTERNAL_API_SECRET=..."
```

Service account skal have:

- **Storage Object Admin** på podcast-bucket
- **Cloud Datastore User** (Firestore)

Kopiér service URL til `PODCAST_PROCESSOR_URL` i Vercel.

## sendPodcastNotification

**Byg ikke en ny function i Onkel Ragekniv.** Brug den deployede function fra iOS-projektet:

1. Firebase Console → Functions → `sendPodcastNotification`
2. Kopiér **Trigger URL** → `PODCAST_NOTIFY_URL` (Vercel + Cloud Run)
3. Payload: `{ "articleSlug": "cape-fear-apple-tv", "title": "Artikel titel" }`
4. Function sender til FCM topic **`new_podcasts`** (iOS abonnerer allerede)

## Storage-stier

| Sti | Formål |
|-----|--------|
| `podcasts/incoming/{slug}/audio.m4a` | Rå upload fra browser |
| `podcasts/articles/{slug}/audio.m4a` | Encodet AAC 96k (public read) |
| `podcasts/manifest.json` | Episode-liste til app + UI |

## Firebase Storage rules (påkrævet for browser-upload)

Browser-upload bruger Firebase Client SDK (`uploadBytesResumable`) — **ikke** rå GCS-URL (CORS blokerer localhost).

Deploy rules fra repo-roden:

```bash
firebase deploy --only storage
```

Reglerne i `storage.rules` tillader indloggede brugere at skrive til `podcasts/incoming/{slug}/audio.m4a`.

Uden deployede rules får du `storage/unauthorized` — ikke "failed to fetch".

**Vercel-deploy er ikke påkrævet for upload** — localhost virker med `.env.local` Firebase-config + storage rules.

## Test

1. Log ind på `https://ai.aproposmagazine.com/ai?view=podcast`
2. Valid artikel-URL + `.m4a`/`.mp3`
3. Publicer → status-trin opdateres
4. Tjek `podcasts/manifest.json` og FCM-notifikation på iOS
