# SoMe text fitting and compact toolbar

Scope: Design Editor only, with an opt-in inlineControls mode on EmbeddedAppHeader. Existing consumers retain their layout. Base bd7ae89 preserves Liv's published weekly approval feed. No CMS, Instagram, auth, dependency or deployment configuration changes.

- Header says SoMe; format, theme, post and PNG controls share the close-button row on mobile/desktop. Main controls and close are 32px high.
- Removed the effect which shortened selected article titles/subtitles, and the export renderer's two-line early return. A measured binary search chooses the largest whole-pixel size up to each existing design maximum. All words remain; long unbroken tokens wrap without losing Unicode code points.
- Light remains the default. Dark uses black background/white type and logo, inverted stars, and a white CTA with black text. The illustration retains its colors.
- Canvas preview, PNG download and Instagram JPEG preparation share the same renderer. Removed the independent HTML layout that clipped text differently. No social post sent during testing.

Validation: 1,037 tests in 101 files passed, full TypeScript and changed-file ESLint passed, fresh webpack production build passed. Isolated Chromium test of the actual editor component, fonts and export renderer with fixture API responses verified controls at 320/375/393/430/1280 widths, full THIRST TRAP title/subtitle, both sizes and themes, PNG dimensions/background pixels and JPEG output. Browser reported no JavaScript errors. Screenshots inspected. Test storage stayed in tmp/vitest-rage; no dependencies installed, lifecycle scripts disabled.

The full local app route requires runtime Firebase configuration and did not complete its auth boot in the empty-environment smoke test; the isolated component test is not an authenticated production test. Production deployment SHA and public/authenticated readback are recorded separately after release.

The user's current request explicitly authorizes deployment of this SoMe change after testing. Earlier image-recovery and unrelated editorial working files are not part of this release.
