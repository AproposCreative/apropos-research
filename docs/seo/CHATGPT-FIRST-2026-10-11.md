# ChatGPT-first SEO delivery

## Objective and acceptance

Reuse the production SEO queue and metadata-only writer. ChatGPT reads the full
article and stored Google evidence, saves a justified proposal (or keep decision),
rechecks it and applies through the authenticated, version-bound server workflow.
No server model request. No Liv, provider hold, budget or Instagram changes.

- [x] Production baseline: a3de3971c71b2da6dc2e85d25fb17ab45794694a,
  dpl_GmYQEpPEXWp3F1Lu1vcueEFVB3af, canonical production alias READY.
- [x] Separate worktree `seo-chatgpt-first`, branch `codex/seo-chatgpt-first`,
  based on 11eaeda2 (production source plus its verification document).
  The historical 9721210d SEO release is already an ancestor; no old branch merge.
- [x] Durable MCP claim/context/proposal/apply/status, existing identities.
- [x] Regression tests: keep/change, locks, stale versions/evidence, retry/timeout,
  no paid model, unknown analytics, authentication, metadata-only preservation.
- [ ] Exact deployment + real manual MCP/public readback (change and keep).
- [ ] Switch processor only after verification; legacy uncertain writes retained.
- [ ] Account-verified scheduled cloud task or exact platform blocker.

## Reuse and gaps found

`seoPostPublishJobs` already stores immutable article snapshots and comparable
Google evidence, admissions (two automatic performance reviews/day), cooldowns,
leases, saved paid stages, intended writes and public receipts. `cms.ts` patches
only live SEO title/description and verifies the hash of all other CMS fields.
The October 6 editorial revision is an immutable regression receipt, not a
reason to rewrite Now You See Me 3 again.

Missing: ChatGPT reservations and durable proposals, client-reported editorial
recheck provenance, MCP discovery, a processor exclusion gate and safe cutover.
No new database/platform or duplicate editorial state will be created. New
review state belongs to the existing quality job and article state.

Read-only Google collection remains on Vercel. The paid post-publication model,
legacy SEO pipeline (analyze/strategize/regenerate), and archive model writer
must respect processor exclusion. Historical paid stages/receipts are preserved.

## Supported scheduling boundary

Official source checked October 11:
https://learn.chatgpt.com/docs/automations
Web Work tasks can use connected tools/plugins without a local checkout. Desktop
tasks depending on local files need the computer running. Account permissions
and write approvals must be tested; neither a created schedule nor Run now is
proof of a timer-started, unattended write. Subscription limits and ordinary
Google/Webflow/storage/hosting costs still apply. No new OpenAI key or paid probe.

Implementation, deployment, interactive verification and unattended verification
will be recorded separately below. This document is not a completion claim.

## Implementation and isolated verification

Four owner-only MCP tools use the existing queue: `claim_seo_tasks`,
`get_seo_task`, `save_seo_review`, `apply_seo_review`. The existing
`get_workflow(seo)` serves the canonical metadata-editor instructions. MCP v19.
No new credential/provider. Saved context contains complete article, original
Google periods and null metrics, review hash, current locks and public URL.
Proposals contain exact before/after, reasons and article quotes. Quote overlap
is not a fact check; the separate recheck is labeled `chatgpt_reported_recheck`.
Model evidence is never fabricated. Full-article inputs over the supported
size fail explicitly instead of silently truncating.

Per-job/per-article processor reservation excludes the paid worker even before
global cutover. Two new performance claims per Copenhagen day; queue admission,
archive limits, field locks, 28-day cooldown and whole-content hash survive.
The original CMS adapter writes metadata only. Durable write intent precedes
transport, and a retry after ambiguous transport performs readback only.
Existing uncertain API writes remain reconcilable after cutover.

The authenticated owner route `/api/seo-engine/chat` mirrors this workflow.
Its one-way `activate` requires real applied + kept public receipts. It does not
change budgets, provider holds, Google collection or Liv. Until activated, only
explicitly claimed jobs move to ChatGPT; other jobs retain the old processor.

October 11 isolated baseline: 368 files / 5098 tests passed; type-check passed;
lint 0 errors (9 pre-existing unrelated warnings); safe build configuration
passed. Additional focused assertions cover daily performance claims and a
rejected recheck. Remote build/deployment and live cases are not yet verified.

Read-only production inventory at 13:13:42Z found the October 11 Google queue
item for Syd for Solen (28 comparable days, 200/1803 impressions) still waiting
at the existing provider hold. Recent Wolverine queue rows are also preserved.
This is fresh queue evidence, not completed reviews or measured SEO improvement.
