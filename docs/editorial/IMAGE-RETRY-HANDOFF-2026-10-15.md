# V34: consume an existing image retry grant through MCP

## Current task and evidence

The owner requested exactly one new attempt authorization for the existing
babycafé/nightclub cover brief
`6f438a39dd22d5addda1f97e15dc53de08ee53aaedacdd0da21e7d24c2cbb394`.
Submission `546794452af45693e3495ae29d4fe5d8912c33844aaa62db10b2ad8a94e36171`
is still revision2 / contentHash
`a26827edd659ebe4b6c85c99115fa0a567346b6374b89d4bf4da49069cc1f846`.
Native readback at07:24:36Z confirmed only `image_attempt_stopped`; the owner
personally declined the old portrait at07:22:06.233Z. No pending selection.

The existing operator-only authorization and one-dispatch claim already worked
internally. However, MCP exposed only read-only preflight, not the claim. A new
grant could produce `canGenerate=true`, but a Work-generated retry would then
fail import because the durable grant had never been atomically consumed.
This is a documented server/tool integration gap, not a demonstrated explanation
for past generator style failures. Hidden native inputs remain unobservable.

## Narrow repair

- Add owner-only, draft-scope `claim_submission_image_attempt`. It consumes only
  an existing operator-recorded direct-owner decision. Strict schema excludes
  decision/resolution text, caller UID, invented capability or approval evidence.
- Exact grant, request, article/version, role, section, brief and inputMode must
  match. Reuse the central transaction and all reference/content/selection checks.
  No model-facing authorization creation, expiry extension or reset.
- Only the first `dispatchAllowed=true` response permits one immediate native
  call. Repeated/concurrent claims return false. Lost replies never permit a
  second dispatch. Readback/import of an existing result retains the request ID.
- Preflight now explicitly advertises this required claim handoff. After claim,
  read-only preflight correctly refuses another dispatch; import of the original
  output uses its existing claimed request. No guard is weakened.
- Preserve private original staging, semantic report honesty, personal image
  selection and publication consent. No article/CMS/media edits or generation.

## Verification before release

183 isolated tests across5 files passed: image preflight98, MCP protocol27,
native import50, image brief5, import-result3. Includes grant absence, foreign
owner, wrong grant/request/brief/section, stale revision/text, expiry, wrong input
mode, missing reference bytes, pending selection, non-draft status, injection,
parallel/lost claim responses and same-request private import recovery.
One initial synthetic pending-selection test lacked the actual importInput
marker; the fixture was corrected, then all affected suites passed.
TypeScript, build-security configuration, changed-file lint and diff checks pass.
Tests use `RAGE_STORAGE_DIR=./tmp/vitest-rage`; no production generation or paid
model calls. No dependency changes. Full historical suite not rerun for this
bounded server-only change.

## Handoff constraints

The new operation must be present in Work's tool catalog; refresh the Apropos
connection if its cached schema lacks it. A valid preflight alone must not be
treated as a claimed retry. Claim only immediately before dispatch, with actual
canonical text and reference files available via the recorded explicit-arguments
mode. If the host cannot do that, stop without consuming the grant. No claims
that client reports independently prove hidden native processing.

Grant registration and live release evidence are recorded below after execution.
