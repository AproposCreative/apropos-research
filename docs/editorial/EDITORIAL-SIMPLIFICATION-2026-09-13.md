# Editorial simplification: execution record

## Current checklist (supersedes historical pending notes below)

- [x] Production staff access and Firebase rules released; administrator and
  outsider API cases verified. Full role/UI coverage remains below.
- [x] Live external-editor membership lifecycle verified through admin API:
  denied before approval, allowed with same token after approval, no admin access,
  denied with same token after suspension. Temporary identity removed; audit retained.
- [x] Preserve existing prepared articles; no paid regeneration for verification.
- [x] Shared accounting extended to newsletter intro, inbox learning/generation
  and translation; output/retry/time bounds and truncation checks tested.
- [x] Read-only authenticated operations API and Liv settings panel implemented.
- [x] Full regression at c36fb5e: 3,154 tests in 197 files passed, isolated from production.
- [x] Production release c36fb5e READY and exact production target verified
  September 13 16:50 UTC; public podcast invalid-input no-store behavior verified.
  Receipt: `DEPLOY-RECEIPT-c36fb5e.md`. Earlier release 15ff3f0:
  authenticated operations 200 on September 13 16:36 UTC. Receipt:
  `DEPLOY-RECEIPT-15ff3f0.md`. Live membership
  approval/suspension and editor/admin separation verified at 15:57 UTC.
- [x] Shared-mode transport refuses missing cost ownership; manual preview and
  revisions accounted. Prompt inspection is free of paid research; discovery
  skips redundant fallback searches. Actual monetary savings are not measured.
- [ ] Complete remaining independent quality/media AI budget coverage. The
  300 DKK limit is not yet a verified full-application/invoice cap.
  Source-only provider-boundary regression now scans app/lib/scripts/services
  for runtime OpenAI imports outside the budget transport (type imports and
  APIError classification allowed). 52 architecture/transport/ledger tests pass.
  This prevents an ordinary direct SDK reintroduction, not arbitrary obfuscated
  network calls or independently deployed services. No provider calls made.
- [x] Verify settings UI visually and remaining access-list role variants.
  LivOperations null usage formatting released: unknown values remain unknown,
  genuine zero remains zero and Danish amounts are formatted safely. 14 targeted
  tests and TypeScript pass. Isolated real-component visual test passes eight
  scenarios at mobile/desktop widths, including refresh and error states.
  Actual production settings shell verified September 13 18:22 Copenhagen:
  gear, budget disclosure, live operations, mobile scroll and back-to-three-stories
  work at build b903348; 390px viewport has no document overflow. Evidence:
  `docs/audits/LIV-SETTINGS-PRODUCTION-2026-09-13.md`.
  Separate live API verification at September 13 16:26:17 UTC proves exact
  verified company domain allowed as editor (200), unverified company email,
  subdomain, suffix-attack domain and outside-domain account denied (401).
  Disabling the temporary domain user denies the same existing token (401).
  Existing administrator remains admin (200); anonymous is denied (401).
  Temporary identity deletion completed. Eighteen policy/server/admin-route tests
  and TypeScript pass. This complements, rather than replaces, the live external
  allowlist approval/suspension evidence above.
- [x] Remove proven obsolete embedding code; preserve editorial work and audit.
  Removed `scripts/train-style-embeddings.ts` and its sole caller, the inactive
  `github/workflows/train-upload.yml` copy. Actual `.github` workflow uses
  `train-embeddings-clean.ts`, cached and shared-budgeted. Removed implementation
  recreated a raw OpenAI client per article and saved partial archives after errors.
  Both files remain recoverable in Git; no datasets or production jobs changed.
- [ ] Record seven consecutive API-driven daily publications and next preview.
  Daily 10:20 Codex after-check created ACTIVE as
  `verific-r-livs-daglige-udgivelse`; journal: `LIV-DAILY-VERIFICATION.md`.
  This local verification does not replace the server publication cron.
  September 13 16:09 UTC: feed confirms three ready stories with no blockers;
  next is Lucian Freud on September 14. Klovn September 16 now has the agreed
  Anmeldelse title prefix, via the audited presentation API (no paid rewrite).
  September 13 16:15:44 UTC: revision
  `945815809ae100b6a0c1b7d85c6ce7fb55442cb85e3e571f86f457eeec40872c`
  returned publicationReady=true, no blockers, still an unpublished draft.
  Independent saved-state readback at 16:16:03 UTC confirms ready September 16,
  unchanged body and only title/seoTitle payload changes. Original audit retained.

