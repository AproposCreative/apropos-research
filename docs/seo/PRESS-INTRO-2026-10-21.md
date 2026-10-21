# Press introduction revision

The owner asked to remove the repeated list of covered subjects from the short
introduction and give it more personality. The separate proposal about corporate
relationships was rejected and was never added.

Only the 50-word short introduction was rewritten in each locale. The 150-word
presentation, coverage sections, layout, portrait, photographer credit and press
contact remain unchanged. The Danish and English HTML sources, localization
nodes, PDFs, plain-text downloads and distribution ZIP now carry the new copy.

## Verification

- Both short introductions are exactly 50 words; long presentations remain 150.
- All six PDF pages were visually reviewed. Pages 2 and 3 in both languages are
  pixel-identical to the previous files; page 1 has no clipping or overlap.
- Each PDF retains 13 links, including four press mail links to Liv.
- The ZIP has 13 entries and passed integrity and PDF/text-content checks.
- All three uploaded assets were downloaded again and matched the local bytes.
- Both staging locales contain the new introduction and five updated download
  links. Their inline CSS is identical to the previous staging versions.
- A pre-existing, unpublished Danish helper-text edit was present in the initial
  MCP read: “Vælg den korte eller den lange præsentation.” It was preserved.
  Webflow also generated responsive image attributes for the unchanged English
  portrait during publishing. Apart from these recorded differences, structural
  comparison confirms only the new introduction and download destinations.
- The Danish introduction was visually inspected in the existing desktop layout.
  The copy button displayed its success feedback; the browser-session clipboard
  did not expose the copied bytes, so exact clipboard contents are not certified.

Evidence: `press-intro-verification-2026-10-21.json`,
`press-kit-intro-assets-2026-10-21.json`,
`press-intro-node-map-2026-10-21.json` and the saved staging screenshot.
No application, Liv, authentication, dependency or deployment files were changed.

## Initial staging release state

Webflow subdomain publish task: `d4827106-2d5c-465f-955e-15493acc4ff8`.
No custom production domain was selected.

A fresh production read now returns HTTP 200 for `/presse`, superseding the
previous 404 observation. It contains the previous introduction and previous
PDF/ZIP links. This turn did not publish that production version and does not
establish who published it or whether the earlier date/sort dependency was fixed.
The new introduction is verified on the Webflow staging URLs only.

The documented full-site publication dependency remains in
`PRESS-PRODUCTION-DEPENDENCY-2026-10-20.md`. Resume production release through that
coordinated date/sort verification before publishing all pending site changes.
The existing authorization remains valid; no new approval is requested.

## Production verification, 21 October 2026 at 17:51 Copenhagen

The owner requested publication and deployment. A fresh supported Webflow site
read showed that all four existing custom domains had already completed a full
site compile at `2026-10-21T15:49:14.316Z`. This turn did not initiate that publish;
it verifies the achieved outcome without attributing the external action.

Both production press pages now return HTTP 200 with the exact new short
introduction and all five updated PDF/ZIP links. Both PDF downloads and the ZIP
were fetched from their live links and match the reviewed local files byte for
byte. Liv's press contact, the longer presentation and photographer credit are
preserved. The Danish production page was visually inspected.

Eight topic paths and Featured in both languages now match staging in visible
text, metadata, inline scripts, image source/alt and ordered article URLs.
Featured contains the same 25 cards in the same order. This supersedes the
previous observation of differences between production and staging, but does
not establish that the underlying mutable date/sort binding was repaired.

The requested press introduction is now verified live. No duplicate site
publication or unrelated AI-app deployment was necessary. No CMS article was
changed by this turn. The Liv task was informed that no new Webflow publication
would be performed. Evidence: `press-intro-production-2026-10-21.json` and
`output/press-kit/intro-production-2026-10-21.png`.
