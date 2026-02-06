# 🎬 TMDB API Key Setup Guide

## Problem
Billedgenerering fejler med: "TMDB API key not configured. Please set TMDB_API_KEY in environment variables."

## Løsning: Få en gratis TMDB API Key (5 minutter)

### Step 1: Opret TMDB Account
1. Gå til: https://www.themoviedb.org/
2. Klik "Sign Up" (øverst til højre)
3. Udfyld formular og bekræft email

### Step 2: Få API Key
1. Efter login, gå til: https://www.themoviedb.org/settings/api
2. Klik "Request an API Key"
3. Vælg "Developer" (gratis)
4. Udfyld formular:
   - **Application Name:** Apropos Magazine
   - **Application URL:** https://ai.aproposmagazine.com
   - **Application Summary:** AI-powered journalism platform for article image generation
5. Accepter vilkår og klik "Submit"
6. **Kopier API Key** (vises på siden)

### Step 3: Tilføj til Vercel Environment Variables
1. Gå til: https://vercel.com/dashboard
2. Vælg projekt: **apropos-research**
3. Gå til: **Settings** → **Environment Variables**
4. Klik "Add New"
5. Indtast:
   - **Key:** `TMDB_API_KEY`
   - **Value:** [Din TMDB API Key]
   - **Environment:** Vælg alle (Production, Preview, Development)
6. Klik "Save"

### Step 4: Redeploy (Hvis nødvendigt)
1. Gå til: **Deployments**
2. Find seneste deployment
3. Klik "..." → **Redeploy**
4. Vælg "Use existing Build Cache: OFF"
5. Klik "Redeploy"

## ✅ Verificering

Efter setup, test at det virker:

1. **Generer en artikel** om en film eller TV-serie
2. **Klik "Generer billede"**
3. Systemet skulle nu finde billeder fra TMDB i stedet for at fejle

## 📝 Noter

- **TMDB API er gratis** for developer accounts
- **Rate limits:** 40 requests per 10 sekunder (mere end nok)
- **Hvis API key mangler:** Systemet fallback til AI-genererede billeder (ikke længere fejler)
- **TMDB billeder er bedre kvalitet** end AI-genererede for film/TV

## 🔧 Troubleshooting

### "TMDB API key not configured" fejl
- Tjek at `TMDB_API_KEY` er sat i Vercel Environment Variables
- Tjek at den er sat for alle environments (Production, Preview, Development)
- Redeploy efter at have tilføjet variablen

### Ingen billeder findes
- Dette er OK - systemet fallback til AI-genererede billeder
- TMDB har ikke alle film/TV-serier
- Prøv at søge med den originale danske titel

---

**Efter setup, skulle billedgenerering virke perfekt! 🎉**
