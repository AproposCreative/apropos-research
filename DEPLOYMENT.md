# 🚀 Apropos Research - Deployment Guide

## Vercel Deployment (Anbefalet)

### 1. Forberedelse
```bash
# Sørg for at du er i UI mappen
cd ui

# Install dependencies
npm install

# Test lokalt
npm run dev
```

### 2. Deploy til Vercel

#### Option A: Vercel CLI (Hurtigst)
```bash
# Install Vercel CLI
npm i -g vercel

# Login til Vercel
vercel login

# Deploy
vercel

# Følg instruktionerne:
# - Link til eksisterende projekt? N
# - Project name: apropos-research
# - Directory: ./ui
# - Override settings? N
```

#### Option B: GitHub Integration
1. Push koden til GitHub
2. Gå til [vercel.com](https://vercel.com)
3. "New Project" → Import fra GitHub
4. Vælg repository
5. Build Settings:
   - Framework Preset: Next.js
   - Root Directory: `ui`
   - Build Command: `npm run build:hosted`
   - Output Directory: `.next`

### 3. Environment Variables
I Vercel Dashboard → Settings → Environment Variables:
```
NODE_ENV=production
```

### 4. Custom Domain (Valgfrit)
- Vercel Dashboard → Domains
- Tilføj dit domæne
- Følg DNS instruktionerne

## Alternative Hosting

### Netlify
```bash
# Build command
npm run build:hosted

# Publish directory
.next
```

### Railway
```bash
# Railway vil automatisk detektere Next.js
# Sørg for at package.json scripts er korrekte
```

## Build Commands

### Lokal test
```bash
npm run build:hosted
npm start
```

### Production build
```bash
npm run build:hosted
```

## Features inkluderet
✅ **Search functionality** - Real-time søgning på tværs af alle artikler  
✅ **AI Integration** - Editorial AI med draft generation  
✅ **Responsive Design** - Mobile-venligt Apple-style UI  
✅ **Dark/Light Mode** - Automatisk theme detection  
✅ **Image Proxy** - Optimerede billeder fra alle kilder  
✅ **Data Export** - Automatisk JSON generation fra JSONL  

## Performance
- **Build time**: ~2-3 minutter
- **Cold start**: ~1-2 sekunder
- **Image optimization**: Automatisk via Next.js
- **Caching**: Aggressive caching for statiske assets

## Monitoring
- Vercel Analytics inkluderet
- Error tracking via Vercel
- Performance metrics automatisk

## Support
Hvis der opstår problemer:
1. Tjek Vercel logs
2. Verificer environment variables
3. Test lokalt først
4. Kontakt support med deployment logs
