# Owner operations release

## September 14 date-field repair (released and verified)

Release `373c3e7d4bcc255f3b44082d9453d04646bda181`, deployment
`dpl_6QYckLEX1HxWsW9t2ev5TijA8Bez`, reached READY with exact production alias.
The enhanced verifier passed: historical alert schema coverage and API response
match, history now returns 200 private/no-store, anonymous history access 401.
Workspace, versions, historical shares, sources, tips, budget, feed and operations
all returned 200; three stories and preparation remain enabled. New shares return
410. Error/fatal grouped runtime scan for this deployment over 15 minutes returned
no entries (limited observation, not proof of all future behavior).

No mail was sent, no verification flag/IAM changed, and no model/CMS call was made
by this repair verification. The Cloud Shell authorization request for the index
is obsolete; no grant is needed. Actual future alert delivery and populated
historical pagination remain distinct from empty-collection live acceptance.

The earlier manual-index requirement is being removed, not bypassed with broader
permissions. Live read-only diagnosis at approximately 07:40 UTC found zero
`livDeliveryAlerts` records and confirmed `orderBy('day', 'desc')` succeeds.
New alert transactions now save the canonical day alongside the unchanged notices;
history paginates on this ordinary automatically indexed field and rejects a
day/document-ID mismatch. No notices or provider receipts are erased or resent.

The release verifier independently enumerates day fields before checking the API,
so missing-field records cannot silently appear to be a successful empty history.
It fails explicitly if data needs migration. No historical migration was necessary
at diagnosis (zero records); this prerequisite must be rechecked after deployment.

24 focused tests and 3,697 full-suite tests pass; production build passed. The
obsolete local manual-index declaration was removed; no deployed index or IAM
policy was changed. Exact release and production history acceptance passed above.
No OAuth grant has been accepted.

Reference: https://firebase.google.com/docs/firestore/query-data/index-overview
(automatic single-field indexes). The prior __name__ query failure is documented
below as historical evidence, not the current proposed implementation.

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

## September 14 follow-up

- At 00:05 UTC production operations/feed returned 200; current day not yet
  published and not overdue, three scheduled stories ready, automatic preparation
  and publication enabled. History still returned 503. The direct query still
  reports FAILED_PRECONDITION for the exact declared one-field descending index.
- Existing Google Cloud browser identity can inspect project indexes. No
  `livDeliveryAlerts` manual index exists. The ordinary creation form requires
  two fields, so it was cancelled without creating an incorrect index.
- The Firebase-generated create-index link instead reports no access to list
  project apps for that identity. No role changes or alternate identities used.
- Standalone Cloud Shell was provisioned because the embedded terminal could not
  be operated. It is now at **Authorize Cloud Shell**, requesting permission to
  use the account credentials for current and future Google Cloud API calls.
  This grant was not accepted. User confirmation is required for that access
  grant before any index command runs; no index operation has been submitted.
- Frederik remains verified; Casper and Milo remain unverified. No verification
  flags changed, emails sent, new research generated or publication triggered.
