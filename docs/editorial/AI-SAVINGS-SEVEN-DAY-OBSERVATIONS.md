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
