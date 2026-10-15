# V36: consistent native image input modes

## Scope and diagnosed difference

The owner requested repair of the reported Work `conversation_context` mismatch,
without image generation, article changes, paid backend AI or publication.

The existing V31 brief instruction and generation report already allow both
`explicit_arguments` and `conversation_context`. V32's one-trial authorization,
its reader and later V34 claim schema were hardcoded to `explicit_arguments`.
That inconsistency is directly observable in code. It explains rejection of a
context-mode claim, not why a previous native image had the wrong visual style.
V31's context trial failed visual checks; V32's explicit trial produced a valid
private candidate subsequently declined by the owner. Both originals remain.

The user's Work session reports a context-only `image_gen.text2im` interface.
This technical task does not independently inspect that session's hidden tool
input or invoke its generator. Official [image-input guidance](https://learn.chatgpt.com/docs/image-inputs)
describes visual context, but does not establish that exact internal schema or
prove native prompt/reference delivery. No claim of a documented hidden bridge.

## Narrow repair in the existing workflow

- Reuse one input-mode enum for generation reports, operator authorization and
  claim. Read the actual saved mode; never reinterpret old explicit grants.
- Read-only preflight accepts the host's reported mode and rejects a mismatch
  with the existing grant. It separately reports required/requested mode,
  `hostCapabilityVerified=false` and `nativeInputVerified=false`.
- Context mode still requires the entire unchanged canonical prompt and actual
  ordered style/subject images in the current generator context. Links, hashes,
  summaries, references to old messages and invented input evidence are not
  substitutes. Missing delivery means STOP without claiming.
- Claim consumes only the recorded mode, exact request/grant/article/brief and
  placement. One atomic success; replay or lost response never allows a second
  call. Models cannot create authorizations, adapt modes or extend expiry.
- A context-mode retry import must report `conversation_context`; a missing or
  mismatched report rejects and retains the original. Historical explicit-mode
  reports may remain `not_reported`; no evidence is retroactively manufactured.
- Operator-only `adaptUnusedImageAttemptInputMode` creates an immutable successor
  for the SAME active unused attempt, request and original expiry. The direct
  owner decision is recorded. Predecessors are unchanged; the existing routing
  head selects the successor. Expired, consumed, stale, foreign, pending-selection
  or missing-reference states reject. Renewal cannot silently switch mode.
- No new image motor/provider, tool, approval flow or public attachment path.
  Semantic checks remain reported judgments, hidden execution remains unknown,
  and the actual image must still be personally selected before attachment.

Changed implementation: `lib/editorial/image-attempt-resume.ts`,
`image-generation-evidence.ts`, `image-preflight.ts`, `chat-image-import.ts`,
and `lib/mcp/server.ts` / `config.ts`. Existing brief construction, canonical
prompt, reference retention and article text are untouched.

## Local verification

Seven isolated suites / **245 tests passed**: preflight143, protocol30,
native import50, brief5, import-result3, generation-evidence10, selection4.
Includes25 new cases for mode mismatch/adaptation, active-only preservation,
concurrent claims/adaptations, missing actual style/subject bytes, hash-only
references, stale article/brief, untouched old decisions, context evidence and
private import/replay. Existing bad-image-type and personal-selection tests pass.

Two earlier runs exposed order-dependent test assertions about which parallel
request wins (one new and one existing). Tests now require exactly one success
and inspect the winning request, not array position. No production guard relaxed.
No real generation/selection/import was used as a test. Storage is isolated at
`RAGE_STORAGE_DIR=./tmp/vitest-rage`; dependency versions are unchanged.

## Live verification

Pending deployment/readback; not a native-generation success claim.
The current owner-authorized cover attempt uses request
`barsel-2026-10-15-babycafe-nightclub-cover-v3` and expires at
`2026-10-15T13:46:51.592Z` (15:46:51 Copenhagen). Mode adaptation must preserve
that expiry and stop if it is already consumed or expired. Submission
`546794452af45693e3495ae29d4fe5d8912c33844aaa62db10b2ad8a94e36171` remains v2;
brief `6f438a39dd22d5addda1f97e15dc53de08ee53aaedacdd0da21e7d24c2cbb394` is reused.

The existing Work connector must discover the expanded claim enum and optional
preflight field. Old schemas must not be bypassed or labelled refreshed without
evidence. Native dispatch, file return and image quality remain untested here.
