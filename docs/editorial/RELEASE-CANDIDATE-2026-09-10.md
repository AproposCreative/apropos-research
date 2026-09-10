# Liv local release candidate, 10 September 2026

Base: `7904e31ed06007ad820f22d74bf7b68bae322598`.
User confirmed credential rotation. No credentials were accessed or independently
audited. Push and deployment await approval of the resulting exact commit.

## Included

- Canonical Liv voice, selective attribution and the two illustration directions.
- Critical style-reference filtering and supporting 50-article analysis/manifest.
- Private, authenticated research-run diagnostics for insufficient evidence;
  model output, source references and missing evidence retained by run ID.
- Preview UI explains missing research without treating notes as approved content.
- Responsive height for optimized inline images, with intrinsic dimensions kept.
- THIRST TRAP local feature package, sources, two supplied photos and an original
  Expressive illustration. This is not a CMS item or published article.

## Local validation

- 35 selected Vitest files, 412 tests passed. Includes Liv, Writer, research
  providers/service, style samples and optimized image HTML.
- `tsc --noEmit --incremental false` passed.
- Build-configuration security check and `git diff --check` passed.
- Lifecycle scripts disabled, existing dependencies only; isolated test storage
  `./tmp/vitest-rage`. No tracked research datasets changed.
- No production build, live API/CMS test, push or deployment in this checkpoint.
  Tests use fixtures/mocks; they do not certify live services or literary quality.

## Remaining boundaries

The daily cron still writes drafts, even in auto mode, until missing image/CMS
gates and the live-publication path are completed. This candidate does not enable
daily auto-publication. Instagram remains unchanged/off for this rollout.

THIRST TRAP photographer credits are unresolved. The generated illustration is
1672x941, not the requested final 1920x1080. CMS reference resolution, upload,
publication and public readback have not been performed. Deploying app code does
not publish this Markdown package to Webflow.

Other untracked historical audits and The Invite article/media working files are
preserved locally outside this candidate; they are not swept into the release.
