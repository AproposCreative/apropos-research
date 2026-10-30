# SoMe: independent title and subtitle sizes

Owner request: add blue “Større” and “Mindre” text buttons next to the existing
copy controls, for both the headline and subtitle.

## Behavior

- Each field has independent 10 percentage point steps between 70% and 150% of
  its automatic fitted size. Default 100% preserves the previous card layout.
- Manual enlargement resizes the actual fitted text and wraps it onto additional
  lines. It does not silently undo the requested increase to retain two lines.
- Percentages belong to the selected article/source and follow it between square
  and story formats. Other articles begin at their own stored/default choices.
  These choices remain in the editor session; cross-device draft saving is not
  implemented by this change.
- “Original” restores that field's original text and its automatic size. Resizing
  itself never rewrites text or issues a provider/API request.
- Preview, PNG download and JPEG publication images use the same renderer and
  size fields. The image and CTA move below the resized text.
- Oversized text that would leave less than 20% of the card for its image is
  blocked with a short message. Export/publication are disabled until the layout
  is corrected. Text is preserved, without truncation.
- Action groups wrap on narrow screens, retaining blue text buttons and usable
  touch targets. No new slider or technical settings panel.

Only the SoMe editor, shared card renderer and focused tests change. No Writer
editing source, CMS article, provider policy, budget or social account is changed.
No real social posts are sent for verification.

## Verification

- Eight fitting tests, including default-layout compatibility and actual growth
  of an already automatically fitted title without losing its text.
- The actual React editor is tested embedded and standalone at 320/390/430/768/
  1440 px, including real canvas drawing, twenty PNG downloads, independent sizes,
  format switching, unchanged copy and zero AI calls caused by resizing.
- PNG download bytes match the current preview. Focused cases also cover size
  limits, original-size reset, article isolation/recovery, both JPEG formats and
  recoverable overflow rejection. All auth/CMS/provider services are fixtures;
  external requests are blocked and no real publication is attempted.
- Screenshots and receipts: `output/social-text-size-20261030/`.

Production deployment/readback is recorded below after verification.
