# Internal-link catalog cleanup

The only tracked caller of `loadInternalLinkCatalog` supplies no filesystem path.
Removed the unused arbitrary-path option; injected test/custom rows remain
supported through `raw`. The production loader now directly reads the existing
`data/apropos-articles.json`, preserving same-site filtering and deduplication.
Malformed/non-array JSON and malformed rows no longer crash the preview path.

## Verification

- Eight focused tests passed: canonical path, raw input without reads, malformed
  JSON/root/rows, deduplication, external-link rejection and missing file.
- Complete isolated regression: 3,448 tests in 242 files passed.
- Production build passed, including TypeScript and build-security checks.
- Build reports seven tracing warnings, down from nine in the preceding build.
  The catalog's arbitrary-path warning is absent. Other warnings remain in
  JSON storage, attachment handling and podcast binary resolution.
- No dependency, environment, data, CMS or security-rule changes; no model calls.
- Logs: `/tmp/apropos-catalog-tests.log`, `/tmp/apropos-catalog-build.log`.

## Production release and discovered SEO access defect

- Runtime SHA `613d3abb042e229264eb91925fbab157dd867961` was first deployed as
  `dpl_FjZqrDkn5EzuDRtyXFJiNuJFjY6L` (READY, production alias verified).
- The first candidate test article had staged `isDraft: true`; the test stopped
  before requesting a preview. Its prior publication date was not treated as
  sufficient evidence that the staged item was published.
- A second verified non-draft article exposed HTTP 403 for Frederik's current
  verified account. Production `SEO_ENGINE_ADMIN_UIDS` held exactly one old UID,
  belonging to `frederik@aproposcreative.com`, not the approved owner account.
- Replaced only the production SEO admin value with the existing verified,
  enabled `frederik@aproposmagazine.com` identity. Preview configuration unchanged;
  no colleague, new account, Firebase role or security-rule access was added.
  Decrypted readback confirmed exactly the current owner's UID without logging it.
- Redeployed the same SHA to apply configuration as
  `dpl_Gn92pBgqm5pQfLKkHxNaZcdLmgKT`: READY and production alias verified.
- Real POST `/api/seo-engine/archive-audit/content-preview`: authenticated 200,
  anonymous 401, stoppedOnError false. Preview
  `acp-2026-09-14T00-20-13-143Z-3d767f83` is unapplied and expires normally.
- Item `6aa25ad86a1d9776ca18ee12` had no safe new internal-link proposals (zero
  proposed links, one unchanged rejection). CMS fields and update/publication
  timestamps hashed identically before and after. No model or CMS write ran.
- Added an exact-owner SEO configuration and invalid-selection API check to
  `verify-editorial-roster-production.ts`, so roster acceptance cannot pass
  solely on general login while SEO rejects that owner. TypeScript passed.

This proves live route access, successful deterministic preview and no CMS
mutation. Zero proposals does not prove catalog completeness or useful link
coverage; the local loader tests remain separate evidence. No measured runtime
latency, bundle-size savings or billing reduction is claimed. Cloud Shell
authorization, colleague verification and the wider goal remain pending.

Environment updates require a new deployment, as described in the
[Vercel environment-variable documentation](https://vercel.com/docs/environment-variables/managing-environment-variables).
