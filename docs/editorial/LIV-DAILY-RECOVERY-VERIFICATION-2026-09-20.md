# Liv recovery: production verification

## Release

- Branch: `codex/liv-daily-recovery`.
- Production SHA: `4293eaf627a97ff85be490ac9a4ed07f44e06d1d`.
- Vercel deployment: `dpl_9DoYixZVeNLx26anUBF4fvLxoSXW`, READY, alias `ai.aproposmagazine.com` verified September 20, 2026.
- Preceding implementation releases: `724e46c`, `762bc3f`, `fc23389`, `1d661fc`.
- Local verification: 2,539 tests / 101 files passed with isolated test storage and blocked real AI transport; TypeScript, scoped ESLint, production build and diff whitespace check passed.

## Observed root causes

1. Legacy terminal preparation states and attempt counters prevented saved work from progressing and left subsequent dates blocked.
2. The database used by the server contained no usable recent topic seeds. Legacy file ingestion was not updating that database.
3. The old targeted-revision code still forbade a new second correction even after the daily policy allowed two.
4. No-topic lookups were incorrectly consuming candidate opportunities even though no article had been bought. They now recheck the refreshed bank every 15 minutes on the same identity.
5. Completed source-review responses with invalid evidence were being conflated with unknown provider outcomes. Both remain blocked; only a completed, archived response can enter the existing single durable originality correction. An uncertain provider outcome never grants a repeat purchase.

## Production checks

- Authenticated source-refresh API fetched and stored 10 articles in 13.8 seconds, without AI calls, failures or pruning. The trending API subsequently exposed 10 sources satisfying the seven-day freshness policy (previously zero).
- A replay returned `already_refreshed_or_running`; unauthenticated source-refresh/preparation/publication requests returned 401 at the perimeter.
- Authenticated owner feed and operations APIs returned 200, with preparation and auto-publication enabled and reserve target zero.
- The saved September 20 Oasis article resumed through the application API. Two bounded corrections were preserved. The final source verification still failed, including a quote not found in its source. It was **not published**, and the original work was not discarded.
- After 20:00 Copenhagen time, the publication API returned `after_deadline`. The day's final failure email was accepted by the mail provider; acceptance is not proof of inbox delivery.
- Vercel invoked preparation automatically at 18:00:22 UTC (20:00 local) on release `fc23389`. September 21's previously stuck no-topic record progressed into research and writing. A simultaneous verification request returned `already_preparing`, preventing duplicate generation.
- That first September 21 candidate (Christopher's planned concert) then failed source-dependence validation. On `1d661fc`, its saved writing was resumed through the authenticated retry API for one durable originality correction. It still failed and was not granted publication approval. No further originality correction was granted.
- The separately identified September 21 alternative is the Ed Sheeran story. The authenticated retry API reused saved original writing run `5b2bacbe-e6ac-438a-8727-e797a5fedf2f`, with request ID `daily-recovery-20260920-sheeran-v1`. One durable originality correction returned `text_prepared` at 18:23 UTC.
- Its initial media check rejected one inaccurate alt description at 18:25 UTC, while describing the three images as distinct, relevant, coherent and without defects. All original pixels and media stages remained saved. Release `4293eaf` adds a single persisted description-only correction and independent review, without image regeneration. The API retry `daily-recovery-20260920-sheeran-label-v1` returned `media_prepared`. The correction and independent approval completed at 18:33:07 and 18:33:13 UTC; all three original image-call timestamps and content hashes remained unchanged.
- Final preparation returned a verified queued draft at 18:35 UTC: `6ab0275fb063e14a30dc2ae1`, title **Ed Sheeran om Israel og Palæstina efter Macklemores fjernelse fra turnéen**. Body: 544 words excluding captions. Five research sources, 23 checked factual claims, source-similarity/moderation/factcheck/voice passed. Hero and two distinct body assets, CMS fields, author and topic references passed Danish CMS readback. This was operator-resumed server/API preparation, not proof of fully automatic publication.
- The editorial review noted a truncated SEO title. The existing authenticated presentation API performed a scoped agent copyedit, request `daily-recovery-20260920-sheeran-seo-v1`, preserving prose, pictures and original verification evidence. SEO title: **Ed Sheeran og Macklemore: En turné i politisk konflikt**. Receipt `4ca3e553685a78a0fc58ea84ac83676dc46edd13b8c4dc3f206874cd2a609179` confirmed `presentation_staged`, `publicationReady: true`, no blockers, and `publicationVerified: false` at 18:37:20 UTC. The general smart SEO generator still uses word-boundary truncation; this copyedit is not evidence that semantic title shortening is solved for every future article.
- At 18:38:19 UTC the authenticated owner feed returned 200 with exactly one `ready` story, scheduled for September 21, and both preparation and auto-publication enabled. Payload hash: `4fef0b1a246966008787341436cccf7c25971413d0e9b1b48aac474a4501f10d`. Manifest showed no publication blockers and no selected/published September 21 slot. Publisher returned `after_deadline` for September 20.
- Tracked shared-budget snapshot: DKK 70.349968 usage-based upper estimate, zero reserved and unknown calls, DKK 229.650032 available from the configured DKK 300 limit. This is partial tracked usage since activation, **not a provider invoice or proof that all historical monthly spending is covered**. Regression tests made no real AI calls; production preparation/recovery did.

## Remaining acceptance

No new live publication has yet been proved by these checks. A verified draft is now ready for September 21's automatic window starting at 10:00 Copenhagen time. A successful deployment, source refresh and draft are not equivalent to end-to-end publication. September 20 remained without a new publication; do not backdate or bypass the cutoff.

The existing daily after-check is active at 10:20 Copenhagen time and now checks three consecutive actual automatic publication days, including late publication on the previous day. Vercel drives publication independently of that local after-check. Preserve the 20:00 cutoff, one alternative, budget limits, all paid receipts and CMS readback.
