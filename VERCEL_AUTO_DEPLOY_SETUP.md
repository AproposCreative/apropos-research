# 🚀 Vercel Automatisk Deployment Setup

## Problem
Vercel deployer ikke automatisk når der pushes til GitHub.

## Løsning: Sæt Vercel GitHub Integration op (5 minutter)

### Metode 1: Via Vercel Dashboard (Anbefalet - Bedst)

1. **Gå til Vercel Dashboard**
   - https://vercel.com/dashboard
   - Log ind med dit GitHub account

2. **Vælg eller Opret Projekt**
   - Hvis projektet allerede eksisterer: Klik på `apropos-research`
   - Hvis ikke: Klik "Add New..." → "Project" → Import fra GitHub

3. **Link til GitHub Repository**
   - Vælg repository: `AproposCreative/apropos-research`
   - Bekræft: **Production Branch** = `main`
   - Klik "Import"

4. **Konfigurer Build Settings** (hvis nødvendigt)
   - Framework Preset: **Next.js**
   - Root Directory: `.` (root)
   - Build Command: `npm run build`
   - Output Directory: `.next`
   - Install Command: `npm ci`

5. **Gem og Deploy**
   - Klik "Deploy"
   - Vercel opretter automatisk webhook i GitHub

**✅ Dette er det!** Nu deployer Vercel automatisk hver gang du pusher til `main`.

---

### Metode 2: Via GitHub Actions (Hvis du vil bruge secrets)

Hvis du foretrækker at bruge GitHub Actions workflow'en i stedet:

1. **Opret Vercel Token**
   - Gå til: https://vercel.com/account/tokens
   - Klik "Create Token"
   - Navn: `github-actions-deploy`
   - Scope: Full Account
   - Kopier tokenet

2. **Find Project ID**
   - Gå til Vercel Dashboard → Projekt → Settings → General
   - Kopier "Project ID"

3. **Tilføj Secrets til GitHub**
   - Gå til: https://github.com/AproposCreative/apropos-research/settings/secrets/actions
   - Klik "New repository secret"
   - Tilføj:
     - Name: `VERCEL_TOKEN` → Value: [dit token]
     - Name: `VERCEL_PROJECT_ID` → Value: [dit project ID]

4. **Test**
   - Push en ændring til `main`
   - Tjek GitHub Actions → "Trigger Vercel Deployment"
   - Tjek Vercel Dashboard → Deployments

---

## Verificering

Efter setup, test at det virker:

1. **Push en lille ændring til `main`**
   ```bash
   git commit --allow-empty -m "test: Trigger Vercel deployment"
   git push
   ```

2. **Tjek Vercel Dashboard**
   - Du skulle se en ny deployment starte automatisk
   - Status: "Building" → "Ready"

3. **Tjek GitHub Webhooks** (valgfrit)
   - Gå til: https://github.com/AproposCreative/apropos-research/settings/hooks
   - Du skulle se en Vercel webhook

---

## Troubleshooting

### Vercel deployer ikke automatisk

1. **Tjek GitHub Webhooks**
   - Settings → Webhooks
   - Find Vercel webhook
   - Tjek "Recent Deliveries" for fejl

2. **Re-link Repository**
   - Vercel Dashboard → Settings → Git
   - Klik "Disconnect"
   - Klik "Connect Git Repository"
   - Vælg repository igen

3. **Tjek Branch Settings**
   - Vercel Dashboard → Settings → Git
   - Verificer: Production Branch = `main`

### GitHub Actions workflow fejler

- Tjek at `VERCEL_TOKEN` og `VERCEL_PROJECT_ID` secrets er sat korrekt
- Tjek workflow logs for fejlbeskeder
- Hvis secrets mangler, workflow'en vil springe over (det er OK)

---

## Status

- ✅ GitHub Actions workflow opdateret til at trigger Vercel deployment
- ⚠️ Vercel GitHub Integration skal sættes op (Metode 1 anbefalet)
- ✅ Workflow'en fejler ikke hvis secrets mangler (bruger webhook i stedet)
