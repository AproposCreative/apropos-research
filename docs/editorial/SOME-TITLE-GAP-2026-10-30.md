# SoMe title/subtitle gap, 30 October 2026

Owner report: the gap below a headline grows too large, particularly after
pressing “Større”. The shared canvas renderer advanced by a complete headline
line-height after its final line, then drew the subtitle at that baseline. The
unused trailing line-height grew with the headline font size.

The subtitle now starts 24 export pixels below the actual bottom of the final
headline's ink. Its own measured ascent determines its baseline. This keeps a
constant visible gap when either field is resized. Finite font-size fallbacks
remain available for browsers without actual ink metrics. Headline position,
fonts, manual sizes, line wrapping, wording and cards without a subtitle stay
unchanged. Image/CTA and story metadata follow the shorter text block naturally.

Preview, PNG download and publication JPEG share this same renderer. No UI,
desktop startup, stored copy, budget, provider, source image or social account
changes. No real post was published to verify an appearance correction.

Verification: 24 actual Chromium/canvas cases with the currently deployed Amiri
fonts served locally. Square/story, light/dark, title sizes 70/100/150%, enlarged
subtitles, multiline titles and no-subtitle cards passed. Every relevant measured
ink-to-ink gap is 24px within floating-point tolerance. PNG/JPEG drawing matches;
copy/fonts/sizes and title position are preserved. TONY at 150% shrinks from
100.69px to 24px; at 100%, from 53.09px to 24px. No-subtitle layouts are identical.
Eight fitting tests, app TypeScript and the build security check also pass.

Evidence: `output/social-title-gap-20261030/`, including actual font receipts,
before/after images and `verification.json`. The photo in the test images is an
explicit local fixture, not replacement article imagery.

Production readback is recorded after deployment below.
