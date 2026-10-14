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

- Source `aa0044955b78a97b69e9ef370b38667faf41ff13`, MCP `2026-10-14-v33`.
- Deployment `dpl_Ac8x2pwc4gG5gPNjECP6bi2SqtPB`, READY. Clean Git archive,
  remote compilation/TypeScript/security gate and237static pages passed.
  Existing dependency audit remains10findings (3moderate/7high), not fixed here.
- Staged protected readback used official Vercel authentication, without weakening
  protection. OAuth resource audience is unchanged.15compiled script chunks
  verified the new decline action, label and status readback before promotion.
- After promotion, independent lookup of `ai.aproposmagazine.com` resolved to the
  exact deployment and source SHA above; no newer concurrent release replaced.
- Connected native MCP preview returned revision2, same content/candidate hashes,
  no preview problems or dependency error and no decline receipt. The host hides
  UI-only confirmation metadata from model output, as intended.
- Authenticated live external preview displays both **Brug dette billede** and
  **Fravælg billedforslag**, enabled with the actual private portrait loaded.
  At390px, both controls fit without horizontal overflow. No choice was clicked.
  Temporary browser tab closed and viewport restored.
- Connected MCP status at19:34:22Z matched the before snapshot for article,
  revision/hash, status, candidates, failure receipts, imports, image selection,
  published target and publication. `imageDeclines=[]`: the agent did not decline
  the owner’s picture. The original historical failure remains visible.
- Read-only preflight19:34:28Z preserves the consumed V32 grant and returns
  `canGenerate=false`, `image_dispatch_already_claimed` and
  `image_selection_required`; it neither clears history nor invents new authority.
- Bounded post-release error-log scan returned3HTTP200requests (MCP and external
  submission read) with the previously observed PassThrough listener warning.
  This is not a clean error log and not proof of a memory leak or failed image
  operation. Responses above completed successfully. No listener limits were
  increased and no unrelated runtime repair was bundled into this release.

Implemented, deployed and verified live **through the personal decision UI**.
Actual negative choice and a new authorized generation remain unperformed.
Update the Apropos tool connection in Work if it retains the old private action
schema, then request a fresh preview. The owner can decline the old portrait.
Only afterwards may an explicit one-attempt decision for the chosen new brief
be recorded and revalidated. This release is not proof of Work-native generation.
