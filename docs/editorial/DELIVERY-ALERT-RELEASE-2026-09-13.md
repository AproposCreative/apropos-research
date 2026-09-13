# Delivery alert release, 2026-09-13

## Verified candidate

- Commit: `f246509aefff0ac00c8345bf2e773beb299cd49f`.
- Full isolated regression: 3,315 tests across 223 files passed.
- Production build and TypeScript passed. Nine existing file-tracing warnings remain.
- Push succeeded without force; remote had no additional commits.
- Deployment requested: `dpl_3kcMuiFTgvscJ9AwcwpfDeX3odHe`. Readiness and production acceptance are recorded below when verified.

## Scope

The existing authenticated quarter-hour API check sends Frederik at most one accepted failure notice and one resolution per publication day. The deadline is 10:15 Copenhagen time; definitive current-day preparation failure can alert earlier. Saved continuations and retryable work do not generate premature alarms. There are no extra AI calls or new schedulers.

Immutable payloads, transactional leases and provider idempotency protect uncertain sends. Ambiguity older than 23 hours requires reconciliation instead of resending. Historical resolution is limited to fourteen retained prior slots. Real Firestore concurrency and actual failure-to-resolution mail delivery still require separate acceptance evidence; unit fixtures do not establish those results.

## Pre-release production evidence

- Authenticated access, private workspace, versions, shares, media sources, tips and delivery feed returned HTTP 200 with no-store caching.
- Anonymous workspace, shares, media-source and tip reads returned HTTP 401.
- Queue and preparation enabled; three stories in feed.
- September 13 delivery manifest: published, not overdue, no reconciliation required, no missing days.
- Recorded article: https://www.aproposmagazine.com/articles/the-gentlemen-saeson-2-goer-privilegium-til-et-vaben
- No paid generation, manual CMS writes, password changes or manufactured failure mails during this verification.

## Production acceptance

- Deployment `dpl_3kcMuiFTgvscJ9AwcwpfDeX3odHe` reached READY with exact commit `f246509aefff0ac00c8345bf2e773beb299cd49f` and alias `ai.aproposmagazine.com`.
- Authenticated production `/api/cron/liv-delivery-check` returned success: delivery `published`, day `2026-09-13`, published true, overdue false, alerts `checked`, preparation `idle`.
- This verifies the healthy production branch, not delivery of a real failure/resolution email. No simulated failure was inserted into production.

The broader personal-workspace plan remains active. Owner operations UI, remaining acceptance tests and seven actual daily publications are not established by this release.
