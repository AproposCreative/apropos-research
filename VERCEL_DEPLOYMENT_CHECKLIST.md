# ✅ Vercel Deployment Checklist

## 🎉 Status: KLAR TIL DEPLOYMENT

Alle kode-fejl er rettet, og projektet er klar til deployment på Vercel.

---

## 📋 Pre-Deployment Checklist

### ✅ Kode Status
- [x] TypeScript fejl rettet
- [x] Regex bugs i ReviewPanel.tsx rettet
- [x] Alle ændringer committet og pushet til GitHub `main` branch
- [x] `vercel.json` konfigureret korrekt
- [x] Build command verificeret: `npm run build`

### 🔑 Environment Variables (Vercel Dashboard)

**KRITISK:** Disse environment variables skal være sat i Vercel Dashboard → Settings → Environment Variables:

#### OpenAI (PÅKRÆVET)
```
OPENAI_API_KEY=sk-your-openai-api-key-here
```

#### Firebase Admin (PÅKRÆVET for image uploads)
```
FIREBASE_ADMIN_PROJECT_ID=apropos-magazine-6004a
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-fbsvc@apropos-magazine-6004a.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----
[Fulde private key her]
-----END PRIVATE KEY-----
FIREBASE_ADMIN_TOKEN_URI=https://oauth2.googleapis.com/token
FIREBASE_STORAGE_BUCKET=apropos-magazine-6004a.firebasestorage.app
```

#### Firebase Public (PÅKRÆVET)
```
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyAgxIh6WvMCeDylwGW7MszqCagxG5oSdfs
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=apropos-magazine-6004a.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=apropos-magazine-6004a
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=apropos-magazine-6004a.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=817066738308
NEXT_PUBLIC_FIREBASE_APP_ID=1:817066738308:web:c5522f15d2c2b4097ab8d1
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-TQLWPZVLMN
```

#### Webflow (PÅKRÆVET for article publishing)
```
WEBFLOW_API_TOKEN=ab247ccecfe9d2603ee91090458d9373d440539e3e18db611e89d7fdf737b467
WEBFLOW_SITE_ID=67dbf17ba540975b5b21c180
```

#### TMDB (VALGFRIT - for film/TV images)
```
TMDB_API_KEY=your-tmdb-api-key-here
```

#### OMDB (VALGFRIT - for IMDb data)
```
OMDB_API_KEY=your-omdb-api-key-here
```

#### Google Custom Search (VALGFRIT - for game images)
```
GOOGLE_CUSTOM_SEARCH_API_KEY=your-google-api-key-here
GOOGLE_CUSTOM_SEARCH_ENGINE_ID=your-search-engine-id-here
```

#### RAGE (Valgfrit - har defaults)
```
RAGE_BASE_URL=https://soundvenue.com
RAGE_FEED_PATH=/feed
RAGE_SITEMAP_INDEX=/sitemap.xml
```

---

## 🚀 Deployment Steps

### 1. Tjek GitHub Integration
- Gå til Vercel Dashboard
- Settings → Git
- Verificer at "Production Branch" er sat til `main`
- Verificer at GitHub repository er linket

### 2. Tilføj Environment Variables
- Gå til Vercel Dashboard
- Settings → Environment Variables
- Tilføj alle variabler fra listen ovenfor
- **Vigtigt:** Sæt hver variabel til både "Production", "Preview", og "Development"

### 3. Trigger Deployment
Vercel deployer automatisk når:
- Der pushes til `main` branch (✅ allerede gjort)
- Eller manuelt via "Redeploy" knappen i Vercel Dashboard

### 4. Verificer Deployment
- Tjek build logs i Vercel Dashboard
- Verificer at alle environment variables er sat
- Test at applikationen virker på production URL

---

## 📊 Seneste Commits

```
43fa619 fix: Fix TypeScript errors - remove firstAirDate property and fix body_text in SimpleArticle
8f81d67 fix: Finalize intro boundary detection - prefer double newline, handle edge cases
d11e5d1 fix: Improve intro boundary detection logic
56bb027 fix: Fix regex bugs in extractIntroAndBody - replace flawed lookahead with robust string parsing
0b3ead9 Merge feat/mobile-ui-intro: Professional research & verification system
```

---

## 🔧 Build Configuration

**vercel.json:**
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs",
  "installCommand": "npm ci",
  "crons": [
    {
      "path": "/api/cron/daily-ingest",
      "schedule": "0 * * * *"
    }
  ]
}
```

---

## ✅ Verificering

Efter deployment, test følgende:

1. **Homepage** - Loader korrekt
2. **AI Writer** (`/ai`) - Kan åbne og se templates
3. **Article Generation** - Kan generere artikler
4. **Image Generation** - Kan generere/besøge billeder
5. **Webflow Publish** - Kan publisere til Webflow (hvis API keys er sat)

---

## 🆘 Troubleshooting

### Build fejler
- Tjek at alle environment variables er sat
- Tjek build logs i Vercel Dashboard
- Verificer at `npm run build` virker lokalt

### Environment variables mangler
- Gå til Vercel Dashboard → Settings → Environment Variables
- Tilføj manglende variabler
- Trigger en ny deployment

### API fejl i production
- Tjek at alle API keys er korrekte
- Verificer at Firebase credentials er korrekte
- Tjek console logs for fejlbeskeder

---

**Status:** ✅ KLAR TIL DEPLOYMENT
**Seneste commit:** 43fa619
**Branch:** main
**GitHub:** https://github.com/AproposCreative/apropos-research

