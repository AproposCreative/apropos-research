# V35: explicit renewal of an expired, unused image attempt

The owner requested one new time-limited authorization for the existing
babycafé/nightclub cover after the v34 grant expired at 10:40 Copenhagen.
No new article, brief, image generation, import, selection or publication.

## Cause and narrow repair

The v34 authorization ID was intentionally immutable and bound to the failed
outputs/personal declines. Replaying it after expiry could not extend it, while
changing its request ID correctly caused an idempotency conflict. There was no
operator renewal operation for an **unused** expired decision.

`renewExpiredImageAttemptResume` is a separate operator-only service action,
not an MCP/model tool. It requires a new direct owner decision, the exact old
grant, a new request ID and all unchanged article/brief/reference bindings.
It creates a new one-hour immutable grant and a transactional routing head.
The predecessor and all originals/receipts remain byte-identical. The existing
preflight, one-dispatch claim and private-import path resolve the current head.

Unexpired, consumed, unknown, mismatched or malformed grants cannot be renewed.
Pending personal selection, stale content, missing reference bytes and non-draft
articles still stop the operation. Exact/lost-response retries preserve the new
expiry. Concurrent different renewals create at most one successor. Claim cannot
create renewal authority, accept decision text or alter expiry. No automatic
renewal, native retry, generation, personal approval or publication is added.

The clock is not extended on the old grant, and an elapsed authorization is not
proof that a native call failed. Consumed grants remain ineligible even after
their expiry; their existing original/import identity must be recovered instead.

## Local verification

203 tests in five isolated files passed: image preflight118, protocol27,
native import50, brief5 and import-result3. Includes20 new renewal tests covering
expiry/consumption, exact replay, competing renewals, wrong binding, untouched
history, retained-original import recovery, one-dispatch claims and unchanged
personal-selection/publication gates. These are simulated image results, not
native generation. Storage: `RAGE_STORAGE_DIR=./tmp/vitest-rage`.

TypeScript, build-configuration security, changed-file ESLint and diff checks
passed. No dependency change. Relevant server paths only; no UI/AI-chat edits.

## Remaining boundary

Refreshing Work's tool catalog is separate. The existing v34 claim tool and its
strict input schema are unchanged. This release does not prove that Work has
refreshed, that a native call received its exact arguments, or that the eventual
illustration follows the style. The intended host must have the actual canonical
prompt and reference file ready, then claim immediately before its one call.
Missing delivery or missing claim tool still means STOP without consuming it.

## Production release and actual renewal

- Source `c9479583f9c5cab42beb56ca901d79e027e86704`, MCP `2026-10-15-v35`,
  deployment `dpl_J29GiHJdXmBTBWXygfZMc2bGEZqp`, READY. Deployed from a clean
  Git archive; remote build/security/TypeScript/237 static pages passed. The
  existing dependency audit still reports10 findings (3moderate/7high).
- Staged protected OAuth metadata read passed through official Vercel service
  authentication. After promotion, independent custom-domain lookup resolved
  `ai.aproposmagazine.com` to this exact deployment and source.
- Owner-authorized renewal at09:21:22.144Z, **15October11:21:22 Copenhagen**:
  new grant `0d243ef4184dc12852166a18ab5050f05ed14d316832320014dfb61fe1d2bcca`,
  request `barsel-2026-10-15-babycafe-nightclub-cover-v2`, expires10:21:22.144Z,
  **15October12:21:22 Copenhagen**. Exactly one attempt, still authorized/unused.
- Same submission
  `546794452af45693e3495ae29d4fe5d8912c33844aaa62db10b2ad8a94e36171`, revision2,
  hash `a26827edd659ebe4b6c85c99115fa0a567346b6374b89d4bf4da49069cc1f846`.
  Same cover brief
  `6f438a39dd22d5addda1f97e15dc53de08ee53aaedacdd0da21e7d24c2cbb394` and
  cover section `914f1bb5458ceebecd73f3b65c4327ba836ae964a0ba4b513cae45062f175910`.
- Service MCP09:21:27.763Z and independent connected MCP09:22:02.483Z both show
  `inputsComplete=true`, `canGenerate=true`, `blockers=[]`, exact new grant/request
  and `dispatch.claimRequired=true`.64 tools; existing strict claim schema.
  Actual canonical style JPEG415373bytes1080x1350 decoded; no missing references.
- All old grants unchanged, including the unused expired39da…db39 and consumed
  0fd5…82fd. Article, metadata, briefs, files, versions, failure/decline receipts
  and consents unchanged, protected hash
  `fa928c7ab33d4577b5fbebe31f289523ec86220497dbc39977f0bf4dca27df3e`.
  Financial hash unchanged
  `e3b2d498e807ab1cba45f4ca156ce81e5eb15d5b71ea496457fc31da07b69101`.
  No dispatch claim, generation, paid AI, image import, CMS write, personal
  approval or publication. Existing Work connections unchanged; test OAuth revoked.
- Bounded live error scan09:20–09:22Z found two previously observed PassThrough
  listener warnings on one MCP request. The verified responses above succeeded;
  this is not a clean error log, a diagnosed leak or a claimed image failure.
  No listener limit/protection/monitoring settings changed. Drains not inspected.

Receipt: `output/image-retry-v35/renew-2026-10-15T09-21-31-107Z.json` and narrow
operator script beside it. No manual reset or expiry edit was used. Native Work
dispatch and actual illustration quality remain untested by this technical task.
