# ChatGPT-supplied shortening through Apropos MCP

## User outcome and boundary

For an **already checked, ready, never-published Liv draft**, ChatGPT can now
propose a shorter body in the conversation, retain it in Apropos, ask Frederik
to read and confirm the exact candidate, and save it through the existing Liv
CMS operation. No new Apropos model generation is needed. This does not turn
arbitrary imported drafts or failed generations into ready articles.

The acceptance chain is: `get_shortening_context` → paragraph edits in the chat
→ `preview_shortening` → personal first-party review → `apply_shortening` → CMS
readback. `get_shortening_status` recovers saved proposals, real reviews and
save receipts. Publication remains a separate fresh preview/confirmation flow.

## Implementation

- MCP version `2026-10-05-v2`, 28 tools. Four shortening tools use the existing
  owner pilot, read/draft scopes, no-paid guard and audit trail. No MCP tool can
  provide the personal review itself.
- Both the existing paid proposal and external proposals share the exact
  baseline/checkpoint, paragraph-edit, candidate, review and CMS services.
  External text is recorded as `chatgpt-supplied`, `providerAttempted=false`,
  `modelVerified=false`, with the authenticated actor and submission hash.
  No invented model verdict, API finish reason or quality score is recorded.
- Proposals are immutable and bound to request ID, CMS/payload versions and
  candidate hash. Exact retry reuses the proposal; same ID/different input is a
  conflict. Owner identity cannot be supplied in tool arguments.
- Existing shortening limits and checks remain: 450–650 target words, only
  shortening editable paragraphs, exact original passages and preservation of
  inline media, links, quotations, cover, SEO and other metadata. Original
  checkpoints, proof and edit history remain available.
- `/connect/chatgpt?shortening=<proposalId>` shows the candidate and original
  in the existing simple, single-column design. Explicit reading/facts/meaning
  confirmation records review only. `/oauth/shortening` requires first-party
  owner authentication; an MCP bearer and colleagues are not allowed to approve.
- The existing CMS operation still requires the saved exact review, current
  ready entry, unselected draft, write lease, immutable pre-edit audit and full
  readback. Only content/read-time fields change. Timeout recovery reads the
  same operation instead of repeating an uncertain CMS write.
- A staged receipt is historical save evidence, not public visibility. Changed
  versions, missing checks or ambiguous readback remain blocked. This release
  does not reset holds/reservations, publish anything or enable Instagram.

## Local verification

- Full isolated suite: **335 files / 4,747 tests passed** using
  `RAGE_STORAGE_DIR=./tmp/vitest-rage`. TypeScript, scoped ESLint, diff checks,
  build-config security and the production build passed.
- New service regression: 23 cases with the actual shared proposal/review/CMS
  services and mocked storage/network. First-party route: 14 cases; SDK protocol
  coverage includes schemas, scopes, actor rejection and nested paid-call denial.
- Positive simulated flow reaches one exact staged CMS patch/readback. Negative
  cases include missing review, published/non-ready/selected drafts, changed
  checkpoint/CMS, conflicting identities, other owners, forged provenance,
  altered review/receipt hashes, media failure and ambiguous CMS responses.
- Isolated service-authenticated localhost browser, **390×844 and 1280×900**:
  ordinary pointer clicks opened/closed the original; approval stayed disabled
  until checked; a double click made one POST; refreshed status retained review.
  No horizontal overflow, framework error overlay or page error was observed.
- Browser API responses were simulated locally, not production approvals.
  Changed versions, staged/uncertain saves, network errors, mismatched approval
  responses, lost approval readback and request timeout were exercised. A lost
  confirmation reused the same proposal and did not send a second POST.
- The initial agent-browser interaction was inconclusive. Re-running with an
  isolated fresh browser and actual Playwright pointer interaction succeeded;
  the harness was corrected to scope alerts away from Next's route announcer.
  No speculative layout patch was made to hide an automation failure.
- The edit workflow skill passed the existing skill validator. No runtime
  dependencies, paid model calls, CMS test writes or fabricated human scores.

## Production verification

Pending exact pushed SHA/deployment and authenticated read-only production
acceptance. Local success is not yet production success.

## Remaining acceptance

The owner's actual ChatGPT connection and an owner-selected editorial task are
not proven by the isolated service/browser tests. Positive real CMS mutation
must use an actual chosen ready draft and Frederik's real version-bound review,
not a synthetic production approval. Generic draft admission, real human
quality calibration, a representative extraction-gap comparison and unattended
Liv delivery remain in the full workflow/delivery checklists.