Historical sections below are an append-only execution trail, not the current
deployment status. No new user approval is required for scoped implementation.

### Import boundary (after f534831, local)

Article import now establishes shared Writer accounting, bounds output to 10,000
tokens, disables SDK retries and passes cancellation with a 60-second timeout.
Oversized article/CMS-option inputs are rejected before model or image work rather
than silently dropping source text. Incomplete output cannot construct an article
update. Budget denial returns uncached 503; raw provider errors are not exposed.
Seventeen import/translation tests pass without paid calls; TypeScript passes.
Existing parallel image uploads remain, so provider failure may still leave
uploaded assets. This is not resumable paid-work checkpoint coverage. Thumbnail
still uses the legacy model and remains the next uncovered image route.

## Target

### Thumbnail consolidation (local, after e3004c2)

Removed the duplicate legacy thumbnail model/prompt implementation, retaining
its endpoint and success envelope as an in-process adapter to generate-image.
No current app/component/lib caller was found. Shared generation now governs
budget reservation, image switch, official media lookup and generated-byte upload.
Seven mocked image tests pass, including adapter success, disabled generation
and budget denial. The old square temporary-provider output is replaced by the
shared editorial image format (generated 1920x1080); no square contract was found
outside the deleted implementation. No paid call or CMS write was made.
This removes duplicate code, not proof of observed monetary savings. Shared image
checkpoint/recovery gaps remain as documented; not yet deployed.

One API-published Liv article at 10:00 Europe/Copenhagen per day, tomorrow's
preview, a hard 300 DKK tracked application AI budget, staff-only access, and
seven consecutive verified daily publications before operational sign-off.

### Additional quality-route accounting (after cf430c9)

Factcheck, TOV critic and moderation now establish shared Writer accounting for
manual requests while preserving signed Liv ownership. Branded pretransport
denials return uncached 503, not a false 401 or successful control result. Invalid
internal contexts still fail before work. Advisory factcheck and TOV calls have
zero SDK retries and 45-second timeouts. Source checks and editorial assessment
are retained. This change is local pending the next release, not proven live.

### Design copy simplification

Headline helper now makes one bounded, shared-budget call and rejects invalid or
truncated results without invented fallback claims. Removed heuristic retry and
generic praise helpers are retained in Git history. Existing API/alias contracts
remain. Prompt preserves review label and work/season clarity. Subtitle generation
also receives Writer accounting and truncation rejection. No current headline
caller was found, so no actual savings are claimed for that route. Pending release.

### Standalone research verification

The independent verifyContent entry establishes one shared Writer run for its two
model checks, with zero retries and 45-second timeouts. A pretransport denial
propagates immediately and cannot trigger the second paid check. Missing AI,
missing sources, malformed/out-of-range scores and truncated responses cannot
produce a passing result. Removed the unused lexical fallback that could present
failed AI verification as a score. Eight mocked tests and TypeScript pass. No
production verification calls or model requests were made; pending release.

Image route inventory: generate-image has a text-planning completion followed by
JSON DALL-E 3 generation. Price support and the planning fallback still need
verification before claiming shared-budget coverage for this path.

### Image-route migration (local)

Official DALL-E 3 model documentation now states removal from the API:
https://developers.openai.com/api/docs/models/dall-e-3 . Replaced the legacy call
with the existing priced gpt-image-1.5/high/1536x1024 shape. Planning and generation
share Writer accounting; a branded planning denial stops before image generation.
Image call has zero retries and 90-second timeout, planning zero retries/45 seconds.
Returned base64 bytes use the shared encoding/upload pipeline; remote downloads
retain existing URL validation. Official image lookup remains available when AI
generation is disabled. Thirty pricing/route/upload tests and TypeScript pass,
no paid generation. Pending release. Standalone route persistence still lacks
Liv's resumable original-image checkpoint and must not be represented as equivalent
to the daily media workflow. Full-app budget coverage remains unverified.

## Implemented locally

- Exact-origin token attachment, preserving Request headers.
- Firebase Admin token/revocation verification and current user verification.
- Verified exact aproposmagazine.com domain OR active `editorialAccess/{normalizedEmail}`.
- Explicit admin/editor role, administrator-only access-list API and selected
  configuration/diagnostic API gates. No blanket Firebase-user approval.
- Login access check before exposing the user to application components.
- Firestore rules preserving public magazine mirrors and reader profiles while
  enforcing editor + owner checks on browser-owned editorial collections.
