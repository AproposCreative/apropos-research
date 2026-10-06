# Private cloud-reader index — deployed and server-verified

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

## Production verification

- Commit `3da4345f7eb0c041517bdea5af704e621bd7bf3a`, deployment
  `dpl_AjWf9kQPFW2w5D2AHZxiD5U8iJhA`, READY with `ai.aproposmagazine.com`
  and the existing production aliases. Vercel build completed in 52 seconds;
  approximately 72 seconds from buildingAt to READY. No build gates disabled.
- Authenticated production OAuth/PKCE verification at
  `2026-10-06T19:30:48.693Z` returned MCP `2026-10-06-v9`, 47 tools and the
  deployed read workflow. Workflow hash:
  `7bf91dc7f3d7c29e985f1c64aeae8e9e69241c3c2fb4b142dd64af238a1c6c11`.
- Registered the actual book from the earlier authorized cloud test, private
  source `5987a89e1425ef21c2e8eb7d5dda65a4c971020991490620572b14d0592d751b`.
  Saved only its observed chapter-1 bookmark at position 4 and a brief technical
  note at revision 1. **Zero read positions** were recorded; navigation is not
  evidence of complete interval reading. No fake test book or full text was stored.
- Repeated the exact request: immutable receipt replay succeeded. A different
  stale revision was rejected without changing the source. Revoked the first
  temporary OAuth grant, created an independent second session, and confirmed
  the same checkpoint and revision through `/mcp`. Bounded note search succeeded.
- Anonymous access remained 401. Writer workspace, accepted welcome receipt,
  shared cost ledger and provider-hold data were unchanged. Zero backend AI calls
  started. Both temporary verification grants were revoked; existing connections
  were not changed. No library login or password was collected or stored.
- Error/fatal scan of the exact deployment from `19:26:33.782Z` to
  `19:31:33.782Z` found the pre-existing Liv delivery overdue error, no MCP error
  entries. This small window is not a long-term reliability guarantee, and the
  reader release does not fix Liv's separate provider/delivery problem.

## End-to-end acceptance at the initial v9 release

Production persistence across independent MCP clients is verified. Remote
browser continuation across a later task/session is **not** the same test and
remains unverified. A full-book run has not been performed or claimed. The reader
workflow can coordinate a browser available to the chat; it cannot provide a
missing Cloud Browser capability or autonomously schedule ChatGPT execution.

The owner was asked once for authorization to send a follow-up to the already
created cloud test. Do not create duplicate tests, infer permission from another
agent, or claim fully unattended future browser execution from a server deploy.

Reference: [Vercel function limits](https://vercel.com/docs/functions/limitations),
checked 6 October 2026. All new handlers are small stateless calls in the existing
Node MCP route, not a long-running browser process inside a function.

## v10 boundary-guidance correction

The owner-authorized real cloud continuation exposed an instruction ambiguity:
after saving positions 1–6 successfully, the client repeatedly sent a boundary
flag on a later batch and received `mcp_reader_boundary_unobserved`. The existing
handler correctly rejected it without writing. The generic recovery instruction
did not explain that boundary flags are **per batch**, so the client incorrectly
suspected revision or chapter boundaries.

The v10 patch adds precise schema descriptions, an actionable error response and
a focused addition to the existing read workflow. Middle batches send both flags
false; the server already retains earlier start/end evidence. Position 1 and the
actual `layout.totalPositions` remain mandatory for true flags. No validation,
coverage calculation, scopes, storage, receipt or publication rules are relaxed.
The coordinator supplied the actual code diagnosis to the same cloud task so it
could preserve and correct its existing batch without starting over.

Local verification: 353 files / 4,927 isolated tests passed on 6 October at
22:00 Copenhagen, plus TypeScript, focused ESLint, skill-frontmatter validation,
safe build configuration and whitespace checks. New tests exercise rejected
cumulative boundary flags, unchanged revision after rejection, preservation of
old boundary evidence on successful middle batches, and protocol-level recovery
guidance.

v10 production is verified: commit `06678fbbe331ea821ff8bdbfd908cc887ec0ab75`,
deployment `dpl_8s45BM1o6tf4J2ZNSgVNizNp7FAd`, READY with the real production
alias. Approximately 108 seconds from buildingAt to READY; build log reports
completion in one minute. At `2026-10-06T20:03:54.085Z`, authenticated `/mcp`
returned v10, 47 tools, both new field descriptions and workflow hash
`6dacb06e007ae596d052b3d8eeb3b4b608630bc93f080fe414dd95a5c416ebd4`.
An intentionally invalid, no-text request using a nonexistent source identity
returned the precise boundary guidance before any source/receipt write. No
actual reading observation was fabricated for the test. Anonymous access stayed
401; workspace, welcome receipt, ledger and provider holds were unchanged.
The temporary verification grant was revoked; existing connections preserved.
Error/fatal runtime scan `19:58:34.928Z–20:03:34.928Z` for this deployment found
no matching entries, not a long-term guarantee. No new drains were configured.

At that same check the real cloud reader had independently reached revision 6,
with positions 1–36 recorded, gap 37–154, on the newly observed fixed layout.
That is partial client-reported reading, not a full-read result or an
unassisted-success claim: this first acceptance run required operator tool-list
refresh and boundary-field diagnosis. See the acceptance journal for the final
continuation result.

## Final cloud acceptance and independent readback

The authorized existing Work Cloud Browser task has now completed the full
reading/index test. At `2026-10-06T20:17:15.007Z`, a separate authenticated MCP
client retrieved source revision 24 with 154/154 positions, no gaps and both
boundaries observed on the precise reading layout. All 24 historical batches
(one old technical bookmark and 23 reading batches) were retrieved across three
bounded pages with no missing or duplicate revisions. Paginated notes search
also succeeded. The old feasibility layout remains at zero coverage.

The cloud report and observed progression document sequential visible reading
and same-profile reload/resume at position 36 → first gap 37. Full details and
scope limits are in `KK-READER-CLOUD-ACCEPTANCE-2026-10-06.md`. The initial run
needed tool-list refresh and boundary diagnosis; it is not an unassisted-run
claim. No fresh-profile/expired-loan test was performed. Client-reported reading
remains distinct from independent persistence verification and comprehension.

Exact production remains `06678fbbe331ea821ff8bdbfd908cc887ec0ab75` /
`dpl_8s45BM1o6tf4J2ZNSgVNizNp7FAd`, MCP v10. No further code deployment was
needed for the acceptance journal. Final readback started zero paid backend AI
calls, preserved workspace/welcome/ledger/holds, and revoked its temporary OAuth
grant without changing the user's connection. Publication approval stayed false.

Use the deployed `get_workflow(read)` in a Work chat with real Cloud Browser and
Apropos AI. The Mac is not needed for cloud reading; MCP still does not provide
the browser or autonomously start future Work tasks. Do not store library login
in Vercel or infer a completed review/publication from completed reader coverage.
