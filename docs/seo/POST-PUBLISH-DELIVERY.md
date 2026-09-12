# Automatic metadata review delivery

User goal: implement and deploy automatic SEO-title and meta-description quality
review after publication across Liv, Writer and direct Webflow publications,
plus later optimization grounded in Search Console and GA4 results.

## Current evidence (2026-09-12)

- Dedicated worktree: `apropos-research-seo-quality`, branch
  `codex/seo-post-publish-quality`, started from freshly fetched main `40909b5`.
- Fast-forwarded to Liv's verified production `523b1ea` to preserve all newer
  editorial, API and security fixes. Liv is separately deploying `17e0c6f`;
  include it and coordinate the latest production SHA before SEO deployment.
- New isolated `post-publish/policy.ts` allows improvements to filled fields,
  preserves per-field locks, rejects changed snapshots and editorial drafts,
  requires comparable performance evidence and enforces a 28-day cooldown.
- New `post-publish/review.ts` reviews both filled fields using article content,
  then independently checks proposed changes. Strict output parsing, no fake
  fallback, no silent article truncation. Calls are dependency-injected.
- 375 SEO regression tests and 127 Liv/CMS save/publication tests pass with existing local runtime; no live model call,
  CMS change or deployment yet. The reused dependency tree differs from this
  release lockfile: these isolated tests are not a full build verification.
- Added atomic Firestore model-stage persistence, saved-response replay,
  request/model hash checks and explicit reconciliation for uncertain transport.
  Production provider uses the existing server OpenAI client with transport retries
  disabled; the job adapter still needs to invoke it.
- Added live/staged CMS snapshot comparison and a metadata-only live PATCH
  adapter using the existing shared CMS lease. It verifies exact CMS metadata,
  preserved editorial fields and public HTML, and exposes a read-only reconciliation
  path for uncertain writes. No shared Webflow helper was changed.
- Webflow endpoint contract checked against official documentation:
  https://developers.webflow.com/data/reference/cms/collection-items/live-items/update-items-live
  https://developers.webflow.com/data/reference/cms/collection-items/live-items/get-item-live
- Added Firestore quality job queue, fenced worker checkpoints, atomic article
  write reservation and pending-write reconciliation. Single indexed `readyAt`
  field schedules retry/recovery without requiring a composite index. Firestore
  transaction behavior still needs integration verification; worker tests use ports.
- Shared `after-publish.ts` now enqueues quality review for filled and empty
  metadata, preserving the existing published-locale and emergency-stop gates.
  New authenticated `/api/internal/seo-quality` starts a durable job; best-effort
  dispatch is supplemented by the existing 15-minute recovery route, now with
  a 300-second budget for up to two workers. No Vercel schedule changed.
- Regression tests cover both DA/EN and filled metadata. Still inspect the
  full Webflow webhook and prove all publishing paths in
  integration; new code has not reached production.
- Fixed partial-failure propagation: after-publish now returns `needsRetry` and
  the webhook includes it in its existing 503/retry decision, even if another
  locale was successfully queued.
- Recovery now also runs one 50-item live-CMS discovery page. A leased Firestore
  cursor cycles through all DA then EN pages, advancing only after enqueue
  succeeds. Discovery performs no CMS writes; actual staged/live comparison is
  repeated by the worker before model calls and writes.
- Existing opportunity scans now preserve explicit equal comparison windows and
  whether both GSC fetches completed without reaching their row cap. Weekly and
  explicit manual optimization now enqueue the same quality worker instead of
  directly writing heuristic proposals. Jobs include actual query/CTR/position,
  previous-period values and available GA4 engagement context. Queued counts are
  distinct from applied counts; missing GA4 remains null, never fabricated zero.
- Remaining release work includes editorial UI/locks/history, uniqueness checks,
  transaction integration tests, actual analytics/publication verification and
  deployment coordination. Performance observations after metadata changes and
  lock/cooldown compatibility with manual legacy SEO writers need audit.
- Added authenticated paginated `/api/seo-engine/quality` history and per-field
  lock controls under the existing CMS lease, with lock-change audit records.
  New panel in the existing optimization tab shows before/proposed/verified
  metadata, actual assessment reasons, Google evidence periods and statuses.
  React review covers request races, stale user requests, keyboard controls and
  minimal server serialization. Visual/browser verification is still outstanding.
