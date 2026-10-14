# V33: decline a private image candidate without clearing history

## Objective and observed cause

Owner approved implementation, tests and release of a personal negative image
choice and safe continuation. No generation, personal choice or publication is
authorized by this technical task.

Barsel submission `546794452af45693e3495ae29d4fe5d8912c33844aaa62db10b2ad8a94e36171`
remains revision2, content hash
`a26827edd659ebe4b6c85c99115fa0a567346b6374b89d4bf4da49069cc1f846`.
The old selfie candidate is private, unselected, not an article attachment:
`c190d0e5882f3cce6936b8ec605d47f2775d1c81ef1f47af2463d29e41806185`.
Original SHA256 `1a354c0e14c0c1f54fee88413e9343b855a3590a5107b549a893137b188073c1`.

Two concrete defects: preview offered only positive selection, leaving an
unwanted candidate pending; the one-shot resume identity used only previous
technical failures, so another human decision after a consumed trial collided
with the existing immutable grant. Neither is a Webflow or provider-credit error.

## Minimal correction in the existing workflow

- Both chat widget and external preview offer **Fravælg billedforslag** for a
  visible, current, not-yet-selected private generated candidate.
- The same UI-only confirmation bearer binds positive/negative choice mutually
  exclusively to user, grant, purpose, revision and displayed original hash.
  Old bearers without decline capability cannot be repurposed. The external
  endpoint retains authenticated ownership, first-party Origin and strict schema.
- A transaction creates an immutable negative-choice receipt beside the original.
  Only candidate status changes. No file deletion, CMS upload, article/version
  change, publication consent or image generation. Exact retries replay safely.
- Pending-choice projection recognizes an exact personal decline receipt, never
  a bare status flag. Old selection links and repeated/relabelled imports cannot
  resurrect the declined bytes, even with a different request ID.
- Decline does not authorize retry. Preflight remains stopped until the owner’s
  separate explicit decision is recorded through the existing operator service.
  The next immutable grant additionally binds the declined-file set. Prior grant
  IDs remain compatible when there are no declines; old consumed grants and
  failures are preserved. Concurrent claims consume one dispatch at most.
- Both UIs guard double clicks and read status after a lost response. A matching
  decline receipt resolves the uncertainty without another mutation.

Changed paths: central candidate state/service, preflight/resume/import/status,
chat preview private confirmation, authenticated external route, two existing UI
surfaces, MCP error guidance/version, focused tests and browser fixtures. No new
image engine, paid model dependency or model-facing decline/grant tool.

## Verification

- Final isolated suite: **386 files / 5,427 tests** (see release verification).
- Focused image/security tests:82; route tests:10. Coverage includes wrong owner,
  grant/scope, hash, stale version/content, missing displayed pixels, expired or
  old tokens, selected-file refusal, exact replay, concurrent choice, retained
  originals/history, no automatic retry and one new explicitly authorized grant.
- Chat widget fixture: positive/negative choice, lost reply, missing pixels and
  legacy token at mobile/desktop. Double click makes one write and one readback.
- Actual external React component:10 browser cases (390/1200px × decline, lost
  reply, stale, missing pixels, selected). No overflow or browser errors. Real
  network/auth/CMS are isolated. Screenshots in `output/image-decline-v33/`.
- TypeScript, build configuration and lint checked. Repository lint has9 existing
  warnings,0errors; changed components pass. No dependency changes.

These are simulated personal actions, NOT a real owner decline or publication.
No native image generation is used as a test. Hidden generator processing still
has `exactPromptExecutionVerified=false`; Work-host image quality is not proven
by this release. A new direction needs its own valid brief, actual references,
explicit retry decision and fresh preflight before any image call.

## Release and live readback

Pending exact release/build and read-only production verification. Do not treat
passing tests as deployment or a completed personal image choice.
