# Approved implementation: personal workspaces and reliable editorial operation

## Goal

Build the user's approved September 13 plan. Only the three verified colleagues may enter. Frederik alone has SEO, Podcast, Newsletter, Liv Inbox, Push, budget and Liv publication control. Casper and Milo can see Liv and propose topics. Personal drafts are private even from Frederik until explicitly shared. Keep one API-published article daily, no Instagram, bounded AI spend, saved paid work and audit intact.

## Approved optimization priorities, September 14

The user approved all six recommendations and requested that they be added to
the existing goal after the current work. This is an additive execution phase,
not a replacement or completion claim for the broader goal. Finish and verify
the in-progress personal-source repair first; do not start unrelated new features.

1. **Working media sources:** persist choices, distinguish selection from uptime,
   report actual errors, and verify reload/account isolation plus actual research
   consumption. Source UI repair and Writer policy integration were released in
   `b0b70512d3b57baf1fdbc6fd2ebbb43d5a020df4`. Source API readback passed;
   research policy was verified with mocked providers, not a paid live generation.
   See PERSONAL-MEDIA-SOURCES-2026-09-14.md.
2. **Self-service onboarding:** automatically send first verification after
   allowed account creation, retain explicit resend with durable limits, and
   provide clear failures. Verify Casper and Milo's real login and restricted
   capabilities. Delivered emails alone do not prove completed onboarding.
3. **Proven daily Liv publication:** verify seven actual consecutive daily
   publications, no duplicates, required images/metadata and CMS/live readback.
   Keep the visible operational view limited to today, next story and actionable
   failures. Do not generate extra paid articles merely to simulate seven days.
4. **One working editorial flow:** Mine artikler -> write -> review -> Webflow
   draft. Verify private resume across mobile/desktop and interrupted connections.
   This supersedes the old shared-copy feature requirement: sharing entry points
   were retired in `c32b0db`; retain private autosave/version history and existing
   records, without reintroducing a second collaboration system.
5. **Visible bounded costs:** reuse saved research/assets and resume checkpoints;
   reconcile tracked spending with actual provider billing. Retain the 300 DKK
   tracked budget and inexpensive essential editorial/security/publication checks.
   No blanket retries, extra model checks or fine-tuning jobs to claim quality.
6. **Cleanup after reliability:** remove unused panels/code with dependency and
   regression checks, address known file-tracing build warnings, and resolve the
   alert-history Firestore index through authorized administration. Preserve
   records and audit history; do not widen runtime permissions to bypass denial.

Completion requires evidence for each item and the remaining original scope.
No additional major features before sources, onboarding, daily publication and
private workspaces have been demonstrated to work.

### Daily length alignment, September 14 (released)

- Found an inconsistent legacy minimum in `run-safety-gates`: moderation's
  combined-text count rejected fewer than 500 words before fact diagnostics,
  although the daily canonical body range is 450–650. This could reject valid
  short daily articles and prevent the existing combined fact/length repair.
- The daily runner now explicitly selects the daily length policy. Moderation
  still blocks plagiarism; fact/editorial evidence still runs; canonical body
  counting, the saved correction budget and `checkCmsDraft(..., 'liv-daily')`
  remain responsible for length before CMS admission. Other callers retain
  their existing moderation minimum. No new research loop or retry budget.
- Regression cases cover 449/450/499/650/651 words reaching fact diagnostics,
  while the real CMS preflight still rejects 449/651. Missing fact evidence
  and high plagiarism remain blocking. This fixes policy consistency; it does
  not implement the separate user-facing shortening editor.
- Verification: 211 focused tests and TypeScript passed; full suite 3,539 tests
  across 246 files passed; production build passed. Logs:
  `/tmp/apropos-length-full.log`, `/tmp/apropos-length-build.log`.
- Released `19ce60e4a6989a9014c3306e70b881eb6ed6931c`, deployment
  `dpl_7Bkj7ujyb3h92kKs4wKY5rLy7weM`: READY and current domain alias verified.
  Owner operations API returned 200 at 2026-09-14T01:25:25.032Z: autopublish
  remains enabled, Lucian Freud ready, today's publication not yet recorded,
  not overdue, no blocked items or reconciliation. No real article was generated
  or revised to test this release. The length edge cases are isolated tests,
  not a claim of a production publication with a short article. The initial
  deployment-scoped error/fatal log count scan was empty. Seven existing build
  tracing warnings remain.

### Targeted revision checkpoint, September 14 (historical checkpoints)

- Inspected current operations rather than assuming they can all edit ready
  stories. `editorial-edit` is a constrained checkpoint repair, not a general
  ready-story editor; the cover operation currently requires a selected slot.
  Neither can simply be wired to every upcoming story as-is.
- Added owner-authenticated `POST /api/liv/revisions/presentation`, delegating to
  the existing `reviseLivPresentation` journal, hash conflict checks, CMS lease,
  draft-only mutation and readback. No cron secret reaches the client. Only
  title/SEO presentation input is accepted; body restoration and arbitrary
  fields are rejected. This operation does not publish or generate research.
- Verified 29 tests across the new route and existing revision implementation;
  TypeScript and diff checks passed. Route tests cover anonymous/colleague denial,
  strict input, unchanged request IDs/hashes on retries and sanitized errors.
  Existing operation tests exercise preserved content, journal replay and CMS
  conflicts with isolated dependencies, not production publication.
