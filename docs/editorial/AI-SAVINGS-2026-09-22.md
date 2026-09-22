# AI savings rollout, 22 September 2026

## Contract

Keep daily API-driven publication, independent Liv voice and source/date, originality,
image and CMS checks. Shared 300 DKK/month and image-gen 150 DKK/month remain unchanged.
No downgrade of the editorial assessment model. Instagram remains off.

## Implementation

- Prepare today if missing, tomorrow, and one reserve. Explicit future briefs remain
  saved but no longer trigger speculative production of the whole week. Existing paid
  inventory and delivery dates are retained. `LIV_RESERVE_ENABLED=false` still disables
  replenishment; otherwise the target is one. The existing reserve expiry policy applies.
- Persist scoped research discovery. Same query/options/model and story/content version
  reuse output. Unknown transport outcomes cannot start another purchase. Downstream
  source retrieval and factual validation still run: discovery is not verification.
- Reuse editorial assessments for whitespace only between HTML blocks. Current sources,
  date, voice, model, factual content, attributes, inline whitespace and visual evidence
  remain binding. Revalidate each returned assessment against the current article;
  retain legacy receipt identities and unfinished results.
- SEO reuses full identical model requests across jobs; current CMS change detection,
  hashes and readback remain. A completed shared receipt can recover a competing job
  without a second provider purchase.
- Structural checks precede source supplementation/media/assessment. Length remains in
  the existing combined factual correction rather than buying a separate rewrite.
- A confirmed provider quota rejection pauses subsequent reservations across both cost
  buckets for the configured credential. Ready stories do not require a new reservation
  merely to publish. Owner-only acknowledgement of a billing change permits new calls,
  without a paid probe or ledger reset. Already-stopped jobs retain their status and
  still require their existing supported continuation/recovery path.
- New receipts record purpose (production, editorial-change or development-pilot),
  story/run identity and content version where available. Internal signatures retain
  attribution. Old receipts are not relabelled retroactively. Owner settings show
  per-story/run totals; estimates are not provider invoices.
- Development-pilot attribution has a combined 20 DKK campaign cap, including outstanding
  reservations, nested inside existing monthly budgets. It is server-owned, not a
  request-body override. Test fixtures simulate calls; no paid pilot was started.

## Verification and honest limits

Regression tests cover saved discovery, concurrent calls, unknown outcomes, quota holds,
owner access, revision-checked acknowledgement, pilot reservations, queue preservation,
SEO reuse and editorial layout equivalence/meaningful changes. Twelve layout cases are
synthetic regression cases, NOT a blinded quality evaluation of twelve real articles.

Thirty percent savings is a target, not a measured result. Record seven days of completed
articles before claiming savings: cost per published article, paid assessment/search
calls, repeated request hashes, unknown reservations, publication success and editorial
corrections. Compare similar formats and lengths. Do not reduce factual/rights checks
or generate articles merely to create a measurement sample.

Provider credits were previously exhausted. A deployment alone is not evidence of a
top-up, successful generation, completed weekly articles or verified daily publication.
No spending-policy increase, invoice reconciliation or clearing of unknown reservations.

## Release verification

- Code commits `31bfe0b6a806895cf0291b5546de9fbcca3e5ad0` and
  `4e21dc4b2c0fab444f6f46d456322100d4d1e3ca` pushed without force.
- Final production deployment `dpl_4mZbH941ngzaGVXepf2rTuthmCe4`: READY, exact latter
  SHA, project production target and `ai.aproposmagazine.com` alias verified.
- 4,004 regression tests pass; TypeScript and targeted lint pass. Production build
  passes, including final Vercel build. No paid model calls were triggered by tests.
- Authenticated provider status, cost actions, delivery feed and operations APIs return
  200 with private/no-store headers. Anonymous provider GET/POST return 401 at middleware.
  Delivery dry-run returns `dry_run_no_writes`; queue and auto-publish are enabled,
  pause is off, cron schedules are active. No runtime error records returned in the
  limited post-deploy log scans; this is not a long-term reliability guarantee.
- At approximately 08:04 Copenhagen time, today's Monster review and tomorrow's
  Suno/Spotify feature are ready. Today's slot is not published yet; automatic delivery
  starts at 10:00. These are existing inventory, not five newly completed weekly briefs.
- The ordinary production cron started reserve preparation. New provider receipts at
  06:00–06:01 UTC report HTTP 200 for research/writing and embeddings; the saved reserve
  stage is ready for continuation. This supersedes the old quota error as latest observed
  provider status, without claiming a verified balance or completed reserve.
- Registered shared estimate 100.283712 DKK, image-gen 13.040224 DKK, unresolved reservations
  14.544048 DKK combined. Historical unknown reservations were not cleared.
- Existing daily follow-up updated in place to seven days, without a duplicate monitor
  or extra paid AI calls. Actual savings and consecutive live publications remain to be
  observed; the model was not downgraded.

## Deferred weekly briefs follow-up

