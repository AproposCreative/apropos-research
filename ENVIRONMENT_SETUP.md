# Environment Variables Setup

## 🔑 **Tilføj disse environment variables til din `.env.local` fil:**

```bash
# Webflow API Configuration
WEBFLOW_API_TOKEN=ab247ccecfe9d2603ee91090458d9373d440539e3e18db611e89d7fdf737b467
WEBFLOW_SITE_ID=67dbf17ba540975b5b21c180

# OpenAI API Key (hvis du har en)
OPENAI_API_KEY=your_openai_key_here

# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyAgxIh6WvMCeDylwGW7MszqCagxG5oSdfs
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=apropos-magazine-6004a.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=apropos-magazine-6004a
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=apropos-magazine-6004a.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=817066738308
NEXT_PUBLIC_FIREBASE_APP_ID=1:817066738308:web:c5522f15d2c2b4097ab8d1
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-TQLWPZVLMN

# Base URL for API calls
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

## 📝 **Hvordan:**

1. **Opret `.env.local` fil** i root mappen af dit projekt
2. **Kopier indholdet** fra ovenstående
3. **Gem filen**
4. **Genstart development server** (`npm run dev`)

## ✅ **Test Webflow Integration:**

Når du har tilføjet environment variablerne:

1. **Gå til `/ai`** på din side
2. **Vælg template** → **Vælg forfatter**
3. **Check om rigtige forfattere vises:**
   - Eva Linde (Freelance kulturskribent)
   - Frederik Emil (Editor-in-chief)
   - Peter Milo (Redaktør)
   - Casper Fiil (Anmelder & skribent)
   - Andreas Christensen (Anmelder, robot & hjælpsom type)
   - Liv Brandt (Skribent og kulturkommentator)
4. **Test publish funktionaliteten** til Webflow

## 🔧 **Hvis der er problemer:**

- **Check console** for API fejl
- **Verify token** er korrekt
- **Check Site ID** matcher din Webflow site
- **Test API endpoint** direkte: `/api/webflow/authors`

---

**Din Webflow API token er nu klar til brug! 🚀**
