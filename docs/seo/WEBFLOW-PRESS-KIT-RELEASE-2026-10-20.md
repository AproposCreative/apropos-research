# Apropos press-kit expansion — 20 October 2026

## Delivery

The Danish and English three-page PDFs and the 11-file ZIP are complete, uploaded and publicly downloadable. The expanded Danish and English press pages are implemented and verified at:
- https://apropos-magazine.webflow.io/presse
- https://apropos-magazine.webflow.io/en/presse

Production /presse still returns 404. The existing full-site publication dependency remains: publishing changes visible article dates and Featured order. This is not a missing user approval. See PRESS-PRODUCTION-DEPENDENCY-2026-10-20.md and WEBFLOW-PROFILE-RELEASE-2026-10-20.md.

Portrait/editorial photographs remain absent because the supplied logo folder contains no photos; a single question requesting their location and real photographer credit is pending. Audience numbers are deliberately not published: the saved GA4 baseline is property-level sessions without a hostname filter, and the fresh authenticated aggregate query stopped at vercel_login_expired. Neither sessions nor missing users/pageviews were presented as readership. See press-kit-evidence-2026-10-20.json.

## Requested editorial changes

The press description is distinct from About. Short (50-word) and extended (150-word) presentations are provided in both languages. Frederik Emil Kragh appears only in the factual editor/contact entries, not the press narrative.

On About, the exact sentence “Ansvarshavende redaktør er Frederik Emil Kragh.” was removed from the existing introductory text node d757511e-40a7-7bc7-979b-2e8f985db120. All other About nodes are unchanged from the previously staged state, including the existing press link. Legal/company and factual contact information remain available.

The expanded page includes six coverage areas, five verified public article examples, the ad-free policy, original black/white logos, both PDFs and the complete ZIP. No unsupported market-leading claims, readership counts, external press endorsements or press photos were fabricated.

## Files and brand

- output/pdf/apropos-pressekit-da.pdf
- output/pdf/apropos-press-kit-en.pdf
- output/press-kit/apropos-pressepakke.zip
- output/press-kit/brand: six untouched SVG/PNG/PDF originals.
- scripts/press-kit/build_press_kit.py and README.md: reproducible generator.
- scripts/press-kit/assets: supplied reference texture, original logo inputs, pinned Google Fonts and their OFL licences.
- press-kit-assets-2026-10-20.json: public URLs, exact hashes and Webflow asset IDs.

The visual PDF treatment follows the supplied reference: blue graphic banner, white logo, serif display headings, Poppins text and rounded links. All six PDF pages were rendered and visually inspected. Every PDF has 13 working link annotations and no text/annotation outside its A4 page.

The ZIP contains 11 files: two PDFs, six original logos, two text documents and README. It excludes internal analytics, credentials, the source application PDF and working files.

## Webflow implementation

Site 67dbf17ba540975b5b21c180; existing press page 6ad77b51dc274141752159c0.

New main: 93cff143-c674-9c0b-d261-d04567d00a0e replaces only the previously created press main 97f17cab-85e0-0f38-13a8-6e54b0b9c0a4.

The page shell and Top Bar/Navigation/Footer/Subscribe component instances are unchanged. No shared component definition, global application/auth/dependency/deployment file, CMS article, Liv process or Instagram publication was modified. The WHTML importer generated scoped -1 class variants when new press styles differed; computed typography is Satoshi, Arial, sans-serif.

Original SVG bindings:
- Black image node a925f543-b8c9-af94-ca0b-13b9163164ea → asset 68b8369a1082b00dd562aac5.
- White image node c4d26d85-fe46-24e9-adc5-438a61a534fd → asset 688df50d0d7d3716eccf2b4e.

All 20 definition-list labels/values contain native paragraphs. This exposes them to the localization API. English content was written against 95 primary text-node IDs with zero API errors, then read back and checked in rendered HTML. Empty feedback paragraphs inherit appropriately; the full EN page contains translated text including all facts. Existing site-wide navigation/footer translations were preserved.

Page-local JavaScript upgrades the two copy links to buttons, preserves paragraph boundaries, handles clipboard refusal with text selection, and chooses feedback using document.documentElement.lang. Contact navigation uses native scrolling with an offset below the existing sticky navigation. Only this page's head/footer blocks were updated.

The first signed S3 upload failed with HTTP403 because the connector returned camelCase field names. The request was corrected to the exact S3 policy field names, reused the existing registered asset IDs, and verified public bytes after upload. Existing matching SVG assets were reused rather than uploaded again. No signed upload details or credentials are stored in this release.

## Verification

Final staging publication task: 598ce0d3-6609-422c-8003-72d3e950002e, customDomains=[], publishToWebflowSubdomain=true. Earlier expansion publish: aa4d5029-94c8-4c30-93a2-577bae9e5194.

- DA and EN return HTTP200, one main, one H1, correct localized title/description/canonical, exact short and long descriptions, 20 fact paragraphs and five article examples.
- All 21 distinct HTTP destinations linked from the page return 200.
- All nine downloadable asset URLs return bytes exactly matching local SHA256 checksums.
- Both PDF files: three A4 pages, complete text and links inside page bounds.
- ZIP integrity check passes; exactly 11 expected files.
- Native browser: actual Satoshi typography; desktop 1200px and mobile 390px without horizontal overflow.
- Both copy controls report success in Danish and English. Local isolated checks additionally verify exact copied text, paragraph boundaries, clipboard rejection fallback and idempotent initialization at 320,390,768,1024,1440 widths.
- Original black and white logos load at natural width 1200. Preview backgrounds remain white/black in both site themes; dark mode text contrasts correctly.
- Contact heading lands 140px below viewport top on desktop.
- Node syntax check passes for the page-local JS.
- Eight generator asset hashes verified against pinned provenance.
- Tree comparison: press shell unchanged; About differs only by the requested sentence removal.
- Temporary theme and viewport changes restored after verification.

Machine-readable HTTP evidence: measurements/2026-10-20-press-kit-http-verification.json.
Element snapshots: WEBFLOW-PRESS-KIT-BEFORE-2026-10-20.json and WEBFLOW-PRESS-KIT-AFTER-2026-10-20.json.

## Resume

The next production step is the existing durable publication-date/sort repair, not another permission request. Preserve these completed press files and staged page identities. Establish authoritative historical dates and supported legacy binding access, verify date/order stability across staging publishes, then perform the authorized production release and verify both press URLs and the About text.

For audience figures, refresh the existing production access session, query hostname-scoped aggregate GA4 users/pageviews/sessions for a dated period and update the press materials only with verified metrics. Add photographs only after actual assets and photographer credits are supplied.
