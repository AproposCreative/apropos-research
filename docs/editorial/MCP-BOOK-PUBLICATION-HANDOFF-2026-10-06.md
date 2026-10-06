# Book publication handoff: implementation and acceptance

## Scope

Regression case: *I mellemtiden er vi ingen*, Frederik Drescher Kluth.
Existing submission `396904fb485abe48df3663e0b3d8c955a83ecc3670c323aa1c1c2838040785a2`.
Existing DK CMS item `6ac561f59604a82185235285`.
Do not create another article. The selected mockup has not yet been supplied to
this development task; the existing CMS hero is the explicitly reported fallback.

The owner's 6 October instruction makes two body images recommendations for
**personally reviewed submissions** when deferred explicitly. Cover remains
required. A personally confirmed human final review may replace optional paid AI
checks. This does not weaken unattended Liv's existing checks or imply an AI pass.

## Implementation

- Native `openai/fileParams` remains the transport contract (`download_url`,
  `file_id`, optional `mime_type`/`file_name`). Removed the regional host allowlist
  that rejected `oaisdmntprdenmarkeast.blob.core.windows.net`. Destinations remain
  untrusted: HTTPS, no credentials/ports/IP hosts, public DNS pinned for the
  request, no redirects, bounded raster bytes and image decoding before storage.
  Generic binary MIME is allowed only for native file input, with raster decoding.
  Signed URLs are not persisted or echoed. No backend ChatGPT-file API was invented.
- New imports retain exact original JPEG/PNG/WebP bytes, dimensions and crop.
  Private content-addressed originals and CMS upload receipts survive timeout.
  User-uploaded art needs no invented generation brief; generated/edited
  illustrations retain the existing brief/section checks. Provenance is declared,
  not independently verified. Stored/requested hashes and selected identities are
  exposed; no silent fallback. The generated-image renderer belongs to ChatGPT;
  MCP returns an image preview after successful import.
- Selected media are locked against silent URL removal/replacement, automatic
  text removal/cropping and later image-optimizer webhooks. Explicit imports can
  replace cover or a specified body asset. Hash changes at a locked URL fail.
- `bodyImages=deferred` and `aiFinalChecks=human` are saved proposals, not model
  approvals. Personal UI confirmation binds the choices to the exact content
  hash. Free preparation runs under a no-paid-AI context, even with provider hold.
  AI stages are recorded `not_run`, not passed. All supplied media can be checked
  within the same free worker invocation; no paid retry or hold reset.
- Preview distinguishes recommended body media from blockers; final approval
  remains a personal version-bound “Publicér denne version”. Deterministic CMS,
  locale, required-field, reference, raster, exact-byte and public checks remain.
- `link_published_submission` checks matching staged/live item and exact prose,
  title, slug, SEO, references and rating, then binds that private submission to
  the existing item. Binding advances the version and invalidates old UI tokens.
  No CMS write occurs at binding. Later staging patches only hero/mobile/credit
  and image placements. Other fields and the original publication date stay
  untouched; concurrency conflicts stop the operation. Uncertain writes reconcile
  by readback without another create/patch. New submissions stop at duplicate slug
  or title rather than creating a second item.
- Reader capture is unchanged. Discovery descriptions and the focused skill
  recognise a KK link / “Anmeld denne bog”. A direct private source lookup avoids
  recreation; complete saved notes can be reused. `readerSourceId` transfers book
  metadata and client-reported coverage into a new submission, not full book text.
  Host tool discovery and Cloud Browser availability are not server guarantees.
- Book title/author are distinct CMS fields, preserved through canonical payload
  and checked when supplied. Missing schema must not silently drop book identity.
- Media staging and publication share the existing per-item CMS write lease with
  SEO writers. A media-only or human-final-review publication records an audited
  preservation marker for that exact content/metadata version before publishing.
  The automatic publication-quality worker verifies fresh live/staged state and
  keeps that version without a paid review. This is not a fabricated AI pass or a
  permanent SEO lock; later content versions and independently justified Google
  performance reviews retain the existing policies. Pending writes still reconcile.

Official native file contract consulted:
https://developers.openai.com/plugins/reference

## Verification before deployment

- Isolated suite: 355 files / 4,958 tests passed; subsequent focused version-binding
  tests also passed. TypeScript, focused ESLint, safe build config and isolated
  Next production build passed. Final release receipt records the final run.
- Simulated cases include regional/future file hosts, private DNS/redirect rejection,
  original-byte upload, MIME/dimensions, timeout reconciliation, asset locks,
  cover-only under quota hold, genuine confirmation versus model proposal,
  same-item media patch, later body insertion, stale CMS/version conflicts,
  preserving SEO/rating/date/slug, and unchanged strict Liv defaults.
- The current SEO release `9721210d302288288920a5b2c52e52cf24e7190a` and its
  documentation were fast-forward integrated before this release. Do not roll back
  the concurrent SEO work.

## Real acceptance still required

Reader state was independently retrieved from production: revision 24,
154/154 positions, 24 batches, `reported_complete`, no full book text stored.
This is saved client-reported reading, not independent proof of every page read.

The original selected mockup has not reached this task or submission storage.
No substitute was generated/imported, no duplicate was created and no fabricated
ChatGPT download URL was used. Real uploaded/generated/edited native file inputs
and this existing article's hero correction / subsequent body additions are NOT
declared passed by mock tests or a READY deployment.

Resume with the original selected file in a ChatGPT session containing Apropos AI:
refresh tool discovery if needed, read the existing submission, bind the exact CMS
item if not already bound, import the native existing file with stable requestId,
retain deferred body decision, preview the exact version, obtain real personal
approval and publish/read back that same item. Then add the selected body images
with stable section/asset identities, approve the new version, and compare all
non-media CMS fields. Never infer approval from this technical checklist.

## First production readback, 6 October 23:45 Copenhagen

- Implementation `43dac9d596597676a361c8218df126b9df8515d3`, deployment
  `dpl_6L2H5tyawnpqZY5SLuCbBvsh1poJ`, READY on `ai.aproposmagazine.com`.
- Authenticated MCP reported `2026-10-06-v11`, 48 tools, and the native object
  schema / `openai/fileParams` on `import_submission_image`.
- Source lookup by reader URL returned the same revision-24 source with 154/154
  reported positions. No reader data or full book text was created/changed.
- The real API bound the existing submission to item `6ac561f59604a82185235285`
  (revision 3→4) and saved the proposed deferred-body/human-review choices (4→5).
  These are not personal approval or CMS/publication writes.
- Preview: required missing `cover`; recommended `body-1`, `body-2`; estimate and
  ceiling 0 DKK, provider hold still true. Publication not ready without the cover.
- Before/after CMS hash stayed
  `5cdbf001ae0c32b263aeab5722790b6e60412f1dff3fb56817245da49f481f5e`.
  Article text, lastPublished, workspace, welcome-mail state, ledger and provider
  hold unchanged. No duplicate, paid AI call, or article publication.
- Temporary service OAuth read/draft grant revoked afterwards; ordinary ChatGPT
  connections untouched. This is a production MCP service-client check, not a
  native ChatGPT-file or user-approval E2E test.

## Follow-up regression

The shared CMS lease and exact-version SEO preservation guard passed the full
isolated suite: 355 test files / 4,963 tests, TypeScript and focused ESLint. This
includes lease contention/release, preservation audit replay, retaining prior SEO
locks/history, pending-write refusal, no paid publication-quality review for the
preserved version, and continuing eligible independent performance reviews.
