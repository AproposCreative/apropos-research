# Dark SoMe rating correction — 2026-09-10

The Safari-compatible alpha-mask recoloring made every star white, including the opaque grey unawarded-star SVG. The rating data was correct; the distinction was lost during drawing.

The shared renderer now uses white for awarded stars and #555555 for unawarded stars in dark mode. Light mode still draws the original SVGs directly. Logo, geometry, text, article rating and CMS data are unchanged. Preview, PNG download and JPEG posting share this renderer.

Validation: actual Chromium canvas exports for ratings 1 through 6, square/story, light/dark, PNG/JPEG (48 outputs). Pixel checks confirm exactly the awarded count is white in dark mode and black in light mode. Canvas filter was disabled to exercise the Safari-compatible implementation. The 3/6 story image was visually inspected. TypeScript, ESLint and diff checks pass. No Instagram publication or physical iPhone test performed.

Local test harness/results: tmp/some-qa/star-check.mjs and star-regression.json. Release also includes the previously tested, unpushed standalone subtitle-control text contrast correction (4128688). Pending exact release approval; not live yet.
