# AI cost savings, 2026-09-13

## Scope

Reduce repeated paid work in Writer and preserve the daily Liv publication path.
No article, rating, CMS identity, publication blocker or Instagram setting is changed.

- Writer forwards at most 12 older messages, within a 24,000-character history
  allowance including the current request. The current request is never clipped.
  Canonical voice, current article and other system context remain separate.
- Successful research is reused for 10 minutes for the exact query, model,
  provider configuration and credential digest. Failed/insufficient research is
  not cached. Concurrent exact misses share one in-flight request, within a
  64-entry bound. This is a bounded process-local optimization, not a promise of
  durable deduplication across Vercel instances or cold starts.
- Consolidated editorial checks retrieve current evidence and use their existing
  exact-request cache. A saved approval alone cannot establish unchanged sources,
  model or prompt. Changes to title, SEO, body, sources or visual evidence can
  legitimately require another assessment. Paid responses and reconciliation
  safeguards remain intact.
- Explicit server-owned Writer and SEO contexts share the existing Liv cost
  ledger. Nested work retains its owner and is not charged twice. Existing Liv
  totals are never reset. Unsupported requests are denied before provider
  transport; ambiguous usage retains its reservation.
- The settings panel uses a dedicated authenticated, read-only aggregate endpoint.
  It no longer downloads the article feed just to display cost estimates.
- Vitest installs an OpenAI fetch-transport blocker before application modules
  load. Unit/regression tests use mocks; this does not change separately invoked
  live smoke-test scripts or claim that all possible network transports are blocked.

## Budget limitations

The existing 300 DKK monthly application policy is reused. This is not OpenAI's
invoice or a historical account-wide cap. Previously untracked Writer/SEO calls,
other providers and unscoped features such as podcast/accreditation are excluded.
No savings percentage is claimed before comparable production usage is measured.

Shared activation requires both `AI_SHARED_COST_ENABLED=true` in the deployment
and `sharedScopesEnabled=true` plus `sharedTrackingStartedAt` merged into the
existing policy. Do not replace the policy or modify monthly totals. Verify model
price coverage before activation. Disabling the flag stops new shared scopes but
must not delete already recorded costs.

## Verification

- 167 test files / 2,966 mocked tests passed; TypeScript and targeted ESLint passed.
- Production build passed (existing broad file-tracing warnings remain).
- Production configuration/quote preflight passed for Writer/research/SEO
  GPT-5.4 mini, legacy SEO GPT-4o mini, and the existing Liv models. No model
  downgrade was made. Supplemental text prices were checked against the official
  [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini) and
  [GPT-4o mini](https://developers.openai.com/api/docs/models/gpt-4o-mini) pages.
- Before activation, the existing ledger held 107 calls, 44.759584 DKK estimated
  usage, zero unknown calls/reservations and a 300 DKK monthly limit. No totals
  were reset or imported.
- A budget-denied SEO stage records an unpaid denial and can try again under
  the budget check. Actual ambiguous transport remains non-retryable without
  reconciliation; worker retry limits remain unchanged.

Deployment and the minimal live Writer verification are recorded separately.
