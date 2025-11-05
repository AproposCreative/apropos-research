# 🚀 Vercel Git Integration - Step by Step

## Problem
Vercel deployer ikke automatisk fra GitHub. Ingen webhooks.

## Løsning: Re-link Vercel til GitHub

### Step 1: Åbn Vercel Dashboard
1. Gå til: https://vercel.com/dashboard
2. Log ind hvis nødvendigt
3. Vælg projektet: **apropos-research**

### Step 2: Gå til Git Settings
1. Klik på **"Settings"** (i top navigation bar)
2. I venstre sidebar, klik på **"Git"**

### Step 3: Disconnect GitHub (hvis allerede linket)
1. Scroll ned til sektionen "Connected Git Repository"
2. Hvis der står "GitHub - AproposCreative/apropos-research"
3. Klik på **"Disconnect"** eller **"Change Git Repository"**

### Step 4: Connect GitHub Repository
1. Klik på **"Connect Git Repository"** knap
2. Vælg **"GitHub"** som kilde
3. Authorize Vercel hvis der bliver bedt om det
4. Find og vælg repository: **AproposCreative/apropos-research**
5. Klik **"Connect"** eller **"Import"**

### Step 5: Production Branch (hvis vist)
- Hvis du ser en "Production Branch" dropdown:
  - Vælg **"main"**
- Hvis du IKKE ser "Production Branch":
  - **Bare klik "Connect"** - Vercel bruger automatisk `main` branch som default
  - Det er normalt at den ikke vises i nogle Vercel UI versioner

### Step 6: Verificer
1. Efter connection, tjek GitHub → Settings → Webhooks
2. Du skulle nu se en Vercel webhook (eller GitHub App)
3. Gå til Vercel Dashboard → Deployments
4. Du skulle se en ny deployment starte automatisk

## Hvis "Production Branch" ikke vises

**Det er OK!** Vercel bruger automatisk `main` branch som default. Bare klik "Connect" og fortsæt.

## Troubleshooting

**Hvis deployment stadig ikke starter:**
1. Vercel Dashboard → Deployments
2. Klik "..." på seneste deployment
3. Vælg "Redeploy"
4. Check "Use existing Build Cache: OFF"
5. Klik "Redeploy"

---

**Tip:** Hvis du ikke kan se "Production Branch" indstilling, er det normalt - Vercel bruger `main` som default.

