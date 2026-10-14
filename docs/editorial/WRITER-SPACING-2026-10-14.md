# Writer: remove editorial-notes card and stacked spacing

## Requested outcome

Remove “Noter fra redaktionen” from the Writer chat surface and reduce excess
spacing below setup choices, without changing generation, saved content, notes,
selection handlers, permissions or publication. This is the owner's explicit
exception to the earlier instruction not to alter Writer's visual presentation.

## Cause and scoped correction

The live 390px browser reproduced the supplied press-step screenshot. Three
nested elements contributed bottom padding: step content12px, SetupWizard8px,
and WizardAutoHeight20px (24px desktop). Approximately40px mobile/48px desktop
below the last option was real CSS padding, not missing content or AI loading.
The mobile wrapper's8px margin also added to the composer's8px flex gap.

- Remove the ColleagueNotes import/render from MainChatPanel. Existing notes,
  their storage, prompt provenance rules and other editing surfaces are intact.
- Remove the step-content12px bottom inset and reduce wrapper padding to4px.
  SetupWizard keeps its8px mobile/12px desktop padding:12/16px total.
- Let the composer's8px gap be the only mobile separation, not gap plus margin.
- Reduce extra message-list clearance from40px to8px while retaining measured
  fixed-composer height, so existing messages remain visible above the input.

No global CSS, typeface, colour, AI prompt, API, article, image, personal consent,
budget or provider setting is changed. No new dependencies.

## Verification

- 30 targeted Vitest tests passed across colleague-note provenance, single
  workspace ownership, restore and synchronisation; isolated RAGE_STORAGE_DIR.
- TypeScript and build-configuration security gate passed.
- Changed-component lint:0errors,4existing warnings (3internal navigation and
  1unused image directive), outside the changed presentation lines.
- React review: no new effects/state/network activity; event handlers and
  accessible controls remain intact.
- `node scripts/verify-writer-spacing.mjs`:10 actual-component browser cases
  passed. Author/press at320/390/768/1440px; hide/reopen; no horizontal overflow,
  no clipped final options, measured bottom inset/gap and notes preserved.
  Two saved-conversation cases at390/1440 verify explicit resume and last-message
  clearance above the input. External services are isolated; zero real AI/CMS calls.
- The reusable resume fixture now supports an opt-in real-wizard layout mode and
  CSS-module bundling. Initial verification found the older fixture lacked that
  bundling and explicit workspace resume; both test-harness issues were corrected.

Evidence: `output/writer-spacing/geometry.json` and mobile screenshots. These
fixtures do not claim a real AI generation, CMS publication or user approval.

## Release

Pending staged production build and authenticated live UI readback.
