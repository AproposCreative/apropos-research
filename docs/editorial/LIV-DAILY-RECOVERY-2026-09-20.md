# Liv daily recovery, September 20, 2026

## Policy

- One scheduled article and at most one separately identified alternative per Copenhagen date. No reserve enabled.
- Publication starts only 10:00–19:59 local time. Cron runs every five minutes; uncertain prior publication is read back outside that window too.
- Saved stages resume without consuming an attempt. Known article defects permit at most two targeted corrections; legacy attempts remain recorded.
- Transient pre-writing trending errors permit two retries after 5/15 minutes. Unknown provider outcomes never trigger blind rebilling.
- A genuinely empty topic lookup before writing remains on the same identity and checks the source bank every 15 minutes without AI calls. It does not consume an alternative or a paid transport retry; source-check counts remain recorded.
- Budget/configuration failure is not permission to bypass limits. CMS uncertainty blocks replacement until reconciled.
- Exhausted dates no longer starve tomorrow. Historical dates are not republished or backdated.
- The same pure decision and read-only candidate selection drive the worker and authenticated UI.
- Production diagnosis also found zero usable current trending seeds. Refresh explicitly configured shared sources every six hours through authenticated, leased server ingestion into Firestore (20 fetches, 72-hour discovery window, bounded runtime, no AI calls or pruning). The older GitHub JSONL ingestion is not the server's source of truth.

## Transition and verification

The first eligible claim atomically records recovery policy v1, original attempt count/reason, and bounded recovery counters. It preserves checkpoints, original histories and cost records. No bulk deletion or counter reset is needed.

Run isolated tests with `RAGE_STORAGE_DIR=./tmp/vitest-rage`. Regression fixtures cover the September 17–21 terminal failures, simultaneous claims, time windows, retained provider/CMS ambiguity and alert deduplication. All AI transport remains blocked by the test setup.

Deployment readiness is not publication proof. Verify exact production SHA, preparation API, budget, saved candidate, and live public readback. Three consecutive automatic daily publications are required before reporting operational verification. Stop new publication at 20:00; unfinished testing does not authorize bypassing that deadline.

Rollback: deploy the preceding SHA without deleting recovery fields, jobs or receipts. Never replay a create/publish operation whose outcome remains uncertain.

## Production findings during verification

Release `724e46c` resumed September 20 through the API and corrected the saved body from 699 to 537 words, preserving media. Subsequent verification found an unsupported factual assertion. The old fact-revision implementation still forbade creating a second correction and rejected overlapping defects. Align it with the two-correction policy while retaining exact completed-parent comparison, current-version diagnostics, immutable receipts and mandatory subsequent verification. No third correction is allowed.

The follow-up also fixes Danish dash-date parsing (June 12 must not become December 6), adds source refresh and includes final failure alerts in health reporting. Local verification: 2,525 tests across 101 files, TypeScript, scoped ESLint and production build passed; no paid AI regression calls.
