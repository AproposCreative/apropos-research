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

Released source `1b36d06ebe2ab21265a4f4c79ad3026614e0e1f1`, MCPv36,
deployment `dpl_BLJgH9tfdMeB69XJd4fyyFShmCLk`, target production / READY.
URL: https://apropos-research-8hcn19fl2-frederik-kraghs-projects.vercel.app .
Built from the exact clean Git archive. Remote compilation/TypeScript/security
and237static pages passed. Build1m31s; post-build45s. Staged OAuth resource
readback through official `vercel curl` passed after READY (an earlier request
while building returned Vercel's building page, not application evidence).
Promotion succeeded; independent custom-domain API and CLI lookups resolve
`ai.aproposmagazine.com` to this deployment/source. No protection changes.

TypeScript, changed-file lint, configuration-security and diff checks passed.
The unchanged dependency audit still lists10 findings (3moderate/7high).

Authenticated live MCP initialized asv36 and listed64tools, including both
inputMode values in the strict claim schema. At13:06:23.299Z the authorized
operator adaptation created successor
`c7060c4e9939d0b588337efb3ad2ec3243ad2bed8b5e7b3942eeaea41a1864dd`
from untouched unused predecessor
`4c6a247a95bfc50a0e54188ed29fd4f13d7a865bd585c6086378ba03f260d2b2`.
The same owner-authorized cover attempt uses request
`barsel-2026-10-15-babycafe-nightclub-cover-v3` and expires at
`2026-10-15T13:46:51.592Z` (15:46:51 Copenhagen), unchanged. It remains
authorized/unused, now `inputMode=conversation_context`. Submission
`546794452af45693e3495ae29d4fe5d8912c33844aaa62db10b2ad8a94e36171` remains v2;
brief `6f438a39dd22d5addda1f97e15dc53de08ee53aaedacdd0da21e7d24c2cbb394` is reused.

Service MCP preflight13:06:28.799Z: inputsComplete/canGenerate true, blockers[],
required/requested mode both conversation_context. A second read with explicit
mode correctly returned `generation_input_mode_mismatch` / canGenerate false.
Independent connected MCP read13:07:14.357Z confirms the same new grant, required
context mode, unchangedv2/content hash and no blockers. It omitted the new optional
mode field because that connector's cached schema is older; this is not proof
the user's Work catalog has refreshed. No claim was invoked to test discovery.

Canonical prompt hash remains
`46544fc32e3b79d5e78d2afa36bb51f905c3457c8de72c479b3ab57302d6257d`.
Actual retained style JPEG415373bytes/1080x1350 was decoded, SHA256
`0ef077580da7c9ed5b4c64a6973acc3dde536af0bb7a40776f45bf59c5bcff01`.
No subject reference is required for this no-face cover direction; original
subject photographs and the personally declined portrait are preserved.
Article hash remains
`a26827edd659ebe4b6c85c99115fa0a567346b6374b89d4bf4da49069cc1f846`.
Article/original/brief/version/consent history hash before and after THIS operation
is identical: `d50efddd01bcd51b16c00d5fa2d7da5e40745080cb4953fce5f43e0461595984`.
All previous grants are unchanged. Financial before/after hash identical:
`e3b2d498e807ab1cba45f4ca156ce81e5eb15d5b71ea496457fc31da07b69101`.
No dispatch, generation, image import, CMS write, personal approval or publication.
Temporary read-only verification OAuth revoked; existing connections untouched.
Receipt: `output/image-retry-v35/adapt-2026-10-15T13-06-32-006Z.json`.

Post-deploy bounded error scan found two HTTP200 MCP requests with the previously
observed PassThrough error/close-listener warnings. The local verifier also
emitted these warnings. They are preserved, not a clean-log claim, suppressed
limits, a diagnosed leak or evidence of failed image generation. Existing
redacted warning diagnostics remain active; external drains were not inspected.

The existing Work connector must discover the expanded claim enum and optional
preflight field. Old schemas must not be bypassed or labelled refreshed without
evidence. Native dispatch, file return and image quality remain untested here.
