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

## Production verification

Source `d86b9117df2d43c3b2bd07b0da3d0cfb0996928d`, staged production deployment
`dpl_GdEHVmfWdoP14NSkgXog7hNkNyjk`, READY with exact SHA metadata and assigned
`ai.aproposmagazine.com` alias confirmed. Local build: webpack, TypeScript and
254 pages; production build: Turbopack, TypeScript and 254 pages. Scoped lint
passes. 82 focused tests in six files pass, covering draft sync, existing and new
duplicate identities, format/text fitting and hosted Story access/store/runtime.

Browser fixture used the actual shared selector/renderer with freshly built
fonts. Desktop and 390px mobile observed; PNG/JPEG exports measured at
1080x1080 and 1080x1920. Long title at 150%, rating absent, and classic/photo
switching exercised. On the real authenticated production editor, Foto was
selected for the existing Terminallisten season 2 Story, saved and retained after
reload. Real photo, centered retained white logo, complete title/subtitle and six
stars visibly confirmed with no layout error. Only the design preference changed;
no article copy, publication receipt, post, worker configuration or automation was
changed by this feature. The in-app browser did not return a download event;
production export capture is not claimed. Local actual-renderer exports were
successfully saved and inspected. Evidence: output/social-photo-design-20261102/.
