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

Production evidence follows after deploy.
