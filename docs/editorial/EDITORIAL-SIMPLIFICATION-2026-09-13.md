# Editorial simplification: execution record

## Target

One API-published Liv article at 10:00 Europe/Copenhagen per day, tomorrow's
preview, a hard 300 DKK tracked application AI budget, staff-only access, and
seven consecutive verified daily publications before operational sign-off.

## Implemented locally

- Exact-origin token attachment, preserving Request headers.
- Firebase Admin token/revocation verification and current user verification.
- Verified exact aproposmagazine.com domain OR active `editorialAccess/{normalizedEmail}`.
- Explicit admin/editor role, administrator-only access-list API and selected
  configuration/diagnostic API gates. No blanket Firebase-user approval.
- Login access check before exposing the user to application components.
- Firestore rules preserving public magazine mirrors and reader profiles while
  enforcing editor + owner checks on browser-owned editorial collections.
- Storage rules enforcing editorial membership; published config is server-owned.
- Rules release utility with mocked policy tests, existing-admin-only migration,
  concurrent release check, readback and retained previous ruleset IDs.
- CI definition: safe install, config gate, typecheck and isolated tests.
- Incremental content/model-keyed embedding cache and budgeted SDK calls; archive
  only replaced after all vectors validate. No ordinary-code push/daily full rebuild.
- Proven pretransport cost denials put SEO jobs in `waiting_budget` for six hours
  without consuming a failed-attempt slot. Uncertain paid work remains fenced.

## Evidence

- Production release verified: dpl_5NxYgkNSaxy5btcq9eV8Lkfuhj3Q, READY,
  exact Git SHA a2f14d8f79a24e92fe7472c541ac5d7077f365ed, selected as production
  target by project API readback. https://ai.aproposmagazine.com/api/auth/access
  returned 200/allowed/admin for the existing administrator, 401 anonymously,
  and 401 for a temporary verified external Firebase user not on the allowlist.
  The temporary Auth identity was deleted in the verifier's finally block.
  This proves API access for those cases, not every frontend/login variant.

- 2026-09-13 13:40 UTC: rules activated and real Firebase client verification
  succeeded. Active Firestore ruleset: 85f95abb-69b5-49f4-ac1a-54ba740c97cd;
  Storage ruleset: 057e8d8b-8114-4b96-81be-2e36af5ffeb5. Prior IDs retained below.
  Allowlisted administrator draft write/read and Storage upload/delete succeeded;
  owner transfer, client access-list read, unsigned draft and unsigned upload
  were denied. UUID-tagged verification artifacts were deleted. These checks do
  not yet prove deployed application login behavior or all access-list variants.
  IAM administration/Google service-agent impersonation are no longer release
  dependencies. A mandatory live verifier follows release readback; failures
  restore only unchanged releases created by this run.

- Local full suite: 171 files, 2,980 tests passed.
- Typecheck and Next.js production build passed.
- Targeted lint: no errors (release script excluded by existing lint configuration).
- Firebase Rules API tests: 5 Firestore + 5 Storage cases passed with function mocks.
  This proves policy evaluation, not live cross-service IAM permission.
- Security commit: d93aef8; savings commit: fe698d6. GitHub Workflow authorization
  completed and branch push verified by remote readback at
  fe698d691aa2f91999d5a657c85edcb829cad4e0. No app deployment yet.
- Google Cloud IAM UI confirmed "Policy updated" and the existing Storage service
  agent service-817066738308@gcp-sa-firebasestorage.iam.gserviceaccount.com now has
  Firebase Rules Firestore Service Agent in addition to its previous role.
  Propagation and a live cross-service rules test remain to be verified.
- Existing explicit administrator migration executed via the server SDK with
  production credentials held in memory: one verified active administrator,
  transactional audit entry and access-list readback confirmed. Existing revoked
  or non-admin entries fail closed and are not overwritten by migration.

## External blockers (not application failures)

1. GitHub workflow-scope blocker resolved; actual push and remote SHA verified.
2. Firebase release preflight: project.get succeeds but projects.getIamPolicy
   returns 403. Storage's Firestore lookup needs the existing Storage service agent
   to have `roles/firebaserules.firestoreServiceAgent`. This precise grant is now
   confirmed in the administrator's IAM UI. Adapt the release preflight to verify
   the externally provisioned prerequisite without requiring runtime IAM write
   authority. Do not grant Owner merely for this operation.

