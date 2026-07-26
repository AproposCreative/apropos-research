# GSC/GA4 opportunity engine (automatic)

## Operating model

**Production default = automatic drift** when GSC + Webflow are healthy (GA4 preferred).

The editorial team does **not** need to open the tool, Scan, or approve for the normal process.

| Path | Behavior |
|------|----------|
| **Publish (new articles)** | Empty `seo-title` / `meta-description` enqueued automatically (fail closed — never blocks publish) |
| **Daily cron** | Collect GSC/GA4 opportunities (no CMS writes) |
| **Weekly cron** | Optimize — auto-apply up to **10** existing articles with guardrails |

UI shows status + **nød-stop** + manuel rollback. Manual “kørsel” is optional.

## Safe automatic fields only

May write:
- `seo-title`
- `meta-description`
- server-side JSON-LD snapshot (version history; not editorial CMS body)

**Never** auto-change: redaktionel titel/H1, subtitle, intro, brødtekst, citater, holdning, rating, forfatter, original publiceringsdato, slug/URL, eventfakta.

## Guardrails

| Rule | Value |
|------|-------|
| Max existing articles / optimize run | 10 |
| Cooldown per URL | 14 days |
| Min confidence | 0.65 |
| Min score | 45 |
| Overwrite strong SEO fields | Only with high impressions + documented SERP opportunity |
| Skip when | missing credentials/data, unhealthy connections, validation fail, low confidence, cooldown, batch limit, idempotency hit |

Reviews get natural `[værk] anmeldelse` / `[work] review` titles (no keyword stuffing).

## Kill-switch (nød-stop)

- Settings → Automatisk SEO toggle **off**, or
- Env `SEO_ENGINE_AUTO_OPPORTUNITY_OPT=false`

Default when unset: **ON**.

## Cron

- `GET /api/cron/seo-engine-opportunities/daily` — collect
- `GET /api/cron/seo-engine-opportunities/weekly` — optimize (max 10)

Auth: `Authorization: Bearer CRON_SECRET`. Idempotent slot claims.

## Manual team setup (one-time)

1. Ensure existing GSC/GA4/Webflow credentials (same SA as Dashboard) — no new OAuth.
2. SA must be a **user on the GSC property**.
3. Set `CRON_SECRET`.
4. Deploy Firestore indexes (`seoEngineOpportunities`).
5. Leave automatic drift ON unless you need nød-stop.

When credentials are missing, status is explicit — **no mock data**.

## Firestore

- `seoEngineOpportunities`
- `seoEngineOpportunityVersions` (rollback)
- `seoEngineOpportunityAudit`
- `seoEngineOpportunityScans`
- `seoEngineOpportunityUrlCooldown`
- `seoEngineOpportunityIdempotency`
