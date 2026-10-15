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

Production deployment and the real renewal receipt are recorded after readback.
