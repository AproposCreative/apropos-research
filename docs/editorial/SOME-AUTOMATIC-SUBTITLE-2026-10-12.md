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

## Production evidence, 12 October 2026

- Code `0513eec190aeb6bea20f48bf61509fb0b452da22`, deployment
  `dpl_6m5rGe3Q6Sk6TrwVWT2iBrpkaN3h`: READY, exact Git SHA and real
  `ai.aproposmagazine.com` production alias confirmed. The first deployment
  `dpl_6itfDsccr88BzW3N7Enx5AC9Ppy3` failed before build with `git_info_fail`;
  remote Git SHA was checked and one retry of the same commit succeeded. No
  source workaround or rollback of unrelated work.
- Authenticated runtime check at `2026-10-12T12:59:13.694Z`: existing Kontrapunkt
  `6accb9d4a4cfa06c22daba31` remained byte-for-byte equal in the article API
  before/after. JSON SHA-256
  `d8349a4b057ff60eab7654d8e53c74a70ffb8016e58319a5ca4e43db65f968e1`.
- Anonymous old shortening endpoint returned 401; two authenticated old-client
  requests returned 410/no-store with `paidAiCalls=0` and reload guidance;
  invalid format returned 400. Shared cost summary and provider hold unchanged:
  one historical call, 0 DKK usage estimate, 1.2144 DKK reserved, one unresolved.
  Provider response hash
  `87926057aa6f38f9bc1157d20575743abd5c5d8eacb0a34da14b8b185814a380`.
  No CMS write, publication, hold/budget change or paid model request.
- Actual production editor at 390×844, existing authenticated session and real
  production font/image: opening Kontrapunkt automatically selects
  “Kontrapunkt har formet DSB og TV 2.” for 1:1, without a shortening click.
  9:16 retains the full original subtitle because it fits. Switching back
  restores automatic square fitting. No browser console errors. Temporary
  viewport override reset afterwards. This is not a mocked article/render.
- Screenshots and machine receipt retained in
  `output/social-subtitle/live-automatic-mobile.jpg`,
  `output/social-subtitle/live-automatic-story.jpg` and
  `output/social-subtitle/production-automatic.json`. Local fixture evidence
  above remains separate from this production readback.
- Connected MCP `get_workflow(submit)` returns the live 90/130-character
  ChatGPT-writing instruction, `paidAiCalls=0`, versionHash
  `8886e7bc5d26f20f040a58f6bf405f540813d7d29ef3f63f9890dbd69b77ca54`.
  No new submission, approval or scheduled generation was run to demonstrate it.
- Invoked the existing Apropos plugin's official Refresh tools UI; it returned
  from loading to enabled without a displayed error or permission change. The
  UI did not expose the refreshed per-field schema, so this is not an actual
  cloud-write proof. Restored the original editorial chat without sending a
  message, starting a task, creating another plugin or changing permissions.
- Bounded Vercel error/fatal log query for this deployment from 12:56 to
  13:00:04Z returned no entries; that is not a claim about all runtime traffic.

Automatic local fitting is verified live. Saved ChatGPT-copy creation and
hash-bound projection are implemented and regression-tested; a future real
cloud-generated/publicized article with these new optional fields is not yet
observed. Legacy excerpt selection is not represented as a semantic AI rewrite.
