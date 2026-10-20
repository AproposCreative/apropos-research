# Apropos press-kit source

`build_press_kit.py` creates the Danish and English three-page A4 press kits from
reviewed local content and original brand material. It performs no network
requests, uploads, CMS writes or application changes.

## Source inputs

These are source material, not disposable build files:

- `assets/reference-texture.png`: the blue texture extracted from the press-access
  PDF supplied by the owner in the conversation.
- `assets/fonts/`: the unchanged Poppins Regular, Poppins SemiBold and Amiri
  Regular font files, with the official SIL Open Font License for each family.
- `assets/logos/`: byte-identical copies of the original black and white PNG
  logos used in the PDF layout.
- `assets/provenance.json`: upstream URLs, fixed Google Fonts revision and SHA-256
  digests for all of the above.
- `../../output/press-kit/portraits/frederik-kragh.jpg` and `portrait.json`:
  the original owner-supplied portrait and confirmed credit metadata. These
  distribution files are also preserved source inputs for the contact page.
- `../../docs/seo/press-kit-copy-2026-10-20.json`: reviewed Danish/English copy,
  including the 50-word and 150-word descriptions.
- `../../docs/seo/press-kit-evidence-2026-10-20.json`: the five verified article
  examples. The generator uses only `articleExamples`, not the internal audience
  diagnostics or unverified traffic figures.

The generator verifies the source-asset hashes and the original portrait's
metadata hash before it loads the fonts or images. It has no input dependency on
`tmp/`, Dropbox, a user attachment path,
or a live website.

## Provenance and licensing

### Reference texture

The owner supplied `1-Ansøgning-om-presseadgang-AproposMagazine.pdf` as a design
reference for this task. The blue texture was extracted from that document and
used with the owner's approval for the press-kit design.

- Source PDF SHA-256:
  `f666f2310e37c8e88338f5af281b2e05f24b9e31d1bada0b1381e3c0de28ee74`
- Extracted texture SHA-256:
  `31c6b1e422f404f55bcbf7413be431dcaad68dbf8a4bf4b4e77977fa022b094a`

The PDF's accreditation request, proposed attendance, publication timing and
Instagram-sharing promises were not copied into this general press kit.
The reference is owner-provided brand material, not an open-source asset.

### Original logos

The owner supplied a Dropbox shared folder:

`/aproposmagazine.com/00. brandmateriale/apropos magazine logo`

Its original `AM_logo_black` and `AM_logo_white` files were retrieved in PNG,
SVG and PDF formats. The six unchanged distribution files remain under
`output/press-kit/brand/`; only the two PNG files are required as generator inputs.
The source copies in `assets/logos/` have the same bytes as those originals:

| Source input | SHA-256 |
| --- | --- |
| `AM_logo_black.png` | `03b6bc890ade083d209147e3fb44b70232e713061bf3cbbb1197a9332f683af8` |
| `AM_logo_white.png` | `67ec3ab1ee9f65004d9a1b55b64731d2bf0300e6877417c6794a9b7a9829cac7` |

The original shared link and its access parameters are deliberately not stored
here. Public CDN locations, file sizes and hashes are recorded separately in
`docs/seo/press-kit-assets-2026-10-20.json`. Apropos retains its brand rights;
the fonts' open license does not apply to the logos or texture.

### Contact portrait

The owner supplied the original portrait of Frederik Emil Kragh and confirmed
the photographer credit as **Christine Olsgaard, Azide**.

- Original JPEG: `output/press-kit/portraits/frederik-kragh.jpg`
- Size: 984 × 1280 pixels; 190,909 bytes.
- SHA-256:
  `fcbeac413578bd657b68bb91860016d3b3e30e8928bde479965488477a8c3bef`
- Metadata: `output/press-kit/portraits/portrait.json`.

The contact page scales the complete photograph proportionally. It does not
crop, retouch or alter the face. The Danish PDF displays
`Foto: Christine Olsgaard, Azide`; the English PDF displays
`Photo: Christine Olsgaard, Azide`.

