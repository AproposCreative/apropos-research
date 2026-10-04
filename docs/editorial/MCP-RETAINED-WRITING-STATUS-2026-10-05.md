# MCP retained writing: accurate completion status

## Confirmed defect

The first remaining technical boundary in the draft-review story was the
saved-writing projection. `list_editorial_work` labeled every archive row
`written_unverified` and set `hasText=true` for any string `rawResponse`.
An archived JSON response saying `insufficient_evidence` with an empty body was
therefore presented as written prose. A pre-generation brief also got the
written stage. `get_saved_writing` returned raw data without the same explicit
status or missing-evidence projection.

A bounded read-only production archive inspection at **4 October 23:26:45 UTC**
(5 October 01:26 Copenhagen) found **76 archive records**, including eight with
no raw response and eleven with provider output `insufficient_evidence`. Three
of the latter appeared among the returned 50 mixed catalog rows with an empty
body but `hasText=true`. The catalog is not a unique-article inventory.

Two preserved examples:

- `038c3fa7-2885-4bab-be30-1653d7a81cf2`: empty article body, three evidence
  gaps, stored/provider status `insufficient_evidence`, finish `stop`.
  Raw SHA-256: `b9a1eae3ad0a5870f112f3cbb2584cb43b38ec9ed58e4312ef5ca1132adf3e90`.
- `eb99845e-7d07-4974-ad32-275240f9be23`: retained article body, provider
  output `ready`, finish `stop`, **not** editorially admitted or publishable.
  Raw SHA-256: `39423ede148471caf48d257146a0a58f00cd0785197d35c41f535d9b3a4887f0`.

## Repair and boundary

MCP version `2026-10-05-v3`, still 28 tools. The list and detail now use one
read-only status projection: `brief_only`, `empty_output`, `evidence_blocked`,
`incomplete_output`, `unparsed_output` or `written_unverified`.

- Distinguish stored raw response from visible article prose. Unknown/legacy
  output stays unknown (`hasText=null`), not missing or certified complete.
- Preserve raw bytes/hash/source links. Project concrete missing evidence,
  recorded finish reason and structural schema status separately. Structural
  validity and provider `ready` are never editorial admission or human approval.
- Refused/truncated/invalid responses cannot become written-complete merely
  because JSON parsed. Brief-only fallback titles do not expose writer prompts.
- Title-only or empty/image-only Liv checkpoints are `checkpoint_incomplete`,
  not written drafts. Existing ready manifests and publication receipts retain
  their separate checks and fresh-readback requirement.
- The list carries one shared explanation instead of repeating it in every row.
  It performs no additional per-row database reads, network research or AI calls.
- Bounds, owner/scopes, paid-call denial, private workspaces and publication
  controls stay unchanged. No saved output, queue state or quality evidence is
  changed by classification. No added dependency or browser/UI change.

## Local verification

The new regression failed on the original code with `written_unverified` and
`hasText=true` for an empty insufficient-evidence response, then passed after
the repair. **44 focused tests** pass, including **26 new status/detail cases**.
The final full isolated suite passes **337 files / 4,777 tests** with
`RAGE_STORAGE_DIR=./tmp/vitest-rage`. TypeScript, scoped ESLint, diff checks and
the build-config safety gate pass. Next.js 16.3.8 production build passes:
231 generated pages; compile 10.8 seconds, TypeScript 7.5 seconds. Generated
temporary build-path changes were restored, not included in the release.

Cases cover actual empty-evidence shape, partial blocked prose, conflicting
saved/provider status, absent/empty/malformed/legacy/oversized output, unknown
finish evidence, refusal/truncation, hidden markup, invalid format, exact raw
hash/source retention and unchanged storage. No provider test call is required.

## Production verification

- Code: `cdd1dfce08dbabe491b50c90abe84ec9f2e0d4c5`, pushed to
  `codex/liv-daily-recovery`.
- Deployment: `dpl_5fbdjuUzMv6cxvFzCYuwniMECQK9`, **READY**, production target.
  Immutable URL:
  https://apropos-research-qsspdcwm9-frederik-kraghs-projects.vercel.app
- The exact SHA, production target and `ai.aproposmagazine.com` alias were
  independently returned by the deployment API and Vercel connector. Remote
  build-to-ready was 67.2 seconds. The deployment used the scoped Git commit,
  not the dirty checkout. A preceding abbreviated-SHA command was rejected by
  the local helper before any deployment request; the full-SHA request above
  created the single deployment that was then polled to completion.
- Authenticated MCP checks against the **actual production alias** ran
  **4 October 23:38:19–23:38:46 UTC**, or 5 October **01:38 Copenhagen**.
  Initialization reports `2026-10-05-v3`, still 28 tools. Both affected tools
  retain their read-only annotation, strict inputs and read scope.
- The returned 50-row catalog reads a bounded window of 63 Liv records and
  76 writing records, not a unique-article total. The known primary now reports
  `evidence_blocked`, `hasText=false`, three missing-evidence notes and no
  publication approval. List and detail statuses match. None of the visible
  insufficient-evidence responses is marked `written_unverified`.
- The alternative remains `written_unverified`, `hasText=true`, still without
  publication approval. Both original raw hashes above and exact source arrays
  match their independently read archive records. A caller-supplied UID is rejected.
- An isolated **read-only service-test** OAuth grant completed S256 exchange.
  Only that test grant was revoked; the same token then returned HTTP 401.
  This was not the owner's real ChatGPT connection or a human editorial review.
- Before/after hashes match for budget, provider hold, owner workspace, delivery
  entries/slots, shared/image ledgers and the entire bounded writing archive.
  **No paid AI call, article edit, CMS write, publication or hold reset.** Only
  test OAuth lifecycle records and ordinary MCP read audits were added.
- Owner connection inventory returned to its original complete baseline:
  zero active authorizations, no observed successful call on an active grant,
  `clientAcceptanceVerified=false`. The owner has been asked which actual article
  should be used for the first real edit once connected; no choice is invented.
- Runtime aggregation for **23:38:15–23:38:50 UTC** reports seven `/mcp`
  requests plus the expected OAuth/status requests. The deployment-scoped
  error/fatal scan found no matching logs. Vercel Drains count is zero; existing
  runtime logs and MCP audit remain, without a new telemetry dependency. These
  bounded checks are not a long-term availability guarantee.

## Remaining full-goal gates

This fixes the accuracy of retained-work discovery; it does not produce a new
article or silently admit a generic draft. The owner's real ChatGPT connection,
owner-selected editorial review/publication, genuine quality scores and Liv's
provider/next-story/reserve/unattended-cadence gates remain separate. The full
objective is not complete.

The next client acceptance step is a real owner connection at
`https://ai.aproposmagazine.com/connect/chatgpt` and the owner's article title/ID.
Read fresh connection/workspace/article state, perform the selected exact edit
through the existing preview/save/readback flow, and retain the resulting
receipt. Publication still needs an eligible ready article and the real
version-bound owner confirmation. Do not substitute another service test grant,
an arbitrary article or synthetic review for those missing inputs. Provider
recovery and human quality scores keep their existing separate resume conditions;
this release provides no fresh billing evidence or editor rating.
