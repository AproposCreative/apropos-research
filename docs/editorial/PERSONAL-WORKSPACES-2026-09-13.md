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

### Shared editorial tips checkpoint

- Added authenticated `/api/editorial/tips` GET/POST for all three verified colleagues, with a strict bounded HTTPS link/angle schema and UID-scoped operation receipts. Identical retries return the existing tip; changed payloads under the same operation ID are rejected.
- Shared list returns only explicit tip content/status/date, not private workspace data or receipt metadata. No remote source fetch, research, generation or publication is triggered by submitting or reading a tip.
- Added a collapsed “Send Liv et tip” form and latest 50 shared tips in the upcoming view. Fetch runs only when opened. Pending retry preserves the same operation while mounted and blocks editing until the receipt is resolved. Session-persistent retry across navigation remains unimplemented.
- Seven targeted API tests passed; TypeScript and diff checks passed. React checklist reviewed. Browser acceptance, owner selection into the research workflow and production release remain pending.

### Build-side ingestion defect repaired

- Production build at local commit `394ed46` succeeded but revealed an old `/api/test-ingest` import of `src/cli/ingest-rage.ts`. Its unconditional `main()` caused feed/sitemap requests during module import/build, outside an explicit ingest request. Build output showed Soundvenue and GAFFA discovery twice. No tracked research datasets changed in the resulting git status.
- Removed the CLI import. Test ingestion now uses `runIngestToFirestore` only inside an authenticated owner POST (24-hour window, 10 candidates). GET returns 405 without ingestion; errors no longer expose stacks. No tracked callers of the old GET endpoint were found.
- Four focused route tests passed. A second complete production build passed, including TypeScript/security config checks, with no feed/sitemap discovery output. Nine existing broad filesystem tracing warnings remain; these are not resolved by this patch.
- This is local build evidence only. No push/deployment, shared-production-source initialization, paid AI call or article publication occurred in this step.

### Feed compatibility and efficiency checkpoint

- Shared discovery uses the validated XML kind when available, including Atom endpoints without RSS/feed words in their URL. Atom alternate article links and publication dates are extracted. Explicit configurations never trigger the legacy Ekko guessed-feed fallback.
- The sitemap pass skips configured RSS/Atom sources, avoiding a second fetch that could not yield sitemap articles.
- Real read-only discovery check at 2026-09-13 19:59:58 UTC: Soundvenue `/feed` returned 10 candidates, all 10 with publication dates; the sitemap pass returned zero without another download. This is development-environment evidence, not a production ingest/publication run.
- Full isolated regression: 3,271 tests in 213 files passed. TypeScript passed. No paid AI calls or production writes.

### Recurring discovery transport checkpoint

- Explicitly configured server feed/sitemap discovery now uses the pinned HTTPS XML transport, validates XML before parsing, shares a 20-second deadline per discovery pass and caps downloads at 20. Nested sitemaps use the same transport and deadline; cycles are skipped. Existing RSS date extraction is preserved.
- Explicit sitemap configuration no longer guesses four feed endpoints. Legacy CLI calls without an explicit list remain separate and retain old behavior.
- Actual read-only check: `https://soundvenue.com/feed` passed the new validator on 2026-09-13 at 19:51:04 UTC with 10 candidate links, no partial result. This proves that one public feed works from the development environment, not production configuration or daily publication.
- Source/discovery targeted tests passed; TypeScript/diff checks passed. Shared-source administration, initialization and production verification remain required. No paid model calls or CMS writes.

### Media validation checkpoint

- Added a DNS-pinned HTTPS XML transport: public IPv4 only, no credentials, every redirect revalidated (max three), 1 MB response cap, identity encoding, supported XML MIME types and shared 20-second deadline.
- XML validation rejects malformed data and DTD/entity declarations; RSS/Atom/sitemap parsing counts discovered URLs rather than inventing verified article totals. Nested checks cap at five documents and mark partial results.
- Replaced the old permissive validator route with authenticated bounded input and sanitized errors. Personal-source create/update use the same validator via a per-UID 24-hour server cache; explicit refresh bypasses cached success. No silent fallback on failure.
- Remaining: integrate hardened transport into recurring discovery (existing discovery fetchers still need replacement), owner shared-source configuration and initialization, UI status/manual refresh and real-source validation. The change is not deployed and does not prove production sources work.
- Targeted tests: 16 passed; TypeScript/diff checks passed. No paid model calls.