- Added the owner-only baseline GET API: returns current CMS title/SEO fields
  and server-computed hashes, never body/provider data. Rejects selected,
  rejected, published, conflicting and revision-locked items. It performs no
  writes or AI calls. 48 isolated tests pass across baseline, route and revision.
- Mobile title/SEO form is now connected to ready, non-rejected owner cards.
  Only opening the editor reads a CMS baseline. Unchanged text cannot create a
  revision. A pending body is saved under UID/item-scoped local storage before
  dispatch; retries reuse it and fields remain locked until a verified receipt.
  Account changes unmount the editor and late results cannot update its state.
- Isolated actual-component mobile verification at 390x844 passed: fields fit
  without horizontal overflow; simulated lost response survived reload; retry
  submitted the byte-identical body and cleared pending storage only after the
  receipt; colleague switch removed the editor. No runtime errors observed.
  Fixture: `scripts/verify-liv-presentation-ui.mjs`; 111 relevant tests and
  TypeScript passed. No production CMS mutation or paid AI calls in this check.
- Integrated-feed mobile fixture passed: a title save refreshes the actual card;
  unchanged fields cannot submit; a pre-start conflict can be cancelled through
  owner-only DELETE. Cancellation writes a retained tombstone under the same CMS
  lease and transaction journal, preventing delayed POST from applying it later.
  Started or completed revisions cannot be cancelled. Proposed text is retained
  locally on cancellation. No audit, checkpoint or paid work is removed.
- Released `3e0609221a00dec20c5c7e9e4e862f25fc0cc0de`, deployment
  `dpl_DSx7t5ooSSBeaR4RvcHMHavNZUHZ`, READY with `ai.aproposmagazine.com` alias.
  Full regression: 3,488 tests across 244 files passed; production build passed
  with seven existing tracing warnings. No environment variables changed.
- Real verified-owner baseline GET returned 200/private-no-store for
  `6aa566cf1d63c39af0d73ad2`, “Lucian Freud på Louisiana: Portrætter uden
  forskønnelse”. Payload hash matched the live feed. Anonymous GET/POST/DELETE
  returned 401; malformed owner POST/DELETE returned 400 before mutation.
  Queue and preparation remained enabled. Production verifier:
  `scripts/verify-liv-presentation-production.ts --execute`.
- Browser evidence uses isolated external services. Production acceptance did
  not submit a real title edit, cancel a real operation or publish an article.
  Title/SEO editing is released; shortening and cover UI are still unfinished.
  Shortening and cover UI remain separate unfinished work; this endpoint alone
  does not complete the targeted editing feature.

### Queued-cover checkpoint, September 14 (released, mutation acceptance still limited)

- Released `6b5d3eef61cfa2112f99af3a452dfaadfff24796`, deployment
  `dpl_8Rydiv5XY4pURawQUcxVGtidLpTt`, READY. Current domain lookup independently
  confirmed `ai.aproposmagazine.com` points to this deployment. No env changes.
- `scripts/verify-liv-cover-production.ts --execute` passed at
  2026-09-14T01:18:21.949Z: verified-owner baseline GET 200/private-no-store,
  exact response allowlist and feed hashes/day matched; anonymous GET/POST/DELETE
  denied with 401; malformed owner POST/DELETE returned 400. No valid mutation,
  source download, image review or publication was performed by the verifier.
- Deployment-scoped runtime error/fatal log counts for the preceding 15 minutes
  were empty. This short scan is not proof of long-term reliability.
- Daily status readback: autoPublishEnabled/queueEnabled/preparationEnabled true;
  September 14 publication not yet recorded and not overdue. Lucian Freud on
  Louisiana is ready; no blocked items or reconciliation flagged. Reserve remains
  zero/target zero. Daily publication and real-asset cover E2E remain to verify.

- Added the owner-only inline cover form on ready, non-rejected cards. It uses
  the cover baseline and POST/DELETE APIs, never CMS browser sessions. Image URL,
  source page, alt and caption are explicit; credit is server-derived. Cover and
  mobile cover change together without regenerating the article or body images.
- UID/item-scoped pending requests persist before dispatch. On reload the exact
  pending request takes priority over a fresh baseline, so a revision hold cannot
  hide recovery. A receipt is required before clearing it; cancellation retains
  the proposed input locally and server audit remains intact.
- Actual-component isolated browser check at 390x844: no horizontal overflow,
  lost-response request survived reload and replayed byte-identically, successful
  receipt cleared pending state and refreshed the feed, colleague switch removed
  editing controls, and no captured browser errors. Extended fixture:
  `scripts/verify-liv-presentation-ui.mjs`. These are mocked-service UI checks,
  not a production cover mutation or proof of source acceptance for a real asset.
- 200 relevant backend/feed/store tests, TypeScript and scoped ESLint passed.
  Full regression passed: 3,532 tests across 246 files. Production build passed
  (`/tmp/apropos-cover-tests.log`, `/tmp/apropos-cover-build.log`). Seven existing
  tracing warnings remain. Production release/read acceptance is recorded above;
  these checks do not establish a real cover mutation's source acceptance.