- Production deployment `dpl_Acd39is88m1QjfcRkPkLLZw42E3L` is READY at exact code
  SHA `87ca5869cb7de7a0756bd888b633f33864badd23`; production alias verified.
- 4,016 tests, TypeScript, targeted lint and production build pass. Tests use
  isolated storage and simulated provider responses, not paid AI requests.
- Existing authenticated retry operation now supports a deferred plan-only request:
  preparation lease, exact prior plan/run hashes, future date window, immutable
  previous-state audit and replay detection. It does not execute `runLivDaily`.
  Existing paid checkpoints, CMS evidence and competing runs prevent replacement.
- Five briefs registered through this production API and read back successfully:
  Slow Horses 24 September, Toy Story 5 on 25 September, Tokyo Game Show on
  26 September, Amalie Smith on 27 September and Christopher on 28 September.
  Each exact replay returned `already_requested`. Old plans/run history and attempt
  counters are retained. These are deferred briefs, NOT finished articles; factual
  premises and availability must still be verified at production time.
- Today's Monster review and tomorrow's Suno/Spotify feature were not replaced.
- The ordinary cron reserve attempt stopped at `research_dated_sources_insufficient`.
  Its saved article/research remain intact, no blind retry was authorized. Seven
  usage receipts total 395,864 DKK micros (about 0.40 DKK estimated). A completed
  reserve and consecutive successful daily publications remain unproven.

## Source-date recovery, 22 September

- Root cause observed in the downloaded source: KulturPuls publishes ISO timestamps
  with microsecond precision (`2026-09-21T10:26:12.487003+00:00`). The parser wrongly
  rejected more than three fractional digits, marking this actual dated source as
  undated. Now accepts up to nanosecond precision and normalizes to milliseconds;
  malformed dates, impossible calendar dates and future dates remain rejected.
- Code `57363f5d65de73c8ab5691e9cd12df64e8434f5f`, production deployment
  `dpl_EY6XxGSGAm53keDTvwDdxWhCgvcp` READY and production alias verified.
  4,023 tests, TypeScript and targeted lint pass; remote production build passes.
- Existing authenticated retry API resumed `reserve-2026-09-22` once under request
  `reserve-date-parser-20260922-v1`, retaining the previous run in its audit.
  Production checkpoint now has two dated hosts and three prepared images.
  Title, intro and prose (excluding inserted figures) match the prior saved article.
  No replacement research/writing calls were observed during this recovery; media
  estimated usage was 5.100880 DKK. It is not a provider invoice.
- Normal 06:30 UTC cron resumed the yielded checkpoint and completed an editorial
  assessment. Source similarity, moderation, factcheck (30 claims) and voice passed.
  A length correction was saved, then visual description review stopped at
  `liv_fact_revision_media_rejected`: initial review caught body-2 standing/sitting;
  saved description correction fixed body-2, but its follow-up review identified
  the same mismatch in the hero alt. All paid outputs/pixels remain stored.
  Do not rerun the failed revision unchanged or regenerate images to repair labels.
  Reserve readiness remains unproven; the next repair must reuse the saved text
  correction and pixels, change inaccurate descriptions and obtain real approval.

## Bounded description recovery, 22 September

- Code `cbfeba2ba1a11663c7099844a2cd42e54f72f2b6`, production deployment
  `dpl_x3RNUvLaLSo6GCRKQaA9JbGTntxw`: READY, exact SHA and production alias verified.
  4,037 tests pass; TypeScript and targeted lint pass. Tests use simulated providers.
- A second, separately persisted description repair may touch only previously
  untouched image roles. No third correction, pixel regeneration, repeated edit
  of a previously corrected role, or implicit retry of an ambiguous provider call.
  Latest visual proof supersedes earlier proof for revision lineage validation.
- API retry `reserve-remaining-description-20260922-v1` returned `facts_revised`.
  Existing text revision and all three image URLs/hashes/credits were retained.
  Initial rejection remains in the revision audit; final independent image review
  passed. Two new correction/review receipts total 0.026656 DKK estimated, not billed.
- Ordinary 06:50 UTC cron picked up the revised checkpoint without another operator
  retry. A fresh editorial assessment is in progress because prose was shortened
  by the previously saved length correction. Do not claim reserve readiness until
  the normal gates and CMS readback finish. Today's and tomorrow's entries remain
  ready, auto-publication enabled; today's 10:00 local publication is not yet due.
- Follow-up at approximately 08:53 local: production delivery feed returns three
  ready items (today, tomorrow, reserve); operations reports reserve target 1/1,
  no blocked items, no reconciliation needed, preparation idle/no work needed.
  Reserve is now `draft` and admitted ready through normal API/CMS-readback flow.
  The earlier reason remains historical on the run, not its current status.
  Recovery receipts total 2.529184 DKK including the fresh editorial assessment
  and two embeddings. Shared registered estimate is 110.643448 DKK; unknown
  reservations were retained. No replacement research, writer or image generation.
  Actual 10:00 publication and seven-day savings evidence remain outstanding.
