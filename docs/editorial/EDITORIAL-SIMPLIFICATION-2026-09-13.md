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

- Local full suite: 171 files, 2,980 tests passed.
- Typecheck and Next.js production build passed.
- Targeted lint: no errors (release script excluded by existing lint configuration).
- Firebase Rules API tests: 5 Firestore + 5 Storage cases passed with function mocks.
  This proves policy evaluation, not live cross-service IAM permission.
- Security commit: d93aef8 (local). No successful push or app deployment this run.

## External blockers (not application failures)

1. GitHub rejected push: OAuth token lacks `workflow` scope for the new CI file.
   Existing scopes verified: gist, project, read:org, repo. Reauthorize the same
   connection with workflow scope; do not bypass its permission restriction.
2. Firebase release preflight: project.get succeeds but projects.getIamPolicy
   returns 403. Storage's Firestore lookup needs the existing Storage service agent
   to have `roles/firebaserules.firestoreServiceAgent`. An authorized project
   administrator must arrange this and permit verification. Do not grant Owner
   merely for this operation.

The release utility stopped before admin migration, IAM writes or rules updates.
Production app and active Firebase rules remain unchanged.

Reference: https://firebase.google.com/docs/rules/manage-deploy#manage_permissions_for_cross-service_cloud_storage_security_rules

## Remaining implementation / verification

- Complete route-by-route role coverage, admin-list management presentation and
  live auth/storage tests after access is restored.
- Extend budget coverage to currently unscoped AI features/providers. Do not call
  the existing Liv/Writer/SEO ledger an account-wide budget.
- Shared read-only Liv/newsletter operational view and concrete failure display.
- Retire simulated prototype outputs, preserve/export browser drafts, lazy-load
  heavy app views, and measure bundle changes.
- Verify exact production SHA, normal daily API delivery and seven-day record.

No paid model tests, CMS writes, newsletter sends or Instagram changes were made.
