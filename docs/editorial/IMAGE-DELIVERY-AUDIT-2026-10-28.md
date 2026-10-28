# Public image delivery audit, 28 October 2026

Scope: read-only inspection of two freshly published DK articles, production
compression receipts and provided-asset locks, plus actual public browser image
selection at mobile 390x844/DPR3 and desktop 1440x1000/DPR1. Chromium viewport
simulation, not a physical iPhone test. This does not certify the entire archive.
No CMS/publication, policy, locks, approvals, image selections or code were changed.

## Verified outcome

Compression is working for the Ringo book review but is skipped for Terminal List.
The browser selects the following visible files on the public pages. Sizes below
are KiB rounded to the nearest whole number, measured from fetched image bytes.

| Article / asset | Mobile | Desktop | Dimensions / format |
|---|---:|---:|---|
| Terminal List cover | 2162 | 2162 | 3900x2600 JPEG |
| Terminal List body 1 | 76 | 76 | 1600x900 WebP |
| Terminal List body 2 | 2649 | 2649 | 3900x2600 JPEG |
| Terminal List body 3 | 21 | 21 | 1200x675 WebP |
| Terminal List body 4 | 5056 | 5056 | 3900x2600 JPEG |
| Ringo cover | 168 | 278 | mobile 1200x800, desktop 1536x1024, WebP |
| Ringo body 1 | 64 | 64 | 1200x670 WebP |
| Ringo body 2 | 90 | 90 | 1200x670 WebP |
| Ringo body 3 | 48 | 48 | 1200x670 WebP |

Terminal List visible article images total 10,204,090 bytes (10.20 MB).
Ringo visible article images total 379,488 bytes on mobile and 491,856 on desktop.
These are sums of selected visible file sizes, not total page network traffic.
No `srcset` exists on these matched image elements. The template switches between
separate mobile and desktop cover elements. Body images use the same delivery
file at both viewport sizes; no automatic smaller responsive variant was selected.

Configured default limits are desktop cover 450 KiB/2400px long edge, mobile cover
260 KiB/1200px, body 200 KiB/1200px. Ringo meets them. Terminal List's three JPEGs
exceed both byte and dimension limits; body 1 meets bytes but exceeds 1200px.

## Cause and receipts

`lib/webflow/article-image-auto-optimize.ts` lines 76 and 95 skip the entire article
when any selected provided asset is locked. One Terminal List body image has a verified
`editorialProvidedAssets` record with `preserveOriginal:true`. This preserves exact
source bytes but also prevents creation of compressed delivery derivatives for
all other images in that article.

Its post-publication receipt
`8c8e7a665e44a5232f6c6537dba654ff3b1be9cedc753b8a18101702fe3be84c`
at 15:35:34.638Z is `no_changes`, with zero optimized images and zero failures.
This is a skip, not proof of compliant image sizes. `published-image-optimization.ts`
also treats any prior `no_changes` receipt as already processed, so the same
unchanged item will continue to skip.

Ringo has a completed receipt
`99ca72d80c757cdd3e053c6c008b69430af6fa2b571783842579f769a1433e77`
at 15:30:28.299Z: desktop cover, mobile cover and three body images compressed.
The current image URLs have no provided-original locks. Its subsequent no-change
receipt at 15:40:29.375Z agrees with the measured files meeting the limits.

Production env export has no explicit optimization disable flags. Source defaults
enable both ordinary compression and the publication webhook. The actual receipts
confirm the post-publication path executed for both articles; this is not merely
an inferred enabled status.

## Required correction

Separate immutable original identity/selection from delivery derivatives: retain
approved originals, generate only proportional encoded copies without crop or AI
edits, and use the existing verified derivative receipt/readback mechanism. Report
locked/skipped distinctly from compliant, including the measured unmet limits.
An updated flow must safely reconsider old `no_changes` receipts without blindly
repeating uncertain writes or overwriting newer CMS changes. Do not delete original
locks or silently alter personal image selections.

This audit identifies the cause; it does not implement or deploy that correction.

## Evidence

- `output/image-delivery-audit-20261028.json`: live CMS asset URLs, byte sizes,
  dimensions, browser `currentSrc`, visibility, rendered sizes and source sets.
- `output/image-optimizer-state-20261028.json`: scoped production locks/receipts,
  checked at 15:46:07.267Z, and non-secret image policy configuration.
- `output/image-delivery-audit-20261028.cjs` and
  `output/image-optimizer-state-20261028.ts`: read-only reproduction scripts.
- Public URLs: `/articles/anmeldelse-the-terminal-list-saeson-1` and
  `/articles/anmeldelse-nogen-der-kender-nogen-laura-ringo` on
  `https://www.aproposmagazine.com`.
