# Compact mobile SoMe controls

Owner screenshot correction: move the mobile Design label to the same line as
Gemt, and collapse the download/article-link panel behind a control beside Byt
felter and Nulstil. Keep Poppins in Foto and the existing artwork unchanged.

Use the existing black #000, panel #1c1c1e, white #f5f5f7, muted #98989d and
selection blue #0a84ff. Keep the current system UI type, rounded design choices
and 44px minimum touch controls. A single Design/Gemt heading row removes the
extra vertical label row on mobile. The original fieldset legend stays available
to assistive technology. At desktop widths the original separate label/status
presentation remains. No new visual decoration or new publishing flow.

The mobile Story-link button shares the existing Byt felter/Nulstil row and
opens the original export/link panel below it. Default closed, useId-bound
aria-controls and aria-expanded, normal keyboard button behavior and hidden
panel semantics. Desktop keeps the panel visible. Opening, closing and copying
do not publish. Image rendering, automatic draft save, scroll bounds, personal
approval/receipts/locks and hosted Story delivery remain unchanged.

## Production verification

Source a871074acdd412a8ddeaf91d2fa69578e958129b, deployment
`dpl_2AaD79yhTYx2JhnUjsMj3i8eRpTS`, READY with exact SHA metadata and assigned
ai.aproposmagazine.com alias confirmed. Turbopack, TypeScript and 254 pages
passed; scoped lint and 15 existing draft/text-layout checks passed.

Actual authenticated production at 390x844: visible Design and Gemt share the
same row/bottom (81.5px); three controls all sit at y=274.5 with 44px targets.
Story-link initially has aria-expanded=false and a hidden panel. Click opens
it and exposes the existing copy action; Enter closes it. At 320px all three
controls remain on the same row and within the viewport. The saved Foto Story
preview begins at y=326.5 when collapsed. At desktop width 1280px the toggle
is not displayed and the original export panel remains visible. No artwork,
font, draft copy, approval, receipt or publishing operation changed or sent.
Evidence: output/mobile-compact-20261102/.