- Shared `patchArticleFieldDataForLocale` now checks SEO locks and pending quality
  writes only when metadata fields are present. Tests prove unchanged filled Liv
  metadata payload, refusal before transport for locked fields, and unchanged
  non-metadata operations. Liv requested and received its 127-test regression
  coverage; no CMS payload/proof fields were altered.
- Still audit direct CMS writers that bypass this shared helper, transaction
  integration, per-article performance follow-up, uniqueness and deployment.
- Implemented full live-locale duplicate traversal before AI review and again
  before metadata changes. Duplicate evidence is checkpointed for reproducible
  model replay. Automatic writes are serialized by locale during the final peer
  check; the item snapshot is refreshed after traversal. Blank metadata and the
  same article/other language are excluded. Incomplete API traversal fails closed.
- Fresh `npm ci --ignore-scripts --no-audit --no-fund` completed in this worktree
  against its exact package lock. Install scripts were inspected and not executed.
  `npm run build` passed including security config, TypeScript and route generation
  on Node 22. All 509 selected SEO + Liv/CMS tests passed on this fresh runtime.
- Authoritative Vercel readback: project Node 22.x, current production
  `dpl_BnvZRsvX79rHDsEfYgaiegTiQ2tF`, READY at
  `17e0c6f9ddab445f12cf64dc1287d433c2fac1cf`. That commit is merged in this branch.
  SEO has not been deployed. Visual/runtime service verification is next.
- Live service probes with existing production credentials succeeded: Firestore
  settings readable and autoOpportunityOptEnabled=true; live DA CMS reports 210
  items and the first article's staged/live data match; GA4 returns 3296 pageviews
  and 611 engaged sessions for the requested last-28-days report; GSC returns
  actual page impressions for 2026-08-13 through 2026-09-09. No CMS write occurred.
- Vercel's sensitive INTERNAL_API_SECRET is present but cannot be exported through
  the environment API. Existing server configuration is preserved; production
  worker verification can use the authenticated cron recovery path. Credentials
  were held only in process memory, never stored or printed.
- Isolated browser test of the actual MetadataQualityPanel with compiled project
  CSS passed at 390px and 1280px: no horizontal overflow or page errors, per-field
  lock reflected the mocked API acknowledgement, failed history read showed its
  error. Used the already installed Chrome via locked Playwright; agent-browser
  CLI was unavailable. This fixture proves UI behavior, not authenticated production
  access. Screenshots are in ignored tmp/seo-release/{mobile,desktop}.png.
- Replaced technical status identifiers with Danish explanations in the panel.

## Required work before claiming completion

1. Connect the reviewer to existing authenticated OpenAI server configuration.
   Persist requests/responses and independent verification by stable job stage;
   resume saved results without regenerating completed paid stages.
2. Durable job and per-item/locale state: atomic deduplication, leases, bounded
   retry/recovery, content version, audit history, locks and cooldown. A metadata
   update's own publish event must not create an endless rewrite loop.
3. Integrate the shared publish hook and authenticated Webflow publication
   webhook. Supplement missed delivery with paginated published-item discovery,
   including articles absent from GSC. Never publish a draft locale.
4. CMS adapter must compare live/staged snapshots, respect existing shared CMS
   write leases, patch only SEO fields, verify exact CMS readback, publish the
   correct locale and verify public HTML metadata. Reconcile uncertain writes
   before retrying. Do not release unrelated staged editorial changes.
5. Integrate GSC/GA4 evidence and existing opportunity schedules into the same
   metadata ownership/lock/cooldown system. Require meaningful samples and
   comparable periods; do not attribute search changes to SEO alone. New articles
   receive immediate content-based quality review without fabricated traffic.
6. Cross-site uniqueness check using real current metadata; expose status,
   before/after, reason, evidence, errors and per-field editorial locks in SEO UI.
   Preserve headline, body, slug, ratings, media, dates and design.
7. Expand tests to API authorization, duplicate delivery, retry after uncertain
   writes, concurrent editorial edits, DA/EN, Webflow/Liv/Writer coverage, missing
   analytics, and published readback. Run relevant existing SEO regressions,
   typecheck and build against verified dependencies.
8. Coordinate current release with Liv; deploy exact combined commit and verify
   deployment SHA, credentials/connections, webhook and schedules plus affected
   production flow. Report failures honestly; ready deployment alone is not proof.

Production changes remain unimplemented. The goal is active and is not reduced
to these two tested modules. Instagram stays off. Existing user authorization
covers necessary implementation and deployment; no new per-commit approval.
