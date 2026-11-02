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
