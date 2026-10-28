# Automatic article image delivery repair

The owner's 28 October rule requires automatic image compression after every
article publication, regardless of author or publishing client. Approved source
images, locks, credits and personal editorial approvals remain immutable.

## Implementation

- Keep the original-byte guard during personal preview/preparation. Published
  compression now creates proportional delivery copies even when an original is
  locked. No cleanup, cropping, AI, reselection or new publication approval occurs.
- Inspect every unique body image, including the ninth and later images, small
  files and URLs containing old optimized-path markers. Process both supported
  rich-text fields. Never replace the image based only on its filename/extension.
- Verify WebP bytes, dimensions and all image roles before CMS write and again
  after CMS readback: desktop 450 KiB/2400px, mobile 260 KiB/1200px, body
  200 KiB/1200px. Unknown/failed reads are errors, not successful no-ops.
- Reconsider historical `no_changes` receipts under the new delivery version,
  retaining their prior dated results. Completed derivative receipts retain the
  existing policy/identity so MCP's verified derivative adoption still works.
- Preserve CMS write leases, staged/live equality checks, image-only patching,
  original snapshots and timeout readback. Ambiguous `write_started` remains
  blocked from a blind retry.
- Handle `collection_item_changed` as well as `collection_item_published` for
  images. Changed events never trigger SEO or translation. The handler must see
  a genuinely published item with no pending changes before touching it; created
  events do not publish drafts. Errors return HTTP 503 for webhook retry.

## Validation and rollout

42 focused image/receipt tests passed, including real Sharp encoding, locked
originals, 13 body images, original preservation, false compliance, repeated
events, conflicts and ambiguous timeouts. ESLint and application TypeScript check
passed (the existing isolated config excludes unrelated output scripts).
Additional submission/webhook integration results and production readback are
recorded below after deployment.

The original audit is in `IMAGE-DELIVERY-AUDIT-2026-10-28.md`. This is a repair of
delivery derivatives, not a bulk editorial rewrite or a new article publication.