- Extended the existing cover journal to accept a ready entry on its actual
  scheduled day with no publication slot. It does not fabricate a selected slot,
  move publication dates or convert ready into selected. Existing selected-slot
  support and its backoff/attempt counters remain intact.
- The same manifest revision hold prevents selection during the change. Each
  saved stage checks entry identity as well as revision ownership; a concurrent
  decision change halts before the CMS patch. Completed retries reuse the
  stored image/review/receipt. Body text, body media and paid writer output remain
  unchanged. Readback and source validation are still required.
- 72 cover and media tests passed; TypeScript passed. No paid provider calls or
  production mutations. The current press-source adapter still only supports
  distribution.paradisbio.dk and cannot truthfully be presented as a universal
  image picker. Owner cover API/UI and broader validated media selection remain
  unfinished; this checkpoint is not a completed covershift release.

### Cover-source extension, September 14 (local, not deployed)

- Supersedes the preceding single-adapter limitation in local code: cover
  preparation now reuses the existing official-source policy and image-specific
  credit extraction, including Netflix Tudum and the supported syndicated TV 2
  stills. The original Paradis adapter remains unchanged for its existing URLs.
- Source credit must be attached to the exact selected image. No caller-provided
  credit, footer credit, photographer inference or licence assertion. Both source
  page and original image URL remain stored; rights status stays unverified.
- Generic approved-source raster inputs support JPEG/PNG/WebP; dimensions,
  single-frame decoding, original/crop storage, byte limits, public-HTTPS transport
  and credential/private-address rejection remain. Page inspection/encoding makes
  no model call; the existing single crop review is still separate and charged.
- 82 cover/media tests and TypeScript passed with isolated network/provider
  dependencies. Tests cover correct Netflix/TV 2 credits, official PNG, unrelated
  credit rejection and unsafe URLs. Real-source production acceptance, owner
  cover API/form and release remain open.

### Cover cancellation and owner API, September 14 (local, not deployed)

- Added owner-only POST/DELETE `/api/liv/revisions/cover`, reusing the existing
  revision service, strict schema, request identity and private/no-store replies.
  Colleagues/anonymous callers cannot invoke preparation, review or cancellation.
- Explicit cancellation is possible only before a CMS patch intent exists and
  while no live cover worker owns the lease. It retains prepared pixels, paid
  review result, costs and immutable audit, marks the choice cancelled, and
  releases only that choice's manifest hold. A delayed request cannot revive it.
  Failed/uncertain CMS writes and completed revisions cannot be cancelled.
- Tests cover unavailable source, rejected crop, live preparation, delayed
  request, changed request identity and uncertain/completed CMS writes. No real
  model/media/CMS operations in these isolated tests. Owner cover baseline/form,
  full regression and production acceptance remain outstanding.

### Cover baseline and pending-feed continuity, September 14 (local)

- Owner-only cover GET now returns the actual scheduled day, title and current
  payload/CMS hashes. It rejects selected/published/rejected/held items, requires
  no SEO fields, exposes no body or provider data, and makes no writes/AI calls.
- Found and corrected a reload dead end: `approvalEntries` formerly hid all
  stories during any editorial revision hold. It now returns only the held story
  with an ephemeral `editorial_revision_pending` blocker. Stored quality evidence
  is unchanged. The card explicitly says “Redigering afventer afslutning”.
- Decision mutations now reject changes to the held item server-side, not merely
  through disabled buttons. Pending editor controls can remain reachable while
  approval/publication stay blocked. Unknown held IDs do not expose other stories.
- 112 relevant tests and TypeScript passed. The actual cover form, browser
  reload/retry integration and production release remain unfinished.

## Local checkpoint (not deployed)

**Latest release (supersedes historical status below):** `dc79e1e` is READY on production. “Mine artikler” now links to saved versions/shared copies, isolates late account responses and uses canonical draft IDs. 3,339 tests and build passed; isolated mobile/browser checks passed. Production private workspace/versions/shares reads are 200 and anonymous access is denied. Three Liv stories remain visible through the feed API with preparation enabled. Alert history alone in the smoke check still fails 503 pending the documented administrator-created Firestore index. Full-project completion is not claimed. See `DRAFTS-SHELF-2026-09-13.md` for exact evidence and remaining acceptance scope.

**Release update:** the implementation through `c3b9b58`, including private sharing and copy UI, is deployed and read-only API-verified in production. See `WORKSPACE-SHARING-RELEASE-2026-09-13.md` for the latest exact SHA, deployment and evidence, and `WORKSPACE-RELEASE-2026-09-13.md` for the preceding release. Older “not deployed” notes below describe historical checkpoints, not the current release. The broader plan and acceptance checks are still incomplete.

- Server-derived owner capability in auth/access. Middleware owner gates, mobile/desktop launcher filtering, standalone page guard and embedded view filtering. Owner status requires Frederik's verified identity, not merely the admin role.
- Liv approval controls and settings gear hidden for colleagues; server denies queue decision mutations.
- Autosave keys scoped by UID. Unknown legacy cache never adopted automatically. Account-keyed React subtree prevents state reuse across accounts. MainChatPanel secondary cache also scoped.
- New private GET/PUT /api/writer/workspace. Server selects UID; strict payload and 500 KB bound; optimistic revision, identical retry readback, conflict copies and history on draft change.
- Writer offers cloud resume and two-second autosave. This is initial implementation, not yet verified across devices or offline transitions.
- Media sources GET no longer seeds records or disguises database failures with default sources; authenticated, private/no-store, preserves empty list.
- First full local regression passed 3,193 tests in 204 files before the final secondary-cache and media-source changes. Final targeted checks must be recorded below.

