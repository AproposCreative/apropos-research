# Apropos 2.0: ChatGPT-first migration

## Outcome and boundaries

This is an incremental migration of the existing MCP/submission services, not a
new AI platform. New submissions use `chatgpt-first-v1`: ChatGPT supplies research,
copy, metadata and images; the backend cannot purchase AI for that submission.
Deterministic validation, private ownership, versioned personal preparation and
publication approval, CMS identity, leases, receipts and public readback remain.
No data migration, new database, new provider, Instagram activation, budget/hold
reset or blanket CMS publication is included. Old records retain their policy.

The complete Definition of Done is **not yet met**. In particular, a deployment or
mocked file test does not establish real new-asset import or cloud automation.

## Smallest architecture change

- Reuse `editorialSubmissions`, original text, research, revision history, media
  receipts, existing Webflow adapter and publication queue. No parallel article table.
- New submissions default to human editorial confirmation, not an API quote.
  Attempts to opt back into paid checks are rejected. Old request replays preserve
  their original hash, policy and approval. Old submissions can explicitly select
  the existing human-check option through a versioned update and fresh approval.
- No-paid protection runs in MCP and across preparation/publication queue boundaries.
  The shared ledger also denies `chatgpt-first-v1`, even without an AsyncLocalStorage
  guard. The provider-hold read is advisory for free preparation, not a dependency.
- `get_liv_production_context` composes the existing plan, Liv voice/structure,
  current CMS choices, retained-run pointers, private continuation and seven days
  in one read-only owner tool. Source bodies/checkpoints remain in their archives.
- Optional `livProduction` binds a private submission to `{kind, day}` independently
  of conversation/request IDs. Scheduled and durable reserve identities are separate.
  Resubmission cannot overwrite an existing version; use `update_submission`.
  This does not claim a global Liv slot, mark a plan used or create unattended evidence.
- `get_workflow(liv)` guides discovery, fresh research/duplicate checks, checkpoint
  reuse, writing, native image generation, preview and personal approval. The shared
  voice is loaded, not copied. Reader memory remains unchanged; no book archive.
- New free preparations can drain up to eight existing durable steps within a
  bounded continuation instead of waiting one cron minute per step. Busy, blocked
  and ambiguous steps stop; legacy paid work retains its single-step behavior.

## Audit: existing paid boundaries and disposition

Audit inspected SDK callsites, provider wrappers, route handlers and `vercel.json`.
The following are code paths, not claims that each is enabled or incurred costs.

| Existing area | Source/boundary | Migration disposition |
| --- | --- | --- |
| Research | `lib/research/providers/openaiResponsesProvider.ts`, `lib/research-verification-service.ts`, `app/api/analyze-research` | ChatGPT search/source criticism for interactive submissions; old service retained |
| Liv writer/revision | `lib/liv/{generate-article,writing-brief-attempt,expand-directive,fact-revision,shortening-proposal}.ts` | Canonical instructions and saved work reused; no new backend generation for chat submissions |
| Quality | `lib/liv/{semantic-source-review,editorial-assessment,editorial-edit-media-review}.ts`, `lib/factcheck/verify-article.ts`, `app/api/{quality-check,factcheck,critic/tov}` | ChatGPT review plus explicit human confirmation; deterministic checks remain; old automatic gates not weakened |
| Images | `lib/image-gen/runtime.ts`, `lib/images/text-free.ts`, `lib/liv/{automatic-media-runtime,cover-revision-media}.ts`, `app/api/generate-image` | Native ChatGPT generation and retained provided assets; no API cleanup/regeneration fallback in new submissions |
| Submission checks | `lib/editorial/submission-worker.ts` | Paid branches unreachable for new policy; legacy receipts/branches retained |
| Writer helpers | `app/api/{generate-article,ai-chat,content-enhancer,ai-suggestions,generate-webflow-fields}`, `app/api/design-editor/{more-clickbait,shorten-subtitle}`, `lib/articles/import-autofill.ts` | Existing legacy UI/API functionality not silently deleted; use MCP/ChatGPT route; removal awaits replacement acceptance |
| Translation | `lib/articles/translate-to-english.ts` | Existing separately metered function retained; not bought by this migration |
| SEO | `lib/seo/generate-seo-meta.ts`, `lib/seo-engine/{pipeline,archive-seo-meta-agent}.ts`, `lib/seo-engine/post-publish/provider.ts` | Chat supplies fields; version-specific preservation prevents paid post-publish rewrite of approved metadata; unrelated SEO automation retains savings policy |
| Newsletter | `lib/newsletter/intro-ai.ts` | Separate existing dependency; not silently migrated or disabled |
| Accreditation/inbox | `lib/accreditation/{event-url,inbound-intake,multi-turn-dialogue,liv-chat,summarize-inbound}.ts`, `lib/liv-inbox/{assistant,learn}.ts` | Separate existing dependencies; no new providers or retries |
| Transport and accounting | `lib/openai.ts`, `lib/liv/{cost-openai,cost-ledger,cost-context}.ts`, `lib/ai/{no-paid-calls,provider-hold}.ts` | Retained and strengthened; original reservations/errors immutable |
| Audio | Current `lib/podcast`/`app/api/podcast` serving path | No directly matched speech-generation provider in this checkout audit; this is not evidence of zero external audio costs/services |

