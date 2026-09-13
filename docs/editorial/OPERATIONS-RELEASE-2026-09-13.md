# Owner operations release

Candidate: `89b7d8f61ac23043fc1bc67d099fa5292024121a`.
Deployment: `dpl_EQwssZi5qG23yvBfBjUhVHUPbyWu`.

## Scope and local evidence

The existing Liv gear-menu operations panel now includes the next eligible story and current alarm status, plus paginated historical alarms. No new dashboard, model calls, publication operation or automatic email resend was introduced. The operations and history routes enforce owner access directly, independently of middleware.

- 3,334 tests across 225 files passed; production build and TypeScript passed.
- Nine existing file-tracing build warnings remain.
- Real component fixture, fake authentication/fetch only: initial history, older page, new-page error and retry back to newest worked. The older ambiguous record remained labeled as requiring reconciliation.
- Mobile 390×844 screenshot inspected; no horizontal overflow or uncaught errors. Prior desktop component inspection remains applicable to layout; full live application rendering is separate acceptance.
- All fixture requests were GETs to operations/history. Browser and fixture server closed after testing.
- Push succeeded without force or overwriting concurrent commits.

## Limits

Provider acceptance is not inbox delivery. A real failure/resolution mail sequence, colleague account acceptance, remaining workspace/media/revision work, invoice reconciliation and seven actual daily publications are still separate open requirements. This release does not complete the full project goal.

## Production result and unresolved dependency

- Deployment reached READY with exact candidate SHA and production alias `ai.aproposmagazine.com`.
- Authenticated workspace, versions, shares, sources, tips, feed and operations returned 200 with private/no-store caching. Feed still has three stories and preparation enabled. Operations Liv/current-alert sections are available.
- `/api/editorial/operations/alerts` returned 503. A read-only query reproduced Firestore `FAILED_PRECONDITION` requiring a collection-scope `__name__ DESCENDING` index for `livDeliveryAlerts`.
- The required index is now declared in `firestore.indexes.json`. Index list succeeded, but creation through the existing application service account returned HTTP 403 `PERMISSION_DENIED`. No IAM changes were attempted and no index operation was created.
- An authorized Google Cloud administrator must create that declared index, then the same history endpoint needs verification. READY alone is not acceptance; historical browsing remains unavailable in production. The verifier now checks this dependency explicitly.
