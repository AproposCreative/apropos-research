# Apropos MCP: editorial workflow acceptance

Latest increment: [publication status after an uncertain response](MCP-PUBLICATION-STATUS-2026-10-05.md),
production `9cd621a`, service-verified 5 October 00:23 Copenhagen. MCP version
`2026-10-05-v1` has 24 tools. [Connection setup](MCP-CONNECTION-SETUP-2026-10-05.md),
[sequential-save recovery](MCP-SEQUENTIAL-SAVE-2026-10-04.md),
[metadata regression evidence](MCP-METADATA-REGRESSION-2026-10-04.md) and the
v2 evidence below remain historical. Chats can now read publication status after
midnight without a new publish attempt; historical receipts and current public
visibility are distinct. Positive publication recovery remains mock-tested,
because there are no real owner publication previews yet.
These fixes do not close the remaining client/admission/delivery/quality-evaluation conditions below.

Owner request: continue the reviewed recommendations, make them a goal, finish
testing and deploy. This release builds on the private owner pilot, not a second
production system. The every-other-day delivery objective remains separate and
is not completed by this release.

## Acceptance

- [x] Discover retained Liv work without knowing its run ID; distinguish plans,
  research, written drafts, checked ready entries and verified publications.
- [x] Preview precise copy changes with old/new values, expected versions and
  unchanged media; use the same service through the first-party API and MCP.
- [x] Return actionable, version-bound editorial diagnostics and existing factual
  evidence separately. Missing checks are never approvals.
- [x] Preserve the existing checkpoint-edit and ready-publication operations.
  New copy edits do not confer admission. An arbitrary edited CMS draft cannot
  automatically become ready; see the remaining acceptance below.
- [x] Provide focused review/edit/publication workflows and compact context.
- [x] Expose owner-bound read-only publication status after expiry/midnight;
  preserve approval, queue, receipts and paid-work boundaries. Actual owner
  publication recovery is not yet a verified production success.
- [x] Reuse the existing 35-case corpus for deterministic offline regression;
  preserve text hashes and the absence of human scores. No paid model comparison.
- [ ] Reproduce an extraction gap before introducing a document dependency;
  preserve source/page provenance and distinguish extracted text from evidence.
- [x] Isolated focused/full tests, TypeScript, lint, safe build and diff checks.
- [x] Push a scoped commit, verify the exact production SHA/alias, exercise
  authenticated production reads and confirm no new paid calls or hold changes.
- [ ] Real owner-selected edit/approval/publication acceptance, or explicitly
  identify the external dependency. Never publish an arbitrary article as a test.

Langfuse, new model/crawler providers, team enablement, video, audio generation,
budget increases, provider-hold resets and paid test calls are not included.

## Baseline

Code `57166ac`, docs HEAD `cf63dc6`: authenticated Streamable HTTP pilot with 16
tools and no-paid guard. Known gaps from the code audit: separate CMS/retained-run
discovery; no copyedit preview; no unified editorial report; publication only for
already-ready Liv entries. Current working tree contains unrelated preserved
editorial documents and operator scripts. They are not part of this release.

## Implemented v2 scope

MCP version `2026-10-04-v2` adds five tools (21 total): `get_workflow`,
`list_editorial_work`, `preview_copyedit`, `apply_copyedit`, and `review_draft`.
The catalog reads at most 100 recent Liv records and 100 retained writer records,
plus the current user's workspace. It is a bounded discovery view, not a complete
CMS inventory or a count of unique articles. CMS pagination remains available
through `list_articles`. Ready and publication receipts are not new approvals.

Copyedit preview/apply is shared with `POST`/`PUT /api/editorial/copyedit`.
It requires exact unique before/after replacements, the current private revision
and a hash-bound preview. Workspace, history and replay receipt commit atomically.
The change does not regenerate media, research or audio, and does not publish.
Conflicts preserve the newer work. Both transports remain owner-only in the pilot.

`review_draft` identifies concrete duplicates, stock language, missing image/SEO
fields and review-ending issues. Its questions about topic, article type and reader
value are separate from saved factual evidence. Neither is a new fact-check pass,
human rating or admission. Paragraph IDs identify this snapshot only; they are not
yet durable media-placement anchors. Current structure/voice versions are visible;
unknown historical rule versions stay unknown.

Three short repository skills provide review, precise editing and publication
workflows. They are delivered by the MCP on demand, not asserted to be installed in
the owner's ChatGPT client. Existing publication still requires a ready Liv entry,
version checks and first-party owner confirmation. A site-wide publish is not added.

## Tests and cost evidence

- Full isolated regression: **330 files / 4,550 tests passed** on 4 October.
- TypeScript, scoped ESLint and build-config security checks passed. Next.js
  production build passed; generated temporary-path edits were not retained.
- Full simulated flow: open CMS article, preview a precise intro replacement,
  apply, review, staged CMS save and readback. Exactly the intro is patched;
  images, publication flags and unrelated fields remain unchanged.
