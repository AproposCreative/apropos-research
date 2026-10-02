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

Deployment and authenticated production readback: pending at commit time.
