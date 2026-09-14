# One reserve: server integration checkpoint

## Retained reserve status repair (released, September 14)

Found a concrete acceptance gap: reserveNeeded correctly suppresses replacement
of a blocked/rejected retained reserve, but the status reader then returned idle.
The reader now reports the reserve hold only after scheduled work and exhausted
daily alternatives have priority. A usable reserve suppresses this nonblocking
old-stock warning; expired/published reserves are ignored. No retry eligibility,
job identity, publication decision, generation or activation flag changes.

35 targeted tests and TypeScript pass, including three blocked/rejected variants,
unchanged input, no datastore reads, healthy replacement, daily precedence and
expiry. Full regression: 3,701 tests / 260 files pass; build and TypeScript pass.
Logs: /tmp/apropos-reserve-status-tests.log and /tmp/apropos-reserve-status-build.log.
Released as `877402c562d574f8ce76725bede42220d3dc76ce` on deployment
`dpl_8FvkG1XgehwzPxuZKMScctwZpFoQ`, READY with exact production alias verified.
Read-only production check at 07:55:42 UTC: Freud remains ready at 572 words,
autopublish enabled, no blocked items, no missing days or reconciliation. Today's
publication is still not due/published; reserve target remains zero. Anonymous
revision access denied and invalid mutations rejected. No article/model/publish
operation was performed by the test. Held-reserve behavior is covered by local
fixtures; no artificial blocked production record was created for acceptance.

## Production inventory, September 14 approximately 07:48 UTC

Follow-up at approximately 07:57 UTC: today's skipped_no_topic record has
preparationAttempts=3. The actual canRetryUnstartedPreparation helper returns
false; none of articleCheckpoint, articleCheckpointHash, preparationProof,
cmsSaveStarted or webflowItemId exists. Activation today would pin an exhausted
job, not produce a reserve. Do not reset its attempts or erase its history. Keep
activation off until a justified next admission can use the normal server path.

Current code is deployed, but reserve activation is still off. Read-only inventory
found no manifest reservePreparation pointer; historical reserve entries are both
published. `reserve-2026-09-11`, `reserve-2026-09-12` and `reserve-2026-09-13` are
failed, while `reserve-2026-09-14` is skipped_no_topic. These four records have no
article checkpoint, CMS item or preparation proof. The separate successful
`reserve-editorial-2026-09-12` retains all three and its item is consumed.
No records were changed and no new generation started. Next activation audit must
check today's bounded unstarted retry semantics and ensure the successful explicit
editorial reserve is never regenerated. Keep the three ready scheduled stories.

Implemented locally, not deployed or activated. Opt-in `LIV_RESERVE_ENABLED=true`; absent/false preserves the current zero-reserve policy.

- Existing preparation cron and lease only; no additional scheduler/generator.
- Reserve selection happens only after no scheduled job is needed, today is covered and tomorrow has usable stock.
- Transaction saves `manifest.reservePreparation.dayKey` before model work. Failed/uncertain work retains this pointer across midnight. No paid checkpoint or CMS identity is reset.
- A ready/selected/rejected unexpired reserve suppresses replacement, including blocked entries. A known consumed/expired admitted item can allow the next day's reserve job, never a second namespace in the same day. A missing admitted item remains ambiguous, not an excuse to regenerate.
- Cron resumes reserve scope with the timeless directive; CMS recovery uses the same current-start/job+5 expiry convention as the existing runner.
- Read-only preparation status recognizes reserve scope. Reserve failure is not an early failed-daily-publication alarm; the daily overdue deadline remains unchanged.

Verification: 14 policy/transaction tests; 29 cron recovery tests; 13 status tests passed. TypeScript and diff checks passed. Transaction tests serialize mocks, not live Firestore. Full regression/build/release and activation with real verified stock are still required. No paid AI or production writes performed.

Subsequent full regression: 3,361 tests in 229 files passed. TypeScript rechecked after integration. Build, release and actual reserve admission remain pending.

Remaining before activation: verify retained legacy reserve jobs and expired/archived identities in production, status semantics for blocked reserve entries, multi-day replenishment and actual successful reserve admission/publication evidence. Keep existing three scheduled stories and budget intact.
