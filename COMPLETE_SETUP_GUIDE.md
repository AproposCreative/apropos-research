# Apropos AI Writer - Komplet Setup Guide

## Oversigt

AI Writer er nu implementeret med multi-forfatter TOV support og automatisk chat-til-artikel konvertering!

## Ny Workflow:

1. **Vælg Template** (Gaming, Kultur, Tech, etc.)
2. **Vælg Forfatter** (Frederik Kragh, etc.) - Henter fra Webflow CMS
3. **Vælg Rating** (1-5 stjerner)
4. **Chat med AI** - Bygger automatisk artiklen i forfatterens TOV

---

## 1. OpenAI API Setup (PÅKRÆVET)

### Step 1: Få OpenAI API Key
1. Gå til https://platform.openai.com/api-keys
2. Log ind eller opret konto
3. Klik "Create new secret key"
4. Kopier nøglen (starter med `sk-`)

### Step 2: Tilføj til projekt
Opret `.env.local` i projektets rod:

```bash
# OpenAI API - PÅKRÆVET
OPENAI_API_KEY=sk-din-nøgle-her

# Firebase (allerede konfigureret)
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyAgxIh6WvMCeDylwGW7MszqCagxG5oSdfs
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=apropos-magazine-6004a.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=apropos-magazine-6004a
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=apropos-magazine-6004a.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=817066738308
NEXT_PUBLIC_FIREBASE_APP_ID=1:817066738308:web:c5522f15d2c2b4097ab8d1
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-TQLWPZVLMN

# Webflow CMS (valgfrit - for forfatter liste)
WEBFLOW_API_KEY=din-webflow-key
WEBFLOW_AUTHORS_COLLECTION_ID=din-authors-collection-id
```

### Step 3: Genstart
```bash
npm run dev
```

---

## 2. Webflow CMS Setup (VALGFRIT)

### Authors Collection

Opret en "Authors" collection i Webflow med følgende felter:

- `author-name` (Plain Text) - Forfatterens navn
- `author-slug` (Plain Text) - URL-venlig slug
- `author-bio` (Rich Text) - Biografi
- `author-image` (Image) - Profilbillede
- `author-tov` (Plain Text) - Tone of Voice beskrivelse

**Eksempel TOV beskrivelser:**
```
Frederik Kragh: Martin Kongstad x Casper Christensen - Personlig, ærlig, humoristisk, skarp, kulturelt bevidst

Forfatter 2: Professionel og reflekterende med fokus på dybdegående analyse

Forfatter 3: Casual og underholdende med populærkulturelle referencer
```

### Hent Webflow API Credentials

1. Log ind på Webflow
2. Gå til Account Settings > Integrations
3. Generer API Token
4. Find Authors Collection ID i CMS settings

Tilføj til `.env.local`:
```bash
WEBFLOW_API_KEY=your-api-key
WEBFLOW_AUTHORS_COLLECTION_ID=your-collection-id
```

### Fallback uden Webflow

Hvis Webflow ikke er konfigureret, bruger systemet hardcoded forfattere:
- Frederik Kragh
- Forfatter 2
- Forfatter 3

---

## 3. Funktioner

### ✅ Multi-Forfatter TOV System
- Vælg forfatter før artiklen skrives
- AI tilpasser automatisk til forfatterens stil
- Henter forfattere fra Webflow eller fallback liste

### ✅ Rating System
- Vælg 1-5 stjerner for anmeldelser
- Vises som pill buttons med stjerne ikoner
- Auto-fyldes i artikel data

### ✅ Chat-til-Artikel Konvertering
- Alt hvad du skriver i chatten bygger artiklen
- AI opdaterer automatisk:
  - Title
  - Subtitle
  - Content
  - Category
  - Tags
  - Author
  - Rating

### ✅ Auto-Save
- Gemmer til Firebase hver 2 sekunder
- Cloud-baseret backup
- Genoptag hvor du slap

### ✅ 10+ Article Templates
- Gaming Anmeldelse
- Kultur Anmeldelse
- Kronik
- Interview
- Nyhedsanalyse
- Tech Anmeldelse
- Lifestyle Feature
- Profil
- Samfundskommentar
- Kreativ Skrivning

---

## 4. Workflow Eksempel

### Step 1: Åbn AI Writer
```
http://localhost:3000/ai
```

### Step 2: Vælg Template
Klik på "Gaming Anmeldelse" pill

### Step 3: Vælg Forfatter
Klik på "Frederik Kragh" pill

### Step 4: Vælg Rating
Klik på "⭐⭐⭐⭐" (4 stjerner) pill

### Step 5: Chat med AI
```
User: Skriv en anmeldelse af Ghost of Yōtei

AI: Perfekt! Lad os bygge en anmeldelse i Frederik Kraghs stil.
     Fortæl mig om dit første indtryk af spillet...

User: Det er visuelt fantastisk. Kurosawa mode er genial.

AI: *Opdaterer automatisk artiklen med intro og visuelt afsnit*
    Fedt! Hvad med gameplayet? Føles det som en naturlig udvikling 
    fra Ghost of Tsushima?

[Artiklen bygges automatisk gennem samtalen]
```

### Step 6: Publicer
Når artiklen er færdig:
- Klik på AI magic ikonet
- Generer Webflow felter
- Publicer til CMS

---

## 5. Næste Skridt: TOV Træning

For at få AI'en til at skrive endnu bedre i hver forfatters stil:

### 1. Scrape Eksisterende Artikler
```bash
npm run scrape:articles
```

### 2. Træn TOV Profiler
```bash
npm run train:tov
```

### 3. Fine-tune OpenAI Model
Upload træningsdata til OpenAI for hver forfatter

---

## 6. Troubleshooting

### AI svarer ikke
- Tjek at `OPENAI_API_KEY` er sat i `.env.local`
- Genstart development server
- Test API key: https://platform.openai.com/usage

### Forfattere vises ikke
- Tjek `WEBFLOW_API_KEY` og `WEBFLOW_AUTHORS_COLLECTION_ID`
- Systemet falder tilbage til hardcoded forfattere hvis Webflow fejler

### Artiklen opdateres ikke
- AI'en returnerer JSON med `articleUpdate` objekt
- Tjek console for fejl
- Sikr at OpenAI bruger korrekt prompt format

---

## 7. Backup til GitHub

Alt kode er nu på GitHub:
```
https://github.com/AproposCreative/apropos-research
```

For at opdatere:
```bash
git add .
git commit -m "din besked"
git push origin main
```

---

**AI Writer er nu klar til produktion med multi-forfatter support!** 🚀

Næste milestone: Træn individuelle TOV profiler baseret på eksisterende Apropos artikler.