For a confirmed credit correction, update `photographer` and both localized
strings in `credit` in the metadata file, then regenerate and inspect both
contact pages. The photographer is not inferred from `providedBy`; supplying
a photograph is distinct from taking it.

### Fonts

The existing reviewed font bytes were compared to the official
[Google Fonts repository](https://github.com/google/fonts) and matched exactly.
Sources are pinned to commit
`47d54ca1ebb14fd864695f1d39dc734f39017c33`.

| Font | SHA-256 |
| --- | --- |
| Poppins Regular | `7e65201e9b79159e2300267cc885e16c8dcef2424cdfa09a29bfb0980a94a7ba` |
| Poppins SemiBold | `d3bf1bdaf0550e83da9ac0b1d1d9fe6db086835a83aa28578e609a394b9a0286` |
| Amiri Regular | `ab391c4147d054c48976e98322ad0eefe1427aa0e0502a12a4c75d80a70cfcd7` |

- [Poppins upstream files](https://github.com/google/fonts/tree/47d54ca1ebb14fd864695f1d39dc734f39017c33/ofl/poppins)
- [Poppins OFL](https://raw.githubusercontent.com/google/fonts/47d54ca1ebb14fd864695f1d39dc734f39017c33/ofl/poppins/OFL.txt),
  retained as `assets/fonts/POPPINS-OFL.txt`.
- [Amiri upstream files](https://github.com/google/fonts/tree/47d54ca1ebb14fd864695f1d39dc734f39017c33/ofl/amiri)
- [Amiri OFL](https://raw.githubusercontent.com/google/fonts/47d54ca1ebb14fd864695f1d39dc734f39017c33/ofl/amiri/OFL.txt),
  retained as `assets/fonts/AMIRI-OFL.txt`.

Both families are distributed under SIL Open Font License 1.1. Keep their
copyright and license files with redistributed font source files. No fonts were
modified.

## Verification and generation

Use the configured Python workspace runtime, which already supplies ReportLab,
Pillow and pypdf. No package installation is needed.

Run from the repository root:

```sh
python3 scripts/press-kit/build_press_kit.py --verify-inputs
```

This checks all source assets, verifies the portrait hash and dimensions, and
loads the font/image inputs without writing or
rebuilding the PDFs.

To deliberately regenerate both PDFs:

```sh
python3 scripts/press-kit/build_press_kit.py
```

This overwrites the two final output files and checks three A4 pages per locale,
text bounds, article links and editor attribution. It recreates its working
directory when necessary. PDF metadata and document IDs can change on a later
build; identical input assets alone do not imply byte-identical PDF output.
After any content or layout change, render and visually inspect all six pages
before distributing a new version.

## Outputs and disposable working files

- Final PDFs:
  `output/pdf/apropos-pressekit-da.pdf` and
  `output/pdf/apropos-press-kit-en.pdf`.
- Original downloadable logos: `output/press-kit/brand/`.
- Distribution ZIP: `python3 scripts/press-kit/build_bundle.py` packages the reviewed PDFs, original logos and portrait with credit. This does not rebuild the PDFs.
- Publication receipt: managed by the coordinating task.
- Disposable renderings and diagnostics:
  `tmp/pdfs/press-kit/rendered/`,
  `tmp/pdfs/press-kit/layout-verification.json` and
  `tmp/pdfs/press-kit/pdf-verification.json`.

The source-input relocation preserved the original reviewed PDF bytes. The
later owner-approved portrait update changes only the contact area on page 3.
All six pages were rendered after that update; pages 1 and 2 in each language
were pixel-identical to the previous version. Both updated contact pages were
visually checked, including the complete photograph and the confirmed credit.

Latest reviewed PDF hashes, including the portrait:

| Final PDF | SHA-256 |
| --- | --- |
| `apropos-pressekit-da.pdf` | `b34b499aa0a84674486540ab9bc4e9b678770ae0b5ea90317d0b1435b5f0f3fb` |
| `apropos-press-kit-en.pdf` | `344f1d5e975b744d1d5c3518da60fa7ef539e15b1da480933e62f61d5eaef2d0` |
