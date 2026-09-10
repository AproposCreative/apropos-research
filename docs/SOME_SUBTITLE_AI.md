# SoMe subtitle shortening — 2026-09-10

Scope: isolated SoMe editor update based on main 0274f34995710981bc0315f799c64e85829e068f.

The card subtitle is measured with the actual Amiri font. When it would fall below 38 px on the 1080 px square or 48 px on the 1080 px story, the editor automatically requests a shorter subtitle. The existing authenticated OpenAI connection returns two bounded candidates; the browser selects a candidate that meets the measured readability floor. No fabricated fallback is supplied on an AI error.

A collapsible editor allows manual edits, retry and restore. Overrides are scoped to the article, source title/subtitle and format for the current mounted editor session. They are not stored in CMS. Switching articles or manually editing cancels stale requests. Download/post confirmation is blocked while the text is too small or a request is pending. The prompt requests factual fidelity; editors should check AI wording before use.

Original article, headline, caption, ratings, image, logo, theme, toolbar and card rendering geometry are unchanged. Shortening naturally changes wrapping and the existing flow layout. No shared auth, Webflow, dependency or deployment files changed. No Instagram post was made.

Validation:
- Full isolated Vitest suite: 102 files / 1041 tests pass.
- New API tests: authentication, input bounds, valid subtitle-only output, unavailable/invalid AI with no invented fallback.
- TypeScript, targeted ESLint and production build pass. Final small UI/key/token-limit adjustments rechecked with TypeScript, ESLint, API tests and browser tests.
- Local Chromium harness: automatic shortening in both formats, original caption preserved, restore without automatic retry, API errors, delayed response cannot overwrite manual edits, and per-format edits retained.
- Existing browser checks: five viewport widths, four format/theme exports, logo visible without canvas.filter; short square rendering still matches baseline.
- Browser tests use mocked AI responses and API fixtures. No real paid model call or production AI verification has been performed. Physical iPhone Safari not tested.

Release status: local only pending exact-commit approval under the most recently supplied user recovery instructions. Credentials were not read or changed. Temporary build and browser artifacts remain under ignored tmp/some-qa.