## Required before this checkpoint can release

### Reserve audit: remaining implementation

The approved one-evergreen reserve is **not implemented/active** merely by existing reserve types. Source inspection after `749fb4a`:

- `delivery-policy.ts` still sets `LIV_RESERVE_TARGET = 0`; `preparationCandidates` only returns scheduled jobs.
- `defaultEditorialPlan(day, true)` already supplies a timeless directive, and `runLivDaily` already supports a separate reserve scope. Reuse these, rather than a second generator.
- A durable reserve-job pointer is needed so a pending/failed paid reserve does not become a fresh paid job each midnight. Existing shared preparation lease and retained checkpoints must remain authoritative.
- Daily/tomorrow work must take priority; one non-rejected valid ready reserve should suppress replenishment. Blocked saved reserves need recovery, not automatic replacement. Never consume the existing three scheduled stories as reserves or pull future publication forward.
- Main runner admits reserve dates as current preparation day through job-day +5, but cron's readback recovery currently uses job-day for both dates and defaults to a scheduled directive. Reserve scheduling must unify those paths before activation.
- Read-only preparation status currently permits only prepare/prepare-alternative scopes and must represent reserve continuation accurately without confusing today's delivery alarm.
- Tests must cover midnight continuation, rejection, expiry, blocked/uncertain CMS work, duplicate selection, and bounded stock. Source/date/media/CMS checks and shared budget remain required. Do not flip the target alone.

### Operations release result

- `89b7d8f` is deployed READY; next-story/current-alert operations API is live and verified. Full 3,334-test regression, build and isolated history browser checks passed.
- Production history is NOT verified/working: Firestore requires the declared `livDeliveryAlerts` collection `__name__ DESCENDING` index. Existing service account may list but cannot create it (403). Administrator index creation is required, without widening runtime IAM. See `OPERATIONS-RELEASE-2026-09-13.md`.

### Next privacy finding

- Release update: implementation through `fd864a4` is deployed READY and real preview API verified: anonymous 401, owner 200 private/no-store, no research requested. See `PROMPT-PRIVACY-RELEASE-2026-09-13.md`. The local-only notes below are historical checkpoints. Full Writer navigation and other private-state audit items remain open.

- Full isolated regression after the privacy change: 3,337 tests in 226 files passed. Build and deployment remain pending; production is still the operations release, not this privacy fix.

- Browser checkpoint: real Architect/ReactFlow component in StrictMode, isolated auth/fetch and a mocked navigation link. Seeded A/B contexts plus legacy unowned context; held A's response, switched to B, then released A while deliberately ignoring abort in the fake transport. Only B's label rendered; requests used each matching token/context, legacy text never sent, no uncaught errors. Switching back to A and logging out before releasing its response left only the login message. Screenshot inspected. Fixture closed after testing. This does not exercise the real Firebase login or full Writer navigation; those remain release acceptance work.

- Local implementation: Writer and Prompt Architect now use versioned UID-scoped context and toggle keys, ignoring legacy keys without deleting them. Architect is keyed by UID, unmounts on logout and aborts obsolete preview fetches; preview includes bearer authentication. The server route verifies editorial identity directly and returns private/no-store responses without logging raw prompt exceptions.
- Four targeted storage/route/no-research tests and TypeScript passed. React review completed. This is not deployed; actual browser account-switch/late-result tests, broader regression and release acceptance remain required. Toggle preferences remain local per user, not yet cross-device cloud state.

- Source audit found `PROMPT_ARCHITECT_CONTEXT_KEY` is still a global sessionStorage key. Writer stores articleData/notes under it; PromptArchitectClient reads it without a UID namespace and posts the preview without an explicit bearer token. This is an unresolved cross-account stale-context risk, not proof of actual data disclosure. Next implementation must scope both sides to the authenticated UID, ignore legacy unowned data, clear in-memory state on account changes and authenticate preview requests. Keep this separate from the already tested operations release.

### Owner operations extension (local)

- Historical alert follow-up: added owner-only read-only `/api/editorial/operations/alerts`, validated keyset cursor and 20-record pages with one lookahead. No age cutoff hides old ambiguous sends; the panel offers older/newest navigation and retry without any resend. Responses project only day/status. Invalid/failed reads are explicit, never an empty healthy list.
- History policy/route tests: 15 passed including current status cases; TypeScript passed. The updated history UI/fixture still needs browser verification, full regression/build and production acceptance. React review confirms aborted request suppression, UID-keyed history lifetime, no browser cache of alert data and bounded reads. This supersedes the earlier current-day-only limitation for browsing; actual mail reconciliation is still separate.

- Browser acceptance checkpoint: real `LivOperations` component rendered in isolated React StrictMode fixture using fake auth/fetch. At 390×844 and 1280×900, no horizontal overflow or uncaught errors; long titles wrap. HTTP 503 hides stale success and shows an error; explicit refresh recovers. Only GET operations calls occurred. Fixture/server and browser were closed afterward. This is component evidence, not full application or production acceptance.
- Full isolated regression after the extension: 3,326 tests in 224 files passed. Build/release remains pending. `scripts/verify-liv-operations-ui.mjs` preserves the reproducible fixture.

