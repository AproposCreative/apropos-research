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
personal approvals. **B** has a cloud-ready prompt below but is not activated or
verified on this account. **A**, unattended end-to-end production/publication, is
not claimed: current publication policy still requires a real version-bound click.
Server-side publication of an already personally approved scheduled version remains
supported and independent of the Mac. No undocumented endpoints or browser replay.

### Cloud schedule handoff (not an activated schedule)

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

Release verification is recorded below when completed.
