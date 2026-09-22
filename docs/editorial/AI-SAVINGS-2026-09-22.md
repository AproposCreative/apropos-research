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