All 14 deployed cron definitions remain unchanged:
`mcp-welcome` (10 min), `editorial-submissions` (1 min), `liv-source-refresh`
(6 hours), `newsletter-weekly`/`newsletter-scheduled` (15 min),
`liv-daily-article`/`liv-prepare` (5 min), `liv-delivery-check` (15 min),
`accreditation-followups` (6 hours), `accreditation-imap-poll`/`liv-inbox-poll`
(10 min), `seo-engine-recovery` (15 min), `seo-engine-opportunities/daily`
(06:15 UTC), `seo-engine-opportunities/weekly` (Monday 06:30 UTC).
The separate daily-ingest route exists but is not in that deployed cron list.
Recurring route invocation is not proof of generation, spending or publication.
Phase 5 retirement is deliberately deferred until the replacement works in production.

## Official platform capabilities checked 10 October 2026

- Interactive ChatGPT work can use the connected MCP and native tools available to
  the account. Subscription usage is distinct from OpenAI API billing; included
  limits are not unlimited or observable in Apropos' ledger. No assumed monthly
  subscription price is used. [Pricing](https://learn.chatgpt.com/docs/pricing).
- Official web scheduled tasks can use connected tools, uploaded context, skills
  and plugins available to their chat. Eligibility/workspace settings matter;
  first test in a normal web chat. Desktop tasks requiring a local folder need
  the computer/app running. The existing local monitoring heartbeat is **not**
  evidence of cloud production. [Scheduled tasks](https://learn.chatgpt.com/docs/automations).
- There is now an official Workspace Agents trigger API with an API-channel ID,
  idempotency key and optional run-status polling. A queued/completed run is not
  a publication receipt. It requires a published agent plus scoped admin-enabled
  access-token setup; none was configured in the inspected production env names.
  Do not infer eligibility, available image tools or billing from an ordinary
  ChatGPT subscription. [Trigger API](https://learn.chatgpt.com/workspace-agents/trigger-runs),
  [authentication](https://learn.chatgpt.com/workspace-agents/authentication).
- Sign in with ChatGPT documents plan usage for eligible open-source/locally hosted
  apps, including host identities and self-hosted VMs. Paid/remotely hosted apps
  are directed to an interest process. This is not blanket permission to put a
  personal ChatGPT session token in Vercel. Not implemented: it would add an auth/
  inference subsystem rather than simplify this MCP.
  [Official overview](https://developers.openai.com/siwc/token-sharing-open-source).

Selected operational model: **C**, manual start with continuous saved workflow and
personal approvals. **B** was initially a handoff; the account-specific cloud setup
and connection tests are now recorded below. They do not establish complete
automated article production. **A**, unattended end-to-end production/publication, is
not claimed: current publication policy still requires a real version-bound click.
Server-side publication of an already personally approved scheduled version remains
supported and independent of the Mac. No undocumented endpoints or browser replay.

### Initial cloud schedule handoff (superseded by account verification below)

Use an official web scheduled task with Apropos connected. Run a daily check at
08:00 Europe/Copenhagen; let the existing anchored calendar policy decide the
publication day (not even day-of-month, which breaks at month boundaries).

> Hent get_liv_production_context. På fridage: ingen ny artikelproduktion. På en
> planlagt dato: følg workflow=liv; genbrug den private submission, checkpoints og
> kilder. Undersøg aktuelle kilder i ChatGPT, skriv og kontrollér teksten her, udfyld
> metadata, og brug kun native billedværktøjer med den præcise MCP-brief/reference,
> hvis de faktisk er tilgængelige. Bevar eksisterende filer ved importfejl. Gem
> arbejdet gennem MCP og vis preview. Ingen betalte backend-AI-kald eller retries,
> ingen provider-/budgetændring, ingen modelbaseret godkendelse. Stop ved nødvendigt
> personligt billedvalg/publiceringsklik. Rapportér kun reelt gemt/færdigt arbejde.
> Hvis dagens artikel allerede er færdig/publiceret, opret ingen dublet. Reserve
> er et separat gemt forløb, aldrig samme artikel talt to gange.

No cloud schedule was silently substituted with a Mac-dependent cron. To activate B,
the account must expose the official web scheduling surface and connected tools;
verify its first real run before retiring any old service. Workspace Agents is an
alternative only after workspace authorization and usage/billing are confirmed.

## Native file/image contract: reused, not rebuilt

The current schema already matches the official `_meta["openai/fileParams"]`
contract: `file` object declares `download_url`, `file_id`, `mime_type`, `file_name`,
with the first two required. ChatGPT supplies the download reference; neither a
guessed URL nor `sandbox:/mnt/data/...` is a downloadable file.
[File input reference](https://developers.openai.com/plugins/reference).

Existing import retains originals, validates decoded raster bytes, verifies storage
readback, performs Webflow's allocation plus multipart byte upload, then compares
hosted bytes. IDs/URLs alone do not mark an upload ready. Saved import identity,
rotated-reference equality, retry receipts, media locks and no silent fallback are
preserved. `generationReport` hashes are server-computed comparisons of client
reports, **not proof of the native generator's hidden input**. Missing/changed
prompt/reference requires personal image selection, not a paid regeneration.

Fresh production credential introspection at **2026-10-10T09:30:14.519Z**:
HTTP 200; `assets:read=false`, `assets:write=false` on the backend Webflow token.
This is an external permission blocker, not the old file-host rejection. Do not
retry allocation until the actual server credential changes. The separate ChatGPT
Webflow connector does not change `WEBFLOW_API_TOKEN` in Vercel.

Book submission `396904fb485abe48df3663e0b3d8c955a83ecc3670c323aa1c1c2838040785a2`
was freshly read through connected MCP: published/revision 7, old human-review
policy, retained native JPEG with SHA-256
`2b27242d08ee7e25d698bb40a384a2a8d32df91f41bf8c96ea8bdfc6920dea71`, 124979 bytes,
1280×720, no fallback. Its 7 October receipt is historical, not a fresh assertion
that all current CMS fields match. No article or body image is overwritten.

## Before/after costs (not invoices or claimed measured savings)

Authenticated MCP snapshot **2026-10-10T09:30:39.297Z**: October shared 1 tracked
call, 0 DKK usage estimate, 1.2144 DKK reserved, 1 unresolved; billed amount unknown.
300 DKK is the app cap, not exhausted provider credits or a subscription balance.
September history remains 1000 shared calls/194.300336 DKK estimated/
29.357368 reserved/19 unresolved; images 105/18.821936/0.026432/1.

| Cost class | Before | After this release |
| --- | --- | --- |
| Interactive backend text/research/images | Legacy provider-metered routes; actual per-article totals depend on receipts | New ChatGPT-first submission policy prohibits backend AI calls; 0 DKK for those calls, not total operating cost |
| Final checks | Old chat workflow could quote paid visual/editorial checks | New submissions require human review, deterministic checks and separate publish approval; no paid fallback |
| ChatGPT | Existing paid account(s), exact invoice/plan not supplied | Same account's included usage limits; no claim of unlimited or free image work |
| Vercel/Firebase/storage/Webflow | Existing services; exact invoices not supplied | Retained; real usage/storage/bandwidth charges may continue |
| Automatic Liv/SEO/newsletter/inbox/translation | Existing scoped API dependencies | Retained during controlled migration, not newly triggered here; provider hold and savings controls unchanged |

No defensible exact monthly saving or quality improvement can yet be calculated.
Compare receipt-linked completed articles after real replacement acceptance; do not
count a reservation as an invoice, refund or achieved saving.

## Acceptance and exact continuation

Implemented: source-of-truth context, zero-paid new policy, persistent deny guard,
private resumable production identity, existing canonical image contract/media
state, deterministic publication and version-bound approvals, bounded continuation.

Pending real acceptance: newly generated/edited PNG/WebP/native file to a **new**
Webflow asset; complete real article with fresh human approval/public readback;
later body-image update on the same item; official cloud schedule first run.
Historical JPEG recovery reused an existing byte-identical asset and does not
close those conditions. No synthetic approvals or test duplicate articles.

Resume after the backend token has both asset scopes: introspect, inspect retained
assets and latest submission/CMS hashes; reconcile concurrent changes; use the
already selected original when possible; import with the same operation identity;
show exact preview and await personal media/publication choices; verify public
bytes/fields. Only then review unused paid endpoints/cron dependencies for retirement.
Never delete old code/data/holds simply because the new code has deployed.

## Release and production verification

Code commit `f13168842c9394e8d99a9a8f622a9deee946209e` is pushed to
`codex/liv-daily-recovery`. Exact-Git production deployment
`dpl_6c38ATotZZhKEk2C9CT8zCuAWvWW` is **READY**, with actual aliases including
`ai.aproposmagazine.com`. This was built remotely from that commit, not the dirty
local checkout; unrelated files/journals were not staged. No cron/env/hold changes.

Verification performed for this release:

- Full isolated suite: **364 files / 5066 tests passed**, 10 October 11:34 Copenhagen,
  with `RAGE_STORAGE_DIR=./tmp/vitest-rage`; tracked research datasets untouched.
- Type checking, focused ESLint, `security:config`, diff whitespace checks passed.
- Mobile 390px / desktop 1200px image-handoff widget verification passed in an
  **isolated simulated host**. This does not represent a real person's approval.
- Authenticated production OAuth/MCP check **09:40:19.103–09:40:40.573Z** confirmed
  server `2026-10-10-v17`, 49 tools, read-only scoped production-context discovery,
  `get_workflow(liv)`, current CMS options (8 authors/3 categories), native file
  schema and rejection of model-supplied `uid`. Test-only read grant was revoked;
  subsequent MCP access returned HTTP 401. No editorial approval was minted.
- The new scheduled context call took **1571 ms** (one measurement, not a latency
  guarantee). Canonical voice hash matched the repository:
  `1dec5b80d3b4b17b46dd5ad2adc68d40144746db0f3bde4c29a016495000183b`.
  Liv workflow hash:
  `a7991a1f197ec243ea33a1a82190b95afa4627604c50f4d1391caa1b64fbbdf2`.
- Connected Apropos MCP in this conversation independently returned the new
  `get_workflow(submit)` instructions; hash
  `6e00c2a7b55d5eadc1947beee01a20b14ba6452933f44f0accb45ed75626b6b1`.
  A client with cached tool schemas may need its connection/tool list refreshed
  before it exposes the newly added `liv` workflow/context tool.
- Before/after hashes of provider state, delivery entries/slots, October shared
  and image ledgers, the existing book submission and Writer were identical.
  No article/CMS writes, new asset allocation, image generation or paid AI call.

At this check, **10 October remains delayed**, not a final missed day before 20:00
Copenhagen. There is no automatic delivery slot or ready reserve. The retained
`prepare-2026-10-10` provider failure is shown honestly as failed, not ready work.
Week: 10 blocked; 11/13/15 off; 12 planned; 14/16 unplanned. The context gives the
durable reserve its separate identity for 28 September and preserves its saved
failure. A new private scheduled submission has not been created by this check.

The complete migration was still **not accepted end-to-end** at the release check:
backend Webflow asset scopes, real new-file import/publication and account-specific
cloud scheduling were unverified/blocked. See the subsequent account verification
below; it does not establish unattended delivery.

## Account verification and cloud setup, 10 October 13:14–13:34 Copenhagen

Read-only production token introspection at **11:14:47.612Z** again returned HTTP
200 and the correct Apropos site `67dbf17ba540975b5b21c180`, but no `assets:read`
or `assets:write`. Webflow's actual site settings independently show the existing
**AI Writer 5.0** token, created 7 April 2026, with CMS/sites/pages/forms/custom
code/site-config read/write and site-activity read. No token or secret is recorded
here. The replacement form is prepared with exactly those scopes plus Assets
read/write. AI, user accounts, site access and workspace access remain off.
Creation/installation is awaiting the action-time permission confirmation; the
old token is not revoked and no environment credential has changed.

The owner's actual ChatGPT web account exposes **Scheduled / Planlagt**. A search
for Liv found no existing matching cloud task. The official task form created
cloud automation `6aca1ef7152c8190a8e9f2ce3d0b2ff3`, subsequently named
**Liv – ChatGPT-first forberedelse**. It is active at **08:00 Europe/Copenhagen**
daily. The selected timezone's actual UI value is `Europe/Copenhagen`, not fixed
CET; the confirmed next run was 11 October at 08:00 CEST. Daily invocation is only
a calendar gate: the prompt explicitly reads `automaticDelivery.publicationDay`
for *today*, skips production on off days, and preserves the every-other-calendar-
day anchor. The context's default next publication date must not be mistaken for
evidence that today is a publication day.

This is a hosted ChatGPT task, not a local Codex heartbeat, external API key,
browser-replayed chat backend or new Workspace Agent integration. Configuration
and verification used the official Scheduled UI and its **Run now** action.
The schedule existing does not prove that a timer-fired production run succeeded.

### Actual connection regression and repair

1. Initial read-only cloud-task test:
   `https://chatgpt.com/c/6aca1f06-e798-83ed-a0e3-b80e0fc10244`.
   ChatGPT could call `get_liv_status` but its cached schema did not expose
   `get_liv_production_context` or accept `get_workflow(workflow=liv)`.
   The backend audit confirms `get_liv_status` at **11:18:43.014Z**, v17,
   status `ok`, `paidAiAllowed=false`. This was a client discovery problem,
   not a provider-billing requirement for ChatGPT-first text.
2. Used **Update tools / Opdater værktøjer** in the existing Apropos plugin's
   official settings. No uninstall, new app, OAuth-scope expansion or permission-
   mode change. Plugin: `plugin_asdk_app_6ac38ead40f881918d8a00144eb848bc`.
3. Repeated only the same read-only test after that material change:
   `https://chatgpt.com/c/6aca1fa1-d014-83ed-bd37-b0236b190ace`.
   Both requested tools worked. Independent production `mcpAudit` entries confirm
   `get_liv_production_context` at **11:21:16.113Z**, **11:21:23.002Z** and
   **11:21:26.113Z** (517/346/332 ms), plus `get_workflow` at **11:21:16.860Z**;
   all v17, `ok`, `paidAiAllowed=false`. These timings are individual samples.

The task was then updated in place to use the existing Liv workflow for research,
writing, metadata, existing media/native images where available, saving through
MCP and exact preview. It may not synthesize personal approvals or publish. It
must preserve durable identities, sources and assets and stop at an actual
personal choice or documented capability/access blocker. Backend paid generation,
provider retries, hold/budget changes and direct Webflow fallbacks are forbidden.

First production-prompt test:
`https://chatgpt.com/c/6aca2032-aad4-83eb-9fbc-0c7f85ea9aca`.
The task fetched context, retained work, existing articles and workflow, then
prematurely ended with a status and no specific research access blocker. It did
**not** write or save an article. This is a failed completion test, not a ready
article. The prompt was strengthened to require actual research and a saved
private draft/preview, or an exact missing tool/access/source condition; a media
blocker alone must not stop saving valid text/research/metadata. One further
bounded test was started after this concrete prompt correction. Its result must
be checked, not inferred from task activation.

### Real ChatGPT writing and private MCP save

The corrected run **did** write and save a private article:
`https://chatgpt.com/c/6aca20be-5f88-83eb-84ff-c8ceb2141851`.
Independent server audit records v17, status `ok`, `paidAiAllowed=false`:

| UTC | Operation | Duration |
| --- | --- | --- |
| 11:25:58.913 | `get_liv_production_context` | 382 ms |
| 11:26:02.620 | `get_liv_work` | 97 ms |
| 11:26:10.840 | `get_submission_options` | 304 ms |
| 11:26:11.210 | `list_articles` | 424 ms |
| 11:26:29.508 | `prepare_submission` | 781 ms |
| 11:26:32.799 | `preview_submission` | 864 ms |

- Title: **Hvorfor er venskab blevet tv-seriernes store kærlighedshistorie?**
- Submission: `9cb959c7798307f33d43f81ce05a55b1748fec8d3f44d9c811c00eee08a2d011`.
- Request: `liv-scheduled-2026-10-10`; production identity:
  `{kind: scheduled, day: 2026-10-10}`.
- Liv Brandt / Kultur, commentary without a star rating; SEO title, description,
  subtitle, introduction and body saved. Four source records from HBO/Prime
  were saved by ChatGPT. This is not a separate independent fact-check receipt.
- Initial revision 1 was `awaiting_preparation`, with `unknown_topic` because
  ChatGPT supplied topic **names**, not IDs, despite fetching current options.
  A precise revision-bound MCP update mapped only those two topics to the actual
  `Kultur & Mening` and `TV-serier` IDs. No other article field changed in revision 2.
- The initial preview displayed literal Markdown as one text block. A second
  deterministic revision-bound MCP update converted the existing body to 12
  escaped HTML paragraphs plus one heading and retained the existing emphasis.
  Normalized rendered prose was compared before/after and was identical; no new
  writing or AI request. The original submission text remains preserved.
- Fresh MCP preview of **revision 3** returned 13 distinct text blocks,
  `previewProblems=[]`, no `unknown_topic`, and hash
  `4523291c19c073197d56c883aa81544bc861a8e7b0451f1869d14c91886b563d`.
  `textPreserved=false` is the system's exact-content comparison after HTML
  formatting, not evidence that the prose was regenerated. A historical tool
  card in the original cloud chat still displayed revision-1 content after its
  refresh action; do not use that cached card as a current-version receipt.
- Still missing: **cover, body-1, body-2**. Quote is 0 DKK backend AI,
  `canAccept=false`, `chat_images_required`, `publicationReady=false`,
  `publicationVerified=false`. No personal approval, CMS item, media import,
  publication or reserve was created. This is saved private text, **not a ready
  article or unattended scheduled delivery**.

The same cloud task was updated again at 13:32 Copenhagen to use exact CMS IDs,
safe HTML rather than Markdown, and fix objective metadata blockers itself before
handoff. It must reuse the saved submission, not regenerate the test article.
The UI confirms it remains active, next invocation **11 October, 08:00 CEST**;
that is an off day and must not produce another article. No further writing test
was started. The first timer-fired production-date run remains unverified.

The existing local delivery observer was updated in place with these receipts and
the pending permission boundary. It is not the cloud producer. No duplicate
monitor or article was created. The pending Webflow permission question was not
repeated and its prepared token form remains unsubmitted.

Ledger readback **11:23:13.843Z**: October shared 1 call, 0 DKK estimate,
1.2144 DKK reserved and 1 unresolved; no October image ledger. No paid backend AI
call was recorded by the connection tests. ChatGPT subscription usage and ordinary
infrastructure charges are separate and are not measured by those ledgers.

Post-writing/post-update ledger readback **11:32:24.088Z** is identical: 1 shared
call, 0 DKK estimate, 1.2144 DKK reserved, 1 unresolved; no October image ledger.
No code deployment or repeated full test suite was needed for account configuration
and private MCP data operations. The earlier v17 release/test evidence remains
historical. Overall migration acceptance, real new-asset upload and public
end-to-end readback remain open; backend asset permission and actual personal
approval are not simulated to close them.
