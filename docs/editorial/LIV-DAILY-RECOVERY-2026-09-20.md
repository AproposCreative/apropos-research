# Liv daily recovery, September 20, 2026

## Policy

- One scheduled article and at most one separately identified alternative per Copenhagen date. No reserve enabled.
- Publication starts only 10:00–19:59 local time. Cron runs every five minutes; uncertain prior publication is read back outside that window too.
- Saved stages resume without consuming an attempt. Known article defects permit at most two targeted corrections; legacy attempts remain recorded.
- Transient pre-writing trending errors permit two retries after 5/15 minutes. Unknown provider outcomes never trigger blind rebilling.
- Budget/configuration failure is not permission to bypass limits. CMS uncertainty blocks replacement until reconciled.
- Exhausted dates no longer starve tomorrow. Historical dates are not republished or backdated.
- The same pure decision and read-only candidate selection drive the worker and authenticated UI.

## Transition and verification

The first eligible claim atomically records recovery policy v1, original attempt count/reason, and bounded recovery counters. It preserves checkpoints, original histories and cost records. No bulk deletion or counter reset is needed.

Run isolated tests with `RAGE_STORAGE_DIR=./tmp/vitest-rage`. Regression fixtures cover the September 17–21 terminal failures, simultaneous claims, time windows, retained provider/CMS ambiguity and alert deduplication. All AI transport remains blocked by the test setup.

Deployment readiness is not publication proof. Verify exact production SHA, preparation API, budget, saved candidate, and live public readback. Three consecutive automatic daily publications are required before reporting operational verification. Stop new publication at 20:00; unfinished testing does not authorize bypassing that deadline.

Rollback: deploy the preceding SHA without deleting recovery fields, jobs or receipts. Never replay a create/publish operation whose outcome remains uncertain.
