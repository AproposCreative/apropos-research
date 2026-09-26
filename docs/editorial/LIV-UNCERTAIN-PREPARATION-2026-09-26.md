# Liv: preserve uncertain preparation before buying replacements

## Finding and scope

The September 26 completion audit found that an expired or missing processing
timestamp returned `alternative / provider_result_unconfirmed`. Selection then
started the alternative, or moved to the following day. A legacy reserve with
`Connection error.` could also be retried because it lacked a saved article or
already had three media assets. That contradicts the delivery acceptance rule:
an unknown provider result is not evidence that the operation was unpaid.

The new regression reproduced 16 failures before the implementation change.

## Repair

- Unconfirmed processing, known connection/timeout failures and pending fact
  revision reconciliation block new preparation identities, including other days.
- The same dependency rule applies to legacy reserve retries and checkpoint
  resume eligibility. Auth, quota and budget failures also cannot escape through
  that path. An active wait is not an automatic resume grant.
- SDK connection/abort failures receive a closed history code. The classification
  does not grant unpaid evidence, clear reservations, erase a run or grant a retry.
- Existing audited continuations and explicit recovery authorizations remain.
- Definite content failures retain their bounded alternative/reserve behavior.
- Ready-item publication is unchanged and does not depend on new AI preparation.

No production data, text, media, CMS identity, budget or reservation is changed by
this repair. No new paid call is needed for verification.

## Verification before release

- 284 targeted tests passed, including route dispatch, provider/cost stops,
  reserve preservation, daily publication and honest weekly status projection.
- TypeScript passed.
- Full regression: 303 files, 4,247 tests passed; `RAGE_STORAGE_DIR` was
  `./tmp/vitest-rage`. The test setup blocks real paid-provider transport.
- `git diff --check` passed.

## Production baseline at 22:33 Copenhagen

Owner-authenticated feed HTTP 200, `private, no-store`:

- September 26: MOR, published, item `6ab80fd835b7f14765be83b5`.
- September 27: Amalie Smith, ready, item `6ab82089416876aaa71a730b`.
- Separate reserve: Kvinde ukendt, ready, item `6ab8260bb4645496e05abb36`.
- Seven days are represented: one published, one ready, two blocked and three
  awaiting preparation. This is not seven completed articles.
- Queue and preparation enabled; provider hold cleared; preparation idle because
  the required ready inventory exists.
- Shared estimate 171.951504 DKK, reservation 29.357368 DKK, 928 tracked calls,
  19 unknown calls. No change from the preceding readback; not a provider invoice.

Vercel runtime logs show HTTP 200 for `/api/cron/liv-daily-article` at
20:15:12, 20:20:12, 20:25:12 and 20:30:12 UTC. The agent did not invoke that
endpoint during this audit. These invocations establish the recurring worker is
being reached, not that tomorrow's article has already been published. The
connector's condensed log output does not include request user-agent evidence.

## Remaining outcome evidence

- Chrome redirects the owner desk to `/login`. The tab is retained for ordinary
  user sign-in. API service authentication works; no browser session is extracted
  or used as a publication fallback. Mobile production rendering remains unproven.
- The next unattended publication is September 27 at 10:00 Europe/Copenhagen.
  Existing heartbeat `verific-r-livs-daglige-udgivelse` remains active at 10:20.
  It must correlate delivery slot, CMS/public readback and runtime invocation,
  and distinguish this from September 26's operator-assisted recovery.
- Do not close the goal based on this repair, enabled settings or green tests.
  The two remaining checks require their own evidence.

## Release and production readback

Commit `87f04ce8f14fa92b1b68745111ae2e027d90d1ab` was pushed to
`codex/liv-daily-recovery`. Production deployment
`dpl_AQ7eADLLyHb6dEwNN28RKeCdUEWE` reached READY at 20:41:51 UTC, with the exact
commit SHA, production target and `ai.aproposmagazine.com` alias confirmed.

Owner-authenticated API readback after release returned HTTP 200 with the same
two ready items and all seven week rows. Preparation remains idle. Independent
manifest inspection reports published=true, overdue=false, reserves=1 of 1,
missingDays=[], blockedItems=[], needsReconciliation=false. Immutable payloads:

- Amalie: `dba63064d13c1debdb2ceb5c11a8e6426009c07f7e47e8438f5f4ae7e6a4214c`.
- Reserve: `49a68d9d19dd5a6508e1655e4faad7d2808b64c3bdd0cbaac30407f749fe7781`.

Both exactly match the pre-release inventory. Shared and image-gen cost ledgers
are unchanged; the shared monthly count is still 928 of 1,000. The configured
call limit and money limit are distinct; neither was raised or reset.

The production error/fatal scan from READY through 20:43:08 UTC returned no
matching logs. This is a bounded early scan, not proof of future reliability.

The existing 10:20 heartbeat was updated, not duplicated, with the exact two
item IDs and the remaining completion checks. It must not manually publish to
manufacture unattended evidence. Browser tab 428018793 is retained for ordinary
sign-in; the mobile UI and the next day's publication are still not verified.