- Mock coverage includes revision conflicts, account isolation, owner access,
  receipt replay after a lost response, malformed markup, media preservation and
  MCP scopes. All three skill definitions passed the skill validator.
- Promptfoo **0.123.1** is isolated in `tools/editorial-eval`, not the app runtime
  dependency tree. Lifecycle scripts are disabled for installation. A transitive
  FTP-parser fix is pinned (`basic-ftp` 6.2.2); isolated audit reported zero
  vulnerabilities at verification time. This is not an assertion about all app
  dependencies. Both Vercel upload and server tracing exclude the evaluator.
- `npm run quality:offline`: **35 passes, 0 failures, 0 errors**, using saved
  outputs only: 25 archive references and 10 control-stopped drafts. The launcher
  uses an isolated working directory and an allowlisted environment, without app
  credentials. No paid model calls or provider probes were made.
- These are text/hash/schema regression checks, **not** proof of better writing,
  verified claims, a model-comparison winner, human approval or percentage savings.
  There are still **0 human scores**. Human calibration and a genuine quality
  comparison remain separate and incomplete.

## Remaining acceptance and explicit boundaries

1. A real owner-selected edit-to-publication acceptance has not been performed.
   Existing Liv admission checks still apply to changed text. Generic imported
   CMS drafts do not have an automatic admission bridge in this release. The MCP
   reports that limitation rather than certifying them itself or buying checks.
2. Production service-protocol verification is not evidence of connecting through
   the user's actual ChatGPT account. Client connection and a chosen editorial
   task still need that end-to-end acceptance; no arbitrary article is published
   as a test.
3. The current source reader deliberately accepts HTML, not PDFs. The earlier
   attached book ZIP is no longer present at its supplied temporary path. No
   representative failing PDF/extraction fixture was available to compare.
   Firecrawl/Docling remain conditional experiments; neither was installed or
   activated without evidence of a specific extraction improvement.
4. Langfuse, Marketing Skills, Impeccable, new models and video/browser agents are
   not installed merely because they appeared in a recommendation list. They are
   not prerequisites for this scoped MCP/offline-regression release.
5. Liv's provider hold, billing and every-other-day delivery acceptance are
   independent. Deploying these tools does not fix a provider balance, create a
   finished reserve or prove unattended publication.

## Production evidence, 4 October 2026

- Code: `73d24797b3dac4c145d97595a06803e989d5ffcd`.
- Deployment: `dpl_9D6hVHBpVNbjpZD5a1AN27Ej5Pac`, **READY**, production target.
- Immutable URL:
  https://apropos-research-dri4oklk8-frederik-kraghs-projects.vercel.app
- Actual alias: **https://ai.aproposmagazine.com**. Vercel independently returned
  this alias and the exact code SHA. The remote build completed successfully.
  Only the scoped pushed Git snapshot was deployed, not the dirty local checkout.
- Live MCP initialization reported `apropos-editorial` / `2026-10-04-v2`, with
  all **21 tools** present.

Service-authenticated acceptance ran **21:11:15–21:12:10 UTC**, or
**23:11–23:12 Europe/Copenhagen**. The temporary OAuth grant was revoked afterward.
No browser/session extraction or manual CMS work was used.

Verified against the production alias:

- Discovery, S256 PKCE, owner consent, refresh rotation and immediate revocation.
  Anonymous access returned 401; Casper and Milo returned 403 for both consent
  and the new first-party copyedit API. MCP bearer tokens could not approve their
  own consent or publication (403).
- Existing workspace, saved writing, Liv run/status, costs and current CMS article
  reads succeeded. Artigeardit's CMS record was read, not changed or republished.
- All three new workflow definitions were available from the deployed bundle.
  Structure-only and voice-only context excluded the other large section.
- The catalog returned five latest rows from a window of **63 Liv records and
  76 retained writing records**. These counts are not unique-article totals.
- `review_draft` read the actual owner's private revision and returned three
  concrete findings with `admission=not_granted`, not fabricated quality approval.
- `preview_copyedit` returned an unsaved, media-preserving proposal. The same
  first-party API request returned the **identical preview hash**. No proposed
  title was applied. Actual save/readback mutation remains covered by isolated
  tests, not by silently altering a production article.
- A non-ready historical article could not obtain a ready publication preview.
- Before/after hashes matched for **budget, provider hold, private workspace,
  queue entries/slots, shared ledger and image ledger**. Zero new paid AI calls;
  no reservation, budget or hold reset and no article publication.

Runtime readback for 21:11:15–21:12:15 UTC found **43 requests**, including 20
successful MCP requests, the first-party preview and the intended 401/403
denials. A separate error/fatal scan covering 21:10:00–21:12:15 UTC found **zero**.
This short release check is not a long-term uptime guarantee. The team's Drains
API returned zero configured drains; no new paid telemetry service was installed.

Unchecked acceptance items above remain incomplete. In particular, protocol
acceptance does not substitute for the owner's real ChatGPT connection and a
chosen article's editorial/publication approval.
