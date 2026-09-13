# One reserve: server integration checkpoint

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
