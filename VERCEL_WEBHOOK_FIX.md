# 🔧 Fix Vercel GitHub Integration

## Problem
Vercel deployer ikke automatisk når der pushes til GitHub. GitHub Webhooks siden viser ingen webhooks.

## Løsning

### Metode 1: Re-link Vercel til GitHub (Anbefalet)

1. **Gå til Vercel Dashboard**
   - https://vercel.com/dashboard
   - Vælg dit projekt `apropos-research`

2. **Gå til Settings → Git**
   - Scroll ned til "Connected Git Repository"
   - Klik "Disconnect" eller "Change Git Repository"

3. **Re-link GitHub**
   - Klik "Connect Git Repository"
   - Vælg "GitHub"
   - Vælg repository: `AproposCreative/apropos-research`
   - Bekræft at "Production Branch" er `main`
   - Klik "Connect"

4. **Verificer**
   - Vercel vil automatisk oprette webhook/GitHub App
   - Tjek GitHub → Settings → Webhooks (eller GitHub Apps)
   - Du skulle nu se en Vercel webhook/app

### Metode 2: Manuelt tilføj Vercel Webhook

Hvis re-linking ikke virker, kan du manuelt tilføje webhook:

1. **Find Vercel Webhook URL**
   - Gå til Vercel Dashboard → Settings → Git
   - Scroll ned til "Deploy Hooks"
   - Klik "Create Hook"
   - Kopier webhook URL

2. **Tilføj i GitHub**
   - Gå til GitHub → Settings → Webhooks
   - Klik "Add webhook"
   - Indsæt webhook URL fra Vercel
   - Content type: `application/json`
   - Events: Vælg "Just the push event"
   - Klik "Add webhook"

### Metode 3: Manuelt Trigger Deployment

Hvis webhook stadig ikke virker:

1. **Vercel Dashboard → Deployments**
2. Klik "..." på seneste deployment
3. Vælg "Redeploy"
4. Check "Use existing Build Cache: OFF"
5. Klik "Redeploy"

## Verificering

Efter re-linking:
- Push en test commit til GitHub
- Vent 1-2 minutter
- Tjek Vercel Dashboard → Deployments
- Du skulle se en ny deployment starte automatisk

## Troubleshooting

**Hvis deployment stadig ikke starter automatisk:**

1. Tjek Vercel Dashboard → Settings → Git
   - Er "Production Branch" sat til `main`?
   - Er repository korrekt linket?

2. Tjek GitHub → Settings → Webhooks
   - Er webhook "Active"?
   - Er der nylige deliveries?

3. Tjek GitHub → Settings → GitHub Apps
   - Vercel kan bruge GitHub Apps i stedet for webhooks
   - Se om der er en "Vercel" app installeret

4. Kontakt Vercel Support
   - Hvis intet virker, kan det være en Vercel-side issue

---

**Status:** GitHub har ingen webhooks konfigureret. Re-link Vercel integration for at fixe dette automatisk.