- Storage rules enforcing editorial membership; published config is server-owned.
- Rules release utility with mocked policy tests, existing-admin-only migration,
  concurrent release check, readback and retained previous ruleset IDs.
- CI definition: safe install, config gate, typecheck and isolated tests.
- Incremental content/model-keyed embedding cache and budgeted SDK calls; archive
  only replaced after all vectors validate. No ordinary-code push/daily full rebuild.
- Proven pretransport cost denials put SEO jobs in `waiting_budget` for six hours
  without consuming a failed-attempt slot. Uncertain paid work remains fenced.

## Evidence

- Production release verified: dpl_5NxYgkNSaxy5btcq9eV8Lkfuhj3Q, READY,
  exact Git SHA a2f14d8f79a24e92fe7472c541ac5d7077f365ed, selected as production
  target by project API readback. https://ai.aproposmagazine.com/api/auth/access
  returned 200/allowed/admin for the existing administrator, 401 anonymously,
  and 401 for a temporary verified external Firebase user not on the allowlist.
  The temporary Auth identity was deleted in the verifier's finally block.
  This proves API access for those cases, not every frontend/login variant.

- 2026-09-13 13:40 UTC: rules activated and real Firebase client verification
  succeeded. Active Firestore ruleset: 85f95abb-69b5-49f4-ac1a-54ba740c97cd;
  Storage ruleset: 057e8d8b-8114-4b96-81be-2e36af5ffeb5. Prior IDs retained below.
  Allowlisted administrator draft write/read and Storage upload/delete succeeded;
  owner transfer, client access-list read, unsigned draft and unsigned upload
  were denied. UUID-tagged verification artifacts were deleted. These checks do
  not yet prove deployed application login behavior or all access-list variants.
  IAM administration/Google service-agent impersonation are no longer release
  dependencies. A mandatory live verifier follows release readback; failures
  restore only unchanged releases created by this run.

- Local full suite: 171 files, 2,980 tests passed.
- Typecheck and Next.js production build passed.
- Targeted lint: no errors (release script excluded by existing lint configuration).
- Firebase Rules API tests: 5 Firestore + 5 Storage cases passed with function mocks.
  This proves policy evaluation, not live cross-service IAM permission.
- Security commit: d93aef8; savings commit: fe698d6. GitHub Workflow authorization
  completed and branch push verified by remote readback at
  fe698d691aa2f91999d5a657c85edcb829cad4e0. No app deployment yet.
- Google Cloud IAM UI confirmed "Policy updated" and the existing Storage service
  agent service-817066738308@gcp-sa-firebasestorage.iam.gserviceaccount.com now has
  Firebase Rules Firestore Service Agent in addition to its previous role.
  Propagation and a live cross-service rules test remain to be verified.
- Existing explicit administrator migration executed via the server SDK with
  production credentials held in memory: one verified active administrator,
  transactional audit entry and access-list readback confirmed. Existing revoked
  or non-admin entries fail closed and are not overwritten by migration.

## External blockers (not application failures)

1. GitHub workflow-scope blocker resolved; actual push and remote SHA verified.
2. Firebase release preflight: project.get succeeds but projects.getIamPolicy
   returns 403. Storage's Firestore lookup needs the existing Storage service agent
   to have `roles/firebaserules.firestoreServiceAgent`. This precise grant is now
   confirmed in the administrator's IAM UI. Adapt the release preflight to verify
   the externally provisioned prerequisite without requiring runtime IAM write
   authority. Do not grant Owner merely for this operation.

The release utility previously stopped before admin migration or rules updates.
The administrator-approved IAM grant, explicit administrator migration and
verified Firebase rule release are now applied. App deployment a2f14d8 is live
with authenticated/anonymous/outside-domain API verification recorded above.

Reference: https://firebase.google.com/docs/rules/manage-deploy#manage_permissions_for_cross-service_cloud_storage_security_rules

## Remaining implementation / verification

- Additional local cost cleanup: attachment filename classification no longer
  calls a model (no current callers found, therefore no claimed current spend
  reduction). Active inbound-mail summaries now cap completion tokens at 2,000
  and disable automatic SDK retries. This is bounded output, not full ledger
  coverage: accreditation and podcast still need shared-budget integration.

- Release preflight experiment: replaced IAM policy mutation with an existing-
  authority, five-minute Storage service-agent permission probe. Real API returned
  `storage_probe_auth_http_403:IAM_PERMISSION_DENIED` before any rules writes.
  This proves impersonation is unavailable, not that Storage lacks its saved role.
  Do not broaden runtime authority to satisfy this diagnostic. Resolve via a
  legitimate administrative read or direct cross-service flow verification.
  Two fail-closed regression tests pass; TypeScript check passed before adding
  the sanitized reason diagnostic. The probe is not a completed release solution.

