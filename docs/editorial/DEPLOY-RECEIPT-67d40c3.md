# AI savings production receipt, 2026-09-13

- URL: https://ai.aproposmagazine.com/ai?view=liv
- Target: production; framework: Next.js.
- Status: READY, verified through Vercel API and production alias assignment.
- Release SHA: `67d40c36f41b0c02bd198b698a758fa81535112b`.
- Deployment: `dpl_Fw6qy5NotFYqS79eDxSS4FQZ3XKF`.
- Includes the previous SEO release `cbbc7fa` and receipt commit `2d05173`.
- Local build passed; 167 test files / 2,966 tests passed; typecheck and targeted
  lint passed. Regression tests used mocked providers. Existing broad file-tracing
  build warnings remain; exact remote build duration was not recorded.

## Activation and live evidence

The existing policy was transactionally merged, not replaced. Shared tracking
started at `2026-09-13T10:14:00.070Z`. Immutable activation receipt:
`shared-activation-67d40c36f41b0c02bd198b698a758fa81535112b`.
Production `AI_SHARED_COST_ENABLED=true` is active in the new deployment.

An authenticated GET to `/api/ai-cost/summary` returned `sharedActivation=enabled`,
scopes Liv/Writer/SEO, monthly limit 300 DKK. An unauthenticated GET returned 401.

Exactly one live, text-only `/api/ai-chat` request asked for `OK` without research,
article data or a CMS operation. It returned `{"response":"OK"}`. The ledger
recorded one Writer call, `gpt-5.4-mini`, `usage_recorded`:

- Tracked calls: 107 → 108.
- Estimated registered usage: 44.759584 → 44.783016 DKK.
- Smoke-test estimate: 0.023432 DKK (not an invoiced amount).
- Remaining registered allowance: 255.216984 DKK.
- Unknown calls and outstanding reservations: both zero after the check.

A deployment-scoped error/fatal runtime log scan returned no entries immediately
after release. Drains and longer-term monitoring were not reconfigured or audited.

## Boundaries

No CMS content, ratings, scheduled articles, publication blockers or Instagram
configuration changed. This verifies the savings release, authentication and a
minimal Writer request, not a new end-to-end article publication or guaranteed
daily delivery. The application budget excludes historical untracked spend,
unscoped features and other providers. No unmeasured savings percentage is claimed.

Research reuse is process-local and bounded; cold starts can still need research.
Paid quality output is reused only for an exact valid request. Existing worker
attempt limits remain in place, including for unpaid budget denials.
