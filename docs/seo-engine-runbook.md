# SEO Engine runbook

## TypeScript / lint scope (legacy debt)

- Global `tsconfig.json` keeps `strict: false` — **existing legacy debt**, do not flip globally without a dedicated cleanup.
- SEO Engine is enforced separately: `npm run type-check:seo-engine` → `tsc -p tsconfig.seo-engine.json` with `strict: true`.
- Scope: `lib/seo-engine/**`, `app/api/seo-engine/**`, `app/api/internal/seo-engine-article/**`, `app/api/cron/seo-engine-recovery/**`, `app/ai/seo/**`, `components/settings/SeoEngineSection.tsx`, `test/seo-engine*.ts`.
- Known legacy deviations outside this gate: global `strict: false`; ProductStoryShowcase lint debt (unrelated).

## Feature flags (default OFF for auto)

| Flag | Default | Effect |
|------|---------|--------|
| `WEBFLOW_AUTO_SEO_ENGINE` | `false` | Env default for auto empty-fill |
| `appSettings/seoEngine.autoSeoEnabled` | unset → env | Runtime toggle (admin UIDs only) |
| `SEO_ENGINE_DEMO` | unset | Server demo / ephemeral heuristics — **never in prod** |
| `NEXT_PUBLIC_SEO_ENGINE_DEMO` | unset | Client demo banner + ephemeral header — **never in prod** |
| `WEBFLOW_ARTICLE_WEBHOOK_OPTIMIZE` | `true` | Image-opt only — **does not** gate SEO/translation |

## Arkiv-audit + UI apply

- UI: SEO Engine → **Arkiv** tab (`ArchiveAuditPanel`)
- Scan: `POST /api/seo-engine/archive-audit` (admin, read-only)
- Preview: `POST /api/seo-engine/archive-audit/preview` — `{ selection: [{ itemId, locale }] }` → frozen `previewId` + `confirmToken` (no CMS writes)
- Apply: `POST /api/seo-engine/archive-audit/apply` — `{ previewId, confirmOverwrite: true, confirmToken }` → backup → SEO title + meta only → exact readback; stop-on-error; DA before EN; pauses auto-translate when possible
- Max **20** selected rows per confirm; empty selection blocked; apply without confirm token / preview refused
- CLI scan still: `npx tsx scripts/seo-engine-archive-audit.ts --limit=80`
- Joins GA4/GSC when configured; compact OK/mangler status in UI

## Auth / allowlists

- **Production:** caller must be in `SEO_ENGINE_ALLOWED_UIDS` **or** `SEO_ENGINE_ADMIN_UIDS`. If **both** lists are empty → **fail closed** (no UI API access).
- Non-prod: empty lists = open (dev convenience); otherwise membership required.
- Admin (`SEO_ENGINE_ADMIN_UIDS`): global auto-toggle PATCH, system-owned docs, cross-owner access.
- UI APIs (`/api/seo-engine/*`): Firebase Bearer + owner/`createdBy` checks.
- Internal worker: **requires** `x-internal-api-secret` = `INTERNAL_API_SECRET` (Firebase token alone is insufficient).
- Recovery cron: **requires** `Authorization: Bearer CRON_SECRET`. **No** `x-vercel-cron` bypass (header is spoofable).

## Required env (ops)

| Area | Vars |
|------|------|
| OpenAI | `OPENAI_API_KEY` (+ model vars as used by `lib/openai`) |
| Firebase Admin | `FIREBASE_ADMIN_*` / client `NEXT_PUBLIC_FIREBASE_*` |
| Webflow | `WEBFLOW_API_TOKEN`, article collection IDs, webhook secrets as needed |
| Locales | `WEBFLOW_CMS_LOCALE_DK`, `WEBFLOW_CMS_LOCALE_EN` (defaults exist in `lib/config/env.ts`) |
| Secrets | `INTERNAL_API_SECRET`, `CRON_SECRET` (ASCII-only) |
| Allowlists (prod) | `SEO_ENGINE_ADMIN_UIDS` and/or `SEO_ENGINE_ALLOWED_UIDS` |
| Auto (optional) | `WEBFLOW_AUTO_SEO_ENGINE` / Settings toggle |

**Never** set `SEO_ENGINE_DEMO=true` or `NEXT_PUBLIC_SEO_ENGINE_DEMO=true` on production.

## Ephemeral local demo

Requires **all** of:

1. `SEO_ENGINE_DEMO=true`
2. `NEXT_PUBLIC_SEO_ENGINE_DEMO=true` (client sends `x-seo-engine-ephemeral-demo: 1` / shows demo banner)
3. `NODE_ENV !== 'production'`
4. Explicit demo header/body on analyze/strategize

No Firebase persist, no OpenAI, no CMS write. UI label: “Demo-heuristik”, not AI.

