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
- [x] Account-verified cloud timer, MCP claim/proposal/apply and public readback
  without intervention; first timer chose keep for both articles.
- [ ] Observe an actual necessary CMS PATCH from a timer-started run. No
  platform approval block was encountered, but keep is not write evidence.

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

## Official cloud schedule (created, then timer verified)

Created through ChatGPT's official web scheduled-task UI, not a local heartbeat:
`6acb8f8eaaa88190b605cf30ca98e982`, **Apropos SEO – ChatGPT-first**.
First automatic trigger is October 11 at 15:45 Europe/Copenhagen. It is intended
to move to daily 09:00 after that first timer observation. No Run now was used.
Fresh chat per run, existing account model, high reasoning, durable daily
request identity, limit two tasks and at most three bounded claim calls.
No connected credential or permission was changed. Writes must still obey the
platform's permissions. Creation is NOT proof of unattended execution.

## Production replay, version and transport checks

At 13:35:11.817Z authenticated production checks confirmed:

- Identical apply retries for both completed tasks returned their existing
  results with unchanged complete job/receipt hashes and no new CMS write.
- Wrong proposal hash and stale save-context hash were rejected with HTTP409;
  reusing the manual batch identity with a different limit was also rejected.
- An unauthenticated request was rejected with HTTP401. The legacy processor
  guard rejected model work with `seo_chatgpt_processor_required`.
- Independent fresh public HTML still matched Wolverine at 13:35:06.784Z and
  Syd for Solen at 13:35:10.719Z. Protected ledger/hold hashes stayed identical.

Follow-up source `446ed7be459fac51a4bca6aa8acac4531edbcf87` is READY as
`dpl_GdmgsTyThaEf38DzAxu58wZhqtcT` with `ai.aproposmagazine.com`, verified
13:38:57Z. It adds the seasonal-demand caveat to the shared editorial prompt.
The full suite evidence remains 5098 tests; three additional focused assertions
passed afterwards (latest focused run: 20 tests across two files). Type-check,
lint and diff checks passed again. No claim that the entire expanded suite was
rerun, and no backend model call was needed.

## First genuine scheduled cloud run and final daily schedule

The October 11 15:45 Copenhagen timer was left to start itself. No Run now and
no message was sent to start/resume that run. The official task displayed
Starting run; the first server MCP call arrived at 13:47:04.260Z. This is a
roughly two-minute start delay, not an exact-on-the-second scheduling claim.
The resulting official cloud chat is:
https://chatgpt.com/c/cddb0fd5-19dc-8333-8bd4-53bc7e0c2606

Server audit recorded successful `get_workflow`, `claim_seo_tasks`, full-context
reads, two `save_seo_review`, fresh proposal reads and two `apply_seo_review`.
All report v19 and `paidAiAllowed=false`. No manual confirmation or intervention
was required. The cloud batch `apropos-seo-2026-10-11` completed two real jobs:

- English **Marvel's Wolverine**, task
  `b996021e125bae2d883181bbe707575a0a618e47c294c0d7a1ed2f309db8aba2`:
  claimed 13:47:12.278Z, kept and publicly verified 13:48:23.295Z.
  https://www.aproposmagazine.com/en/articles/marvels-wolverine-anmeldelse
- **I mellemtiden er vi ingen**, task
  `a32721c7cf76ca31b8b82b79b6e0b3606735012b79a29ed63de293586e98c74d`:
  claimed 13:47:13.713Z, kept and publicly verified 13:48:40.179Z.
  https://www.aproposmagazine.com/articles/boganmeldelse-i-mellemtiden-er-vi-ingen

Authenticated independent inspection at 13:49:55.212Z confirmed both complete
receipts, unchanged non-SEO content hashes, no write intent/CMS PATCH and the
same protected ledger/hold hashes recorded above. Unknown Google data stayed
unknown; these were content-based reviews, not performance conclusions.
The real user subsequently asked a status question in the result chat after
the receipts; that message did not initiate or assist the completed reviews.

The SAME cloud task was then changed to daily **09:00 Europe/Copenhagen**.
The official UI confirmed next run October 12 09:00 GMT+2 and Daily at 9:00 AM.
Model/reasoning, fresh-chat-per-run, existing permissions and bounded batch
prompt were preserved. No duplicate local automation or server ChatGPT-session
emulation was created. Screenshot evidence is saved locally at
`/tmp/apropos-seo-cloud-schedule-2026-10-11.jpg`.

Status distinction: implemented and deployed; manual real metadata change and
keep verified; genuine unattended claim/save/apply/readback verified. An actual
unattended metadata PATCH is still unobserved because both timer decisions
correctly kept existing metadata. Do not change good metadata to manufacture
that proof. The scheduled workflow can attempt future justified changes, but
do not claim the write-specific unattended criterion complete until a real
receipt exists. This SEO acceptance does not close Liv publication acceptance.