- Complete route-by-route role coverage, admin-list management presentation and
  live auth/storage tests after access is restored.
- Extend budget coverage to currently unscoped AI features/providers. Do not call
  the existing Liv/Writer/SEO ledger an account-wide budget.
- Shared read-only Liv/newsletter operational view and concrete failure display.
- Retire simulated prototype outputs, preserve/export browser drafts, lazy-load
  heavy app views, and measure bundle changes.
- Verify exact production SHA, normal daily API delivery and seven-day record.

No paid model tests, CMS writes, newsletter sends or Instagram changes were made.

### Daily delivery inspection, 2026-09-13 (latest)

- Authenticated production delivery API reports today's publication. Public URL
  `https://www.aproposmagazine.com/articles/the-gentlemen-saeson-2-goer-privilegium-til-et-vaben`
  returned HTTP 200 with its canonical URL and two body image elements. This is
  not evidence of seven consecutive scheduled deliveries or verified image bytes.
- Tomorrow's saved Lucian Freud item `6aa566cf1d63c39af0d73ad2` is blocked by
  `field:content`, `field:intro`, `image:body-assets`. Frankenstein on September 15
  is blocked by `field:content`, `image:body-matches`, `image:body-assets`.
  Resolve actual CMS/checkpoint differences via server operations; never clear
  blockers blindly or regenerate paid work merely to fill the queue.
- Fixed local status projection: blocked tomorrow inventory no longer counts as
  publication-ready, and preparation exposes a safe saved-work hold instead of
  idle. No preparation-selection or paid-regeneration policy changed.
  37 targeted tests and TypeScript pass. This status patch is not deployed yet.
- Budget readback: estimated tracked upper 46.306176 DKK, limit 300 DKK, tracking
  began September 12. `fullMonthlyCapVerified=false`; remaining allowance is not
  proof of actual account-wide September spending.

### CMS normalization diagnosis and release, September 13

- Direct read-only CMS comparison confirms Freud's main prose and captions are
  unchanged. The false content failure occurs at the figure-to-paragraph boundary:
  Webflow drops the serialization newline after the caption. Semantic block text
  comparison now passes that exact case, still rejecting changed words/captions.
- Actual editorial changes remain: Freud's intro differs; Frankenstein's captions
  have lost illustration credits. CMS also strips inline image style. Do not
  erase blockers: reconcile reviewed text and establish image layout/byte proof.
  Existing continue/edit endpoints target pre-CMS checkpoints, not these saved
  ready drafts; they must not be misused to regenerate the articles.
- 85 relevant tests pass, TypeScript passes. Commits cfdcdf2 and 70022b3 pushed;
  production deployment `dpl_FT76ViE8G4RrPvkwSAhQEYmo6GYV` targets exact SHA
  `70022b3633f97bfc6c3c58c96cb11e1a594d2007`. READY and production target SHA
  verified. Authenticated production delivery and feed GETs return HTTP 200:
  tomorrow is missing readiness and shows `blocked_saved_work` with
  `cms_reconciliation_required`, not false idle. Today's publication remains true.
  No paid AI requests or CMS writes in this diagnostic.

### Intrinsic image dimensions verified, September 13

- CMS retains Freud body images as width=1200 height=800 with no style. The
  technical asset check now accepts style-free intrinsic dimensions only when
  both attributes exactly match decoded image bytes. Changed/missing dimensions
  and fixed-height styling remain rejected; no computed CSS claim is made.
- 52 CMS inspection tests pass, including exact/stretched/missing/fixed-style
  cases, and TypeScript passes. Read-only inspection against actual production
  CMS and downloaded assets now leaves Freud blocked only by `field:intro`.
  Frankenstein still fails content/caption/credit checks. No blocker was removed
  from production state and no CMS content was written.
- Next: audited, hash-pinned API reconciliation for already-saved ready drafts.
  Existing pre-CMS edit/continue routes cannot safely perform this operation.
  Preserve current CMS before-image, editorial responsibility, paid checkpoint,
  item identity and write-intent audit; recheck CMS after any scoped edit.

### Freud ready for September 14, verified server revision

