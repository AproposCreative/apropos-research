# GSC/GA4 opportunity engine

## What it is

A **swappable server-side module** (`lib/seo-engine/opportunity-engine/`) that scores SEO opportunities from existing Google Search Console + GA4 connections (same service-account auth as Dashboard / SEO Engine). It does **not** create a new OAuth integration and never invents mock metrics.

## Signals scored

| Signal | Evidence |
|--------|----------|
| High impressions / low CTR | GSC page aggregates |
| Position 4–20 | GSC average position |
| Rising queries | Last 28 days vs previous 28 |
| Declining articles | Same windows on page impressions |
| Query cannibalization | Same query → multiple pages |
| Weak/missing title/meta | CMS seo-title / meta-description |

Each open item includes concrete proposals (safe metadata only), evidence (query, clicks, impressions, CTR, position, GA4 engagement), and a Danish `why` explanation.

## Modes

| Mode | Behavior |
|------|----------|
| **Recommendation / approval (default)** | Queue only. Humans approve/reject. No automatic CMS overwrite of editorial fields. |
| **Auto-optimering (explicit)** | When `appSettings/seoEngine.autoOpportunityOptEnabled` or env `SEO_ENGINE_AUTO_OPPORTUNITY_OPT=true`, cron/scan may update **only** `seo-title` + `meta-description`, with versions + audit log + rollback. |

Never auto-overwrites: redaktionel titel, brødtekst, holdning/rating.

## UI

- SEO Engine overlay → tab **Optimering** (`OpportunityQueuePanel`)
- Settings → Optimering → toggle **Auto-optimering (GSC/GA4)** (admin only)
- Manual **Scan / Kør**: `POST /api/seo-engine/opportunities/scan`

## Cron (idempotent)

Registered in `vercel.json`:

- Daily: `GET /api/cron/seo-engine-opportunities/daily` @ 06:15 UTC
- Weekly: `GET /api/cron/seo-engine-opportunities/weekly` @ 06:30 UTC Mondays

Auth: `Authorization: Bearer CRON_SECRET` (same as seo-engine-recovery). Slot claim prevents double-runs.

## Manual team setup

1. **Reuse existing credentials** (no new OAuth app):
   - `FIREBASE_ADMIN_CLIENT_EMAIL` + `FIREBASE_ADMIN_PRIVATE_KEY`
   - `GSC_SITE_URL` (e.g. `sc-domain:aproposmagazine.com` or property URL)
   - `GA4_PROPERTY_ID`
2. Add the service account as a **user on the GSC property** (GA4↔GSC product link alone is not enough for Search Analytics).
3. Enable Search Console API + Analytics Data API on the GCP project.
4. Set `CRON_SECRET` for cron routes.
5. Keep Auto-optimering **OFF** until the queue has been reviewed.
6. Optional: set `SEO_ENGINE_AUTO_OPPORTUNITY_OPT=true` only after explicit editorial approval of the workflow.

When credentials/data are missing, the UI/API show a clear status (`missing_gsc` / `missing_ga4` / `partial`) — **no mock rows**.

## Firestore collections

- `seoEngineOpportunities`
- `seoEngineOpportunityVersions` (rollback)
- `seoEngineOpportunityAudit`
- `seoEngineOpportunityScans` (+ cron slot claims)

## APIs

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/seo-engine/opportunities` | List queue + connection status |
| POST | `/api/seo-engine/opportunities/scan` | Manual scan |
| POST | `/api/seo-engine/opportunities/[id]` | `approve` / `reject` / `apply` / `rollback` |
| GET | `/api/cron/seo-engine-opportunities/daily` | Daily scheduled scan |
| GET | `/api/cron/seo-engine-opportunities/weekly` | Weekly scheduled scan |
