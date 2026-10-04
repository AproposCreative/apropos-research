# MCP: sequential staged saves and timeout recovery

## Reproduced failure

During the remaining end-to-end audit, a second exact intro edit in the same
private workspace failed with `mcp_cms_revision_conflict` after the first CMS
save succeeded. This was reproduced before the fix in
`test/mcp-copyedit-flow.spec.ts`. The stored opening binding still pointed to
the original CMS fields. It therefore treated our own verified first save as an
external conflict.

This is distinct from the still-unresolved generic admission of imported drafts,
actual ChatGPT-client acceptance and Liv's provider/delivery failure. It does not
justify bypassing any of those controls.

## Repair

- After exact CMS readback, commit the save receipt and the new CMS binding in
  the same transaction. The binding advances only if its old version is still
  identical. Reopening an article concurrently preserves that newer binding.
- Never overwrite the private workspace during confirmation. A later unsaved
  local edit remains intact while the previous save is reconciled.
- Use a stable operation identity bound to item, draft, private revision and
  article, not a patch computed from a binding that changes after success.
  Repeating the original request returns its receipt without a second PATCH.
- The ordinary save response and `get_save_status` share the same confirmation
  code. A lost response uses CMS readback, not another write or AI purchase.
- Preserve old receipts. When they lack the captured next binding, reconcile the
  known write but explicitly require reopening before the next edit. Do not
  invent the missing historical state.
- An unexpected CMS version or publication flag leaves the uncertain receipt and
  lock intact. Newer fields, media, live state and receipts are not overwritten.

## Verification

- The pre-fix second-save test failed with the actual conflict above.
- After repair, **22 focused tests** pass, including sequential edits, duplicate
  request, lost-response recovery through both entrypoints, later private edits,
  concurrent reopening, conflicting CMS readback and pre-upgrade receipts.
- Full isolated regression: **331 files / 4,662 tests passed**.
- TypeScript, scoped ESLint, build-config security and diff checks passed.
- CMS mutations above use simulated services. No production article is changed
  as a test, and no paid AI calls are authorized by this repair.

## Production release and bounded verification

- Commit `f6701d85d8cb4895b67f27833c6f66736e0f54b0`, deployment
  `dpl_DCVqxBKjmweZS7BTDqs94nf4EXNU`, **READY**, production target.
- Actual alias: https://ai.aproposmagazine.com . Immutable deployment:
  https://apropos-research-rap6xx3kg-frederik-kraghs-projects.vercel.app .
- Local Next.js 16.3.8 production build passed. The exact pushed Git commit was
  built remotely and aliased, not the unrelated dirty local working tree.
  Remote build-to-ready interval: **67 seconds**.
- Service acceptance ran **21:45:01–21:46:09 UTC** on 4 October, or
  **23:45–23:46 Copenhagen**. The actual server returned `2026-10-04-v4` and
  all 23 tools. Discovery, owner OAuth/PKCE, refresh rotation, access denial for
  anonymous requests and colleagues, and immediate test-grant revocation passed.
- Reads of the current private workspace, CMS article, retained work, editorial
  rules, workflows and costs succeeded. Exact-copyedit preview still matches the
  first-party API. Metadata regression cases and deliberately stale/invalid
  proposals retained the expected results.
- `get_save_status` succeeded. A save with a deliberately impossible private
  revision was rejected with `mcp_revision_conflict` before CMS mutation. There
  were no existing MCP save receipts in the selected private workspace to
  reconcile. The successful write/timeout/concurrency paths remain **simulated
  acceptance**, not a claim that a real article was edited in production.
- Before/after hashes matched for budget, provider state, private workspace,
  queue entries/slots, and both October cost ledgers. **Zero new paid AI calls**,
  no CMS mutation, no publication and no budget/hold change were made by the test.

Runtime logs from **21:44:55–21:46:20 UTC** returned 100 rows with duplicate IDs;
deduplication yielded 50 unique rows. They include 27 MCP HTTP 200s, two expected
MCP 401 denials, and the expected first-party 403 denials. An independent
error/fatal query returned **one** `/api/cron/liv-delivery-check` HTTP 503 with
`liv_daily_overdue`. This known delivery failure remains unresolved; it is not
hidden by the successful MCP release. The narrow scan is not an uptime guarantee.

## Remaining outcome and resume point

At **21:44:40 UTC**, a read-only owner connection inventory found **zero active
grants**, across three retained, non-truncated grant records. The owner's account
was enabled. Temporary service-test grants are revoked, not a real ChatGPT
connection. No user's grant was deleted or revoked by this inspection.

Next client acceptance: Frederik connects his private ChatGPT app at
https://ai.aproposmagazine.com/connect/chatgpt and selects an existing draft.
Read its current version and sources, preview a precise edit, save only after
the requested edit, then check the receipt. Publication still needs existing
admission checks and exact-version first-party approval. Do not select and
publish an arbitrary article just to mark the test complete.

The current private workspace, all archived paid text, media, queue identities,
reservations and audit records are preserved. Generic imported-draft admission,
genuine human quality ratings, conditional document-extraction comparison and
Liv's every-other-day delivery remain as documented in the broader checklist.
This release does not establish readiness, three unattended publications or a
completed overall goal.
