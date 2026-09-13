# Writer staging: no post-publication SEO on draft save

## Finding and implementation

The shared staged-save function called the post-publication SEO hook after CMS
readback. That hook normally rejects unpublished locales, so this finding is
not proof that every draft incurred model charges. It could still read runtime
settings and both locales, and an update to an existing live item could consider
the older live version for review without a new publication event.

Removed that call from `lib/articles/publish.ts`. Draft save and recovery retain
canonical-content checkpoints, CMS readback and the durable Writer operation
journal. The authenticated Webflow webhook still handles post-publication SEO;
its locale/publication checks are unchanged. No model or quality gate was removed
from article preparation.

## Evidence

- 44 focused tests passed, covering shared save, journal recovery, CMS field
  mapping and post-publication SEO locale behavior.
- Complete isolated regression: 3,440 tests in 241 files passed.
- Type-check and production build passed.
- Logs: `/tmp/apropos-staging-seo-tests.log` and
  `/tmp/apropos-staging-seo-build.log`.
- No paid AI calls, production CMS writes or credential changes in this step.

## Remaining acceptance

This change is local until a release receipt states otherwise. Deploy and verify
the exact SHA before the real Writer API test: create one clearly labeled private
test draft, replay the same draft operation, prove the same CMS ID and checked
body, then archive that exact test item while retaining its audit. Never publish
the test or substitute this test for Liv daily-publication acceptance. No actual
currency savings have yet been measured.
