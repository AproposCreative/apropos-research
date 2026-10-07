# Existing-article media regression, 7 October 2026

## Exact scope

Submission `396904fb485abe48df3663e0b3d8c955a83ecc3670c323aa1c1c2838040785a2`,
DK item `6ac561f59604a82185235285`, slug
`boganmeldelse-i-mellemtiden-er-vi-ingen`. Never create a duplicate.

The approved JPEG is 1280×720, 124979 bytes, SHA-256
`2b27242d08ee7e25d698bb40a384a2a8d32df91f41bf8c96ea8bdfc6920dea71`.
It was already published through the user's explicitly requested direct Webflow
operation earlier today. This is **not** proof of the Apropos MCP import flow.
The same submission still had revision 5 and an older CMS binding; that binding
omitted the later author-background paragraph and official body figure.

## Minimal changes

- Keep the official native `openai/fileParams` contract: required `download_url`
  and `file_id`, optional declared `mime_type` and `file_name`. No regional host
  allowlist or fabricated URL. HTTPS/public pinned DNS, no redirects, bounded
  bytes, real raster decode and original SHA-256 remain required.
  Official reference checked 7 October:
  https://developers.openai.com/plugins/reference#file-apis
- Old scanned clients cannot supply the new `origin` field. Omission now means
  **unspecified**, not an invented ChatGPT generation. Explicit generated/edited
  illustrations still require the matching brief. Unknown provenance is never a
  claim that the prompt was followed. Binary MIME from the native adapter is
  accepted only after real JPEG/PNG/WebP decoding; declared contradictory MIME
  still fails. Originals are not cropped or regenerated.
- The existing backend uploader performs metadata allocation, multipart bytes
  and exact CDN readback. Normalize the signed `policy` field to `Policy` too.
  Ambiguous/ghost uploads retain original + allocated identity and a safe failure
  receipt. They are not ready and do not allocate again on a blind retry.
- Extend **existing** `link_published_submission` with `inspect` and `refresh`.
  Only the already-bound item may refresh. Inspect returns actual CMS hash,
  changed fields and merge conflicts; refresh requires that hash, expected
  revision and idempotent request ID. Preserve old versions, original prose,
  receipts and nonconflicting pending edits. Never write to CMS during refresh.
  A new version invalidates former UI approvals. Conflicting edits stop.
- Cover-only worker/staging passes original body HTML verbatim and sends no
  `content` field at all. Later body-media revisions use the same item; prose
  changes are rejected **before** patching. Other CMS fields remain untouched.
- Published identity requires decoded live bytes matching the chosen hash for
  hero **and mobile** (and selected body assets), not an asset ID or row status.
  Status exposes dated verified receipts only; no invented published hash. Fresh
  publication readback also rechecks selected media. A mismatch stays unconfirmed.
- Keep reader memory, deferred body decision, personally confirmed human review,
  required deterministic checks, exact-version publication approval, SEO
  preservation and item-only publication. No paid AI test, new provider, budget
  change, provider-hold reset, Instagram or site publication.

## Acceptance boundaries

Mock tests cover file formats, unknown/declared origin, binary MIME, S3 fields,
ghost/timeout retention, byte identity, same-item cover/body patch, exact body
preservation, CMS divergence, optimistic conflicts, replay and dated readback.
Fixtures are **not** real ChatGPT uploads/generated/edited files.

`scripts/verify-submission-media-production.ts` is a scoped temporary read/draft
OAuth service-client check. `--refresh-existing` explicitly reconciles this
already-bound item only. It does not import a fabricated file, approve checks,
publish, call a model or prove a native ChatGPT handoff. The grant is revoked.

Real native JPEG test, current deployment identity and remaining acceptance
items are recorded below after execution. Real PNG/WebP/generated/edited files
and separately selected body images have not been supplied for production tests;
do not generate or invent them to claim completion. The personal preview click
is not replaced by a model-authored confirmation.
