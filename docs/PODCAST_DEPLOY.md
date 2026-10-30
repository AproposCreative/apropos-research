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

## Webflow website player

Samme Firebase-manifest driver iOS **og** websitet. Webflow CMS får ikke audio-URL-felter, men Switch-feltet **Lydversion** (`lydversion`) sættes automatisk til `true` når en episode publiceres (og kan backfilles med `node scripts/backfill-webflow-lydversion.mjs`).

### Public API (CORS til aproposmagazine.com / .dk / *.webflow.io)

| Endpoint | Formål |
|----------|--------|
| `GET /api/podcast/public/episode?slug={slug}` | Én episode til artikelsiden (`found: true/false`) |
| `GET /api/podcast/public/episodes?limit=20` | Seneste episoder til `/podcasts` |
| `GET /api/podcast/rss` | Podcast RSS 2.0 + iTunes (Spotify / Apple) |
| `GET /api/podcast/feed.xml` | Alias til RSS |

Hydrator-script: `https://ai.aproposmagazine.com/podcast-player.js`  
Lokal demo: `http://localhost:3000/podcast-player-demo.html`

### Design-kontrakt

Se [PODCAST_WEBFLOW_DESIGN.md](./PODCAST_WEBFLOW_DESIGN.md) for `data-apropos-*` attributter.

Paste-klare Embed-skaller (erstat gerne med Webflow AI-design, behold attributter):

- [webflow-embeds/podcast-listen-button.html](./webflow-embeds/podcast-listen-button.html) → Articles Template
- [webflow-embeds/podcast-player-sheet.html](./webflow-embeds/podcast-player-sheet.html) → Articles + Podcasts (eller site footer)
- [webflow-embeds/podcast-list.html](./webflow-embeds/podcast-list.html) → ny/eksisterende `/podcasts`-side

### Site footer (custom code)

Efter deploy af Onkel Ragekniv til Vercel:

```html
<script
  src="https://ai.aproposmagazine.com/podcast-player.js"
  defer
  data-api-base="https://ai.aproposmagazine.com"
></script>
```

### Status i Webflow (wired via MCP)

Allerede udført på site `67dbf17ba540975b5b21c180` (Apropos Magazine) — **endnu ikke publiceret**:

| Hvad | Hvor |
|------|------|
| Lytte-knap (`data-apropos-podcast-listen`, `hidden`) | Articles Template (`detail_articles`), i byline-rækken `short-info__wrap`, styles `btn_fill btn_fill_secondary` |
| Global player + script-tag | Site footer custom code (GTM bevaret) |
| Episode-liste + item-template | Ny side **Podcasts** (`/podcasts`), oprettet som **kladde** |

Elementerne er ustylede/neutrale med vilje — styl dem i Designer (eller erstat med AI-design) og behold `data-apropos-*`.

### Resterende trin

