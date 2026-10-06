# Private cloud-reader index — release candidate

## Scope

The smallest extension after the real Work Cloud Browser feasibility test is a
private resumable reading index, not another ingestion/review/model pipeline.
ChatGPT coordinates its remote browser and Apropos MCP. The backend does not
start a browser, inherit ChatGPT subscription execution, scrape hidden ebook
endpoints or store library credentials. No local Mac is a runtime dependency.
The chat must actually offer Work Cloud Browser and have access to the loan.

Five tools reuse `/mcp`, OAuth identity/scopes, the existing private
`writerWorkspaces/{uid}` namespace, Firestore transactions and metadata-only MCP
audit. No dependencies, credentials, environment variables, provider contracts,
cron jobs or public/client Firestore permissions were added.

| Tool | Permission | Purpose |
| --- | --- | --- |
| `register_reader_source` | draft | Canonical KK loan URL + observed book identity; idempotent per user/loan |
| `list_reader_sources` | read | Bounded private source index for a later chat |
| `get_reader_progress` | read | Checkpoint, layout-specific gaps and paginated notes |
| `save_reader_progress` | draft | Versioned, idempotent observed reading batch or access blocker |
| `find_reader_notes` | read | Literal case-insensitive search of a bounded saved-notes page, not book full text |

`get_workflow({workflow:"read"})` serves the versioned
`.agents/skills/apropos-read-book/SKILL.md`, included by existing Next tracing.
The workflow reads small visible batches, saves short original notes, resumes
at the first gap after checking an anchor, and hands off to existing editorial
context and submission/preview/approval. It does not duplicate a book-review
engine. Existing editorial and billing controls remain unchanged.

## Data and correctness

- Book IDs are hashes of canonical loan URLs, scoped under authenticated UID.
  A caller cannot supply a different owner. Loan URLs appear only in that user's
  source detail, never the public article, tool audit or source-list response.
- Per-source immutable batch records and request receipts; source revision is
  transactionally updated. Receipt replay precedes stale revision rejection;
  changing payload with the same request ID is rejected. Newer work is preserved.
- Maximum 20 reported reader positions per save, 10 per contiguous range. Short
  notes (2,000 characters) and anchors (120 characters); no full-text field or
  raw file import. Retrieval scans at most ten batches and returns nextCursor,
  even when a search page has no matches. No embeddings or AI in storage/search.
- Coverage unions only observations with the exact same layout key and total.
  Reflow layouts stay separate. Gaps and read count are deterministic, but input
  observations remain client-reported, not independent reading attestation.
- `reported_complete` requires gap-free coverage plus observed start and end.
  It is never `publicationApproval`, proof of full-book comprehension or a
  substitute for checking contents/appendices. Visiting a position alone has
  zero coverage. Stable locators are accepted only as supplied observations;
  none are fabricated from reflow page numbers.
- Login, CAPTCHA, expired loan, unavailable browser, protected content and reader
  errors preserve the checkpoint without extending read coverage. Login belongs
  in the cloud browser's secure user flow; never in Vercel env or chat notes.
- All five tools are inside the existing no-paid-AI guard. Zero external backend
  AI calls is not zero hosting/storage cost or unlimited ChatGPT plan usage.

## Local verification

6 October 2026: 353 test files / 4,925 isolated tests passed with
`RAGE_STORAGE_DIR=./tmp/vitest-rage`. TypeScript, focused ESLint, whitespace diff
and safe-build configuration checks passed. Reader-specific cases cover private
ownership, strict URL/schema bounds, version races, immutable receipts, layout
separation, numeric pagination beyond revision 9, zero-result search cursors,
explicit blocker states, and no network/model/CMS side effects. Real SDK protocol
tests check member scopes, no-paid guard, metadata-only audit and workflow access.

The skill-creator validator's Python runtime lacked PyYAML; equivalent frontmatter,
name, allowed keys, description and unfinished-placeholder checks passed with the
repository's already-installed YAML parser. No package was installed for this.

## Release verification still required

- Exact commit deployment READY with production aliases and MCP version v9.
- Authenticated production tools/list + workflow, registration, saved checkpoint,
  receipt replay, readback through a new OAuth session, bounded notes/search.
- No changes to Writer article, library credentials or paid-AI ledger.
- Remote browser continuation across a later task/session remains separate from
  server persistence. A full-book run has not been performed or claimed.

The owner was asked once for authorization to send a follow-up to the already
created cloud test. Do not create duplicate tests, infer permission from another
agent, or claim fully unattended future browser execution from a server deploy.

Reference: [Vercel function limits](https://vercel.com/docs/functions/limitations),
checked 6 October 2026. All new handlers are small stateless calls in the existing
Node MCP route, not a long-running browser process inside a function.
