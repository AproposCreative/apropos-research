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

## Production evidence, 09:07–09:14 Copenhagen

- Release `ea71fb996f5574c5cba6a49df7c9bfcc51f0f1e5`, deployment
  `dpl_72dZdKdBwE89T4R7LuUApNLYYngK`, READY with production alias; build 90.551 s.
  356 test files / 4,977 isolated tests, TypeScript, focused ESLint and Next build
  passed. Authenticated MCP: v12, 48 tools, correct native file schema.
- Real MCP inspect/refresh advanced existing submission 5→6, bringing back the
  newer author paragraph, official body figure and current book/hero metadata.
  No CMS write. CMS hash remained
  `26f6c55b7ecb6a2c97e9ab05e5e38ae5cbf67c2ec8c2a417fc432a80fd92d9a9`.
  No merge conflicts. Ledger, provider holds and welcome state unchanged.
- A **real native tool call** used the attached JPEG, not a fabricated URL.
  File adapter delivered `file_00000000a0a881f4aa2ffc3a0a3d69c2` and the original
  1280×720 bytes/hash above reached private storage. Receipt
  `cf0d8d74b4eb1729c984c046e96da8cb84bd214f23bdacd2eb5dc305983994c1`,
  request `approved-native-jpeg-2b27242d-20261007`.
- Import stopped at Webflow asset allocation, no asset ID returned. Read-only
  introspection of the **production** service key returned HTTP 200 and no
  `assets:read` or `assets:write`. Listing this site's assets returned HTTP 403
  `missing_scopes`. The known local service key has the same missing rights.
  ChatGPT's independent Webflow connector grant does not change Vercel's key.
  The owner was asked once to update server asset access; no secret was requested
  in chat, token replaced, scope bypassed or new allocation retried.
- An older retained receipt `8f53ab658d3bf6c8429c2fd6d64e108d36147f07fbddacc1b7f44d4273f86dd6`
  holds a DIFFERENT 1536×864 JPEG, SHA `ae5326f52e00f8ffbd41b1813975dd2a1c23d1c2f77b0c17ffb5109b89e5f63a`.
  It remains preserved/unconfirmed; it was not reset or relabeled as the attached
  1280×720 file. No ghost asset was deleted on metadata alone.

Follow-up v13: explicit permission-rejection error/receipt and read-only scope
evidence before retrying such an allocation. Existing unconfirmed imports can
reuse an already-bound cover ONLY after fresh CMS hash and exact byte equality;
record the recovery and former failure without allocating, substituting or
publishing. This does not grant missing server asset scopes or prove the full new
upload path works. Complete publication still requires the real personal preview.
