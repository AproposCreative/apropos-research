# Budget-boundary release, 2026-09-13

- Production: https://ai.aproposmagazine.com
- Commit: f5348310d441b85d5ec3113f42893bec89242376
- Deployment: dpl_8npVTRp7GJZLKdSwHzCuPGy85AJD, READY.
- Non-force push and remote SHA matched; Vercel project production target
  matched this deployment and exact SHA after build completion.
- Full isolated suite: 3,088 tests, 188 files passed without paid model calls.
  TypeScript passed before release; remote production build succeeded.

## Changes

Shared budget boundaries now cover additional editorial checks, design-copy
routes, standalone research verification and standalone image generation.
Headline generation uses one bounded call without invented fallback praise.
Standalone generated images use the existing priced GPT Image model and upload
validated bytes instead of relying on a temporary provider URL.

## Production verification

At 2026-09-13T15:20:40.080Z, authenticated GET /api/editorial/operations
returned 200 with private, no-store. Anonymous GET returned 401.
An authenticated empty-body POST to /api/design-editor/more-clickbait returned
400 at input validation, without paid generation.

- Liv: autoPublishEnabled true, today's published slot true, overdue false;
  blockedItems and missingDays empty; needsReconciliation false.
- Recorded article: https://www.aproposmagazine.com/articles/the-gentlemen-saeson-2-goer-privilegium-til-et-vaben
- Newsletter: 2026-W37, enabled, Friday 13:45 Europe/Copenhagen;
  stored status sent, sentCount 14, failedCount 0. Not inbox delivery proof.
- Budget status available, monthlyLimitDkk 300, fullMonthlyCapVerified false.

Credentials remained in memory. No publication, newsletter send or paid model
call was triggered by these checks. Instagram configuration was not changed.

## Still open

Remaining model-call chains (including thumbnail and import autofill), standalone
paid-image recovery, full role/UI matrix, visual settings checks and seven
consecutive daily publication readbacks. This release is not evidence of a fully
covering monthly cap. Runtime error/drain scan was not recorded.
