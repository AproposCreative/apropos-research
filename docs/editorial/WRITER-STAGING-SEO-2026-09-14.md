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

The production release and same-operation replay test below are complete. Lost
response recovery still has isolated fault-test evidence, not a deliberately
interrupted production request. Full Writer UI/multidevice and Liv publication
acceptance remain separate. No actual currency savings have yet been measured.

## Production receipt

- Commit: `19922f21cfb18572e9ad4cb33dd9912b7558f9e4`.
- Deployment: `dpl_86aWmEKESVBuqiG433eStfnX8Kra`, READY, exact SHA verified;
  production alias includes `ai.aproposmagazine.com`.
- Executed `scripts/verify-writer-cms-production.ts --execute` against the real
  `/api/writer/cms-save` with an authenticated verified Frederik identity.
- Two identical requests for `acceptance-writer-cms-19922f2` returned 200,
  `private, no-store`, `saveVerified: true`, `publicationVerified: false` and
  the same item ID `6aa739c915cd9e0275428a92`.
- Server operation journal was `saved`. Direct Webflow readback confirmed exact
  test title/slug, equivalent body (including Danish characters), `isDraft: true`
  and no `lastPublished`. Test item was absent from the pre-create ID baseline.
- Cleanup archived that exact unpublished test item. Readback confirmed
  `isArchived: true`; item is recoverable, journal retained. No existing article
  or private workspace snapshot was changed. No test article was published.
- This test intentionally used a small technical text, not a full illustrated
  editorial article. It proves real API save/replay/body readback, not editorial
  image handling, rights, daily publication, or colleague login.
- Global production error/drain scan was not performed in this step.
