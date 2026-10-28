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

## Verified in production

Release `10fde77fa4d1837c098922859cdca031b5b34236` is READY as
`dpl_6k2jtvszjFhe679TiDZR19hVc4aT`; direct Vercel API metadata confirms the exact
SHA. `ai.aproposmagazine.com` points to that deployment. Remote build and typecheck
passed. 131 focused tests passed in total, including submission consent, published
target refresh and media identity. The staged deployment's protected image-status
route returned Unauthorized, not a successful flow check. Production checks below
used the existing authenticated webhook, not a protection bypass.

The Webflow connector lists only its own App-created registrations and could not
inspect this project's existing webhook. The existing service API verified the
publication registration `6aa5bdfa43db9787bc0d424c`. A single additional change
registration `6ae21d76d7314ac7030f815d` reuses the exact existing authenticated URL.
The API contract was checked against [Webflow's create webhook documentation](https://developers.webflow.com/data/reference/webhooks/create).
No authentication settings were weakened and no new secrets were introduced.

At 16:06:50.275Z an operator replay of Terminal List's change event through the
deployed webhook returned HTTP 200, CMS-verified desktop/mobile compression and
three compressed body images. The fourth body was already compliant. No SEO or
translation jobs were queued by this change event. The original locked no-change
receipt was reconsidered with its dated result preserved. A second replay at
16:07:48.488Z returned HTTP 200 / verified_compliant / six verified image roles /
zero new optimizations, demonstrating safe repeated invocation.

The actual CMS patch also triggered the new Webflow registration at 16:06:46.706Z.
That concurrent callback encountered the active CMS lease and received a retryable
503 rather than writing concurrently. The bounded deployment runtime error scan
found this single expected write-busy collision. No independent provider retry
completion is claimed; the subsequent deployed readback above verifies compliance.

Public Chromium mobile and desktop readbacks now select these files:

| Terminal List | Before | After |
|---|---:|---:|
| Visible article images, mobile | 10,204,090 bytes | 212,842 bytes (97.9% smaller) |
| Visible article images, desktop | 10,204,090 bytes | 437,914 bytes (95.7% smaller) |
| Mobile cover | 2,214,245 bytes | 77,064 bytes, 1200x800 WebP |
| Desktop cover | 2,214,245 bytes | 302,136 bytes, 2400x1600 WebP |

Body images are now 47,904 / 36,646 / 21,686 / 29,542 bytes, all WebP with long
edge at most 1200px. Totals are visible article file sizes, not total page traffic
(the template also contains hidden cover elements). The book review remains
unchanged and compliant. Every one of the five Terminal List original assets
returned HTTP 200 with its exact approved SHA-256 at 16:10:30.512Z. Native MCP
still reports published revision 12 with the original personal publication receipt.
This is image delivery maintenance, not a new editorial publication or Liv delivery.

Evidence:
- `output/image-fix-repair-receipt.json` / `image-fix-repeat-receipt.json`
- `output/image-fix-webhook-registration.json` / `image-fix-webhooks-after.json`
- `output/image-delivery-after-20261028.json`
- `output/image-optimizer-after-20261028.json`
- `output/image-fix-final-verification.json`
- `output/image-fix-deployment-api.json` / `image-fix-alias.log`

The rule applies to article media across publishing paths and locales. It does
not claim a full historical archive backfill or rewrite unrelated static design
assets. Unsupported/corrupt/animated sources fail visibly for review. Original
files and editorial approvals remain preserved.
