# 🚀 AUTOMATISK VERCEL DEPLOYMENT FIX

## Problem
Vercel deployer ikke automatisk fra GitHub. Ingen webhooks er konfigureret.

## LØSNING - 3 MINUTTER

### Step 1: Vercel Dashboard (1 minut)
1. Gå til: https://vercel.com/dashboard
2. Vælg projekt: `apropos-research`
3. Klik: **Settings** (i top menu)
4. Klik: **Git** (i venstre sidebar)
5. Scroll ned til "Connected Git Repository"
6. Klik: **"Disconnect"** eller **"Change Git Repository"**

### Step 2: Re-link GitHub (1 minut)
1. Klik: **"Connect Git Repository"**
2. Vælg: **GitHub**
3. Vælg repository: **AproposCreative/apropos-research**
4. Bekræft: **Production Branch** = `main`
5. Klik: **"Connect"**

### Step 3: Verificer (1 minut)
1. Tjek GitHub → Settings → Webhooks
2. Du skulle nu se en Vercel webhook
3. Tjek Vercel Dashboard → Deployments
4. Du skulle se en ny deployment starte automatisk

## Hvis det ikke virker

### Alternativ: Manuelt Redeploy
1. Vercel Dashboard → **Deployments**
2. Find seneste deployment
3. Klik **"..."** → **"Redeploy"**
4. Check **"Use existing Build Cache: OFF"**
5. Klik **"Redeploy"**

## Status
- ✅ GitHub: Seneste commit pushet (`080d815`)
- ⚠️ Vercel: Mangler webhook integration
- 🔧 Fix: Re-link Vercel til GitHub (3 minutter)

---

**Dette fixer problemet automatisk når du re-linker Vercel til GitHub.**