### Shared-source separation checkpoint

- System ingest now reads only enabled `sharedMediaSources`, never the personal `mediaSources` collection. Missing database/read failures are explicit errors; a deliberate empty shared list stays empty.
- Server ingest passes the configured list through feed and sitemap discovery. Explicit lists no longer trigger hard-coded fallback sources. Candidate publisher hosts must belong to that same list before article fetch; forged source labels cannot authorize another host.
- Legacy CLI discovery without an explicit list retains its existing static defaults. Personal-source research consumption still needs its own integration verification.
- Required before deployment: owner-only shared-source configuration/initialization, network transport validation and actual source checks. No shared production documents have been initialized in this checkpoint. Deploying without that step would leave shared ingestion empty; do not infer live readiness.
- Targeted tests: 12 passed, including configured feed use, disabled/foreign publisher exclusion, empty configuration and unavailable storage. TypeScript/diff checks passed; no paid model calls.

### Restore continuation checkpoint

- Implemented explicit POST `/api/writer/workspace/restore`: verified own UID only, bounded schema, immutable operation receipt, optimistic revision, preserve current server snapshot and submitted local text, then open selected own history/conflict snapshot under a new draft identity. Retries read the same receipt; modified operation bodies and concurrent writes are rejected.
- Versions dialog now offers “Åbn som ny kopi i Writer”. Sync pauses while restoring, retries the exact uncertain operation, refuses swapping selections mid-retry, ignores disposed-account results, and retains newer local typing rather than replacing it with a late restore result.
- This supersedes the previous checkpoint's missing direct-restore implementation. Actual multi-device/browser acceptance, Mine artikler integration, sharing, pagination and the broader plan still remain.
- Targeted server/controller tests: 22 passed; TypeScript passed. No deployment or paid AI calls.

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
- Complete production initialization and end-to-end source verification. Shared-source isolation, bounded XML transport, 24-hour cache and owner settings are now implemented locally (see newer checkpoints); personal-source UI status and article HTML transport still require review. Do not treat the historical pre-separation notes above as current implementation status.
- Permanent verified-sender Firebase verification/password-reset flow, enumeration-safe responses and rate limits. Prior mails were individual service operations only.
- Owner-only simple operations card, deduplicated server-side failure email after 10:15, resolution follow-up; no desktop dependency.
- Targeted title/shorten/cover revision UI using existing audited operations, versioned visible per-article/fixed Liv rules, one evergreen reserve with duplicate-safe publication. No fine-tuning jobs.
- Verify exact production SHA and actual affected API/UI flows. Provider invoice reconciliation and seven real consecutive daily publications remain separate acceptance evidence.

## Decisions fixed by user

### Shared-source settings checkpoint

- Added `/api/liv/media-sources` GET/PUT with direct verified-owner enforcement, bounded strict input, stable URL identity and transactional revision checks. GET is read-only and private/no-store; personal collections are not read or copied.
- Enabling validates through the existing safe 24-hour check cache. Disabling does not require a working remote source. Failed validation preserves the configured document; manual refresh is explicit and uses no AI.
- Added shared-source list, enable/disable, last check/link counts and add form in Liv's settings. Counts are explicitly discovered URLs, not verified articles. React checklist and TypeScript reviewed; no browser acceptance yet.
- Verification: 24 targeted tests passed, including eight new owner/settings tests. TypeScript and diff checks passed.
- Not deployed. Production shared sources still require initialization through the authenticated API before switching ingest. Remaining full-plan work and production acceptance remain open.

- Private until explicitly shared, including against Frederik's normal application access.
- Casper/Milo can see and suggest in Liv, not approve/reject/publish.
- One deployment with authorization, not separate forks of the application.
- Shared snapshots are read-only; recipients can make their own copy.
- Preserve existing daily schedule, three prepared stories and 300 DKK tracked budget. Do not regenerate work to test.
