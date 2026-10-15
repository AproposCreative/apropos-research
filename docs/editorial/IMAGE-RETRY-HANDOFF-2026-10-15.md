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

## Release and actual authorization

- Source `333266fa4a6ab792216e92a55a8d5ce07b613eb6`, MCP `2026-10-15-v34`.
- Deployment `dpl_DzmQnaivPPVDanZNktzhQ9aZRuqN`, READY; exact clean Git archive.
  Remote compilation, TypeScript, build-security gate and237static pages passed.
  Existing dependency audit10findings (3moderate/7high) was not changed here.
- Protected staged readback through authenticated `vercel curl` preserved the
  canonical OAuth resource. Promotion completed and independent custom-domain
  lookup resolved `ai.aproposmagazine.com` to this exact deployment/source.
- Live authenticated MCP initialized asv34 and discovered64tools, including the
  strict owner/draft claim operation. The temporary read-only verification OAuth
  grant was revoked; existing ChatGPT connections were not changed.
- New owner-decision grant:
  `39da48268590eb576e075cfd16ef0e88a3bb4a770211074856ff062ab136db39`.
  Request `barsel-2026-10-15-babycafe-nightclub-cover-v1`, authorized07:40:09.697Z,
  expires08:40:09.697Z (**15October10:40:09 Copenhagen**), status`authorized`.
  No dispatch claim, generation, image import, personal choice or publication.
- Live service MCP preflight07:40:14.384Z and independent connected MCP
  preflight07:40:54.795Z: `canGenerate=true`, `blockers=[]`, same brief/revision2,
  actual decoded style JPEG415373bytes1080x1350, SHA256
  `0ef077580da7c9ed5b4c64a6973acc3dde536af0bb7a40776f45bf59c5bcff01`.
  `dispatch.claimRequired=true`; it names the new claim tool and exact request.
- Native status: no pending candidates; exact personal decline preserved; article
  still draft/awaiting_preparation, same revision/content hash. Protected article,
  briefs, original files/receipts, versions and consents hash unchanged:
  `fa928c7ab33d4577b5fbebe31f289523ec86220497dbc39977f0bf4dca27df3e`.
  Consumed old grant remained hash-identical; one new grant was added.
- Financial state before/after identical:
  `e3b2d498e807ab1cba45f4ca156ce81e5eb15d5b71ea496457fc31da07b69101`.
  No paid model call, provider/budget/reservation change. Hosting not measured.
- Local verification emitted the previously observed PassThrough listener warning
  while all reads/writes completed. No listener limits were increased. This is
  not proof of a new image failure or a diagnosed memory leak.

Evidence: `output/image-retry-v34/authorize.json` and the narrowly scoped operator
script beside it. Authorization was made through the existing central service,
not by manually resetting failures or database grant fields.

**Verified live through grant + preflight + tool discovery, not native dispatch.**
The grant intentionally remains unused for Work. Refresh its tool catalog if
`claim_submission_image_attempt` is missing. Only the intended Work execution,
with all actual inputs present, may claim it immediately before its one cover
call. Body images need their own briefs/authority; no automatic retry or publish.
