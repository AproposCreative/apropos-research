# Chat article intake and preparation — 5 October 2026

## Approved outcome

Frederik sends an article through the existing remote Apropos MCP. The chat
preserves his copy, obtains real CMS choices, asks at most three missing questions
at a time and supplies missing metadata. Existing images and source material are
reused. Film/TV requires real stills; music can use clearly credited illustrations
anchored to actual sections. Preparation uses the existing application services,
not a parallel publishing system. No team rollout, Instagram, audio or video.

Payment acceptance and publication approval are separate first-party owner actions.
The chat cannot supply either approval. API production remains separately billed;
an MCP connection does not turn ChatGPT subscription usage into API credit.

## Implementation

- Eight new MCP operations: `get_submission_options`, `list_submissions`,
  `prepare_submission`, `update_submission`, `get_submission_status`,
  `find_submission_images`, `get_submission_media_context`, `reconcile_submission`. `get_workflow` accepts
  `submit`. These operations are wrapped in the existing no-paid-AI boundary.
- Owner-private `editorialSubmissions`, stable request IDs, revision conflicts,
  immutable originals, update receipts, archived versions and persisted steps.
  No placeholder CMS item is created for image generation.
- Bounded extraction from supplied official source URLs before paid research.
  A search candidate is never labelled licensed or approved; source credit and
  unknown rights status remain explicit. Existing visual-reference research and
  image validation are reused for generated illustrations.
- A private preview link shows an estimate and conservative package reservation
  ceiling. Every nested text/image/internal-HTTP provider call is bound to the
  accepted article hash and the same cross-ledger ceiling. Existing monthly
  limits, quota holds and unresolved reservations are unchanged. Estimates are
  not invoices, and a ceiling does not guarantee every production can finish.
- Durable worker: one step per invocation, leases, persisted intent/results,
  independent cron continuation. An ambiguous paid step blocks rather than
  buying again. Status exposes the saved steps and concrete blocker. Existing
  images are retained when valid; cover cleanup and size correction are explicit
  preparation work. Body placement uses article section anchors.
- Existing safety checks, canonical Writer staged-save receipts and CMS readback
  precede owner preview. Preview renders text and images in article order without
  executing imported HTML. A prepared title/metadata correction preserves its
  completed assets and invalidates the old approval; CMS conflicts stop saving.
- Exact-version owner approval supports now or a future Copenhagen timestamp.
  DST gaps/ambiguous times are rejected. Only the item is published. Uncertain
  writes get read-only reconciliation with backoff, never a second publish.
  These explicit submissions do not consume or prove an unattended Liv slot.

## Verification so far

- Focused tests cover intake/isolation/revisions, package ceiling across both
  ledgers, nested signed cost context, first-party-only approval, section anchors,
  supplied-image reuse, step persistence, provider hold, DST, stale CMS preview
  and publication timeout reconciliation.
- Isolated real React component tested in headless installed Chrome at 390px:
  no horizontal overflow or console errors; payment and publication buttons
  disabled until checked; one price action, no publication action. Body image
  appears between its surrounding paragraphs. No production authentication,
  provider/CMS calls or user article was used by this browser fixture.
- TypeScript, focused ESLint and safe-build configuration passed during development.
  Final isolated suite: **343 files / 4,803 tests** pass. Optimized local Next.js
  build passed; subsequent reconciliation/auth changes also pass TypeScript and
  scoped ESLint and will be checked in the exact remote production build.
  Final release SHA/production verification must be recorded below.

## Acceptance still requiring real evidence

- Owner ChatGPT connection exposes the new tools after refresh.
- One actual film article: supplied text, required questions, real stills,
  personally accepted budget, completed checks, owner preview, targeted
  publication and public readback.
- One actual concert article: source-anchored illustration and actual visual
  research, same price/check/approval/readback workflow.
- Real paid latency, acceptance rate and cost are **not measured** by mocks.
  Do not call this fully end-to-end verified until those owner pilots finish.
  The saved provider quota hold must not be reset just to run a pilot.

## Operational limits

An unclear paid step is intentionally retained for evidence-based recovery;
there is no general-purpose automatic retry or permission to regenerate it.
Uncertain CMS saves can be reconciled through MCP using existing save intent,
unique staged-item readback and unchanged checks, with no new CMS write or AI.
Source lookup is bounded, not a guarantee that three suitable press images exist.
User-supplied media uses existing HTTPS assets with alt/credit; arbitrary private
ChatGPT attachment URLs are not treated as server-accessible uploads. Missing
assets, source evidence or metadata remain blockers, not fabricated completions.

This release does not settle the separate every-other-day Liv delivery objective.
