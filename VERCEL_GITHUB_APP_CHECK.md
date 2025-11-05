# 🔍 Vercel GitHub Integration - Tjek

## Problem
Du kan ikke se nogen webhook i GitHub → Settings → Webhooks.

## Forklaring
Vercel kan bruge **to forskellige metoder**:
1. **GitHub Webhooks** (gammel metode) - vises i Webhooks
2. **GitHub Apps** (nyere metode) - vises i GitHub Apps

## Tjek GitHub Apps

### Step 1: Gå til GitHub Apps
1. GitHub repository: `AproposCreative/apropos-research`
2. Klik **Settings** (top navigation)
3. I venstre sidebar, find **"Integrations"**
4. Klik **"GitHub Apps"**

### Step 2: Tjek for Vercel App
- Se om der er en **"Vercel"** app installeret
- Hvis der er: ✅ Integration virker (selvom der ikke er webhook)
- Hvis der IKKE er: ❌ Integration mangler

## Hvis der IKKE er Vercel GitHub App

### Re-link Vercel til GitHub (igen)

1. **Vercel Dashboard**
   - https://vercel.com/dashboard
   - Vælg projekt: **apropos-research**

2. **Settings → Git**
   - Klik **Settings** (top menu)
   - Klik **Git** (venstre sidebar)

3. **Disconnect og Reconnect**
   - Klik **"Disconnect"** ved GitHub integration
   - Klik **"Connect Git Repository"**
   - Vælg **GitHub**
   - Vælg **AproposCreative/apropos-research**
   - Klik **"Connect"**

4. **Efter connection**
   - Vercel installerer automatisk GitHub App
   - Tjek GitHub → Settings → GitHub Apps
   - Du skulle nu se en **Vercel** app

## Verificer Deployment

Efter re-linking:
1. Vent 1-2 minutter
2. Vercel Dashboard → Deployments
3. Du skulle se en ny deployment starte automatisk

## Hvis det stadig ikke virker

**Manuel deployment:**
1. Vercel Dashboard → Deployments
2. Klik **"..."** på seneste deployment
3. Vælg **"Redeploy"**
4. Check **"Use existing Build Cache: OFF"**
5. Klik **"Redeploy"**

---

**Vigtigt:** Vercel kan bruge GitHub Apps i stedet for Webhooks. Tjek GitHub Apps først!

