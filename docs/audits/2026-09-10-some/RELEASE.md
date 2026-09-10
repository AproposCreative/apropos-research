# SoMe text fitting and compact toolbar

Scope: Design Editor only, with an opt-in inlineControls mode on EmbeddedAppHeader. Existing consumers retain their layout. Base bd7ae89 preserves Liv's published weekly approval feed. No CMS, Instagram, auth, dependency or deployment configuration changes.

- Header says SoMe; format, theme, post and PNG controls share the close-button row on mobile/desktop. Main controls and close are 32px high.
- Removed the effect which shortened selected article titles/subtitles, and the export renderer's two-line early return. A measured binary search chooses the largest whole-pixel size up to each existing design maximum. All words remain; long unbroken tokens wrap without losing Unicode code points.
- Light remains the default. Dark uses black background/white type and logo, inverted stars, and a white CTA with black text. The illustration retains its colors.
- Canvas preview, PNG download and Instagram JPEG preparation share the same renderer. Removed the independent HTML layout that clipped text differently. No social post sent during testing.

Validation: 1,037 tests in 101 files passed, full TypeScript and changed-file ESLint passed, fresh webpack production build passed. Isolated Chromium test of the actual editor component, fonts and export renderer with fixture API responses verified controls at 320/375/393/430/1280 widths, full THIRST TRAP title/subtitle, both sizes and themes, PNG dimensions/background pixels and JPEG output. Browser reported no JavaScript errors. Screenshots inspected. Test storage stayed in tmp/vitest-rage; no dependencies installed, lifecycle scripts disabled.

The full local app route requires runtime Firebase configuration and did not complete its auth boot in the empty-environment smoke test; the isolated component test is not an authenticated production test. Production deployment SHA and public/authenticated readback are recorded separately after release.

The user's current request explicitly authorizes deployment of this SoMe change after testing. Earlier image-recovery and unrelated editorial working files are not part of this release.

## Follow-up design comparison

Compared the previous and current PNG renderers in the same browser/font session. Short-copy light cards in square and story (including logo, rating and metadata) produce byte-identical PNG output. Geometry/constants, font family and image-cover algorithm remain unchanged. Text fitting can change the text block height and therefore image crop through the existing flow layout.

The standalone desktop topbar lost its article-list shortcut when controls were consolidated; the separate navigation still provided access. Restored the topbar shortcut at all widths, using the compact control size. Verified closing/reopening the article list at desktop plus repeated five-viewport and four theme/format checks. No other design changes in this follow-up.

## Story spacing and filter-independent dark assets

Added 32 export pixels between the Story headline and subtitle (existing -10 adjustment becomes +22). Subsequent metadata, CTA and image follow the existing flow. Square spacing is unchanged.

Replaced canvas.filter inversion for logo/stars with an isolated alpha-mask canvas using source-in compositing. This avoids the limited filter API in Safari/iOS. Light assets are drawn by the original path. Source: https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/filter .

Browser verification with canvas.filter forced to a no-op: visible white logo pixels in both dark export sizes; all four PNG/JPEG combinations and five viewport controls pass. Square light short-copy output remains byte-identical to the original renderer. Story changes as intended. TypeScript, ESLint and diff checks pass. This is a simulated unsupported-filter regression check, not a claim of testing the user's physical iPhone.
