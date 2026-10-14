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

- Source: `98e4eefb741fb7477297ca50ea089562e3fe16cc`.
- Deployment: `dpl_DkcvftpruvhXiU2qCtKWbQoiMtE1`, production build READY.
  The clean-archive deployment passed the remote security gate, compilation,
  TypeScript and generation of 237 static pages. Existing dependency audit
  findings were unchanged (3 moderate, 7 high); this layout patch does not fix them.
- Before promotion, authenticated Vercel curl verified the staged `/ai` page
  and its 17 script chunks: new build ID present, notes label absent, compact
  `pt-2 pb-1` wrapper present. Deployment protection was not disabled.
- Promoted on 14 October 2026 around 18:31Z. Independent alias lookup for
  `ai.aproposmagazine.com` returned the exact deployment and source SHA above.
- Authenticated live browser readback at 390x740 and 1440x900 confirmed the
  notes card is absent, setup and composer remain usable, and the production
  build label is `1.0.0.98e4eef`. Mobile press and last author choice both have
  11.5px measured bottom clearance; desktop press has 17.5px including the
  production border/rounding. All choices remain visible and unclipped.
- Only setup tabs were opened; no author/press choice, article generation,
  workspace reset, approval or CMS action was submitted. The temporary browser
  viewport was reset and the verification tab closed.

Implemented, deployed and verified live. Saved-conversation continuation and
note preservation are covered by the isolated browser/regression tests above;
no paid production generation was used as a layout test.