The release utility previously stopped before admin migration or rules updates.
The administrator-approved IAM grant, explicit administrator migration and
verified Firebase rule release are now applied. App deployment a2f14d8 is live
with authenticated/anonymous/outside-domain API verification recorded above.

Reference: https://firebase.google.com/docs/rules/manage-deploy#manage_permissions_for_cross-service_cloud_storage_security_rules

## Remaining implementation / verification

- Additional local cost cleanup: attachment filename classification no longer
  calls a model (no current callers found, therefore no claimed current spend
  reduction). Active inbound-mail summaries now cap completion tokens at 2,000
  and disable automatic SDK retries. This is bounded output, not full ledger
  coverage: accreditation and podcast still need shared-budget integration.

- Release preflight experiment: replaced IAM policy mutation with an existing-
  authority, five-minute Storage service-agent permission probe. Real API returned
  `storage_probe_auth_http_403:IAM_PERMISSION_DENIED` before any rules writes.
  This proves impersonation is unavailable, not that Storage lacks its saved role.
  Do not broaden runtime authority to satisfy this diagnostic. Resolve via a
  legitimate administrative read or direct cross-service flow verification.
  Two fail-closed regression tests pass; TypeScript check passed before adding
  the sanitized reason diagnostic. The probe is not a completed release solution.

- Complete route-by-route role coverage, admin-list management presentation and
  live auth/storage tests after access is restored.
- Extend budget coverage to currently unscoped AI features/providers. Do not call
  the existing Liv/Writer/SEO ledger an account-wide budget.
- Shared read-only Liv/newsletter operational view and concrete failure display.
- Retire simulated prototype outputs, preserve/export browser drafts, lazy-load
  heavy app views, and measure bundle changes.
- Verify exact production SHA, normal daily API delivery and seven-day record.

No paid model tests, CMS writes, newsletter sends or Instagram changes were made.

### Daily delivery inspection, 2026-09-13 (latest)

- Authenticated production delivery API reports today's publication. Public URL
  `https://www.aproposmagazine.com/articles/the-gentlemen-saeson-2-goer-privilegium-til-et-vaben`
  returned HTTP 200 with its canonical URL and two body image elements. This is
  not evidence of seven consecutive scheduled deliveries or verified image bytes.
- Tomorrow's saved Lucian Freud item `6aa566cf1d63c39af0d73ad2` is blocked by
  `field:content`, `field:intro`, `image:body-assets`. Frankenstein on September 15
  is blocked by `field:content`, `image:body-matches`, `image:body-assets`.
  Resolve actual CMS/checkpoint differences via server operations; never clear
  blockers blindly or regenerate paid work merely to fill the queue.
- Fixed local status projection: blocked tomorrow inventory no longer counts as
  publication-ready, and preparation exposes a safe saved-work hold instead of
  idle. No preparation-selection or paid-regeneration policy changed.
  37 targeted tests and TypeScript pass. This status patch is not deployed yet.
- Budget readback: estimated tracked upper 46.306176 DKK, limit 300 DKK, tracking
  began September 12. `fullMonthlyCapVerified=false`; remaining allowance is not
  proof of actual account-wide September spending.

### CMS normalization diagnosis and release, September 13

- Direct read-only CMS comparison confirms Freud's main prose and captions are
  unchanged. The false content failure occurs at the figure-to-paragraph boundary:
  Webflow drops the serialization newline after the caption. Semantic block text
  comparison now passes that exact case, still rejecting changed words/captions.
- Actual editorial changes remain: Freud's intro differs; Frankenstein's captions
  have lost illustration credits. CMS also strips inline image style. Do not
  erase blockers: reconcile reviewed text and establish image layout/byte proof.
  Existing continue/edit endpoints target pre-CMS checkpoints, not these saved
  ready drafts; they must not be misused to regenerate the articles.
- 85 relevant tests pass, TypeScript passes. Commits cfdcdf2 and 70022b3 pushed;
  production deployment `dpl_FT76ViE8G4RrPvkwSAhQEYmo6GYV` targets exact SHA
  `70022b3633f97bfc6c3c58c96cb11e1a594d2007`. READY and production target SHA
  verified. Authenticated production delivery and feed GETs return HTTP 200:
  tomorrow is missing readiness and shows `blocked_saved_work` with
  `cms_reconciliation_required`, not false idle. Today's publication remains true.
  No paid AI requests or CMS writes in this diagnostic.
