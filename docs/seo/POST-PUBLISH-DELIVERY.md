# Automatic metadata review delivery

User goal: implement and deploy automatic SEO-title and meta-description quality
review after publication across Liv, Writer and direct Webflow publications,
plus later optimization grounded in Search Console and GA4 results.

## Current evidence (2026-09-12)

- Dedicated worktree: `apropos-research-seo-quality`, branch
  `codex/seo-post-publish-quality`, started from freshly fetched main `40909b5`.
- Fast-forwarded to Liv's verified production `523b1ea` to preserve all newer
  editorial, API and security fixes. Liv is separately deploying `17e0c6f`;
  include it and coordinate the latest production SHA before SEO deployment.
- New isolated `post-publish/policy.ts` allows improvements to filled fields,
  preserves per-field locks, rejects changed snapshots and editorial drafts,
  requires comparable performance evidence and enforces a 28-day cooldown.
- New `post-publish/review.ts` reviews both filled fields using article content,
  then independently checks proposed changes. Strict output parsing, no fake
  fallback, no silent article truncation. Calls are dependency-injected.
- 16 unit tests pass with existing local Vitest runtime; no live model call,
  CMS change or deployment yet. The reused dependency tree differs from this
  release lockfile: these isolated tests are not a full build verification.

## Required work before claiming completion

1. Connect the reviewer to existing authenticated OpenAI server configuration.
   Persist requests/responses and independent verification by stable job stage;
   resume saved results without regenerating completed paid stages.
2. Durable job and per-item/locale state: atomic deduplication, leases, bounded
   retry/recovery, content version, audit history, locks and cooldown. A metadata
   update's own publish event must not create an endless rewrite loop.
3. Integrate the shared publish hook and authenticated Webflow publication
   webhook. Supplement missed delivery with paginated published-item discovery,
   including articles absent from GSC. Never publish a draft locale.
4. CMS adapter must compare live/staged snapshots, respect existing shared CMS
   write leases, patch only SEO fields, verify exact CMS readback, publish the
   correct locale and verify public HTML metadata. Reconcile uncertain writes
   before retrying. Do not release unrelated staged editorial changes.
5. Integrate GSC/GA4 evidence and existing opportunity schedules into the same
   metadata ownership/lock/cooldown system. Require meaningful samples and
   comparable periods; do not attribute search changes to SEO alone. New articles
   receive immediate content-based quality review without fabricated traffic.
6. Cross-site uniqueness check using real current metadata; expose status,
   before/after, reason, evidence, errors and per-field editorial locks in SEO UI.
   Preserve headline, body, slug, ratings, media, dates and design.
7. Expand tests to API authorization, duplicate delivery, retry after uncertain
   writes, concurrent editorial edits, DA/EN, Webflow/Liv/Writer coverage, missing
   analytics, and published readback. Run relevant existing SEO regressions,
   typecheck and build against verified dependencies.
8. Coordinate current release with Liv; deploy exact combined commit and verify
   deployment SHA, credentials/connections, webhook and schedules plus affected
   production flow. Report failures honestly; ready deployment alone is not proof.

Production changes remain unimplemented. The goal is active and is not reduced
to these two tested modules. Instagram stays off. Existing user authorization
covers necessary implementation and deployment; no new per-commit approval.