- Reused the existing gear-menu operations panel instead of adding another dashboard. Added next-day/current-missing-day eligible story title and a separate read-only current-day alert projection. Selection respects existing rejection/blocker/priority policy and existing selected slots.
- Direct operations route now requires verified `owner`, independently of middleware. Colleague editor/admin roles are rejected before reading operations.
- Alert DTO contains only day/status; no payload, recipient or provider identity. Missing history is not successful delivery; unavailable storage remains a separate unavailable section. Provider acceptance is labeled as acceptance, not inbox delivery.
- Sixteen targeted tests passed, including colleague denial, Danish midnight, uncertain/old sends, unavailable sections and candidate filtering. TypeScript passed before the final test additions; no paid API calls or production mutations.
- Still local: visual verification, complete regression/build and release verification remain. Historical unresolved alert display and actual failure/resolution delivery acceptance are not covered by this current-day panel.

### Delivery alert production release

- Supersedes the historical local-only alert checkpoints below: `f246509` is deployed READY on `ai.aproposmagazine.com`; full 3,315-test regression and build passed.
- Real authenticated delivery-check API returned published true, overdue false, alerts checked and preparation idle for September 13. Healthy-path verification does not prove actual failure/resolution mail delivery.
- Exact deployment and remaining limitations: `DELIVERY-ALERT-RELEASE-2026-09-13.md`. The owner operations UI and broader acceptance work remain open.

### Preparation and concurrent alert checkpoint

- The check reads the existing read-only preparation DTO. Today's terminal failed/skipped preparation can alarm before the deadline; queued retries, saved continuation stages and active work do not. Unavailable preparation status is exposed as unknown/503, not healthy.
- Tests reuse the actual preparation classifier. Eight simultaneous calls against serialized mock transactions produce one send; retries beyond the conservative provider deduplication window stop without resending.
- Nineteen targeted tests and TypeScript passed. Mock transaction serialization is not a live Firestore concurrency test. Build/regression and production acceptance still required; no actual alert has been sent. Future-day preparation alarms are not covered by the current-day policy.

### Alert cross-midnight/error-isolation checkpoint

- Existing prior-day slots are considered for resolving existing notices (bounded to fourteen). No retrospective failure notice is created for days without an existing alert. Future/invalid days are rejected by policy.
- Publisher exceptions no longer skip health/alert evaluation. Mail failures preserve delivery and health evidence in the response and return a distinct `alerts: unconfirmed` flag with 503. One day's alert failure does not prevent processing the other selected days.
- Sixteen targeted policy/send/route tests passed and TypeScript passed, including cross-midnight resolution and publisher/mail failures. Still local, not deployed. Preparation terminal state integration, stronger concurrent storage coverage and production alarm acceptance remain pending.

### Delivery alarms (local, not deployed)

- Extended the existing authenticated quarter-hour delivery check, without another scheduler or AI call. Alarm policy waits until 10:15 Copenhagen time or a definitive non-user rejection; healthy days are quiet. One accepted failure notice and one accepted resolution per day, only to Frederik.
- Firestore stores immutable message payload/lease and provider ID. Uncertain requests retry the identical provider idempotency key within a conservative 23-hour window; older ambiguity requires reconciliation instead of a possible duplicate. An uncertain failure is reconciled before a resolution notice.
- Thirteen policy/send/route tests passed, including summer/winter deadline, stable retry payload/identity, suppression and one resolution. TypeScript passed.
- Still required before deployment: previous-day resolution/cross-midnight handling, preparation-terminal status integration, error isolation when delivery itself throws, stronger concurrent-transaction tests and production acceptance. Current tests use fixtures, not real alert mail. The owner operations UI remains separate pending work.

### Account mail production release

- Account mail flow through `ec5b63b` is now deployed. See `AUTH-MAIL-RELEASE-2026-09-13.md`: verified sender domain, production auth/origin boundary checks, one owner reset request and provider `delivered` evidence. No password or verification flag was changed.
- Full build and 3,305 tests passed. Historical local/not-deployed notes below are superseded for this mail implementation. Colleague verification completion, central alerts and interrupted-mail recovery remain open.

### Permanent auth mail implementation (local, not deployed)

- Added exact POST `/api/auth/mail`, using fresh revoked-token verification and Firebase user readback for verification; the client cannot select another verification recipient. Reset remains available logged out with identical responses and account lookup/provider work deferred through Next `after` to avoid account-dependent response timing.
- Replaced direct client Firebase mail calls with this application endpoint. Firebase still creates and validates the actual action links; no manual `emailVerified` mutation.
- Resend uses the existing configured sender/API key. Durable transaction limits: one/minute and six/day per address/action, thirty/day overall. This reserves attempts before provider calls, including failed attempts. Audit records contain recipient hashes, status and provider IDs, not action links or credentials. Provider acceptance is not proof of inbox delivery.
- Initial service, route, client verification and access-policy tests pass; TypeScript passed. Remaining before release: verify configured sender/domain, middleware regression/full build, production background execution and actual delivery acceptance. This checkpoint is not yet deployed and does not replace the earlier production mail flow until release.

