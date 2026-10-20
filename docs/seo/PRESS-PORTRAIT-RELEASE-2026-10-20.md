# Press portrait update, 20 October 2026

## Delivered

The owner-supplied portrait of Frederik Emil Kragh is included in the Danish and
English press contact profile, both three-page PDF press kits and the downloadable
ZIP. The owner confirmed the photographer credit as **Christine Olsgaard, Azide**.

- Danish: `Foto: Christine Olsgaard, Azide`.
- English: `Photo: Christine Olsgaard, Azide`.
- Original JPEG preserved byte-for-byte: 984 × 1280, 190,909 bytes.
- SHA-256: `fcbeac413578bd657b68bb91860016d3b3e30e8928bde479965488477a8c3bef`.
- No crop, retouching or change to the photograph.
- Role remains in the factual/contact area, not the publication's presentation.

## Verification

- Both PDFs: three A4 pages, 13 working PDF link annotations, text bounds passed.
  All six pages rendered and inspected. Pages 1 and 2 in each language remain
  pixel-identical to the previously reviewed versions.
- ZIP: 13 files, integrity check passed. Embedded portrait and PDFs match the
  final local and uploaded bytes. Separate photo-credit text included.
- Four new public assets uploaded with HTTP 201 and read back byte-for-byte.
  Previous assets remain available at their existing URLs.
- Danish and English staging pages return HTTP 200 and point all five PDF/ZIP
  links at the portrait edition; the separate JPG download is also verified.
- Press-page text outside the contact section is unchanged against commit
  `a0784f1c2a4c4b07eee00934bcdd24925029d3d3`.
- Browser checks at 1200px and 390px: no horizontal overflow. The complete
  portrait renders at 200 × 260.15625 CSS pixels in both checked layouts.
- A site-wide `figure { min-width: 100% }` rule initially enlarged the mobile
  portrait. A scoped `min-width: 0` on `.press-portrait-figure` corrects it.
  No pre-existing style class was changed.
- Webflow retained the old English download destinations after native link and
  localized text updates. The five download elements were recreated in the
  same positions with the same classes and labels, then localized and verified.
  Old-to-new node IDs are saved separately.

Evidence: `press-portrait-verification-2026-10-20.json`,
`press-kit-portrait-assets-2026-10-20.json`, the original page-tree snapshot and
the desktop/mobile PNGs under `output/press-kit/`.

## Release state

Latest staging publish task: `cd0b793e-f01c-4571-aaeb-f0b073743a9f`.
Only the Webflow subdomain was selected; `customDomains` was empty.

- Danish preview: https://apropos-magazine.webflow.io/presse
- English preview: https://apropos-magazine.webflow.io/en/presse
- Production `/presse` still returns HTTP 404.

The existing full-site production dependency remains:
`PRESS-PRODUCTION-DEPENDENCY-2026-10-20.md`. Publication would also affect topic
dates and Featured ordering through mutable publication metadata. The portrait
update does not repair that shared CMS dependency and does not establish a
production release. Existing owner authorization remains valid.

The exact next production-release step is to establish the durable original
publication-date source and supported legacy date binding, verify stable dates
and ordering across repeated staging publications, then recheck concurrent
changes before publishing to the existing custom domains.

No application, Liv, authentication, dependency, CMS article or Instagram changes
were made for this portrait update.