- Reused the existing audited presentation API with `restorePreparedIntro: true`.
  Only canonical reviewed intro can be restored; differing CMS text is archived,
  paid response/checkpoints/check results remain, duplicate calls do not rewrite.
  66 tests pass; TypeScript passed. Production deployment
  `dpl_3PpSC8E4L29B8ZsRRDrkHeTz2orc` is READY and production target verified at
  SHA `061a5a0fc8b4259d4b467f5e197035ddb45110d6`.
- Authenticated POST `/api/liv/operations/presentation` for Freud returned
  `publicationReady: true`, no blockers, `publicationVerified: false` at
  2026-09-13T14:03:45.273Z. Revision audit:
  `861a1edd891bfb5a55a1bf29e2ef6445ddcd4a40318a2a11fe65ba5ab68f357b`.
  No AI regeneration, no early publication. This is preparation readiness for
  tomorrow, not evidence of tomorrow's scheduled publication.

### Frankenstein ready for September 15, verified caption restoration

- Existing presentation API now supports restoring only prepared captions. It
  rejects changed surrounding prose, alt/order/count conflicts, preserves CMS
  image URLs/dimensions, and archives the old CMS content. Complete CMS content,
  caption and byte checks must pass after restoration. No fabricated credit.
- 20 targeted caption/revision tests and TypeScript pass. Production deployment
  `dpl_28qi47JEb59Nf9Ax7mcGHFXMySyN` READY and production target verified at
  `83cba47c6dd6bb04658b51b5b4962a67cc206d44`.
- Authenticated API restoration for item `6aa56bc84e30064cbbb7c4c5` returned
  `publicationReady: true`, no blockers, `publicationVerified: false` at
  2026-09-13T14:10:00.006Z. Immutable revision audit:
  `f662e175bbbf578c0c3eb907a7495384f3c1c898d1a2e8b39621e68087c1fa41`.
  Saved text/images reused, no paid model calls, no early publication.
- Continue the broader goal: budget coverage beyond Liv/Writer/SEO, operational
  Liv/newsletter read-only view, access coverage/admin UX, and seven-day delivery
  evidence. Ready drafts do not prove those remaining requirements.

### Shared budget expansion: inbound accreditation summaries

- Added server-owned accreditation cost scope and wrapped inbound summary model
  transport with the existing shared reservation/settlement policy. Nested Liv
  ownership survives. Existing 2000 output token cap and zero SDK retries remain.
  Invalid budget config returns the manual-review fallback without model contact.
- 37 context/ledger tests and two actual-summary-boundary mock tests pass; no
  paid model calls. TypeScript passes. This change is not deployed yet.
- Summary coverage explicitly retains `accreditation_other_calls`, podcast,
  unscoped OpenAI, other providers and historical untracked calls as exclusions.
  The global 300 DKK objective is still incomplete; do not advertise full coverage.

### Accreditation completion inventory, September 13

- All six direct OpenAI chat completion sites under `lib/accreditation` now use
  the server-owned shared cost scope: inbound summary, event extraction, event
  date, intake classification, studio chat, and multi-turn dialogue test.
  Event-date output is bounded at 500 tokens, others at 2000; SDK retries zero.
- 81 accreditation tests pass and TypeScript passes, all without live model
  requests. These tests preserve existing behavior but are not proof of each
  production provider path. Changes remain pending deployment with b04dff9.
- Web research invoked by accreditation and other provider/client paths still
  require tracing. Keep partial-coverage disclosures until that audit is complete.

### Research budget escape closed

- Wrapped accreditation event-date and contact research in shared cost context,
  with one provider attempt. Research propagates branded pretransport budget
  errors instead of swallowing them and starting fallback work.
- Legacy search HTTP adapter refuses scoped work before transport because it
  cannot yet propagate and settle its provider costs. Unscoped legacy behavior
  is unchanged; this is an explicit partial-coverage boundary, not full billing.
- 99 research/accreditation tests and TypeScript pass; no paid API calls. Added
  regressions for wrapped budget errors and refusing unmetered legacy transport.
  Changes pending the combined budget release. Podcast/other-provider audit and
  production budget verification remain required.

### Standalone text tools, September 13

- `ai-suggestions`, `generate-article`, `generate-webflow-fields` and
  `analyze-research` now establish the shared Writer budget at the provider call.
  Parent Liv ownership is preserved. Existing token caps are unchanged; all
  calls use zero SDK retries, a 45-second timeout and request cancellation.
- Branded budget pretransport failures (including SDK-wrapped failures) return
  a no-store 503 rather than a misleading successful fallback or raw error.
- 41 focused route/context/transport tests and TypeScript pass, without paid
  provider requests. These changes are local pending the combined budget release.
