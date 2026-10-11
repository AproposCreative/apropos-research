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
- [x] Exact deployment + real manual MCP/public readback (change and keep).
- [x] Switch processor only after verification; legacy uncertain writes retained.
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
rejected recheck. Remote build/deployment and live cases are recorded below.

Read-only production inventory at 13:13:42Z found the October 11 Google queue
item for Syd for Solen (28 comparable days, 200/1803 impressions) still waiting
at the existing provider hold. Recent Wolverine queue rows are also preserved.
This is fresh queue evidence, not completed reviews or measured SEO improvement.

## Actual manual cloud/MCP verification and processor cutover

Source `fbcca47c75600da5259ff0e3cd50456d73855f4a` deployed as
`dpl_5kQt5Yxgdx7NRatU3SHSfUnyfbiF`, READY with the actual production alias.
The existing Apropos plugin's tools were refreshed, with no permission changes.
The account already had Allow all configured; this rollout did not expand it.
Real official ChatGPT Work test:
https://chatgpt.com/c/6acb8e3e-86f8-83ed-ad99-c64ea6148255

The initial app-created cloud chat took time to acquire its final ID. A second
web test used the SAME `seo-manual-2026-10-11-v1` request and therefore the same
two reserved jobs, not a duplicate batch. That extra chat was stopped; its
different editorial opinion was not substituted for the saved proposal. This
is manually initiated verification, not timer or independent-review evidence.

- **Syd for Solen 2026**, `69eb66221a89288e5b96907d`, task
  `c1c4b15dd673841e4297d4355cee0e64457491192c0cc1096f7c1e458e097e7f`:
  `applied`; public receipt `2026-10-11T13:27:31.274Z`.
  Title now “Syd for Solen 2026 – program, navne og anbefalinger”.
  Description now “Syd for Solen 2026 i Valbyparken byder på Lorde, The xx,
  Medina, Blood Orange og flere. Få programmet dag for dag og Apropos’
  anbefalinger til festivalens koncerter.”
  This is a judgment about the article's day-by-day programme/recommendations,
  not proof that metadata caused traffic decline or that the change improves SEO.
  Equal-length periods can span different seasonal demand. The canonical shared
  instructions were strengthened to make that caveat explicit after this test.
  Non-SEO content hash unchanged:
  `886b5258c73c81c6773c20f56eda340c8a2de5e4dbcaf8689f95b6d6538836ab`.
- **Marvel’s Wolverine**, `6ac7a31e994128467aa26e6a`, task
  `abbab2000949e47f68f0a018e17a6cce5625cd4cde92da5cc458b66d7acc4a6f`:
  `kept`; no CMS PATCH, public receipt `2026-10-11T13:27:38.623Z`.
  Both fields already accurately reflected the review. Unknown Google data was
  not treated as zero. Non-SEO content hash unchanged:
  `72c2817c68632b65052122bf5863a25595f6d4ee834c6d30583cad095c25cd35`.
- Now You See Me 3 was read-only checked through connected MCP at
  `2026-10-11T13:28:52.940Z`: lastPublished still October 6 21:25:27.270Z,
  expected corrected description and CMS hash
  `180f149c8921fc04aaac213e794db8799388ecac0362eea35feb72d323e1f233`.
  It was not rewritten.

At 13:29Z the existing authenticated owner API accepted the `activate` operation
with these exact applied/kept task IDs. Processor is now `chatgpt-first`.
Existing paid SEO workers are excluded; Google collection, historical failed
jobs/stages and ambiguous-write recovery remain. Liv was not migrated/reset.

Before/after authenticated production inspection (13:24–13:29Z) matched:

- shared ledger hash `a94a613eef3f7d2bb029dde9d5f0935ecfe01581d4d13d0b001784a1230e76ea`
- image ledger absent, hash `74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b`
- provider hold collection hash `dabf304be7cbda0d37c92f666d640f2ec114d2b13b2774ddcfd5da10416e08de`

No separate paid backend-model call, provider reset, budget change, whole-site
publication or Instagram action. ChatGPT subscription usage is not zero-cost or
unlimited; ordinary Google/Webflow/storage/hosting costs are unchanged.

## Official cloud schedule (timer verification pending)

Created through ChatGPT's official web scheduled-task UI, not a local heartbeat:
`6acb8f8eaaa88190b605cf30ca98e982`, **Apropos SEO – ChatGPT-first**.
First automatic trigger is October 11 at 15:45 Europe/Copenhagen. It is intended
to move to daily 09:00 after that first timer observation. No Run now was used.
Fresh chat per run, existing account model, high reasoning, durable daily
request identity, limit two tasks and at most three bounded claim calls.
No connected credential or permission was changed. Writes must still obey the
platform's permissions. Creation is NOT proof of unattended execution.
