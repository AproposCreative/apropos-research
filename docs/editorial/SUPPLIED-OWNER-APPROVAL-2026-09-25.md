# Supplied original reviews: separate editorial authority

The owner explicitly supplied and approved the Partybus review and rejected
another paid AI factcheck. Automatic candidates had failed and the queue was
empty. The supplied review's prior combined assessment timed out; that failure
and its uncertain cost receipt must not be rewritten as successful evidence.

## Implementation

- Owner-authenticated `POST /api/liv/operations/approve-supplied` records an
  exact-checkpoint approval for an immutable, explicitly supplied original book
  review. It cannot approve generated copy. No CMS or AI request is made here.
- Optionally accepts the owner's uploaded cover, validates real image bytes,
  optimizes WebP without enlargement, uploads immutably and reads bytes back.
  The current owner-selected image deliberately preserves the printed book
  title. Credit/rights are not invented; unknown photographer remains unknown.
- Shared preparation lease, immutable receipt, request idempotency and
  transactional compare-and-swap retain original failures, prose and body images.
- Existing retry API resumes the normal runner. Only this separate approval
  replaces paid editorial assessment and dated-source supplementation. It is
  explicitly labelled owner editorial approval, NOT AI factual verification.
- Generated articles retain normal safety gates. Structural checks, source URL
  presence, CMS mapping, media byte checks, draft readback and queue admission
  stay in the shared path. Preparation does not itself publish live.

## Verification before release

TypeScript passed. Final isolated suite: 299 files, 4,122 tests passed.
Tests cover owner-only authorization, stale/altered copies and reservations,
concurrent/active/saved jobs, immutable replay, genuine editorial audit,
prepared cover validation, storage readback, and common-runner behavior with
successful and failed CMS readback. Regression uses simulated AI responses.

## Production receipt

- Release `ba9d07ec130bc627c2788598b73e7da22beb808f` deployed READY as
  `dpl_6HNL1UwrYS8aEn2eRVeGwudrmptF`, alias `ai.aproposmagazine.com` verified.
- Owner-authenticated approval API: HTTP 200, `editorially_approved`, explicit
  `aiFactcheck:false`. Receipt `partybus-owner-original-cover-20260925`.
- Existing retry API: HTTP 200, `queued:true`, `saveVerified:true`,
  `webflowStatus:draft`. Webflow item `6ab63b300dab9b2ea23d8fff`.
- CMS readback at 2026-09-25T09:13:22Z: Danish locale
  `67dbf17ba540975b5b21c225`, all 25 field/reference/image checks passed.
  Proof includes separately labelled owner editorial authority.
- Authenticated `/api/liv/delivery/feed`: HTTP 200, total 1, Partybus review
  state `ready`, scheduled 2026-09-25, rating 5, publicationBlockers empty.
  Cover downloaded and byte hash matched the owner-approved asset; 2 body
  images present. Queue and preparation enabled. Live publication is NOT
  claimed by this preparation receipt; the separate scheduler owns delivery.
- Photographer was not supplied, so credit remains explicitly unknown:
  `Brugerleveret billede; fotograf ikke oplyst`.
- Other automated candidates are still unfinished. This release fixes the
  supplied-original-review path, not every automatic research failure.
- The legacy run `reason` retains the previous verification-complete failure
  because history merges fields; the current status is draft, current gates
  are passed and queue blockers empty. Previous assessment/unknown cost is
  preserved, not relabelled or charged again by this editorial approval.

The shared CMS image optimizer also enforces text removal. A byte-bound,
owner-selected printed-book exception is therefore recorded in the same
approval transaction and checked against its immutable audit. It is not a
text-free verdict. Deterministic resized WebP variants inherit only that
artwork permission; other assets retain the standard policy. This avoids
removing the title from the supplied book photograph or buying an AI edit.