### Sharing browser verification and durable retry

- Real React StrictMode dialog tested via agent-browser with isolated HTTP/auth fixtures, never production data. Verified own-version preview, recipient and explicit consent gate, simulated network failure, exact same-operation retry, received snapshot copy callback and modal close. No uncaught browser errors.
- Pending sharing metadata now survives dialog unmount/reload within the tab in UID-scoped sessionStorage. No tokens or draft contents are persisted in the receipt; no automatic resend. Storage failures stop the write before a request is sent. Successful/definitively rejected operations clear the receipt.
- Browser close/reopen test confirmed two attempts with identical operation payload, then cleared receipt. 390px mobile viewport had no horizontal overflow. Added reusable isolated fixture `scripts/verify-workspace-sharing-ui.mjs`.
- 32 targeted share/receipt/restore/sync tests passed, TypeScript passed. The browser test mocks transport and does not prove production sharing with colleague accounts. Shares list pagination and full cross-device acceptance remain open.

### Writer sharing dialog checkpoint

- Added “Delte kopier” to Writer. Native modal with focus/escape handling, list of participant-only shares, exact stored-version preview, explicit colleague selection and confirmation that the entire article/chat/notes/reference snapshot is shared.
- Received snapshots can open through the protected existing restore controller as a new own copy, preserving current local/server work. Network requests cancel on dialog close; same-operation sharing retries retain their identity while mounted. React strict-effect cleanup no longer leaves the loading lock stuck.
- TypeScript and diff checks passed; existing share/restore/sync tests remain the behavioral backend coverage. Actual modal/browser acceptance and navigation-persistent pending receipts are still required. This UI and share endpoints are not yet deployed; production remains `ff2af68`.

### Shared-copy restore checkpoint

- Extended the existing restore operation with a strictly validated shared-snapshot selector. Membership is checked inside the transaction; no owner override. Source share and sender workspace are never written.
- Uses the same exact-operation receipt, optimistic revision and saved-local/server conflict history as ordinary restore, opening the copy under a fresh draft identity. The existing sync controller can submit this selector without a parallel restore implementation.
- 29 restore/sync/share tests passed, including own-only writes, preserved unsaved typing and rejection of a share addressed to someone else. TypeScript passed. UI integration and end-to-end browser verification remain pending; not deployed.

### Explicit private-share backend checkpoint

- Added authenticated own-workspace sharing with an exact revision precondition, named verified colleague recipient and immutable snapshot. Source UID comes exclusively from authentication, not request input. No recipient gets live access to subsequent edits.
- Read/list access requires participant membership; Frederik's owner capability provides no override. Responses omit participant/receipt metadata. Retries reuse the same UID-scoped operation identity; changed revision/recipient cannot replace a shared snapshot.
- Five targeted tests passed, including immutable snapshot, owner denied when not a participant, stale/forged requests, verified recipient and idempotency. TypeScript passed.
- Not deployed. Writer sharing UI, recipient copy-to-own operation, list pagination beyond 50 and browser acceptance remain pending. No actual private workspace was shared during these tests.

### Production shared-source initialization

- Read-only production check confirmed Frederik verified/enabled and an empty `sharedMediaSources` list.
- Initialized Soundvenue `https://soundvenue.com/feed` using the real GET/PUT application handlers in a local release process with an authenticated owner token and production storage. Credentials stayed in memory. No personal source collection was read or copied.
- API readback: document `1ea055a90c51ff9259c5b57ba85b50eb71e592789e19fd25fa3a8aea11819ad5`, enabled, revision 1. Check at 2026-09-13 20:14:33.631 UTC: RSS, 10 links, not partial. Counts are candidate links, not researched articles.
- Added an explicit, import-safe setup helper that skips a nonempty shared list. TypeScript/diff checks passed. This resolves the empty shared production configuration prerequisite, not the pending deployment or Vercel runtime verification. No article/CMS/AI operation ran.

### Tip-to-desk selection checkpoint

- Added owner-only POST `/api/editorial/tips/select`, also gated in middleware policy. It atomically creates a discovered idea in Frederik's existing editorial desk and marks the shared tip selected. Existing source URL keys prevent duplicate ideas across tips; retries preserve the same story and selection timestamp.
- Tip angle/link are retained; no sourced facts, research result or quality evidence are invented. New ideas use provisional culture categorization and zero unassessed signal scores, requiring the existing explicit research operation before drafting.
- Frederik sees “Vælg til redaktionen”; selected status is visible to all colleagues. The confirmation directs Frederik to gear → Research og kilder, where existing research/draft operations apply. Selection itself performs no external fetch or paid call.
- Five selection tests and seven submission tests passed; TypeScript and diff checks passed. Browser verification, durable client retry across navigation and actual production release remain outstanding.

### Shared editorial tips checkpoint

