# Savings rollout: seven-day observation journal

Window: 22–28 September 2026 inclusive. Daily read-only control; Vercel, not this local monitor, runs publication. One row per calendar day, regardless of repeated inspections. Pause the existing monitor after seven recorded days and report limitations. Three consecutive **proven automatic** publications remain a separate requirement; do not infer caller identity from a successful HTTP response alone.

## Day 1 of 7 — 22 September 2026

Checked approximately 10:24 Copenhagen (`2026-09-22T08:24:07.921Z`). Authenticated application operations, delivery feed and cost actions returned 200 with private/no-store. No paid AI requests, research, generation, retries, CMS mutations, publication or reservation clearing were performed by this control.

### Publication and queue

- Today's [Monster review](https://www.aproposmagazine.com/articles/anmeldelse-monster-saeson-4-the-lizzie-borden-story) is live. Delivery slot published on one attempt, checked at `08:00:26.495Z` (10:00:26 Copenhagen), CMS item `6ab032d32664b24bb5486830`.
- Independent Webflow live-item GET: 200, `isDraft=false`, `isArchived=false`, `lastPublished=2026-09-22T08:00:23.961Z`. Independent public GET: 200, matching canonical and H1, 3,591 body text characters, two body image elements. This control did not re-evaluate article facts or image content.
- Vercel runtime log: GET `/api/cron/liv-daily-article` at 08:00:12 UTC, HTTP 200, deployment `dpl_Eh8vnjfX4X7EPhTYC7USP7BQvfaF`. Correlates with scheduled publication; no manual publication was started by this control. Neither stored delivery history nor returned logs expose scheduler identity, so mark **scheduled execution corroborated, automatic caller provenance not independently proved**.
- Tomorrow: “Suno v6 og Spotify AI Persona: Hvem står bag musikken?” ready for 23 September.
- Reserve: “Asta Kamma August kritiserer filmbranchens SoMe-pres” ready, target 1/1. Preparation idle because no work is needed; no blocked items, missing days or reconciliation needed. Auto-publish enabled.
- The five later weekly briefs remain pending plans, not completed articles.
- Yesterday's [Ed Sheeran article](https://www.aproposmagazine.com/articles/ed-sheeran-om-israel-og-palaestina-efter-macklemores-fjernelse-fra-turneen) was already delivered at `2026-09-21T08:00:21.900Z`, one attempt. Current CMS live GET and public GET both 200; two body images. Current H1 “Hvad er det lige, der foregår med Ed Sheeran?”. Its CMS `lastPublished` now reflects a subsequent update on 22 September, not original delivery. No delayed 21 September publication remains outstanding.

### Recorded cost estimates, not invoices

| Scope / saved run | Calls | Estimated DKK | Reserved DKK | Research-writing stage calls | Editorial assessments | Repeated request hashes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Today's preparation (`prepare-2026-09-22`) | 14 | 5.693448 | 0 | 2 | 2 | 0 |
| Tomorrow (`prepare-2026-09-23`) | 21 | 11.236416 | 0 | 2 | 3 | 0 |
| Reserve (`reserve-2026-09-22`) | 25 | 10.617464 | 0 | 3 | 2 | 0 |

These are recorded run totals, not exact all-in article costs or all generated today. The “research-writing” stage combines discovery/writing and is not a count of web-search tool calls. Embeddings, media checks, corrections and other stages explain additional calls. Distinct requests for revised text are not counted as duplicate hashes. Today's article and tomorrow's article were existing inventory and cannot alone establish the new policy's production savings. Post-publication translation/SEO/image-inspection calls exist under separate run IDs; without a reliable article join they are not silently added to a particular article.

Monthly tracked totals at inspection:

- Shared: 700 calls, estimated **111.012544 DKK**, reserved **14.517616 DKK**, 14 unknown calls, one repeated request hash within the existing grouped metric.
- Image-gen: 35 calls, estimated **13.102304 DKK**, reserved **0.026432 DKK**, one unknown call, no grouped repeats.
- Combined: estimated **124.114848 DKK**, unresolved reservations **14.544048 DKK**, 15 unknown calls. Reservations were preserved. Historical untracked costs and invoices are not included.
- Available tracked shared allowance: 174.469840 DKK of 300; this is not provider credit balance. Image-gen retains its separate budget.

### Remaining evidence gaps and warnings

