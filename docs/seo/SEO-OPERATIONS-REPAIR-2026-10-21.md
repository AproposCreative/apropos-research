# SEO operations repair — 21 October 2026

## Result

Today's existing batch is now **completed with operator assistance**, within its
original three-claim/two-task limit. It contains one kept article with its original
public receipt and eleven checked candidates. No SEO metadata or article content
was changed during this repair. The saved schedule prompt correction still needs
verification on its next natural run; this assisted completion is not unattended
evidence.

No new request ID, review proposal, apply call, paid model call, budget change,
CMS write, deployment or historical reset was made. The coordinating task
explicitly approved at most two further claims after read-only evidence established
that only one claim had been used today.

## Runtime and release evidence

Read-only production inspection used the existing `scripts/liv-production-access.ts`
helper and approved Vercel CLI authentication. Only the three Firebase environment
values required for Firestore reads were loaded in process. No credentials were
printed, written into files or copied into this report.

At `2026-10-21T16:44:28.947Z`, Vercel's canonical alias API resolved
`ai.aproposmagazine.com` to READY production deployment
`dpl_Acffqqbkathf2uLT99AsG3297XLL`. Its deployment metadata reports source
`695261e756b1072525db49df77e0fef74a8565d2`, branch
`codex/image-preflight-v30`, and `gitDirty=1`. The dirty flag means the source SHA
alone is not a clean-tree attestation. SEO code paths in the audit checkout were
identical to this SHA. A newer local accreditation commit `e5e7d6ab` was observed
in the production writer's separate worktree; this task did not deploy or replace
that concurrent work.

Audit checkout baseline: `edb4bf9acc56c3307a1325a9e8b2face47462e54`.
The public website and the application are distinct deployment surfaces. No old
`main` checkout was used as a release candidate.

## First unmet condition and diagnosis

The existing cloud result for 21 October reported one kept article and stopped
after `article_changed` despite `hasMore=true`. No newer natural SEO result was
visible among the latest 25 app threads. Direct read-only Firestore inspection
provided stronger, current batch evidence:

- Request: `apropos-seo-2026-10-21`; parsed arguments are exactly
  `{ requestId: "apropos-seo-2026-10-21", limit: 2, locale: "da" }`, no article ID.
  The parsed input hash matched the saved batch before any continuation.
- Batch: `chat-0514a931ab4a37c214313c4d5a028147222bf60b1aafb71d57b8d64b68cb8efd`.
- Created `07:01:22.345Z`; last progress `07:01:29.890Z` before repair.
- Eleven candidate identities, four checked, one claimed/kept task, seven remaining.
- Queue scan was complete, not partial. Ten jobs were still active at inspection;
  an active queue row is not necessarily eligible for a new review.
- Saved health at `16:30:34.399Z` reported `scheduled_run_incomplete` for today
  and the preceding day.
- The remaining seven candidates were recovery jobs discovered 6–16 October,
  outside the existing 72-hour automatic recovery window. None was manually
  requested or had a paid review/verification stage in started/responded/uncertain
  state. Their correct outcome was `archive_not_admitted`, unless a fresh CMS
  version check first made one stale. They did not require a new editorial review.
- A complete bounded query of `mcpAudit` found 20 historical claim records and
  exactly one owner claim today, at `07:01:21.821Z`, status `ok`. The batch does
  not itself store a claim-call counter; the operation journal established the
  observed call budget. Journaling is best effort in current code, so a missing
  journal row alone would not prove an invocation never occurred. Here the journal,
  four-row saved cursor and cloud result agreed.

The first unmet condition was batch continuation, not missing model access or a
need to rewrite good metadata. Two existing-request continuations can inspect
the seven remaining rows without exceeding three total calls. No application
patch or deployment was necessary to finish this particular batch.

## Controlled continuation and readback

The current native `get_workflow(seo)` was read before continuation. Each claim
was followed by an independent saved-batch read. No status lookup was attempted
on a skipped candidate, and the kept task was not applied again.

| Invocation | Started UTC | Result | Saved cursor |
| --- | --- | --- | --- |
| Natural cloud claim | 07:01:21.821 | Original one kept task; processing stopped early | 4/11 |
| Assisted continuation 1 | 16:46:39.379 | Four `archive_not_admitted`; original kept task returned unchanged; `hasMore=true` | 8/11 |
| Assisted continuation 2 | 16:47:04.858 | Three `archive_not_admitted`; original kept task returned unchanged; `hasMore=false` | 11/11 |

Final readback at `2026-10-21T16:47:21.534Z` confirmed exactly three successful
claim journal entries today, one unique task, eleven checked candidates and no
batch error. `readSeoChatHealth` returned:

```json
{
  "day": "2026-10-21",
  "status": "completed",
  "completedTasks": 1,
  "editorialAttentionTasks": 0,
  "issues": [],
  "scanPartial": false,
  "timerOriginVerified": false,
  "paidModelCalls": 0,
  "automaticRepairAttempted": false
}
```

This was the read-only health evaluator, not a manual write to the cron health
record. The existing observer will refresh its saved health through its normal
cadence. The previous day's historical incomplete status was preserved.

The single task remains
`72a0f8eccff21c1671593d1a6631230bfe48b6f0f1ca5b2a552656df8773da25`,
status `kept`, reason `no_unlocked_improvement`, `writeStartedAt=null`.
Its public receipt remains exactly `2026-10-21T07:02:15.057Z` for
https://www.aproposmagazine.com/articles/jeg-gik-paa-barsel-og-endte-i-en-religioes-uldsekt.
Returning that saved receipt is not a new public verification or CMS operation.

## Regression coverage and remaining acceptance

Three focused regressions were added to
`test/seo-engine/post-publish/chat.test.ts`:

1. Eleven candidates complete in the same three-call batch while a kept task and
   its receipt are replayed without a duplicate review or CMS write.
2. Two empty pages of stale candidates do not prevent a later eligible task from
   being claimed with the identical request. Skipped IDs remain unowned.
3. Thirteen stale candidates leave `hasMore=true` after three calls and twelve
   inspections. The test does not make a fourth call or substitute another request.

Targeted run: **2 test files / 40 tests passed**, with
`RAGE_STORAGE_DIR=./tmp/vitest-rage`, using existing installed dependencies.
All service effects in those tests were mocked. No application code changed.

The schedule enforces the three-call cap; the server enforces four inspections
per call and at most two tasks. The existing caps were sufficient for today's
eleven candidates, but are not a guarantee for every future batch. The active
queue still includes old recovery/cooldown rows because a skip is not deletion
or historical reset. If repeated natural batches cannot reach eligible work,
prioritize a separate bounded eligibility-selection repair that preserves
paid-stage reconciliation, ownership, archive limits and cooldowns. Do not raise
capacity or remove guards as a substitute.

Next unmet acceptance: observe the existing schedule on its next natural run
(22 October, 09:00 Europe/Copenhagen) and verify full same-request completion,
without operator continuation. The revised prompt is live; natural completion
after that correction and consecutive unattended reliability remain unverified.
