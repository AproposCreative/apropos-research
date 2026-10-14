# Manual Writer: fixed 50 DKK allowance

## Funded and resumed — 14 October, 14:30 Copenhagen

The owner explicitly accepted the displayed credit terms at action time.
One payment of **22USD total** completed, invoice`ECF8A545-0012` marked **Paid**
at14:28 in the official billing UI. API credit balance is **8.13USD** after the
13.87USD deficit settlement. Automatic reload remains **OFF**. No second purchase,
new key, Dobby change or recurring payment. The bank's final DKK conversion/fees
were not exposed in this UI; do not state a precise DKK card debit.

After rechecking release and the active fixed50DKK policy, the existing audited
owner API resumed providerhold revision5→6. GET at12:29:47.657Z confirms
manual-writer-only-v1, limit50/remaining50/usage0/reserved0/calls0,
resetsAutomatically=false, providerBlocked=false, **available=true**. The live
tool catalogue exposes Writer and keeps paid image generation hidden. Liv's
inbox remains visible/autosvaroff. Anonymous Writer POST still returns401.

Evidence:`output/manual-writer-resumption-2026-10-14T12-29-50-042Z.json` in the
main checkout. Shared/image ledger snapshots and Casper's revision14 workspace
hash are identical before/after. Old hold reason/time and audited resumption are
preserved; no failed-run reset, historical reservation clearance or paid retry.
No model generation was performed: **funding, activation and guards are verified
live; Casper's next actual generation is not yet observed**. He can refresh the
existing Writer and continue his saved draft. Do not send/replay his stored prompt
on his behalf merely for verification.

The paid legacy automations stay centrally denied by the manual-only policy,
including future months. ChatGPT-first Liv/SEO, schedules, article approvals,
translation status and delivery acceptance are unchanged. Earlier pending-payment
sections below are chronological evidence, not current status.

## Live verification — 14 October, 14:26 Copenhagen

Code release `df966aa7c489f3aff8e89168f0f0404d08c3797d`, deployment
`dpl_2XHzqZDeBktCvZcXcos2P93yK4wR`, is READY with the actual production alias
`ai.aproposmagazine.com`. Remote build succeeded; MCP schema remains v28.

Owner API activation and identical-request replay returned HTTP200/private-no-store.
Fresh GET at12:26:06.833Z verifies configured manual-writer-only-v1, limit50,
remaining50, usage0/reserved0/calls0, resetsAutomatically=false. Provider hold is
still true/revision5, so **available=false**. The catalogue correctly shows Writer
awaiting account recovery and keeps paid image generation hidden; Liv's inbox
remains visible with automatic replies off. Anonymous Writer POST returns401.

Before/after12:25:58.233Z–12:26:10.323Z snapshots are identical for the historical
shared/image ledgers, complete provider hold and Casper workspace. Casper has
since edited his workspace: fresh revision14, updated11:19:02.081Z,2,265 note
characters, same draft identity. That newer work was preserved exactly, not
replaced by the earlier revision7 diagnosis. Workspace SHA256:
`0698f7869f814c1f35ec5b45fd8129c85a623f288b3379c2b2bda4c2ed7b0bc4`.
Shared October remains1 historical call/0DKK usage/1.214400DKK reserved/1unknown;
image month absent. No model call, article/CMS write, provider resumption or
payment was performed. Evidence in the main checkout:
`output/manual-writer-activation-2026-10-14T12-26-10-323Z.json`.

**Remaining:** owner's pending action-time credit-terms answer, then verified
payment within the authorized cap and audited provider resumption. A real paid
Writer generation has not been tested or claimed successful. Do not retry the
stored article prompt merely to test billing. New funding must not restart paid
legacy Liv/SEO/translation/image jobs; the manual-only policy remains mandatory.

## Objective and authorization

Restore the authenticated team's manual web Writer, including Casper's preserved
workspace, with a **one-time shared 50 DKK ceiling**. No monthly replenishment,
paid legacy Liv/SEO recovery, article approval or speculative paid test generation.
ChatGPT-first remains the editorial production architecture.

The owner accepted a separate one-time OpenAI payment capped at 200 DKK including
fees/tax and disabling automatic credit reload. This is organization-wide funding,
not a 200 DKK Writer allowance. Existing Dobby usage/configuration is separate and
untouched. Payment requires separate action-time acceptance of the credit terms.

## Implemented

- Only a verified editorial bearer token at `/api/ai-chat` can establish the
  in-process manual Writer identity. Body fields, internal headers and cron
  credentials cannot grant it.
- Durable `aiExecutionPolicies/paid` policy
  `manual-writer-50dkk-2026-10-14-v1` atomically accounts for reservations and
  completed usage across users, concurrent requests and calendar months.
- Both cost ledgers enforce the policy. Non-manual Liv, SEO, image and other
  backend AI work stays blocked after a legitimate provider-hold resumption.
  Disabling the shared-accounting environment flag cannot bypass the policy.
- Unknown usage keeps its full reservation; mismatched models or exceeded quote
  bounds fail closed. Idempotent completion cannot charge twice.
- Owner-only `POST /api/ai-cost/writer` activates the exact fixed allowance.
  Replaying activation returns existing counters; it never resets or tops up.
  Authenticated team `GET` exposes private, read-only status, not owner identity.
- Writer sends its Firebase token and displays a concrete, non-retryable message
  for quota/budget refusal. Notes, chats and draft identity are unchanged.
- The tool catalogue distinguishes manual Writer availability from paused paid
  image generation. Existing monthly ledger, provider hold and audit history stay
  intact; no new key or provider is introduced.

The allowance is an application's conservative usage/reservation control, not a
provider invoice or an account-wide spending cap. Existing price/FX guardrails
remain in force. Other keys in the shared OpenAI organization can consume its
balance independently.

## Verification before release

- Isolated suite: **385 files / 5,311 tests passed**; no live model calls.
- TypeScript and security configuration checks passed.
- Lint: zero errors, nine pre-existing warnings. `git diff --check` passed.
- Coverage includes concurrent editors, month boundaries, unknown usage,
  duplicate completion/activation, model mismatch, quote breach, forged identity,
  owner-only writes, retained provider hold and blocked Liv/SEO/image work.
- Production `AI_SHARED_COST_ENABLED` was freshly read as plain `true`.
- Existing production at inspection: `c2e0361a111e3b05486c50e0335e6922c513cebf`,
  `dpl_BFm7QehphWpiiwDN4S7v3XveAg1V`, READY with the production alias.

## Billing and remaining acceptance

Official billing UI: automatic reload was switched **OFF and verified**. Checkout
currently proposes $22.00 USD total ($0 tax), with a negative balance of -$13.87
and projected available credit of $8.13. These are dated UI observations, not a
completed payment or final card-currency conversion.

The action-time question about non-refundable, one-year credit terms is pending.
No payment or provider-hold resumption has happened. Never infer success from a
checkout modal, model-list HTTP200, passing test or READY deployment.

Acceptance still required: exact release/alias verification, owner API activation
and readback of the 50 DKK policy, actual authorized payment receipt and positive
balance, then audited provider resumption and runtime status readback. Preserve
the historical shared call, unresolved reservation, Casper workspace and all Liv
records. Do not generate a paid article merely to prove recovery.
