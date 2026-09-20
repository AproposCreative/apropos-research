# Text-free Reacher cover: verified release

User requested AI removal of all promotional lettering and logos from their supplied Reacher image, use as article cover, and a standing no-text image rule.

## Verified delivery

- Production code: `ac818dcf03f5aceb74a578274f0a4fff687ac35e`.
- Deployment: `dpl_DH5YAK7t7NsNZY2e4gDrM4R6CZNd`, READY with `ai.aproposmagazine.com` alias.
- Application API: authenticated `/api/liv/operations/cover-cleanup`, prepare followed by apply. No browser session or manual CMS write.
- CMS item: `6ab04461516d8c4c0bc8482d`, Danish locale.
- Revision: `477dd47ff872cd8e462240f731cdce32e12526dcf35e9e6376c15bb58af1f084`.
- Image receipt: `d35f5be8e1c54b9b3d0ca9fec1daf5c4a4a4638aee900c7790f2c8e1122f1e7b`.
- Public URL: https://www.aproposmagazine.com/articles/anmeldelse-reacher-saeson-4-er-brutal-lettelse
- Public HTTP 200, correct title, two cover variants and matching Open Graph image verified at `2026-09-20T21:18:51.989Z`.
- Public image bytes exactly match SHA-256 `1688040748eb28a53aaf8b5c016b18f54a397cfb6c994a528fb162666f887e98`: 1280×720 WebP, 110,022 bytes.
- Cover/mobile alt: “Alan Ritchson som Reacher i rødt og blåt lys.” Credit retained: “Foto: Prime Video”.
- Operation verifies all non-cover CMS fields unchanged before publishing: prose, body images, metadata, categories and rating remain intact. No unpublish/reset, queue mutation or Instagram operation.

## Editing and provenance

- User-provided original SHA-256: `1f193c6ff27f2ffe5fce787f1db82ae0dd68277e2ad48e5f717f04e0bf3c8190`.
- One OpenAI `gpt-image-1.5` image-edit response was purchased through the application's separate Image-gen ledger. Additional checks used bounded vision calls, not further image generations.
- The first whole-image result altered some facial detail. It was not published. The same saved AI response was localized to detected lettering regions, then colour-matched to the original boundaries to avoid visible seams. Original pixels outside those masks are retained before final WebP encoding.
- Final localized, blended result passed independent vision comparison and visual inspection. Original, paid response and intermediate image assets remain stored. The source was supplied by Frederik; reuse rights are not independently asserted by this operation.
- Local final artifact: `output/imagegen/reacher-cover-uden-tekst.webp`.

## Standing rule and checks

See `IMAGE-TEXT-POLICY.md`. New Liv media, Image-gen output/import/recovery, and shared app-to-CMS image preparation enforce the rule. No paid historical backfill was run. Direct edits outside the application cannot be guaranteed by this server flow.

- Text-free images reuse cached checks. Edited derivatives retain stable CMS/CDN URLs to prevent webhook update loops.
- Idempotent paid stages, source/result persistence, budget reservations, uncertain-call protection, publication reconciliation, CMS write lease and readback remain enforced.
- Regression: 283 suites / 3,939 tests passed, with paid transports blocked in tests. TypeScript and scoped ESLint passed.
