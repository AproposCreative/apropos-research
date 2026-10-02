# AI savings release — 2 October 2026

Owner authorization: “Ja til det hele implementer og deploy”. Scope is the five
accepted cost reductions, not a new publication or permission to clear billing
holds. Alternate-calendar-day publishing, 300-DKK shared / 150-DKK image-gen
budgets, provider hold, saved receipts and Instagram-off remain unchanged.

## Implemented

1. **Compact final assessment.** The same factual units, quotes and editorial
   checks remain mandatory. Verified claims no longer request explanatory prose;
   failed claims receive short concrete explanations. Existing literal-quote,
   coverage, fresh-source, dated-host and visual/colleague evidence validation
   still determines whether a report passes. No smaller model or lower gate.
2. **Caption-only delta assessment.** Reuse only exact unchanged units from a
   validated immutable assessment for the same run and policy/model/voice/day,
   with matching retrieved source contents and image identities. Changed
   descriptions are checked; whole-article editorial judgment still runs.
   Field/prose/source/image changes invalidate reuse. Coverage is revalidated
   after merging; overlapping/missing units fail closed. Legacy paid outputs and
   unknown calls are retained, never repurchased just to migrate format.
3. **Press material before illustrations.** For new default illustration jobs,
   inspect already-researched official pages first. Reuse credits and bounded
   public image retrieval, no additional AI research. Prefer relevant text-free
   photographs to posters requiring cleanup. Saved paid media and explicit
   choices win. Three distinct validated images (hero + two body) remain required;
   unknown rights are not labelled approved. Visual selection/validation remain.
4. **Manual archive SEO.** Recovery discovery admits only CMS publications from
   the last 72 hours; at most one new recovery review per Copenhagen day. Actual
   publish/webhook events remain supported. Daily and weekly opportunity cron
   only collect analytics, not AI optimization. Old unpaid recovery/performance
   jobs require manual opt-in; paid/uncertain stages and pending CMS writes retain
   reconciliation. No historical rows or reservations are deleted. Existing
   manual scan with `mode=optimize, autoApply=true` remains available.
5. **Cost and result together.** The owner-only cost API joins explicit Liv
   run→CMS identities with durable publication receipts, including archived
   receipts. It never treats a plan, enabled flag or paid call as a finished
   article. The settings UI shows titles, ready/published/unfinished status,
   stage costs, failed work and unknown reservations, with month selection.
   Unattributed runs remain separate; month estimates are not lifetime costs or
   provider invoices. `billedDkk` remains null. No inference by similar title/date.

## Verification before deployment

- 316 files / 4,383 isolated Vitest tests pass with
  `RAGE_STORAGE_DIR=./tmp/vitest-rage`.
- TypeScript, focused production-code ESLint and diff whitespace checks pass.
- New tests cover compact/invalid evidence, caption-delta plus durable replay,
  changed sources/prose/images, press-first/saved-image/explicit-choice behavior,
  manual archive admission, old admissions, uncertain stages, cron collection,
  owner-only route access, receipt-based costs and preservation of all totals.
- All AI responses in regression are simulated. No paid test generation,
  research, publication or image-cleaning call was made for this release.

## Limits

No measured percentage saving is claimed. This release changes future work; it
does not refund historical provider charges. Genuine provider recovery and a
normal subsequent production run are needed to measure output-token and image
cost effects. A successful deployment is not evidence that Liv's unattended
delivery objective or editorial human calibration is complete.

## Deployment and production readback

- Production code commit: `0f5c2d43828b50266001fa5ee966712710628b67`.
- Deployment: `dpl_CPTdUXEAbrMGYaUxpC9fyCQaDKPT`, READY, with
  `ai.aproposmagazine.com` as the verified production alias.
- Authenticated owner API readback completed 2 October at 13:16 Copenhagen.
  `/api/ai-cost/actions` for September and October returns savings policy
  `2026-10-02-v1`. The new projection found 14 distinct published articles with
  durable receipts. This does not certify unassisted preparation or add new
  publications. No fresh CMS article publication was attempted.
- Stage/run totals exactly match projected story totals to the stored micro-DKK:
  September shared 1,000 calls / 194.300336 DKK estimated / 29.357368 reserved;
  image-gen 105 calls / 18.821936 estimated / 0.026432 reserved. No invoice value
  was manufactured. Example: Partybus has 5.241448 estimated and 12.088160
  unresolved reservation, shown separately rather than pretending the latter is
  spent or refunded.
- October remains one shared call, 0 DKK usage-estimate and 1.214400 reserved.
  Budget readback is identical before/after verification. Provider hold remains
  blocked, revision 5. No holds, limits, paid jobs or reservation history changed.
- Production operations still reports interval 2. The seven-day feed has
  3/5/7 October as `off_day`; 2 October is blocked, 4/6 planned, 8 unplanned.
  The delivery goal remains unmet. This release is not a repaired credit balance.
- Unauthenticated production requests are rejected with HTTP 401 by middleware;
  unit route tests also verify owner-only HTTP 403. The first readback script
  expected 403 rather than middleware's 401; only that test expectation changed.
  Authorized calls returned HTTP 200 throughout. No authentication was weakened.
- Scoped runtime error/fatal query returned no entries after rollout. Cost-API
  runtime logs show successful authenticated calls and expected 401 denials.
  This is a short rollout check, not proof of long-term unattended operation.

UI response contracts are type/regression tested; production verification here
is API-only, not a new visual browser test. AI-provider effects are simulated,
not demonstrated by a paid test or a claimed measured saving.
