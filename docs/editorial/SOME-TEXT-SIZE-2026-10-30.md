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

## Production readback

Verified 2026-10-30 12:59:16.902 UTC (13:59 Copenhagen):

- Release `f4378a8a152e4a68c8f46390438ae255ba478156`.
- Production deployment `dpl_8ej2WHt36F18tDfwBAtC4zr6TYes` is READY and direct
  `ai.aproposmagazine.com` deployment lookup matches that exact Git SHA.
- Public `/design-editor` returns HTTP 200 and serves both button labels, the
  title/subtitle size fields and the new action-group stylesheet.
- Served JS `/_next/static/immutable/chunks/3wd3h5o4mpelc.js` SHA-256:
  `d3092a88f02d9e7bc0d95ce906b2a09c6ec89099eb514f19942cf918f1b8721a`.
- Served CSS `/_next/static/immutable/chunks/3z_0eibp3ja-0.css` SHA-256:
  `23a321a222ab71374e76e05a2513552b0643eef9910dae3b1a45782ef2b1bb0c`.
- Eight unit tests and all ten viewport/embed combinations passed, plus the
  focused limit/reset/article/JPEG/overflow checks and confirmation-cancel case.
  Twenty real PNG downloads were verified; the square files match preview bytes.
- Application TypeScript, changed-source ESLint and diff checks pass. Nine
  protected Writer/global files remain byte-identical in the exact release.

Receipt: `output/social-text-size-20261030/production-receipt.json`.
Production verification only reads HTML/static assets/deployment metadata. No
provider requests, social publications or service data changes were made.