- Remaining scope: independent quality/research/media helpers and newsletter
  generation, production budget verification, operations UI, documented cleanup
  and seven consecutive daily publication readbacks. Goal remains active.

### Multi-stage budget boundaries

- Research-engine, content-enhancer and quality-check now keep their model calls
  within one shared Writer run, retaining any existing parent Liv ownership.
  SDK-wrapped pretransport denials propagate as no-store 503, not success.
- 69 focused route/transport/ledger tests and TypeScript pass without paid calls.
  New tests exercise all five stages, invalid configuration and parent ownership.
- Still pending combined deployment. The coverage audit records additional
  editorial debt in legacy research and quality fallbacks; wrapping is not proof
  of grounded research or a complete global budget.

### Legacy research replacement

- Replaced research-engine's five ungrounded completion passes and fabricated
  fallback findings with one bounded existing source-discovery request, no paid
  fallback. Shared budget and signed parent context are preserved. Explicit auth
  and topic length validation happen before provider work.
- Results expose cited source discovery, not verified facts/expert judgments.
  Insufficient evidence returns 503 instead of invented success. The only found
  runtime caller now reads the standard data envelope and forwards cost context.
- 20 targeted tests and TypeScript pass, no paid calls. Pending combined release;
  this source change alone is not proof of production savings or publication.

### Newsletter intro budget

- Newsletter intro generation now uses shared Writer accounting, stage
  newsletter-intro, 600-token cap, zero retries and a 45-second timeout.
- Invalid/denied accounting returns empty generated fields and a safe warning;
  composeWeeklyNewsletterDraft retains its existing standard-text fallback.
  Truncated model responses are rejected even if their JSON parses. Provider
  error bodies no longer leak into draft warnings. Sending behavior is unchanged.
- 24 intro/transport tests and TypeScript pass without live model requests.
  Pending deployment; not a claim of successful newsletter delivery.

### Inbox generation and learning budget

- Shared structured inbox generation and learnFromEdit now use accreditation
  accounting (inbox-assistant/inbox-learn), 2000-token bounds, zero SDK retries
  and 45-second timeout. Incomplete completions return existing failure values.
- Learning refuses incomplete rules before settings/contact writes. Existing
  best-effort failure behavior does not initiate or repeat mail delivery.
- 83 existing inbox tests and three new learning boundary tests pass, without
  model requests; TypeScript passes. Changes remain pending deployment.

### Translation boundary

- English article translation now establishes shared Writer accounting, caps
  output at 8000 tokens and uses zero retries with a 60-second timeout.
- Oversized source payloads are rejected before provider work rather than silently
  sliced. Truncated responses and missing required translated text throw before
  returning to the caller's CMS patch. Existing source-hash skip remains intact.
- Five boundary tests and TypeScript pass. No translation or CMS mutation was
  performed against production. Pending the next combined release.

### Daily schedule across daylight saving

- Primary Vercel trigger now uses 08:00 and 09:00 UTC. The existing Copenhagen
  hour gate ignores the early winter invocation; published-day state makes the
  second summer invocation a no-op. The 15-minute catch-up remains unchanged.
- 48 schedule/policy/worker/route tests pass, including actual worker regression
  cases for winter's early trigger and summer's second trigger. TypeScript and
  build-configuration security check pass. No publication triggered by tests.
- Pending deployment. This is not evidence of seven successful publication days.

### Read-only operations foundation

- Added server projection for Liv delivery health, weekly newsletter record and
  shared budget. Each section reports unavailable independently on read failure.
- Newsletter settings are read strictly; absent settings are labelled default,
  database failures do not imply enabled/healthy, absent history is not_recorded.
  No raw errors, recipient addresses or email subject/body are returned.
- Three projection tests and TypeScript pass. No cron/send/generation calls.
  Authenticated route and settings-menu UI still required; not deployed yet.

### Operations API and settings panel

- Added GET-only /api/editorial/operations with verifyEditorialToken (revocation,
  current account and editorial membership), private no-store responses and safe
  errors. Anonymous/unapproved calls do not read operational stores.
- Liv settings now contains a compact Liv/newsletter/budget status panel. It only
  fetches while mounted or on manual refresh; cancellation prevents late updates.
  No cron, generation, recipient loading or send action exists in this panel.
- Five API/projection tests and TypeScript pass. React checklist reviewed for
  effect cleanup, conditional mounting and type-only server imports. Visual and
  production verification remain pending; not claimed live yet.
