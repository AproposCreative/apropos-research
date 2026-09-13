# Approved implementation: personal workspaces and reliable editorial operation

## Goal

Build the user's approved September 13 plan. Only the three verified colleagues may enter. Frederik alone has SEO, Podcast, Newsletter, Liv Inbox, Push, budget and Liv publication control. Casper and Milo can see Liv and propose topics. Personal drafts are private even from Frederik until explicitly shared. Keep one API-published article daily, no Instagram, bounded AI spend, saved paid work and audit intact.

## Local checkpoint (not deployed)

- Server-derived owner capability in auth/access. Middleware owner gates, mobile/desktop launcher filtering, standalone page guard and embedded view filtering. Owner status requires Frederik's verified identity, not merely the admin role.
- Liv approval controls and settings gear hidden for colleagues; server denies queue decision mutations.
- Autosave keys scoped by UID. Unknown legacy cache never adopted automatically. Account-keyed React subtree prevents state reuse across accounts. MainChatPanel secondary cache also scoped.
- New private GET/PUT /api/writer/workspace. Server selects UID; strict payload and 500 KB bound; optimistic revision, identical retry readback, conflict copies and history on draft change.
- Writer offers cloud resume and two-second autosave. This is initial implementation, not yet verified across devices or offline transitions.
- Media sources GET no longer seeds records or disguises database failures with default sources; authenticated, private/no-store, preserves empty list.
- First full local regression passed 3,193 tests in 204 files before the final secondary-cache and media-source changes. Final targeted checks must be recorded below.

## Required before this checkpoint can release

### Workspace continuation checkpoint

- Extracted an account-lifetime sync controller and connected it to the Writer. Two-second debounce, no empty initial write, serialized saves, exact-body retry after uncertain network results, manual retry and online reconnect. Disposed accounts cannot apply late reads/writes. Conflicts remain paused rather than overwritten.
- Added a visible own-local-copy resume button; removed the old opt-in testing flag and restore metadata logging. Offline initial reads stay retryable when local work is opened.
- Added private `/api/writer/workspace/versions` list/detail endpoint. Authenticated UID only, including for Frederik; bounded 20-per-kind metadata list, validated selectors and read-only snapshot responses. No data mutation on read.
- Added a native modal versions list, plain-text reading and JSON download for preserved historical/conflicting versions. Direct restore/copy into the editor, pagination beyond the first 20 and integration with Mine artikler remain pending. These read-only tools are not a claim that conflict recovery is complete.
- Targeted verification: 29 tests passed; TypeScript and diff checks passed. Live multi-device/browser verification remains pending. No paid model calls or deployment.

### Additional local audit checkpoint, September 13

- Liv feed now derives identity through the verified editorial account within the route itself. Colleagues receive previews without cost/preparation diagnostics; owner-only decisions are enforced even without middleware.
- Liv status sends colleagues only allowlisted published article fields, excluding draft/run/configuration data. Other Liv GET routes are owner-only, except preview feed and publication history.
- Dashboard does not fetch newsletter recipients for colleagues and omits newsletter/draft totals from their response. Leaderboard excludes unpublished/archived work for colleagues; publication counting now requires a publication timestamp rather than merely non-draft status. Dashboard errors are sanitized and successful responses private/no-store.
- Legacy Webflow configuration, Instagram credential management and editorial desk routes are owner-gated. This does not activate Instagram or any publication.
- Same-account focus/token rechecks no longer unmount the editor. Failed authorization still clears access; account switches still reset the subtree. Browser verification remains required.
- Verification: 3,206 tests in 206 files passed; TypeScript and git diff checks passed. No paid AI calls, production writes or deployment in this checkpoint.

- Complete capability route/data audit, including legacy settings endpoints and dashboard aggregation; preserve public podcast feeds and signed server cron workflows. Ensure colleagues cannot invoke shared Liv research/publication through alternative routes. Verify direct Firebase/Storage access for restricted services.
- Test browser resume, initial fetch race, new workspace, in-flight account switch, offline/reconnect and conflict recovery UX. Add explicit retry and selectable preserved versions. Audit remaining browser/session cache keys; do not claim all personal state isolated yet.
- Ensure the new private workspace history is visible alongside Mine artikler. Implement explicit read-only shared snapshots with copy-to-own-workspace, no collaborative original overwrite. Preserve original ownership in migrations.
- Add colleague tip submission and shared tip list without paid research on submit.
- Complete media source transport security, bounded XML/RSS parsing, 24-hour status cache and UI; validate real sources. Separate system source configuration from private users' lists. Currently lib/getMediaSources.ts still aggregates across users; do not call this separation complete. lib/trending/ingest-runner.ts has a default fallback and separate discovery functions requiring integration review.
- Permanent verified-sender Firebase verification/password-reset flow, enumeration-safe responses and rate limits. Prior mails were individual service operations only.
- Owner-only simple operations card, deduplicated server-side failure email after 10:15, resolution follow-up; no desktop dependency.
- Targeted title/shorten/cover revision UI using existing audited operations, versioned visible per-article/fixed Liv rules, one evergreen reserve with duplicate-safe publication. No fine-tuning jobs.
- Verify exact production SHA and actual affected API/UI flows. Provider invoice reconciliation and seven real consecutive daily publications remain separate acceptance evidence.

## Decisions fixed by user

- Private until explicitly shared, including against Frederik's normal application access.
- Casper/Milo can see and suggest in Liv, not approve/reject/publish.
- One deployment with authorization, not separate forks of the application.
- Shared snapshots are read-only; recipients can make their own copy.
- Preserve existing daily schedule, three prepared stories and 300 DKK tracked budget. Do not regenerate work to test.
