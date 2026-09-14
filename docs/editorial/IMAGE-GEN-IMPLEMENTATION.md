# Image-gen delivery checklist

Approved September 14: shared entry point for Frederik, Casper and Milo;
private work per UID, shared Webflow articles, OpenAI server calls, two fixed
Apropos styles (Expressive default), 150 DKK separate monthly budget. No video
or Artlist runtime integration in v1. Do not change Liv's daily publishing.

## Required delivery

Implementation checkpoint, September 14: all v1 application paths below are
implemented locally. Full regression: 269 files / 3,758 tests passed, followed
by four additional passing asset-upload transport tests. Production build passed.
Offline browser verification covered 320/390/768/1280 px, restoring private work,
motifs, generation/edit fixtures, preview and staged-save fixtures with zero
provider calls or real CMS writes. The production acceptance boxes remain open
until the deployed API and the paid Gobs pilot verify them.

Known boundary: Webflow does not expose a documented conditional-write token for
this endpoint. Shared application locks and an immediate pre-PATCH read reject
detected conflicts, but cannot eliminate a simultaneous external CMS edit between
that read and PATCH. Ambiguous writes retain their lock and audit; no automatic
repeat write is made. Unknown image-provider outcomes likewise never auto-retry.

Gobs pilot candidate confirmed read-only: `6a83178d7cd3b8a2a97494aa`,
“Anmeldelse: Gobs på Wonder 26”. Re-read through the deployed API before generation.
The actual article does not describe an ape on stage.

- [ ] Paginated Danish Webflow article picker, title search, draft/live badges.
- [ ] Current article snapshot and existing images; no paid call on opening.
- [ ] Three grounded motifs with exact excerpt anchors plus bounded cached press search.
- [ ] Actual versioned style reference assets, owner-only style administration.
- [ ] Single image generation, new variant and reference-based edit, price quote.
- [ ] Durable private jobs, result history and idempotency across reconnects.
- [ ] Separate server-enforced monthly budget including in-flight reservations.
- [ ] Press source/credit/unknown rights plus recorded editorial confirmation.
- [ ] Preview and explicit image placement/replacement; preserve other article fields.
- [ ] Conflict detection, staged-only Webflow write and changed-field readback.
- [ ] Mobile full-screen navigation and account-switch isolation.
- [ ] Mock-provider regression and bounded Gobs/Wonderfestiwall live pilot.
- [ ] Exact deployment and production feature verification.

Do not check a requirement merely because types or a local unit test exist.
API credentials are the user's already authorized production credentials.
Unknown paid-provider outcomes retain their reservation and cannot auto-retry.
No changes to CMS/publication or paid calls are made by pure unit tests.
