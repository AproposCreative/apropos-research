# Liv: truthful draft status and CMS readback

## Scope

This change is a local, tested step toward automated publication, not completion
of the live-publication pipeline. No production credentials or settings changed.
The shared CMS writer and the parallel SEO image helpers are unchanged.

## Findings confirmed on 2026-09-09

- `publishArticleToWebflow` stages new CMS items with `isDraft: true`. Its name and
  requested payload status do not prove live publication.
- Liv previously derived successful history status from the requested mode and
  sent a `published` analytics event even for draft mode.
- The Webflow connector returned the Articles schema for
  `67dbf17ba540975b5b21c2a6`. It contains `minutes-to-read`, but no `word-count`.
  Author, section and topic collection IDs are in `validations.collectionId`.
- Webflow has a separate live-item read endpoint:
  https://developers.webflow.com/data/reference/cms/collection-items/live-items/get-item-live
  A staged item, an HTTP success, or an old `lastPublished` timestamp is not proof
  that the current article is live.

## Changes

- Liv calls the existing explicitly draft-only wrapper. Requested auto mode is
  returned separately from the observed `draft` status.
- Research-passing articles can be saved as drafts even when automatic publication
  is blocked. Research failures still stop before the CMS write.
- After saving, a GET-only adapter reads the staged DK item and collection schema.
  Missing/mismatched item ID, locale, title, slug, draft/archive state or schema
  fails the run. It never invents an item ID from the request.
- Field checks compare subtitle and SEO values, inspect content/intro presence,
  AI disclosure, reading time, accreditation, thumbnail and credit presence.
  Author and section names are checked against the actual reference items in
  the schema's collections, rather than trusting ID-shaped strings or fallbacks.
- These are draft diagnostics, **not** full content, topic, image-rights or live
  publication validation. Content and intro are checked for presence only.
- API reads reject redirects and arbitrary paths, disable caching, have a 15-second
  timeout and a two-megabyte body limit. Upstream bodies and credentials are not
  included in application errors.
- If a save succeeds but readback fails, history retains the CMS item ID for
  reconciliation. It does not claim success or automatically create another item.
- Analytics reports `draft`, not `published`, for a staged result.

## Still required before automatic live publication

1. Persisted server-side image provenance and rights/creation evidence tied to the
   actual stored bytes. Image search, TMDB, og:image and credit text are not proof.
2. Validate the complete final article fields after all shared-writer/SEO transforms,
   including topic references, image changes and the verified article fingerprint.
3. Durable, concurrency-safe stage/publish recovery, including ambiguous network
   outcomes. Retaining an item ID after readback failure is not exactly-once delivery.
4. Explicit DK item publication only after all gates pass, followed by actual live
   readback of the approved fields. Preview must remain write-free.
5. Separately approved exact clean release commit and post-deployment verification.

No `publicationReady` flag has been forced true. No site-wide publish is introduced.

## Verification

- Unit tests cover draft identity/locale mismatches, missing schema/reference data,
  changed SEO fields, oversized/non-JSON/auth-error responses, read-only URL scope,
  draft-only auto-mode fallback, truthful analytics and recovery item IDs.
- Tests retain the isolated `./tmp/vitest-rage` storage path.
- No dependencies installed or changed; npm lifecycle scripts were not run.
- 557 tests in 49 files passed. Typecheck and scoped ESLint passed.
- Production build passed with the same three existing podcast/SEO tracing warnings.
- Six compiled API modules loaded and rejected unauthenticated calls, including
  the Liv cron. The test awaits Next's lazy userland initialization before inspection.
- 207 deployment manifests passed the exclusion check for tmp, Git and root env files.
