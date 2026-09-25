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

Production deployment and queue receipt will be recorded after execution.

The shared CMS image optimizer also enforces text removal. A byte-bound,
owner-selected printed-book exception is therefore recorded in the same
approval transaction and checked against its immutable audit. It is not a
text-free verdict. Deterministic resized WebP variants inherit only that
artwork permission; other assets retain the standard policy. This avoids
removing the title from the supplied book photograph or buying an AI edit.
