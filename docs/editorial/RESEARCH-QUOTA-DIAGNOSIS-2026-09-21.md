# Research rejection: confirmed credit exhaustion

## Scope

User requested resolution of the five blocked weekly articles. Diagnose through the application API/server flow, preserve saved work and costs, and do not invent research or silently increase budgets.

## Confirmed cause

Production POST `/api/research-engine` for the saved Slow Horses brief at **2026-09-21T12:33:40.596Z** reached OpenAI and received:

- HTTP **429**
- `error.code`: **credit_balance_exhausted**
- `error.type`: **insufficient_quota**
- Model: `gpt-5.4-mini`
- No provider usage and no Retry-After/rate-limit header values recorded.

The app returned HTTP 503 with `code: quota_exhausted`. The safe diagnostic is persisted in the existing `livCostLedger` result receipt; the original error body, account IDs and credentials are not stored in diagnostics. The retained DKK 1.868 reservation is **not evidence of an actual charge** and was not cleared.

This establishes exhausted prepaid organization credit, not a model-rate limit or an exhausted local application budget. OpenAI's current documentation distinguishes this from organization/project spend limits and explicitly says retries do not restore access:
https://developers.openai.com/api/docs/guides/error-codes

## Application defect corrected

The previous classifier checked only legacy `error.code` values, then mapped every HTTP 429 to a rate limit. It ignored `error.type: insufficient_quota` and newer specific billing codes.

- `cea3775b99d9a6c06cca46f2aea278cd154dbc42`: persist a closed safe diagnostic (known code/type, numeric rate headers, no raw messages); also parse `application/problem+json`.
- `49e1b7c414f0772fd0505c9a46aeba3e835d5cb7`: recognize credit exhaustion, organization/project spend limits, organization usage limits, and the broad insufficient-quota type before generic 429 handling.
- Existing research no-fallback and preparation stop behavior remains intact. No automatic SDK retry, key rotation, model substitution, budget increase, new CMS item or publication was performed.
- Original receipts are immutable and retained, including older misclassified receipts. No paid work, existing queue entry or historical plan was reset or deleted.

## Verification

- Final release: `49e1b7c414f0772fd0505c9a46aeba3e835d5cb7`.
- Deployment: `dpl_GZ3GLHxZZgdiR4XS5mw9pDTatPBp`, READY with the exact SHA and `ai.aproposmagazine.com` alias verified.
- 286 suites / **3,967 tests passed**, isolated `RAGE_STORAGE_DIR=./tmp/vitest-rage`, mocked provider transport. TypeScript, scoped lint and whitespace checks passed.
- Two bounded production diagnosis requests in this turn, both through `/api/research-engine`: the first captured `type: insufficient_quota`; after updating the known-code list from official documentation, the second captured the exact `credit_balance_exhausted` subtype and verified the corrected response. No further generation attempts after confirmation.
- Browser billing inspection reached OpenAI login, not an authenticated balance page. Login was handed to the user; no payment or account setting was changed. This was account diagnosis only, not a browser fallback for editorial work.

## Remaining blocker and handoff

The account owner must add prepaid credits to the organization used by the production key:
https://platform.openai.com/settings/organization/billing/overview

Existing application limits (shared DKK 300/month and separate Image-gen DKK 150/month) remain unchanged. Do not imply those app limits are the OpenAI account balance or reset them to bypass the rejection. Do not buy credits or enable automatic reload without specific authority.

After the account balance is restored, continue with one successful application research call, then the five saved briefs in `WEEK-BRIEFS-2026-09-21.json`, using authenticated audited plan/retry operations for occupied dates. Verify sources/dates first, preserve existing ready stories, generate article/media only once and verify actual queue entries. **The five articles are not yet written or queued by this repair.**
