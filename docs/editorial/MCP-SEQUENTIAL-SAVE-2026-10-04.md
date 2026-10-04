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

Production build, exact deployment identity and read-only service acceptance are
recorded below after release. A successful deployment is not proof that Frederik
has connected his real ChatGPT account or that an article has been published.
