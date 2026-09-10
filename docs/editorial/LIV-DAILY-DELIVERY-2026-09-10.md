# Liv daily delivery — local implementation, not activated

## Objective

Prepare before publication day; target one verified article each Copenhagen calendar day at 10:00, with three ready reserves and a rolling seven-day plan. Never treat a cron invocation, draft or HTTP 200 alone as a published article. No Instagram.

## Implemented

- The existing daily research/generation/media/quality/CMS pipeline is reused in `lib/liv/run-daily.ts`. A preparation invocation saves a draft and admits it to a persistent ready queue only after full editorial, structure and current CMS/media checks. It never publishes early.
- Separate `prepare-*` and `reserve-*` records preserve paid work without consuming daily publication slots. A single preparation lease bounds parallel paid generation. Known CMS drafts can recover admission from a hashed pre-save proof; unknown CMS outcomes and partial image jobs are never blindly regenerated.
- Missing dates get question-led, non-review feature plans, without overwriting editor plans. Tomorrow is prepared first, then three reserves, then the rest of the week. Defaults are editorial prompts, not verified current news or guaranteed publication-ready stories. Planned and reserve themes use separate pools.
- The ready queue selects today's article, or an unexpired reserve. Future scheduled articles cannot be pulled forward. Changed editorial plans invalidate prepared scheduled articles. Publication date is set to the selected day before the final CMS checks, including reserves.
- A transaction assigns one item/day and a fenced lease. Write intent and the exact CMS revision hash are saved before publishing. Retries after an ambiguous write only inspect the same live item and public page. Definitive pre-write rejection frees the slot for a reserve. Technical pre-write errors back off on the same item. A previous ambiguous day's publication blocks further writes until reconciled.
- Verified publication updates the existing daily history and planned status. Legacy daily records guard the rollout against a second article on a day already processed by the old deployment.
- Status API and the Liv settings panel show actual ready inventory, seven-day gaps and missing/uncertain publication. Missed deadlines emit a structured error and HTTP 503 from the periodic check. This is monitor-visible, **not a configured email/push notification subscription**.
- Payloads and slug tombstones are immutable. Old completed manifest entries are compacted; ambiguous records are retained. No dependencies, credentials, lifecycle scripts or production access were added.

## Activation sequence (not performed)

Local verification: 1,007 tests across 98 files passed, TypeScript passed, and a fresh production build passed in an isolated `tmp/liv-delivery-build-20260910-final` directory. Nine broad file-tracing warnings remain in existing storage/attachment paths. Test storage stayed at `./tmp/vitest-rage`. Build-generated temporary TypeScript paths were reverted; no research data or dependencies changed. Tests cover the queue state machine, store transactions, legacy migration guard, route authentication/flags, complete preparation admission, reserve fallback, plan edits, date assignment, and read-only reconciliation. These are mocked integration tests, not production-provider evidence.

1. Approve the exact reviewed release commit under the recovery policy and confirm credential rotation. Deploy that release only.
2. Verify Firestore rules deny client writes to server-owned `livDelivery` and daily proof records. Verify existing provider credentials and cron authentication without exposing them.
3. Enable preparation only (`LIV_DELIVERY_PREPARE_ENABLED=true`), retaining the old publisher during warm-up. Confirm at least tomorrow's completed item plus three distinct, unexpired reserves. Inspect editorial relevance, sources, images and CMS metadata. A seed plan does not count as a ready article.
4. Configure a real alert destination for the failed delivery check. Confirm the current Vercel plan supports the additional hourly/15-minute schedules; don't infer delivery of notifications from logs alone.
5. After reconciling any existing daily CMS item, enable `LIV_DELIVERY_QUEUE_ENABLED=true` with `LIV_DAILY_PUBLICATION_MODE=auto_publish`. Pause remains authoritative. The original daily endpoint switches to the queue; the 15-minute check is inert until queue mode is enabled. Preparation and queue flags default off.
6. Verify one real research → media → staged draft → scheduled publish → public-page run, then a reserve fallback and read-only recovery after a delayed response. Check Danish winter/summer timing. No production test or activation occurred in this local turn.

## Remaining operational limits

- External outages cannot support an unconditional daily guarantee. An ambiguous write intentionally stops further publication rather than risking duplicates.
- Failed partial generation jobs remain visible in the existing stored records and need reconciliation; there is no automatic re-purchase of partial text/image work. A known CMS draft with a saved proof can resume into the queue without another generation.
- The initial reserve stock still has to be produced and editorially checked in production. No new article was generated or published during this implementation.
- Alerts currently mean the dashboard, HTTP status and logs. An operator notification destination still needs configuration and a delivery test.
- A complete authenticated production/UI verification is outside this local-only recovery session. Local tests use mocked providers/Firestore and do not establish provider availability or Firestore production rules.
