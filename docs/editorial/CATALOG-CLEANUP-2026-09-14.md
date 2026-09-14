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

This is local verification, not a production release receipt. No claim of
measured runtime latency, bundle-size savings or billing reduction is made.
The separate Cloud Shell authorization and real colleague verification remain
pending; this cleanup does not bypass those requirements.