- Added authenticated `/api/editorial/tips` GET/POST for all three verified colleagues, with a strict bounded HTTPS link/angle schema and UID-scoped operation receipts. Identical retries return the existing tip; changed payloads under the same operation ID are rejected.
- Shared list returns only explicit tip content/status/date, not private workspace data or receipt metadata. No remote source fetch, research, generation or publication is triggered by submitting or reading a tip.
- Added a collapsed “Send Liv et tip” form and latest 50 shared tips in the upcoming view. Fetch runs only when opened. Pending retry preserves the same operation while mounted and blocks editing until the receipt is resolved. Session-persistent retry across navigation remains unimplemented.
- Seven targeted API tests passed; TypeScript and diff checks passed. React checklist reviewed. Browser acceptance, owner selection into the research workflow and production release remain pending.

### Build-side ingestion defect repaired

- Production build at local commit `394ed46` succeeded but revealed an old `/api/test-ingest` import of `src/cli/ingest-rage.ts`. Its unconditional `main()` caused feed/sitemap requests during module import/build, outside an explicit ingest request. Build output showed Soundvenue and GAFFA discovery twice. No tracked research datasets changed in the resulting git status.
- Removed the CLI import. Test ingestion now uses `runIngestToFirestore` only inside an authenticated owner POST (24-hour window, 10 candidates). GET returns 405 without ingestion; errors no longer expose stacks. No tracked callers of the old GET endpoint were found.
- Four focused route tests passed. A second complete production build passed, including TypeScript/security config checks, with no feed/sitemap discovery output. Nine existing broad filesystem tracing warnings remain; these are not resolved by this patch.
- This is local build evidence only. No push/deployment, shared-production-source initialization, paid AI call or article publication occurred in this step.

### Feed compatibility and efficiency checkpoint

- Shared discovery uses the validated XML kind when available, including Atom endpoints without RSS/feed words in their URL. Atom alternate article links and publication dates are extracted. Explicit configurations never trigger the legacy Ekko guessed-feed fallback.
- The sitemap pass skips configured RSS/Atom sources, avoiding a second fetch that could not yield sitemap articles.
- Real read-only discovery check at 2026-09-13 19:59:58 UTC: Soundvenue `/feed` returned 10 candidates, all 10 with publication dates; the sitemap pass returned zero without another download. This is development-environment evidence, not a production ingest/publication run.
- Full isolated regression: 3,271 tests in 213 files passed. TypeScript passed. No paid AI calls or production writes.

### Recurring discovery transport checkpoint

- Explicitly configured server feed/sitemap discovery now uses the pinned HTTPS XML transport, validates XML before parsing, shares a 20-second deadline per discovery pass and caps downloads at 20. Nested sitemaps use the same transport and deadline; cycles are skipped. Existing RSS date extraction is preserved.
- Explicit sitemap configuration no longer guesses four feed endpoints. Legacy CLI calls without an explicit list remain separate and retain old behavior.
- Actual read-only check: `https://soundvenue.com/feed` passed the new validator on 2026-09-13 at 19:51:04 UTC with 10 candidate links, no partial result. This proves that one public feed works from the development environment, not production configuration or daily publication.
- Source/discovery targeted tests passed; TypeScript/diff checks passed. Shared-source administration, initialization and production verification remain required. No paid model calls or CMS writes.

### Media validation checkpoint

- Added a DNS-pinned HTTPS XML transport: public IPv4 only, no credentials, every redirect revalidated (max three), 1 MB response cap, identity encoding, supported XML MIME types and shared 20-second deadline.
- XML validation rejects malformed data and DTD/entity declarations; RSS/Atom/sitemap parsing counts discovered URLs rather than inventing verified article totals. Nested checks cap at five documents and mark partial results.
- Replaced the old permissive validator route with authenticated bounded input and sanitized errors. Personal-source create/update use the same validator via a per-UID 24-hour server cache; explicit refresh bypasses cached success. No silent fallback on failure.
- Remaining: integrate hardened transport into recurring discovery (existing discovery fetchers still need replacement), owner shared-source configuration and initialization, UI status/manual refresh and real-source validation. The change is not deployed and does not prove production sources work.
- Targeted tests: 16 passed; TypeScript/diff checks passed. No paid model calls.

### Shared-source separation checkpoint

- System ingest now reads only enabled `sharedMediaSources`, never the personal `mediaSources` collection. Missing database/read failures are explicit errors; a deliberate empty shared list stays empty.
- Server ingest passes the configured list through feed and sitemap discovery. Explicit lists no longer trigger hard-coded fallback sources. Candidate publisher hosts must belong to that same list before article fetch; forged source labels cannot authorize another host.
- Legacy CLI discovery without an explicit list retains its existing static defaults. Personal-source research consumption still needs its own integration verification.
- Required before deployment: owner-only shared-source configuration/initialization, network transport validation and actual source checks. No shared production documents have been initialized in this checkpoint. Deploying without that step would leave shared ingestion empty; do not infer live readiness.
- Targeted tests: 12 passed, including configured feed use, disabled/foreign publisher exclusion, empty configuration and unavailable storage. TypeScript/diff checks passed; no paid model calls.

### Restore continuation checkpoint

- Implemented explicit POST `/api/writer/workspace/restore`: verified own UID only, bounded schema, immutable operation receipt, optimistic revision, preserve current server snapshot and submitted local text, then open selected own history/conflict snapshot under a new draft identity. Retries read the same receipt; modified operation bodies and concurrent writes are rejected.
- Versions dialog now offers “Åbn som ny kopi i Writer”. Sync pauses while restoring, retries the exact uncertain operation, refuses swapping selections mid-retry, ignores disposed-account results, and retains newer local typing rather than replacing it with a late restore result.
- This supersedes the previous checkpoint's missing direct-restore implementation. Actual multi-device/browser acceptance, Mine artikler integration, sharing, pagination and the broader plan still remain.
- Targeted server/controller tests: 22 passed; TypeScript passed. No deployment or paid AI calls.

