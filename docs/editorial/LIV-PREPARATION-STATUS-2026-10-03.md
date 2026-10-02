# Preparation status repair — 3 October 2026

## Verified incident

Authenticated production reads at 00:26 Copenhagen (2 October 22:26 UTC)
disagreed: operations advertised `preparing/source_retry_scheduled` for 4 October,
the week said "Liv arbejder på historien", and the same feed's effective
preparation status was `blocked_saved_work/provider_quota_exhausted`.
The provider hold is still blocked, revision 5. It is persisted failure evidence,
not a new numeric balance check. No new AI request was made.

The 2 October due date is now a **missed scheduled publication**, not just delayed.
There is no delivery slot or daily publication history. Independent live-CMS
pagination at 00:27 scanned 227/227 Danish articles with none published or dated
since 2 October began. Latest known Liv is still Artigeardit, 29 September:
`6ab8eafeba2f51d17fc87b36`; public HTTP 200, matching title/canonical and two body
images were reconfirmed. Today, 3 October, is an intentional off day. No completed
4 October story or separate reserve exists. Stored plans are not ready articles.

Vercel runtime 00:00–00:20 shows server preparation/delivery invocations; source
lookups for 4 October return `no_topic`. This is not active writing or publication.
The narrowly scoped 2 October 19:55–20:06 historical log query timed out, so it
adds no evidence either for or against execution at the final deadline.

## Repair

- Centralize the provider-hold overlay in the read-only next-preparation status
  shared by operations, feed and delivery-health consumers.
- A scheduled source-bank retry is queued, not active article writing.
- Pass that same effective status to the seven-day view. The affected unfinished
  date is blocked; ready/published/off-day rows, other dates and reserves are not
  relabelled or removed.
- If hold lookup fails, expose unknown status, not healthy preparation. Existing
  CMS reconciliation and idle inventory retain their own status.
- No worker admission, retry budget, provider hold, saved job, plan, reservation,
  CMS item, cadence or publication authority changes. No paid probe or test.

## Local verification

316 test files / 4,389 isolated tests pass with `RAGE_STORAGE_DIR=./tmp/vitest-rage`.
TypeScript, focused ESLint, safe build configuration and whitespace checks pass.
Tests cover waiting versus active work, provider hold/unavailable status, unchanged
saved rows, reconciliation/idle exceptions, week preservation and authenticated
feed integration. All model responses are simulated.

Pre-repair production was `0f5c2d43828b50266001fa5ee966712710628b67`, deployment
`dpl_CPTdUXEAbrMGYaUxpC9fyCQaDKPT`, READY with production alias. The 2 October
cost-saving policies remain present; this repair is not a savings measurement.
October remains one shared call, 0 DKK usage-based estimate, 1.214400 DKK reserved
and one unknown; image-gen has zero calls. No invoice balance was read.

## Deployed and verified production readback

Code `452f45b46948e340ddf665221199459fc43c331b` was pushed and deployed as
`dpl_FSQ7tvZAixSEvwbFJAd9P3QTPbva`. READY with the actual
`ai.aproposmagazine.com` production alias, no alias error. Build duration was
approximately 77 seconds. No environment or provider configuration was changed.

At `2026-10-02T22:35:39Z` (3 October 00:35 Copenhagen), authenticated operations
and delivery feed both report 4 October `blocked_saved_work`,
`provider_quota_exhausted`, no next attempt, and the week correctly marks it
`blocked`. Days 3/5/7/9 remain off; 6 is planned and 8 unplanned. Zero ready
stories/reserves. Savings policy `2026-10-02-v1` remains present. Budget data
before and after the readback are identical (one call, zero usage estimate,
1.214400 DKK reserved), provider hold still revision 5. No billed balance inferred.

The narrowly scoped new-deployment error/fatal scan, 22:35:00–22:35:37 UTC, found
no matching logs. This short observation is not a long-term reliability proof.
The affected API flow is verified; no browser session, paid test, manual CMS
write or operator-triggered cron was used. Existing recurring checks remain
active; the automation's stale deployment and deadline evidence are refreshed.

## Remaining delivery dependency

The broader goal is not complete. Genuine billing recovery for the production
credential still needs fresh evidence before the existing owner billing-change
acknowledgement and one necessary idempotent, audited saved-work retry. Inspect
current-source/duplicate eligibility and paid receipts before choosing the target.
Do not silently reuse old Dizzy Mizz Lizzy/Fire & Ice plan hints as verified news,
buy a speculative week, clear holds/reservations, or call assisted work automatic.
The cadence remains every other calendar day at 10:00 Copenhagen, anchored
2 October, with one next article, one reserve and three proven unassisted
scheduled publications required for acceptance.
