# GSC/GA4 opportunity engine (automatic)

## Operating model

**Production default = automatic drift** when GSC + Webflow are healthy (GA4 preferred) **and** settings are readable.

The editorial team does **not** need to open the tool, Scan, or approve for the normal process.

| Path | Behavior |
|------|----------|
| **Publish (new articles)** | Empty `seo-title` / `meta-description` for **da + en** via existing durable job queue (fail closed — never blocks publish; no double CMS writes; publish date preserved) |
| **Daily cron** | Collect GSC/GA4 opportunities (no CMS writes) |
| **Weekly cron** | Optimize — auto-apply up to **10** existing articles with guardrails |

UI shows status + **nød-stop** + manuel rollback. Manual “kørsel” is optional.

### Locales
GSC URLs `/articles/…` → DK Webflow locale; `/en/articles/…` → EN.  
Slug maps are **locale-specific** (EN slug may differ from DK). Language-correct metadata; apply/rollback targets the matched locale.

Publish enqueue only runs for locales that are **published** (`!isDraft` + `lastPublished`). A DK publish never writes an EN draft’s empty SEO.

### Stale-write
Before any CMS write the live item is re-read. If SEO/meta or `cmsLastUpdated` changed since scan → **SKIP** (never overwrite editor edits).

## Safe automatic fields only

May write:
- `seo-title`
- `meta-description`
- No automatic schema snapshot is produced by the opportunity scan. JSON-LD remains a separate SEO Engine capability.

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
- Env `SEO_ENGINE_AUTO_OPPORTUNITY_OPT=false` (wins over stored enable)

Default when unset **and settings read succeeds**: **ON**.

**Fail-closed:** if Firestore/settings cannot be read, auto stays **OFF** (does not fall back to enabled). Explicit env `true` does not bypass stored stop or unavailable settings.

## GSC windows

Equal **28-day** full windows with **3-day data lag** (today excluded). Search Console rows are paginated with a hard cap (10k).

## Cron

- `GET /api/cron/seo-engine-opportunities/daily` — collect
- `GET /api/cron/seo-engine-opportunities/weekly` — optimize (max 10)

Auth: `Authorization: Bearer CRON_SECRET`. Slot claims: succeeded runs hold TTL; **failed runs release the lease** so the next tick can retry.

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


## Staged writes and recovery (2026-09-09)

Automatic metadata updates are saved to staged CMS fields and read back exactly. They do not publish the item; the editorial flow retains responsibility for publication of body, images and metadata. UI labels new results as verified drafts. Historical applied rows have unknown live state. This prevents SEO from publishing an editor’s unrelated pending changes.

A per-item/locale lease serializes worker/apply/rollback. Idempotency claims reject active owners; expired token owners cannot complete another owner's claim. Frozen pending apply versions support reconciliation after a lost CMS response. Rollback rejects newer editor values, restores only the latest operation and marks completion after readback; retries can complete without a second PATCH.

Manual scan defaults to `collect`. To explicitly write use `mode=optimize` and `autoApply=true`; the UI confirms that this saves up to ten drafts. Stored emergency stop beats environment enable and legacy empty-fill. Requests already sent to CMS may still complete.

These locks coordinate SEO writers, not external Webflow editors. Webflow PATCH here is not a conditional compare-and-swap; a small race after the final read remains. No automatic item publication occurs. Live SEO impact measurement requires a separately verified editorial publication timestamp.
