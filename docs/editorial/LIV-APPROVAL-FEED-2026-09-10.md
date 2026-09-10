# Liv · Ugens historier

Local implementation; no production access, deployment, secret changes, paid generation or CMS writes performed.

## Reader flow

- New default tab in Liv Redaktion: Ugens historier.
- Five real prepared articles per page, image above title and excerpt, category badge, planned date/reserve label.
- Godkend / Afvis persist to the existing Firestore delivery manifest. Decisions remain visible and can be reversed before selection.
- Clicking the card expands a plain-text article excerpt (up to twelve paragraphs/headings).
- Approved eligible articles precede pending ones. With no approval, Liv may choose a pending eligible article. Rejected articles are excluded, including from reserve counts.
- Future scheduled articles cannot be pulled forward. Existing quality gates, one-publication/day ownership and Instagram-off behavior are unchanged.
- Buttons do not publish or override content/media checks.

## Implementation

GET/POST `/api/liv/delivery/feed` use the existing Firebase ID-token authentication. Preview responses are private/no-store, bounded to five immutable payloads per request, and contain only presentation fields. Article HTML is converted to plain text. Images are restricted to existing storage/Webflow CDN hosts; no arbitrary server-side image fetching is added.

The manifest stores decision, decisionRevision, decidedAt and decidedBy. A decision transaction checks item ID, exact payload hash, expected decision revision, expiry and publication ownership. It uses the same transaction document as the worker, so rejection-before-selection excludes the article; selection-before-rejection yields HTTP 409. Stale browser tabs cannot overwrite a newer choice. Failed/ambiguous client responses require a refresh before another choice.

Next.js and React skill guidance influenced server-side DTO serialization, parallel bounded reads, deferred loading of the old desk, explicit image aspect ratio, accessible toggle states and 48px action buttons. Browser tooling fell back to the existing Playwright dependency because agent-browser was unavailable. No dependencies were added.

## Verification

- Full Vitest suite: 1,032 tests / 100 files passed, isolated RAGE_STORAGE_DIR=./tmp/vitest-rage.
- TypeScript: passed with no emit/incremental cache.
- Fresh isolated Next production build: passed; nine existing broad file-tracing warnings remain.
- Offline browser integration using the real feed and Next Image component: passed at 320px, 390px and desktop; five cards, approve/reject, persistence across reload, details, pagination, conflict recovery, touch target sizes, no horizontal overflow and no browser page errors.
- Reproducible browser test: `test/e2e/liv-approval-browser.mjs`. It uses only synthetic test stories, local HTTP endpoints and an isolated Chrome session. It does not authenticate to production.
- Screenshots: `tmp/liv-approval-visual/mobile.png`, `tmp/liv-approval-visual/desktop.png` (explicitly synthetic preview images, not editorial output).

## Release / remaining work

The recovery override still requires credential-rotation confirmation and approval of an exact release commit before push/deploy. This feature does not activate queue/preparation flags. Once released, generate and inspect the first five real prepared stories through the existing pipeline and verify the feed with a real editor session.

With an empty or disabled preparation queue the UI says so; no fake five-story inventory is seeded. Rejecting everything cannot safely guarantee a daily publication: usable reserves or new work are required. Existing immutable job IDs may prevent automatic regeneration of an already prepared rejected slot; such a slot needs a separately identified new preparation job, not resurrection of the rejected item. Production notification delivery and the remaining daily-delivery activation checks in LIV-DAILY-DELIVERY-2026-09-10.md are still outstanding.
