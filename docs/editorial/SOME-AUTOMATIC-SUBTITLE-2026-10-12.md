# Automatic SoMe subtitles, 12 October 2026

Owner correction: “Det skal holde samme automatik og selv gøre det.” This
supersedes the manual copy/paste and first-sentence-button UX in
`SOME-SUBTITLE-CHATGPT-FIRST-2026-10-12.md`. It does not authorize paid backend AI.

## Delivery

- On opening an article or switching 1:1/9:16, automatically measure and select
  readable card copy with the actual font. No shortening click, clipboard, model
  request, subscription-session automation, CMS write or posting.
- Prefer ChatGPT's saved `article.socialSubtitles.square/story` (90/130 characters).
  The existing submission schemas, identity, revision, history, idempotency and
  approval hash store these optional fields. No parallel article, model or CMS
  field. `submit`, `liv` and `editorial` instructions ask ChatGPT to write these
  alongside metadata, based only on the title/subtitle; no additional generation
  request from the backend. MCP v24 advertises the additive schema.
- Title/subtitle edits invalidate older variants unless replacements accompany
  the same versioned update. Media/SEO-only changes retain them. Existing records
  and approvals are not migrated or changed.
- The editor's existing article read joins only published submissions and only
  when the current CMS fields exactly match the saved publication target hash.
  Projection excludes private text/research/ownership/approval records. Optional
  enrichment is bounded to 300 published records; absent/unavailable/oversized
  enrichment falls back to local automatic fitting, never a paid call.
- For legacy articles, preserve the full original if it fits; otherwise use the
  longest fitting complete leading passage. A single long sentence uses a
  word-boundary lead with a visible ellipsis. The UI labels this an excerpt, not
  an AI paraphrase or equivalent editorial quality. An unbreakable word or font
  failure stays blocked rather than hiding text or claiming readiness.
- Manual edits and Gendan original remain authoritative per article/source/format.
  Tilpas automatisk restores auto mode. Async font results cannot overwrite a
  newer selection. The existing renderer produces both preview and export.
- The old authenticated model route stays retired (410/no-store). Instagram,
  provider holds/budgets/reservations, article text and publication are untouched.

## Verification before release

- 374 isolated files / 5,190 tests passed with `RAGE_STORAGE_DIR=./tmp/vitest-rage`.
- Type-check, lint (0 errors / 9 unrelated existing warnings), safe-build config.
- Real MCP protocol discovery includes the 90/130 schema; existing submission
  persistence/replay/revision/history and source-invalidation regression passed.
- Published-copy projection tests cover matching CMS, concurrent changes, private
  states, malformed copy, missing bindings/storage and oversized query.
- Browser fixture runs the real editor/hook/canvas/export with isolated CMS and
  Georgia font at 390×844 and 1440×1000: Kontrapunkt zero-click auto fitting, saved
  ChatGPT variants for both formats, manual preservation, restore, per-format
  isolation, PNG export, no overflow/errors/mutations/model requests.
- `scripts/verify-social-subtitle-ui.mjs` reproduces it. Runtime production-font
  and exact release evidence is recorded below after deployment.

These tests do not prove a future cloud task will supply the optional variants.
Cached ChatGPT clients must refresh MCP discovery before using the new field.
No new article or unattended publication was generated to demonstrate this change.
Native ChatGPT writing uses subscription limits; storage/hosting remain separate.
