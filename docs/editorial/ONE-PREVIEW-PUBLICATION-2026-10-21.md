# One preview from image choice to publication

Owner request, 21 October: no opening a preview twice. Choose the pictures,
review the article and finish with “Godkend og udgiv” in one flow.

## Implemented boundary

Both the MCP article card and first-party preview now keep the article visible
alongside pending image choices. The separate image/article tabs are removed.
“Brug dette billede” selects the exact displayed file for the private draft;
the same page reads back and displays the updated article. It is not a second
publication approval. When choices are resolved, the existing single final
“Godkend og udgiv” is available in this same view. No link reopening, return to
chat or confirmation message is required. Planning remains an optional choice.

This deliberately does not silently publish a new image just because it was
selected. The final personal consent still binds the actual resulting revision,
content hash, media hashes and editorial decision. Existing ownership, expiry,
stale-version, exact-file exception and technical publication checks remain.
Failed/ambiguous selection is read back; it never starts a publication attempt.
An external-preview lost publication acknowledgement is now resolved against
the exact consent ID and revision, not merely any processing/publication state.

## Design

Keep Apropos's existing palette (#080808, #f5f5f5, #b0b0b0, #555555, #333333),
inherited type and bounded article measure. One vertical reading surface with
image choices, the actual article and one final publication control. No new
dashboard cards, tabs, modal, brand treatment or animation. Candidate history
warnings remain visible, including after attachment beside final consent.
Mobile controls retain accessible focus and touch sizes. Individual choice is
still explicit; an unresolved alternative cannot be chosen by the model.

## Verification

- Five relevant suites, 72 tests passed: consent, first-party route, widget
  state, MCP protocol and exact-file cover exception.
- Isolated actual first-party React component: 16 mobile/desktop cases passed,
  including non-first candidate choice, stale/missing pixels, decline, selected
  attachment resume, sequential choices, lost selection/publication responses,
  and one final publication request despite double click, without navigation.
- Isolated MCP candidate widget: seven cases passed, including the sequence
  from choices to a single final consent in the same visible article card.
- MCP publication widget: normal, lost acknowledgement, rejected version and
  broken image passed under enforced CSP. No real personal approval, CMS write,
  generation or external publication occurred in any fixture.
- TypeScript and targeted ESLint passed. Screenshots were inspected at mobile
  and desktop widths. Synthetic pixels are fixtures, not article assets.

## Barsel owner publication, separate from this UI release

The owner already completed actual selection and publication before this change.
No new approval or repeat publication was performed by this implementation.

- Same submission `546794452af45693e3495ae29d4fe5d8912c33844aaa62db10b2ad8a94e36171`,
  revision 10, hash `e02913cd16990457b39776ab43056adcc5381bb63dc76c35d2e7109e3107e227`.
- Same CMS item `6ad7aa27843abbb71024e79f`.
- Personal publication consent accepted `2026-10-21T07:35:33.481Z`;
  publication receipt `2026-10-21T07:36:00.371Z` verifies the new cover and four
  body images including cake. Original cover and cake bytes match their hashes.
- Fresh native MCP preview `2026-10-21T07:43:28.532Z`: published,
  publicationVerified=true, no preview/dependency error, four body images.
- Public URL: https://www.aproposmagazine.com/articles/jeg-gik-paa-barsel-og-endte-i-en-religioes-uldsekt

The historical cover preflight exception remains disclosed, not retroactively
converted to proof of canonical generation. Liv scheduling/acceptance, mail
access, the Rockstar draft, budgets and Instagram are not changed.

Deployment verification follows below. A fixture pass is not a claim of a real
user completing the newly deployed UI.