1. **Deploy denne app til Vercel** — `podcast-player.js` og `/api/podcast/public/*` skal være live på `ai.aproposmagazine.com` (scriptet 404'er indtil da)
2. Styl lytte-knap, player og liste i Designer
3. Tag `/podcasts` ud af kladde-tilstand når siden er færdig (og tilføj nav/footer)
4. **Publish** sitet
5. Test: artikel med episode (knap synlig), artikel uden (knap skjult), `/podcasts` lister episoder

### Auth-note

`/api/podcast/public/` er tilføjet til `PUBLIC_API_PREFIXES` i [lib/api/middleware-auth.ts](../lib/api/middleware-auth.ts). Uden den svarer middleware `401` på alle `/api/*` i produktion.

`/api/podcast/rss` og `/api/podcast/feed.xml` er også offentlige (Spotify/Apple crawlers).

---

## Spotify / Apple Podcasts (RSS)

Automatisk AI-oplæsning (ElevenLabs via Firebase Functions i iOS-projektet) og manuel upload lander begge i `podcasts/manifest.json`. RSS-feedet bygges fra hele manifestet, uden spillerens pagineringsgrænse. Efter tilkobling af showet henter Spotify nye episoder ved næste crawl. En fungerende RSS-URL er ikke i sig selv dokumentation for, at showet er tilkoblet eller episoderne er synlige på Spotify.

### Feed-URL (indsend denne)

```
https://ai.aproposmagazine.com/api/podcast/rss
```

Alias: `https://ai.aproposmagazine.com/api/podcast/feed.xml`  
Spejl (CDN-backup): `podcasts/feed.xml` i Firebase Storage (skrives ved manifest-sync).

### Show-metadata

| Felt | Værdi |
|------|--------|
| Titel | Lyt til Apropos Magazine |
| Ejer | Liv · `liv@aproposmagazine.com` |
| Sprog | `da-dk` |
| Kategori | Arts |
| Explicit | false |
| Cover | `https://ai.aproposmagazine.com/podcast/show-cover.jpg` |

Figma-design: [Apropos Magazine — Podcast Cover](https://www.figma.com/design/ImGGPWkLATInaN8yexJ9eC) (3000×3000 + 1400×1400).

### Cover-upload til Storage (én gang)

```bash
node scripts/upload-podcast-artwork.mjs
# firebase deploy --only storage   # tillad public read på podcasts/artwork/**
```

Lokale filer: `public/podcast/show-cover.jpg` (3000) og `public/podcast/show-cover-1400.jpg`.

### Validér feed

1. Deploy Onkel Ragekniv (så `/api/podcast/rss` er live)
2. Åbn [podba.se validate](https://podba.se/validate/) eller Cast Feed Validator
3. Indtast `https://ai.aproposmagazine.com/api/podcast/rss`
4. Kontrollér unikke, stabile GUID'er, offentlig lydadgang, korrekt enclosure-type og faktiske filstørrelser. `itunes:duration` er valgfrit; ukendte varigheder må ikke opfindes. Lydproduktionen kan fortsat levere AAC-LC i M4A/MP4 uden en ny konvertering til MP3.

### Indsend til platforme (én gang — kræver login + e-mail)

Spotify tilkobles gennem ejerens konto på Spotify for Creators og e-mail-verifikation til feedets ejer, `liv@aproposmagazine.com`. Brug eksisterende hosting og RSS. Flyt ikke hosting, og opret ikke et dubletshow, hvis showet allerede findes.

**RSS-URL (kopiér):**
```
https://ai.aproposmagazine.com/api/podcast/rss
```

1. **Spotify** — [creators.spotify.com](https://creators.spotify.com/)
   Log ind → **Find an existing show** → **Somewhere else** → indsæt RSS (eller eksisterende Spotify-showlink). Spotify sender en ottecifret kode til `liv@aproposmagazine.com`. Indtast den hos Spotify. Hvis showet allerede er claimed af en anden administrator, skal denne give kontoadgang; opret ikke et nyt show for at omgå det. Se [Spotifys officielle vejledning](https://support.spotify.com/us/creators/article/claiming-your-podcast-on-spotify-for-creators/).
2. **Apple Podcasts (iTunes)** — [podcastsconnect.apple.com](https://podcastsconnect.apple.com/)  
   Add show / Add a show with an RSS feed → paste RSS → Apple sender bekræftelse til `liv@aproposmagazine.com`
3. **Øvrige (osv.)** — samme RSS: Amazon Music, Pocket Casts, Podcast Index, YouTube Podcasts

Efter godkendelse henter platformene nye episoder automatisk, når narration eller manuel pipeline opdaterer manifestet. Spotify kontrollerer RSS flere gange i timen; giv ændringer mindst en time, før en manglende opdatering fejlmeldes. Kontrollér det faktiske show og mindst en ny episode på Spotify, og gem show-ID/URL og tidspunkt. Hverken en succesfuld lokal test eller en READY deployment er denne slutverifikation.

**Engelske CMS-oversættelser** filtreres fra RSS (app-manifest kan stadig have dem).

### Episodeidentitet og genudgivelser

`lib/podcast/rss-episodes.ts` samler kun gentagelser af samme GUID og samme normaliserede artikelslug. En manuel optagelse foretrækkes; ellers bruges den nyeste gemte optagelse. Den valgte optagelses GUID, lyd-URL og dato bevares. Begge originaler bliver i arkivet og app-manifestet. Samme GUID på forskellige artikler udløser en konkret fejl frem for lydløst at fjerne en artikel.

Den 30. oktober 2026 fandtes 154 indekserede lydfiler: 34 engelske oversættelser og 120 danske poster. To Placebo-revisioner delte GUID. Rettelsen giver 119 unikke danske RSS-episoder uden sletning eller ny lydgenerering. Se [distributionskontrollen](./editorial/SPOTIFY-DISTRIBUTION-2026-10-30.md) for test- og produktionsstatus.

### Manifest-felter til RSS

Nye episoder får (bagudkompatibelt — iOS ignorerer ukendte felter):

- `durationSeconds`, `audioBytes`, `description`, `imageURL`, `guid`, `kind`

Ældre episoder uden eget billede får show-cover som fallback. Manglende filstørrelse giver stadig `length="0"` i legacy-koden og skal undersøges som manglende metadata, ikke kaldes verificeret. Kontrollen 30. oktober 2026 fandt ingen sådanne længder i det offentlige feed; alle lydfilstørrelser svarede til serverens Content-Range.
