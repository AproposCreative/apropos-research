# ChatGPT-first SEO: status, operational health and queue selection

Scope approved by the owner after the October 11 SEO recommendations: first
three priorities only. Reuse the existing queue, cloud task, database, metadata
write adapter, locks, versions, cooldown, receipts and 15-minute recovery cron.
No new provider, paid model call, CMS edit, cloud task or billing/hold reset.

## Implemented

- UI recognizes ChatGPT success, reconciled writes and saved-but-not-applied
  proposals. Unknown codes use status-aware wording, not a universal failure.
  Public verification requires a receipt; a reported editorial recheck is not
  presented as an independent server fact-check. History now includes saved
  proposal patches even before an apply decision exists.
- Read-only health is included with authenticated, private/no-store history.
  Existing recovery cron also records current and dated health in the existing
  control collection. Warnings are logged only when the issue signature changes.
  This is dashboard/runtime monitoring, not a new email or notification channel.
- The existing cloud task `6acb8f8eaaa88190b605cf30ca98e982` is expected at 09:00
  Europe/Copenhagen from October 12. Missing daily batch is flagged after local
  10:00, including DST; yesterday remains visible. Missing run does not identify
  its cause or prove credentials expired. Exact saved 401/403/auth-missing errors
  are separated from unknown failures. Reviews idle two hours and writes without
  readback after thirty minutes require attention. Monitor never retries work.
- The newest-100-history filter is replaced by active-status pagination, up to
  200 rows per batch. A cursor rotates across batches atomically with creation;
  same-request replay does not advance it twice. Within each bounded window:
  owned uncertain writes, owned reviews, missing metadata, publication events,
  adequately evidenced Google opportunities, then ordinary reviews. Oldest first
  inside each class. Partial windows are explicit, not a global-priority claim.
  Legacy uncertain writes remain owned by their existing readback recovery.
- Two new performance claims per Copenhagen day, at most two tasks per batch,
  four fresh CMS inspections per call, archive admission and every write guard
  remain unchanged. Historical failed/terminal jobs and reservations are not reset.

## Verification before release

- Focused suite: 147 tests passed across 19 files. Final full isolated suite
  passed 370 files / 5119 tests, including two server-rendered presentation tests.
- Type-check and security/build configuration passed. Lint: no errors, nine
  pre-existing warnings outside the changed component.
- Real read-only Firestore inspection at 14:11:36Z: active-status and snapshot
  cursor queries work without a new index; five active candidates, complete
  bounded window. Today's existing scheduled identity has two public receipts;
  no issues. This read creates no batch, claim, review or cursor.
- Before/after complete SEO-job hash:
  `1e8546b0f248ccf4aba8e1873fdd849bc83c11e5bd79a62ad269b965b698354a`.
  Shared ledger `a94a613eef3f7d2bb029dde9d5f0935ecfe01581d4d13d0b001784a1230e76ea`,
  absent image ledger `74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b`,
  provider holds `dabf304be7cbda0d37c92f666d640f2ec114d2b13b2774ddcfd5da10416e08de`
  unchanged. No new provider-balance assertion.
- Actual React view rendered with read-only production data at 14:14:40Z,
  inspected in a browser at desktop and 390×844 mobile. No horizontal overflow
  (scrollWidth/clientWidth both 390). Real applied and kept receipts display
  correctly. Local fixture is labelled; not a logged-in production UI test.
  Existing browser lacked the owner login; no credentials or permissions changed.
  Screenshots: `/tmp/apropos-seo-status-desktop-2026-10-11.jpg` and
  `/tmp/apropos-seo-status-mobile-2026-10-11.jpg`.

## Remaining acceptance distinctions

Deployment, authenticated API readback and actual cron evidence are recorded
below after release. The existing timer's two keep results and earlier manual
metadata PATCH are historical evidence in CHATGPT-FIRST-2026-10-11.md.
Do not manufacture an unattended PATCH by changing good metadata.
Queue ranking is bounded and does not claim a global scan of an unlimited queue.
Server-observed daily identity alone does not independently prove timer origin.
No compact-payload, inventory-cache or 28-day-effect-report rollout in this scope.
Liv publication acceptance is separate and remains open.

## Production release and readback

Source `269f7181c3ef083e13e3fe837c25ed57c2bee79c` deployed as
`dpl_6NWVevgtJRifv3xFH5pGGHvT8yCS`, READY on `ai.aproposmagazine.com`.
Remote build completed successfully; exact alias/SHA verified at 14:19Z.
The exact final source passed the full isolated suite again: 370 files / 5119
tests. No CMS or whole-site publication was performed for this release.

One bounded **manually invoked cron smoke test** at 14:19:33Z exercised the
existing authenticated recovery route after checking ChatGPT-first mode,
zero queued legacy jobs and no pending CMS-write recovery in its selected work.
Response: HTTP200, kicked=0. The one selected legacy quality job was refused by
the processor guard; no job state changed. The new monitor persisted current
and dated health successfully at `2026-10-11T14:19:33.028Z`.
This is real deployed-path evidence, NOT a new unattended timer observation.
The next natural 15-minute invocation has not been claimed as observed here.

Authenticated production history API at `2026-10-11T14:19:50.901Z` returned
HTTP200/private-no-store, today's two completed public results, no issues,
and the four earlier applied/kept ChatGPT rows with their actual receipts.
Unauthenticated GET returned HTTP401. Complete SEO jobs, shared/image ledgers
and provider holds retained exactly the pre-release hashes above, including
after the manual cron smoke test. No claim/save/apply, paid model, provider
probe, CMS update, reservation reset or new cloud task was used.

Bounded Vercel console search 14:18:50–14:20:02Z returned no SEO console output;
normal healthy monitoring is intentionally quiet. The persisted server receipt
and authenticated HTTP readback are the positive evidence, not absence of logs.

Status: implemented, deployed and production API/monitor path verified. Actual
component visually verified with production data in a labelled local fixture;
the full production browser session still requires the owner's existing login.
The original cloud task/two-per-day policy and every editorial/write guard are
unchanged. Actual unattended metadata PATCH remains separately unobserved.
