# SoMe subtitle: no paid backend model, 12 October 2026

Historical first release. The owner's subsequent requirement for zero-click
automation supersedes its manual UX; see `SOME-AUTOMATIC-SUBTITLE-2026-10-12.md`.

## Cause and scope

The old `useCardSubtitle` effect called `/api/design-editor/shorten-subtitle`
automatically when the original subtitle did not fit. The button called the same
OpenAI-backed route (`writer/design-subtitle`). An existing cost guard stopped it
and surfaced “AI-budgettet tillader ikke dette kald.” This was separate from the
MCP article approval/publication workflow.

## Change

- No generation/network request in the subtitle hook or controls. Opening the
  editor never rewrites the subtitle. Manual editing and original restoration remain.
- An explicit “Brug første sætning” option offers an exact, complete source sentence
  only if it fits the actual canvas font/format. It is labeled an excerpt, not AI
  rewriting. No arbitrary word truncation, new facts or automatic application.
- “Kopiér til ChatGPT” copies a bounded, source-preserving instruction for the
  existing editorial chat. The user pastes its response into the subtitle field.
  If clipboard access is denied, a selectable text field provides the instruction.
  This is a manual handoff, not subscription-backed server generation.
- The old authenticated route returns no-store HTTP410 / `subtitle_chatgpt_first`,
  with refresh guidance. Old tabs cannot make it purchase generation either.
- Format/article/source identity isolates local edits; cancelled font measurements
  cannot make the next article appear ready. Preview and PNG use the existing
  canvas renderer and readability gate. Only the card subtitle changes, not CMS.
- Desktop verification exposed a duplicate floating navigation overlay covering
  the export button. Removed it; both actions remain in the normal toolbar.

No change to published Kontrapunkt text/byline/SEO/media, personal approvals,
MCP v23, Liv scheduling, provider hold, budgets or reservations. No social posting
or activation. The separate legacy `more-clickbait` route was not used by this
view and is outside this subtitle repair; this is not a claim that all legacy
paid endpoints in the application have been removed.

## Verification before release

- Isolated suite: 373 files, 5,180 tests passed (`RAGE_STORAGE_DIR=./tmp/vitest-rage`).
- Type-check and build security configuration passed. Lint: no errors, nine
  existing unrelated warnings.
- Real SoMe view/hook/controls/canvas/PNG with isolated CMS/Firebase data and a
  Georgia font fixture: 390×844 and 1440×1000. Original unchanged on entry;
  explicit local excerpt; manual edit; restore; successful prompt copy and
  clipboard-denied fallback; separate square/story edits; successful PNG export;
  no overflow, JS errors, POSTs or model requests.
- `scripts/verify-social-subtitle-ui.mjs` reproduces this isolated browser test.
  `test/social-card-subtitle-api.spec.ts` covers retired-route auth/input checks,
  repeated calls with an available/unavailable mocked model, exact excerpts,
  unsupported segmentation, prompt provenance and no-model/no-fetch regression.
- Frontend-design guidance kept the existing black/white palette and compact
  disclosure; React guidance checked asynchronous font/copy state, identity,
  labels and touch targets. Vercel deployments-cicd guidance governs exact-SHA
  production release and runtime readback. No dependency changes.

## Production verified

- Source: `632f15b18cf3951b47b0542fc15383062feab11f`.
- Deployment: `dpl_Ev42yKcC4mykvVPpQtYdZHyya1tM`, READY with actual
  `ai.aproposmagazine.com` alias. Remote build completed in 55 seconds, ready
  2026-10-12T12:36:27.933Z. Initial Git-source creation hit a temporary GitHub
  secondary rate limit and created no deployment; one later attempt succeeded.
- Authenticated runtime check 12:36:54.065Z: unauthenticated POST401; two valid
  old-client requests HTTP410/no-store/paidAiCalls0; invalid input400. No model
  client, retry or budget change. See `SOME-SUBTITLE-CHATGPT-FIRST-2026-10-12-production.json`.
- Before/after cost and provider state identical: one historical tracked call,
  0 DKK usage estimate, 1.2144 DKK reserved, one unresolved; not a billing balance.
- Kontrapunkt item `6accb9d4a4cfa06c22daba31` unchanged in authenticated app CMS
  readback, item hash `d8349a4b057ff60eab7654d8e53c74a70ffb8016e58319a5ca4e43db65f968e1`.
- Actual production mobile browser at 390×844, production Amiri and real image:
  original shown; new first-sentence option; explicit selection changed only the
  local card and rendered “Klar”; no budget error. Restored original afterward.
  Screenshot: local `output/social-subtitle/production-mobile.jpg`.
- No article/CMS write or publication, no personal approval, no social post.
- Main checkout fast-forwarded while preserving the pre-existing unstaged diff
  SHA256 `1b319945b1841615679c2252e927796024b2493e2da861fba2aff6c9235b0cf0`.

The local excerpt is not a semantic rewrite and can omit a later qualification;
the UI explicitly asks the editor to check the point. ChatGPT handoff still needs
the user to paste the prompt/response; this release does not pretend to call their
subscription from the server. Broader Liv/migration acceptance remains separate.