- Seven-day savings and 30% target: **not demonstrated**, six further daily observations required and comparable format/length baseline still needed.
- Three consecutive proven automatic days: **not demonstrated**; current evidence proves live delivery, not authenticated scheduler identity.
- The 22 September cron log still emits PassThrough error/close `MaxListenersExceededWarning` despite HTTP 200 and successful delivery. This is a persisting warning, not proof of a memory leak or publication failure; do not hide it by increasing listener limits.
- The bounded 21 September runtime-log query failed with `ExceedsBillingLimitError`. This is Vercel log access failure, not absent execution logs or OpenAI quota evidence. No repeated log query or billing change was made.
- All findings are observational; no production code/configuration was changed by this scheduled check.

## Day 2 of 7 — 23 September 2026

Readback at `2026-09-23T08:45:16.031Z` (10:45 Copenhagen). Existing Vercel CLI credentials initially expired; installed CLI `whoami` refreshed the existing session successfully. This was a monitoring-authentication issue, not publication downtime. Application operations, cost actions and delivery feed returned 200/private/no-store. No paid work, retries, CMS mutation, publication or reservation reset was triggered by this check. Instagram configuration was not changed.

### Publication evidence

- [Suno v6 og Spotify AI Persona: Hvem står bag musikken?](https://www.aproposmagazine.com/articles/suno-v6-og-spotify-ai-persona-hvem-star-bag-musikken) published on one delivery attempt, verified at `08:00:19.856Z` (10:00:19), item `6ab0332b02373e747b956f72`.
- Independent live CMS GET: 200, draft/archive false, `lastPublished=2026-09-23T08:00:50.260Z` (later than original delivery receipt). Public GET 200, matching canonical/H1, 4,098 body characters and two body image elements. This is availability/markup verification, not renewed factual review.
- Runtime log: GET daily cron at `08:00:12Z`, HTTP 200, deployment `dpl_4rYiTFuQc3v2NfUckVmkQH7LJr77` / `08159a716f75d015a398138e6bf4fec952324a6c`. Schedule correlation supports automatic operation, but caller/scheduler identity is still absent in the inspected receipts. No manual publication was initiated by this control. Three consecutive independently proven automatic days remain unestablished.
- Yesterday's Monster remains live: CMS/public GET 200, two body images. Its H1/body have subsequently changed; latest CMS publication `2026-09-22T09:33:26.445Z` is an update, not evidence of a missed original slot. No outstanding delayed publication from yesterday.

### Regression: tomorrow's dedicated preparation blocked

- Operations: today's delivery healthy; auto-publish enabled; missing dedicated day `2026-09-24`, no reconciliation needed. Preparation `blocked_saved_work`, `alternative_limit_reached`.
- Slow Horses plan failed with `article_evidence_insufficient`: insufficient research foundation, no article checkpoint.
- Alternative failed with `source_similarity_unapproved`, source `eilish.dk`; no article checkpoint. This is a saved rejection, not approval to publish copied prose. No failure or audit evidence was cleared and no blind retry made.
- One ready reserve remains: “Asta Kamma August kritiserer filmbranchens SoMe-pres”, expires 27 September. Operations lists this as next story. There is therefore fallback stock, not a guarantee of tomorrow's successful publication.
- Recommended follow-up: review the unsupported brief and rejected alternative through the existing editorial API workflow; do not regenerate solely for monitoring. Future Toy Story/TGS/Amalie Smith/Christopher briefs remain pending plans.

### Estimates and call counts

| Run | Calls | Estimated DKK | Research-writing calls | Editorial assessment calls | Repeated hashes | Unknown reservations |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Today's Suno preparation | 21 | 11.236416 | 2 | 3 | 0 | 0 |
| Tomorrow's failed primary | 3 | 1.404968 | 3 | 0 | 0 | 0 |
| Tomorrow's failed alternative | 12 | 1.513256 | 3 | 0 | 0 | 0 |
| Existing reserve | 25 | 10.617464 | 3 | 2 | 0 | 0 |

Alternative additionally has one originality call (1.199360 DKK), two source-similarity calls (0.052992 DKK), six embeddings (0.000776 DKK). Failed primary plus alternative total 2.918224 DKK. These stage/run totals are not invoices, exact web-search-tool counts, or all-in article costs; downstream translation/SEO/image checks have separate identities. Today's published article is paid inventory from before the savings rollout, so do not claim a savings effect from its cost.

- Shared monthly tracked: 743 calls, estimate **115.789160 DKK**, reserved **16.385616 DKK**, 15 unknown calls, one grouped repeated hash.
- Image-gen: 36 calls, estimate **13.113776 DKK**, reserved **0.026432 DKK**, one unknown call, no grouped repeats.
- Combined: 779 calls, estimate **128.902936 DKK**, reserved **16.412048 DKK**, 16 unknown calls. Since Day 1 snapshot: +44 calls, +4.788088 DKK estimated and +1.868000 DKK reserved. This interval includes other platform use, not only Liv or a calendar day. New retained reservation appears under Writer editorial-search; not silently assigned to today's article.
- Existing monitor remains active: 2/7 recorded days. Five observations and a comparable baseline remain; 30% savings not demonstrated.
- PassThrough listener warnings persist in today's successful cron log. No new failure is inferred from the warning alone.

## Day 3 of 7 — 24 September 2026

Readback at `2026-09-24T08:36:31.009Z` (10:36 Copenhagen). Existing CLI session refreshed via `whoami`. Authenticated operations, cost actions and delivery feed returned 200/private/no-store. This control made no paid AI calls, retries, CMS writes, publications, reservation changes or Instagram changes.

### Publication and regression

- [Asta Kamma August kritiserer filmbranchens SoMe-pres](https://www.aproposmagazine.com/articles/asta-kamma-august-kritiserer-filmbranchens-some-pres) is live, using the existing reserve. One delivery attempt, verified `08:00:19.614Z`, CMS item `6ab225a3a347a5d0ff388f06`. Independent live CMS GET 200, draft/archive false, lastPublished `08:00:48.810Z`. Public GET 200, matching H1/canonical, 4,033 body characters and two body image elements. No renewed content/rights assessment was performed.
- Runtime log: GET daily cron `08:00:12Z`, HTTP 200, deployment `dpl_4rYiTFuQc3v2NfUckVmkQH7LJr77`, SHA `08159a716f75d015a398138e6bf4fec952324a6c`. PassThrough listener warnings persist. Publication correlates with the schedule; caller identity is still not independently evidenced. Three consecutive live days are verified, but the stronger automatic-provenance requirement remains open.
- Yesterday's Suno remains live: CMS/public 200, two body images, H1 now “Hvem har egentlig lavet den her sang?”, 6,427 body characters. CMS lastPublished `2026-09-23T09:12:00.580Z` is a later update. No overdue publication from yesterday.
- **Tomorrow is not covered.** Feed contains zero ready stories; reserve 0/1, nextStory null, missing day 25 September. Auto-publish remains enabled, but preparation is `blocked_saved_work` / `alternative_limit_reached`.
- Primary Toy Story preparation failed `article_evidence_insufficient`, no checkpoint. Alternative failed `source_similarity_incomplete` for soundvenue.com, no checkpoint. This is an incomplete check, explicitly not a finding of plagiarism. Saved failures were preserved.
- User-supplied Partybus review remains a local editorial package, not a scheduled CMS article; it did not become today's delivery. Pending TGS/Amalie/Christopher plans are not ready inventory. Follow-up requires the application editorial workflow; monitoring did not import or regenerate articles.

### Recorded estimates, not invoices

| Run | Calls | Estimated DKK | Research-writing calls | Editorial assessments | Repeated hashes | Unknown calls |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Published reserve (22 September preparation) | 25 | 10.617464 | 3 | 2 | 0 | 0 |
| Failed 25 September primary | 3 | 1.469576 | 3 | 0 | 0 | 0 |
| Failed 25 September alternative | 8 | 1.464216 | 3 | 0 | 0 | 0 |

Tomorrow's failed work totals 2.933792 DKK. Alternative also includes one originality call (1.169680), one similarity call (0.024096), three embeddings (0.000480). No cost records under `reserve-2026-09-24` or `daily-2026-09-24`; this does not mean today's publication was free: inventory was paid previously and translation/SEO/media-inspection use separate run IDs.

- Shared monthly: 783 calls, estimate **119.883392 DKK**, reserved **16.385616 DKK**, 15 unknown calls, one grouped repeated request hash.
- Image-gen monthly: 55 calls, estimate **16.642680 DKK**, reserved **0.026432 DKK**, one unknown call, no grouped repeats.
- Combined: 838 calls, estimate **136.526072 DKK**, reserved **16.412048 DKK**, 16 unknown calls. Since Day 2 snapshot: +59 calls and +7.623136 DKK estimated, reservations unchanged. These are platform-wide interval totals, not daily Liv invoice amounts. Shared allowance remaining 163.730992 DKK is not provider credit balance.
- Observation 3/7 recorded; monitor remains active. Four daily observations and a comparable baseline remain. The 30% savings hypothesis is not demonstrated.
