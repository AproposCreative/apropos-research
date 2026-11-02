# Mobile SoMe scrolling and other tools

Owner correction: the mobile editor cannot scroll to the design. Move Podcast
and Pushbeskeder into the mobile overview's disclosure, named Andre værktøjer.
The font question is informational: classic keeps Amiri regular/italic; Foto
keeps Poppins bold/regular. No font or card artwork changes are requested here.

Production reproduction at 390x844: the standalone editor root is 844px high,
but its main flex child grows to 1168px (min-height:auto), its inner frame to
1166px, and its intended scroll area to 1113px with equal client/scroll heights.
The root clips the overflow; the intended scroller therefore has nothing to
scroll. Bound both intermediate flex children with min-height:0 and make the
inner frame flex:1 instead of percentage height. The existing bounded workspace
remains the sole scroll area. Embedded and desktop layout, canvas rendering,
saved design/copy, publication receipts and duplicate locks are preserved.

Only the ToolList presentation groups active push/podcast with the existing
secondary tools. The catalogue's availability/status/permissions and the separate
desktop card menu remain unchanged. No service is disabled or marked paused by
this move. Retain deep links and the existing expandable disclosure semantics.

## Production verification

Source ddd61ebba8bff83c22ad41a0dbb1e59a742c1f43, deployment
`dpl_Ea5NwTctvauawV8dBVQt5WK4uchv`, READY with exact source metadata and
ai.aproposmagazine.com alias confirmed. Turbopack, TypeScript, 254 pages and
scoped lint pass; 26 existing checks across four access/catalogue/draft files pass.

Actual authenticated production at 390x844: workspace is now 789px high with
1087px scrollable content. Native scroll moves its scrollTop from 0 to 298 while
document scroll stays 0. Complete saved Foto Story, subtitle and six stars are
visible, with toolbar fixed above it. Mobile /ai disclosure reads Andre værktøjer
(4) and contains Pushbeskeder, Podcast, Image-gen and Akkreditering; first two are
absent from the primary list. Actual paused-status notes remain for the latter
two only. Before applying the mobile viewport, /ai without a view parameter
opened the desktop Writer, as required. No typography, artwork, article copy,
publishing identity, automation, provider, budget or credential change. No post,
push message or mail sent. Evidence: output/mobile-scroll-tools-20261102/.
