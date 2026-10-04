# MCP v3: substantive metadata regression

Continuation of the approved MCP/evaluation plan. Previous turn made concrete
progress (v2 code and production verification); it did not complete actual
ChatGPT-client acceptance, human calibration or generic draft admission.

## Gap and change

The initial 35-text Promptfoo check proves saved-output integrity, not whether a
changed title loses a name, invents a number or introduces prohibited boilerplate.
Do not substitute that narrower check for the requested 20-article regression.

This release adds an explicit 20-article metadata corpus, grounded literal name
anchors and exact source hashes covering title/intro/body/original SEO metadata.
These are archive references, not a hidden holdout, newly verified facts or human
scores. The canonical data is never rewritten by evaluation.

- Shared pure comparator reports old/new findings and exact changed fields.
- New/misspelled primary names, new numbers absent from the saved context,
  existing prohibited SEO phrases, em dashes, corrupt characters, HTML and
  worsening field lengths can be caught without an AI call.
- Number presence in the source is not entailment. No lexical checker can promise
  complete factual accuracy or good Danish. Changed fields still need semantic
  review; fewer flags never becomes a quality score or publication approval.
- `get_metadata_test_cases` exposes the index, or one full reference on demand.
  `review_metadata_candidate` compares a proposed title/meta against that version.
  Both use read scope, retain owner-only access and make no paid model/CMS calls.
- MCP version `2026-10-04-v3`, **23 tools**. Same code is used by the offline
  Promptfoo assertion and the live MCP, rather than independent scoring rules.
- `quality:metadata` can import a strict 20-candidate JSON set from ChatGPT.
  Missing/duplicate IDs, extra evidence/score fields and stale hashes are rejected.
  Reports are local, and Promptfoo is still excluded from the production bundle.

## Verified locally

- **4,654 tests / 331 files**, isolated storage, passed, including 103 corpus
  tests and a real SDK-level metadata discovery/comparison/access/version test.
- Promptfoo baseline: **20 pass / 0 fail / 0 errors**. **Six** existing archive
  texts have visible rule findings; an unchanged reference has no new regression.
- Deliberately corrupted candidate set: **19 pass / 1 expected fail / 0 errors**,
  process exit **100** propagated. The changed case lost its subject name and
  introduced `987654321`. It was rejected, not saved or presented as real copy.
- TypeScript, focused ESLint, safe build configuration and production build pass.
  The traced MCP bundle includes corpus snapshots but not the Promptfoo package.
- **Zero paid model calls**, zero human ratings fabricated, zero CMS mutations.

## Still not complete

Actual owner ChatGPT connection, a selected real editorial task and exact-version
publication acceptance remain outstanding. This regression work does not bridge
arbitrary CMS drafts into Liv's approved queue, clear provider holds or demonstrate
unattended publishing. The original boundaries in
[the workflow acceptance](MCP-EDITORIAL-WORKFLOW-2026-10-04.md) remain in force.
Human quality comparisons and conditional document-extraction experiments remain
unproved. The full goal is not complete merely because this increment deploys.

## Production evidence

- Code **`0e31dd00612932377b2fd0b3a8cd71c8479c7a2a`**.
- Deployment **`dpl_BhQ2xjNVPzDCMJoufnGxvkHuDiWb`**, production, **READY**.
- Alias https://ai.aproposmagazine.com, exact SHA verified through Vercel.
- Immutable URL: https://apropos-research-b4h49l1g7-frederik-kraghs-projects.vercel.app
- Next.js 16.3.8; remote build-to-ready approximately 73 seconds. The deployed
  Git snapshot excludes unrelated dirty local work.

Owner service-authenticated acceptance **21:30:30–21:31:25 UTC** / **23:30–23:31
Copenhagen** returned MCP version `2026-10-04-v3` and all 23 tools.

The live server returned all 20 case summaries, retrieved one full saved source,
accepted an unchanged metadata baseline, detected the deliberately removed name
and invented numeric token, and rejected a stale source hash. These were read-only
proposals, not real replacements. Existing workspace/Liv/CMS reads, shared copyedit
preview, owner-only denials, OAuth PKCE/rotation/revocation and publication denial
remained correct. The temporary verification grant was revoked.

Before/after hashes for budget, provider, private workspace, delivery entries and
slots, shared ledger and image ledger were identical. No paid AI call, CMS write,
publication, budget increase or hold reset was performed.

Runtime window **21:30:30–21:31:30 UTC** contained 49 requests and no error/fatal
records. A wider error/fatal scan **21:29:45–21:31:30 UTC** contained **one** known
unresolved delivery alert: `/api/cron/liv-delivery-check` returned **503
liv_daily_overdue** at 21:30:26 UTC, with 4 October unpublished, reserve 0/1 and
6 October missing. This is not an MCP test failure, but it is also not repaired
or waived by this deployment. The delivery goal remains incomplete. The team's
Drains API returned zero configured drains; this short scan is not a long-term
monitoring/uptime claim.

A separate read-only owner connection inventory at **21:28:07 UTC** found two
historical grants, both inactive, **zero active connections**, no truncation and
an enabled owner account. No existing user connection was revoked by that check.
The remaining client acceptance therefore needs the owner to connect the private
app at https://ai.aproposmagazine.com/connect/chatgpt and identify a real draft/task.
An active grant by itself will still not count as a successful edit/publication
test. Resume at the actual ChatGPT call, preserving the selected article's version
and normal editorial/publication controls; do not publish arbitrary content.
