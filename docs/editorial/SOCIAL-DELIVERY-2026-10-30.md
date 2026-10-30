# SoMe drafts, publication receipts and Story export

Owner approved the four improvements on 30 October 2026: save work across sessions/devices, durable duplicate-safe publishing, explicit channels and convenient Story image/link export. No real social publication, paid AI call, credential/budget change or Instagram activation was part of this implementation.

## Implementation

- Private source-bound Firestore drafts retain final title/subtitle, caption, format, theme, independent text sizes, metadata selections, Story field order and per-article Facebook choice. The synchronous local journal preserves offline changes; server saves are debounced 600 ms and flushed on close/visibility changes where possible. Cross-device availability requires successful server sync.
- Optimistic revisions reject stale writes with HTTP 409. Explicit conflict choices use the known server revision and cannot silently overwrite a later concurrent update. Lost successful save acknowledgements replay without creating a new revision.
- A verified editorial user confirms the captured card version. Facebook is opt-in, explicitly displayed; Stories cannot cross-post to Facebook. No client-supplied user ID is trusted.
- The server validates the exact exported JPEG and SHA-256 against the authenticated user's existing upload path. It uses the existing bucket/rules; no arbitrary remote image fetch or proxy is added.
- Atomic approved-design/account identity and request-ID pointers reserve one executor across concurrent tabs/devices and changing download tokens and different Safari/Chrome JPEG encodings. The exact approved card/caption/link/format and the first exported image digest are retained. The approved channels are immutable. Intent is stored before each irreversible Meta call. API writes are never automatically retried. Failures before intent persistence cannot dispatch; a lost post response or final receipt write leaves a durable duplicate lock.
- Instagram, Facebook and the link comment retain independent receipts. Actual API permalink readback is optional and cannot invalidate a confirmed post. Read-only status checks may verify a known Instagram container as published. They never send a post or comment. Older receipts are collapsed to preserve the compact UI.
- Story export pairs the PNG download with a clipboard article link and a short link-sticker instruction. A graphic button is not a clickable Story link.

The selected final copy is synchronized. Existing AI candidate caches and spend guards remain in place; candidate-history panels themselves are still session-local. No audio, Spotify, CMS content, Liv producer or protected Writer file was changed.

## Verification

- 84 focused tests passed, covering auth/account isolation, draft versions, offline restore, conflicting devices, lost acknowledgements, edits during saves, simultaneous requests, immutable versions/channels, JPEG digest verification, no dispatch without durable storage, partial success, failed permalink reads, explicit Facebook and Story behavior, container readback and no resending on replay.
- Real client fixture passed at 320, 390, 768 and 1440 px. Manual copy/design persisted after reload and in a fresh browser context; stale edits required conflict resolution. Story PNG export and clipboard link worked. Double-click produced one fixture operation, explicit Facebook produced independent links, history survived reload, and a deliberately lost response recovered via GET without another publication.
- Application typecheck and lint passed. Tests use `RAGE_STORAGE_DIR=./tmp/vitest-rage`; fixtures block non-local network requests. Browser testing used an isolated headless test browser and no logged-in user session.
- Production-service Firestore verification at 2026-10-30T13:52:52Z passed actual draft write/readback, stale revision rejection, publication claim/replay, request readback and article-history query. All generated fixture documents were removed and absence verified. No real user draft, social account or published receipt was altered. Evidence: `firestore-verification.json`.
- Local evidence: `output/social-delivery-20261030/tests.json`, `report.json`, exported `story.png` and mobile/desktop screenshots.

## Deployment checkpoint

Implementation and tests completed. Exact release and public production verification pending at this checkpoint. No real Meta publication is claimed. A provider-level ambiguous Facebook response still requires checking the real channel; replaying the request is not a reconciliation strategy. Story permalinks may be unavailable from Meta. Historical posts from before this release have not been invented or backfilled into the new ledger.
