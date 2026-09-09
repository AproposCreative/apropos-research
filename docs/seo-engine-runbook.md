# SEO Engine runbook

## TypeScript / lint scope (legacy debt)

- Global `tsconfig.json` keeps `strict: false` — **existing legacy debt**, do not flip globally without a dedicated cleanup.
- SEO Engine is enforced separately: `npm run type-check:seo-engine` → `tsc -p tsconfig.seo-engine.json` with `strict: true`.
- Scope: `lib/seo-engine/**`, `app/api/seo-engine/**`, `app/api/internal/seo-engine-article/**`, `app/api/cron/seo-engine-recovery/**`, `app/ai/seo/**`, `components/settings/SeoEngineSection.tsx`, `test/seo-engine*.ts`.
- Known legacy deviations outside this gate: global `strict: false`; ProductStoryShowcase lint debt (unrelated).

## Current write contract (2026-09-09)

| Path | Permission / stop rule | CMS result |
| --- | --- | --- |
| Publish empty-fill | Opportunity stop must allow work; opportunity runtime or legacy empty-fill enabled | DA/EN published locales only; empty fields saved and read back as staged metadata |
| Recovery | Same stop rule; kick original durable job ID, retaining locale and attempts | No replacement DA job for an EN job |
| Weekly optimize | Readable settings, no env/stored stop, healthy connections and guardrails | Staged metadata, exact readback; no item publication |
| Manual scan | Default collect; writes require mode=optimize and autoApply=true | UI confirms up to 10 staged changes |
| Manual approved apply / rollback | Explicit editorial action; conflict checks and per-item/locale lease | Staged metadata, exact readback; no item publication |
| Archive/content/backfill | Separate frozen preview and confirmation | These existing explicit workflows can publish; do not use for unattended audit |

`SEO_ENGINE_AUTO_OPPORTUNITY_OPT=false` or a stored `autoOpportunityOptEnabled=false` stops new automatic writes, including legacy empty-fill. Environment true never overrides stored stop or unreadable settings. The worker checks stop before processing and again before writing. A request already sent to CMS cannot be recalled.

`applied` is a legacy internal status: new writes additionally record `cmsWriteState=staged_verified` and `cmsVerifiedAt`. Neither means live publication. The editorial publication flow owns publication; SEO must not release unrelated staged body changes. Cooldown is measured from the staged operation as a write throttle, not as proof of SEO effect.

Rollback reads the current locale and only restores fields still matching the recorded operation, or reconciles fields already restored by a prior attempt. It marks history complete after exact readback. Apply persists frozen pending versions before PATCH so uncertain responses can be reconciled without regeneration.

## Feature flags

| Flag | Default | Effect |
|------|---------|--------|
| `WEBFLOW_AUTO_SEO_ENGINE` | `false` | Env default for auto empty-fill |
| `appSettings/seoEngine.autoSeoEnabled` | unset → env | Runtime toggle (admin UIDs only) |
| `SEO_ENGINE_DEMO` | unset | Server demo / ephemeral heuristics — **never in prod** |
| `NEXT_PUBLIC_SEO_ENGINE_DEMO` | unset | Client demo banner + ephemeral header — **never in prod** |
| `WEBFLOW_ARTICLE_WEBHOOK_OPTIMIZE` | `true` | Image-opt only — **does not** gate SEO/translation |

## Opportunity engine (GSC/GA4) — automatic

- Module: `lib/seo-engine/opportunity-engine/` (swappable)
- **Production default ON** (nød-stop via Settings / `SEO_ENGINE_AUTO_OPPORTUNITY_OPT=false`)
- Publish: empty SEO fill enqueue (fail closed — never blocks publish)
- Cron daily = collect; weekly = optimize (max 10, 14d cooldown, confidence gates)
- Safe writes only: seo-title / meta-description (staged metadata only)
- UI: SEO Engine → **Optimering** (status + nød-stop + rollback) — no ongoing Scan needed
- Docs: `docs/seo-engine-opportunity-engine.md`
- Review JSON-LD (server HTML): `docs/seo-engine-review-jsonld.md`

## Arkiv impact-kø (primary UX)

- UI: SEO Engine → **Arkiv** — tabs **Åbne · Kører · Løst**
- Scan → jobs: `POST /api/seo-engine/archive-jobs/scan` (upserts `seoEngineArchiveJobs`; skips EN 404 noise)
- List: `GET /api/seo-engine/archive-jobs/scan?tab=open|running|done`
- Løs: `POST /api/seo-engine/archive-jobs/[jobId]` `{ action: "preview" }` then `{ action: "apply", confirmOverwrite: true, confirmToken }`
- Tasks: `seo_meta` | `canonical` | `image_alt` | `headings` | `internal_links`
- Lifecycle: `open → fixing → verified | partial | failed | dismissed`
- Success = **planned** findings resolved (CMS re-fetch), not whole-article P0-free
- After seo_meta only with remaining content: badge **Meta OK · N åbne content** (partial)
- `seo_meta` agent: one title+meta — **no** strategy-pack 2-alternatives fail-closed
- Backup: `os.tmpdir` on Vercel + Firestore `seoEngineArchiveApplyBackups`

## Arkiv-audit legacy apply (still available)

- Scan: `POST /api/seo-engine/archive-audit` (admin, read-only)
- Preview/apply SEO: `/api/seo-engine/archive-audit/preview` + `/apply` (now uses dedicated seo_meta agent)
- Content: `/content-preview` + `/content-apply`
- CLI scan: `npx tsx scripts/seo-engine-archive-audit.ts --limit=80`
- Joins GA4/GSC when configured

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

Re-fetch before PATCH; only still-empty `seo-title` / `meta-description` in the job’s **DA or EN locale**. Skip drafts. Exact readback, no automatic item publication.

## One-off overwrite backfill

Separate from the auto worker (does **not** change locale-aware / fill-empty rules).

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

1. Keep automatic writes **OFF** (`SEO_ENGINE_AUTO_OPPORTUNITY_OPT=false`, opportunity toggle off; legacy enable cannot override the stop).
2. Manual AI smoke: authenticated POST `/api/seo-engine/analyze` (≥200 char body) → `mode: "ai"`, Zod-valid — no worker/CMS write.
3. Staging worker with empty DK SEO fields (internal secret + one item).
4. Enable toggle / env → monitor logs (webhook enqueue, worker, recovery cron).
5. **Rollback** = toggle OFF (and/or env `false`) — blocks new automatic CMS requests; a request already sent may finish. Legacy enable cannot override this stop.

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
