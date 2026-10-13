# Whisper Man: version-bound single approval and pre-write recovery

## Objective and evidence baseline

Repair the existing article, not create or regenerate it. One personal **Godkend og udgiv** in the inline preview or optional external preview drives the server. Do not convert preparation-only consent into publication consent.

Submission `fba542e0dea6eb8b11abb30fd5d651039f8e09f4ddecd711cdbf0ce1fac66d71`, revision 10, content hash `db6736eaea25c57a3c994f43aaf630d13ccb22c3bbdcae8ff69db99c57750ca5`. Same never-published draft item `6ace000e6400e97c7469979a`.

The durable evidence differs from the prior chat account: publication consent was revision **5**, accepted 2026-10-13T09:55:15.954Z. Revision **10** had preparation-only approval at 10:39:40.408Z, quote `e476209b8c8e507acffbba0a7ffccf859fde1450306e9c4e41697e43d9b2a515`. No new publication permission may be inferred from this.

## Causes

1. Updating the submission preserved a raw `publicationConsentPending=true`. Offer generation suppressed the new single consent because it tested the flag without checking revision/hash/owner. This produced the older preparation-only fallback and confusing double approval.
2. The old draft proof hash `70c7f33e3f2110cc1304f68cf63a6aea0e47993d9fdf24f5353616f3801f0205` differed from current `6f81eb377c9c544fd64f5af281cc5944161a4e22059a3e16aee9f58aeb3f7d5f`. Reverting ONLY `unique-watch-now-title`, `watch-now-link`, `video-trailer` to their prior nulls reconstructs the entire old hash exactly. These additive Netflix/trailer values caused the strict conflict; no other concurrent field edit was inferred.
3. The writer save journal was `preparing`, expired lease, **no expected/sent-write checkpoint**. Revision 10 never reached the external PATCH. Generic reconciliation looked for an already performed write, hence `mcp_submission_reconciliation_evidence_missing`. Nested error wrapping hid the original conflict.

## Implemented safeguards

- Consent validity uses owner + revision + content hash. New edits clear only the pending flag, retaining immutable consent/version history. Continuations/cron ignore stale consent. The status explicitly distinguishes preparation-only and publication approval.
- ChatGPT-first never falls back from missing single-consent offer/scope to a preparation-only or separate media approval. Existing legacy approvals are not upgraded. Server continuation needs no return-to-chat message.
- Narrow draft merge proves the complete prior CMS hash, accepting only additions to previously absent/null watch/trailer fields. Changed existing values, other concurrent edits, published/previously published items still stop. Optional fields must survive post-write readback and timeout reconciliation exactly.
- Authenticated `resume_submission_cms` and first-party `resume_cms` use expected revision/CMS hash, original preparation approval and complete saved checks/media. Only a proven pre-write stop on the same bound never-published draft qualifies. Active leases, ambiguous sent writes, changed payloads, missing checks or revoked membership fail closed.
- The existing stages, original files, old save attempt and failure are retained in an idempotent recovery receipt. Only the CMS stage resumes; no model call, image import, new CMS item or personal approval is generated.
- Error causes now retain a sanitized failure phase/code. Existing global item write lease serializes the update.

## Verification boundaries

Local tests cover stale consent, one-click continuation, double clicks, lost acknowledgements, preparation-only protection, additive draft guards, unsafe recovery refusal, authentication, phase diagnosis and saved identity. Full isolated suite: **379 files / 5,236 tests passed** (2026-10-13 11:04Z); TypeScript, changed-file ESLint and safe-build configuration passed. No paid test calls.

The real external React preview was exercised with isolated fixtures at 390px and 1440px: exactly one `approve_publish` request, no second approval, automatic processing status, no horizontal overflow or browser exceptions. This is **not** personal production approval.

No user approval is simulated. No provider hold, budget, reservation, Instagram state or unrelated article is changed by this repair.

## Production recovery and additional rehosting defect

First release `210233e43a47d9c1ab34770a6479a8c663d0b7de` / `dpl_GCc2UDq9tYZvESan4DTpQoWEj98E` (MCP v25), READY with production alias at 11:08Z. Remote build passed. Authenticated owner endpoint queued precisely one recovery at **11:08:58.180Z**, HTTP202. Runtime confirms same-item PATCH, not create or publish.

The actual save then uncovered a second receipt defect: `inspectArticleSave` required identical embedded URLs. Webflow rehosted three JPEGs to its collection CDN. Visible prose, captions, alt text and order were unchanged, but the strict string comparison treated the successful PATCH as unconfirmed. The journal correctly retained `attempted` with canonical expected data; **no repeat PATCH was performed**.

Existing MCP `reconcile_submission` verified all 25 schema/content/reference/image checks, including identical actual image bytes, at **11:10:24.112Z**, and recovered revision 10 to **prepared**. CMS hash is `4086f2ce876b0de78f8040962833150bc2534da2207378fc3930c223722dcf92`. Same item, short title, corrected ending, cover plus three body images; Netflix title/link/trailer preserved exactly. No personal rev10 publication consent exists yet.

The follow-up patch prevents this rehosting false failure in ordinary saving AND lost-response candidate lookup. Only a changed `img src` on an allowed Webflow CDN can pass after identical nonempty JPEG/PNG/WebP bytes are fetched through the existing bounded secure reader. No prose/alt/caption/link/srcset change is ignored; no filename-based equivalence, re-encoding or fallback. Candidate checks are bounded; missing/different/invalid bytes fail closed.

Real CDN comparison with the saved production intent returned **true at 11:14:14.589Z**, GET-only, no CMS write. Final isolated suite **379 files / 5,246 tests**, TypeScript and changed-file ESLint passed. Both real React external preview and MCP widget passed simulated mobile/desktop one-click/status tests; these are not claims of a human production click.

Financial snapshot before deploy/recovery and after recovery stayed identical: hash `2c77ab6264c4b91394ad6de7741cad384c4ce280c53b200e22464ba326aac1a8`; October shared 1 historical call, 0 DKK committed estimate, 1.214400 DKK reserved, 1 unknown, no image month row, provider hold true/revision5. This is not a provider balance or an estimate of subscription usage.
