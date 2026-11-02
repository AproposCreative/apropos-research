# Second SoMe design: Foto

Owner brief: keep the existing design and add a choice inspired by the supplied
full-photo reference cards, with the actual Apropos Magazine logo centered at
the top. Apply in the existing Social Media editor, including embedded app use.

Design plan: edge-to-edge centered photo crop, a black gradient toward the
bottom, centered white Poppins 700 headline, regular subtitle/metadata and six
rating positions below (filled white earned stars, gray remaining stars). The
photograph carries the design; no additional decoration or drawn CTA. Original
retained logo recolored through its alpha mask. Palette: photo colors, black
#000000, white #ffffff, unearned stars #747474; existing editor #1c1c1e and
selection blue #0a84ff. Classic keeps its existing appearance and light/dark
choice. Story leaves space for the native Meta link sticker.

Brief review: retain the reference's photographic hierarchy and centered copy,
replace its left-aligned publisher branding with centered Apropos branding.
Use real article titles, subtitles, images and ratings, not reference content.

The new Klassisk/Foto control uses the shared canvas renderer for preview,
PNG download and approved JPEG publication. Both existing 1:1 and 9:16 formats
are supported. Text sizes and title/subtitle spacing continue to apply.
Design is saved in the existing per-owner/article/source draft, including the
existing offline/conflict handling. Older drafts default to classic. Explicit
classic preserves historical publication identities; photo is a distinct design
and ignores the classic-only theme when calculating its duplicate lock. Existing
receipts and queued approvals are not changed. No post or mail is sent by release.

Missing photo/logo or excessive text prevents a photo export; it cannot silently
publish an empty cover. No dependencies, auth, credentials, Story worker, cadence,
production automation or budget changes are part of this feature.
