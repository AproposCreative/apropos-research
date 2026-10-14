# Manual Writer: fixed 50 DKK allowance

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