```bash
SEO_ENGINE_DEMO=true NEXT_PUBLIC_SEO_ENGINE_DEMO=true npm run dev
# Open /ai?view=seo
```

## Firestore indexes

Deploy `firestore.indexes.json` **before** relying on:

- History lists (`articleKey` + `createdAt` / `endedAt`)
- Recovery / ordered queues (`seoEngineJobs`: `status` ASC + `updatedAt` ASC)

`listQueuedSeoEngineJobs` uses `where status==queued` + `orderBy(updatedAt, asc)` + `limit` (oldest first). If the index is missing or legacy docs lack `updatedAt`, it **falls back** to an unordered `status==queued` query and logs a warning — deploy the index to avoid starvation under load.

## articleKey

- Webflow worker/auto: `wf:{itemId}` (stable across edits).
- Manual drafts: pass `articleKey` / `webflowItemId`, else `draft:{inputVersionHash}`.

## Empty-only CMS write

Re-fetch before PATCH; only still-empty `seo-title` / `meta-description` on **DK locale** helpers. Never EN.

## One-off overwrite backfill

Separate from the auto worker (does **not** change DK-only / fill-empty rules).

```bash
# 1) Dry-run (zero Webflow writes) — real AI; writes frozen manifest
npm run seo-engine:backfill-overwrite -- --limit=10 --locales=da,en

# 1b) If a locale failed, retry only that item/locale, then compose a clean report
#     (keeps original reports unchanged; rejects conflicts / unresolved statuses):
npm run seo-engine:backfill-overwrite -- --item-id=<id> --locales=da
npm run seo-engine:backfill-overwrite -- \
  --compose \
  --base-report=tmp/seo-engine-backfill/report-<base>.json \
  --retry-report=tmp/seo-engine-backfill/report-<retry>.json \
  --out=tmp/seo-engine-backfill/report-composite.json

# 2) Live CMS overwrite — requires a clean reviewed dry-run / composite report:
npm run seo-engine:backfill-overwrite -- \
  --apply --overwrite --limit=10 --locales=da,en \
  --from-report=tmp/seo-engine-backfill/report-….json
```

- Selects the **N newest published** DK items by Webflow `lastPublished`.
- Processes **DA + EN** when published EN exists; **skips only definitive 404 missing EN** (no invent/translate). Auth/5xx/network **block**.
- Unpublished locales (incl. DA) are skipped/stopped — never written.
- Uses locale-separated `articleKey`: `wf:{itemId}:da` / `wf:{itemId}:en`.
- Overwrite mode clears `existingSeoTitle` / `existingMetaDescription` so AI is not locked to CMS values.
- Apply uses **frozen manifest** from `--from-report` (no silent re-select / re-generate). Verifies `lastUpdated` + content/input hashes before each PATCH.
- `--from-report` must be clean: only `proposed` + legitimate EN `skipped_missing` / `skipped_unpublished`. Rejects `error`, `blocked_fetch`, `skipped_validation`, and any unresolved status even when `stoppedOnError=false`. Manifest entries must match proposed results 1:1.
- Before writes: timestamped backup under `tmp/seo-engine-backfill/` (gitignored).
- Apply: sequential, **stop on first error**, exact readback. **No automatic rollback** — restore from backup JSON.
- Help / rollback: `npm run seo-engine:backfill-overwrite -- --help`

## Rollout

1. Keep auto **OFF** (`WEBFLOW_AUTO_SEO_ENGINE=false`, Settings toggle off).
2. Manual AI smoke: authenticated POST `/api/seo-engine/analyze` (≥200 char body) → `mode: "ai"`, Zod-valid — no worker/CMS write.
3. Staging worker with empty DK SEO fields (internal secret + one item).
4. Enable toggle / env → monitor logs (webhook enqueue, worker, recovery cron).
5. **Rollback** = toggle OFF (and/or env `false`) — stops new auto work; in-flight jobs may finish.

## Ops checklist

1. Indexes deployed; allowlists set in prod; demo flags unset in prod.
2. `INTERNAL_API_SECRET` + `CRON_SECRET` + OpenAI + Firestore Admin + Webflow.
3. Webhook on `collection_item_published` (DK only enqueued).
4. Recovery: `GET /api/cron/seo-engine-recovery` every 15m (`vercel.json`) with `Authorization: Bearer CRON_SECRET`.
5. Soft-delete via History UI — no auto hard-purge.

## Non-E2E / residual risk

Not covered by full end-to-end automation (unit/blockers tests only):

- Live Webflow PATCH against production CMS
- Real OpenAI latency/timeouts under webhook deadline
- Firestore index deploy lag after first ordered-queue use
- Concurrent webhook + recovery double-kick (idempotent job ids mitigate)
- Full UI overlay flows in CI

## Live AI smoke (no CMS write)

Authenticated POST `/api/seo-engine/analyze` with ≥200 char body; confirm `mode: "ai"` and Zod-valid analysis. Do not call worker.