### Workspace continuation checkpoint

- Extracted an account-lifetime sync controller and connected it to the Writer. Two-second debounce, no empty initial write, serialized saves, exact-body retry after uncertain network results, manual retry and online reconnect. Disposed accounts cannot apply late reads/writes. Conflicts remain paused rather than overwritten.
- Added a visible own-local-copy resume button; removed the old opt-in testing flag and restore metadata logging. Offline initial reads stay retryable when local work is opened.
- Added private `/api/writer/workspace/versions` list/detail endpoint. Authenticated UID only, including for Frederik; bounded 20-per-kind metadata list, validated selectors and read-only snapshot responses. No data mutation on read.
- Added a native modal versions list, plain-text reading and JSON download for preserved historical/conflicting versions. Direct restore/copy into the editor, pagination beyond the first 20 and integration with Mine artikler remain pending. These read-only tools are not a claim that conflict recovery is complete.
- Targeted verification: 29 tests passed; TypeScript and diff checks passed. Live multi-device/browser verification remains pending. No paid model calls or deployment.

### Additional local audit checkpoint, September 13

- Liv feed now derives identity through the verified editorial account within the route itself. Colleagues receive previews without cost/preparation diagnostics; owner-only decisions are enforced even without middleware.
- Liv status sends colleagues only allowlisted published article fields, excluding draft/run/configuration data. Other Liv GET routes are owner-only, except preview feed and publication history.
- Dashboard does not fetch newsletter recipients for colleagues and omits newsletter/draft totals from their response. Leaderboard excludes unpublished/archived work for colleagues; publication counting now requires a publication timestamp rather than merely non-draft status. Dashboard errors are sanitized and successful responses private/no-store.
- Legacy Webflow configuration, Instagram credential management and editorial desk routes are owner-gated. This does not activate Instagram or any publication.
- Same-account focus/token rechecks no longer unmount the editor. Failed authorization still clears access; account switches still reset the subtree. Browser verification remains required.
- Verification: 3,206 tests in 206 files passed; TypeScript and git diff checks passed. No paid AI calls, production writes or deployment in this checkpoint.

- Complete capability route/data audit, including legacy settings endpoints and dashboard aggregation; preserve public podcast feeds and signed server cron workflows. Ensure colleagues cannot invoke shared Liv research/publication through alternative routes. Verify direct Firebase/Storage access for restricted services.
- Test browser resume, initial fetch race, new workspace, in-flight account switch, offline/reconnect and conflict recovery UX. Add explicit retry and selectable preserved versions. Audit remaining browser/session cache keys; do not claim all personal state isolated yet.
- Ensure the new private workspace history is visible alongside Mine artikler. Implement explicit read-only shared snapshots with copy-to-own-workspace, no collaborative original overwrite. Preserve original ownership in migrations.
- Add colleague tip submission and shared tip list without paid research on submit.
- Complete production initialization and end-to-end source verification. Shared-source isolation, bounded XML transport, 24-hour cache and owner settings are now implemented locally (see newer checkpoints); personal-source UI status and article HTML transport still require review. Do not treat the historical pre-separation notes above as current implementation status.
- Permanent verified-sender Firebase verification/password-reset flow, enumeration-safe responses and rate limits. Prior mails were individual service operations only.
- Owner-only simple operations card, deduplicated server-side failure email after 10:15, resolution follow-up; no desktop dependency.
- Targeted title/shorten/cover revision UI using existing audited operations, versioned visible per-article/fixed Liv rules, one evergreen reserve with duplicate-safe publication. No fine-tuning jobs.
- Verify exact production SHA and actual affected API/UI flows. Provider invoice reconciliation and seven real consecutive daily publications remain separate acceptance evidence.

## Decisions fixed by user

### Shared-source settings checkpoint

- Added `/api/liv/media-sources` GET/PUT with direct verified-owner enforcement, bounded strict input, stable URL identity and transactional revision checks. GET is read-only and private/no-store; personal collections are not read or copied.
- Enabling validates through the existing safe 24-hour check cache. Disabling does not require a working remote source. Failed validation preserves the configured document; manual refresh is explicit and uses no AI.
- Added shared-source list, enable/disable, last check/link counts and add form in Liv's settings. Counts are explicitly discovered URLs, not verified articles. React checklist and TypeScript reviewed; no browser acceptance yet.
- Verification: 24 targeted tests passed, including eight new owner/settings tests. TypeScript and diff checks passed.
- Not deployed. Production shared sources still require initialization through the authenticated API before switching ingest. Remaining full-plan work and production acceptance remain open.

- Private until explicitly shared, including against Frederik's normal application access.
- Casper/Milo can see and suggest in Liv, not approve/reject/publish.
- One deployment with authorization, not separate forks of the application.
- Shared snapshots are read-only; recipients can make their own copy.
- Preserve existing daily schedule, three prepared stories and 300 DKK tracked budget. Do not regenerate work to test.
