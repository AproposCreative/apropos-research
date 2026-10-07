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

## Native retry finding, 09:20 Copenhagen

v13 `531a79a54f88cfed3f920f4a005d8bfc3375ae2a`, deployment
`dpl_NNkG9z8x5zsEV9bDC73HAym3qsnB`, READY/production alias, build 71.539 s.
356 test files / 4,981 tests passed. Authenticated tools/list confirmed v13.
Same native JPEG/request/revision replay returned `mcp_submission_idempotency_conflict`:
the host adapter supplied a different file ID for the same attached local file.
No allocation, CMS write or paid work resulted.

v14 keeps the original operation/file identity and accepts a rotated native
reference only after unchanged request metadata AND exact downloaded original
SHA-256. Record the new file ID/hash check in a receipt subcollection, never its
signed URL. Changed instructions fail before download; changed bytes fail before
any storage/asset/attachment mutation. No new request ID or receipt reset.
Tests cover attached replay and interrupted-import continuation with rotated IDs,
rejection of different bytes/metadata, and signed-URL non-persistence.

## Verified release and real JPEG result, 09:26–09:28 Copenhagen

- Production SHA `9fce9836079d95df16c9f82885f8662d7451e0fd`, deployment
  `dpl_4md6ncyPcpAZGcY7gUvirm1o4HN5`: READY, `ai.aproposmagazine.com` alias,
  build 73.435 s. Authenticated MCP reports `2026-10-07-v14`, 48 tools and the
  native file-object metadata/schema. 356 files / 4,984 isolated tests pass;
  TypeScript and focused ESLint pass. Production build passes. The preceding
  release also passed the isolated local Next build.
- The **same real native JPEG import**, same request ID and expected revision 6,
  resumed successfully through the connected Apropos MCP. Receipt `cf0d8d…994c1`
  is now attached, submission revision **7**. It retained the original bytes,
  crop, dimensions and original file identity. A new native file reference was
  accepted only after byte equality, with an audit receipt. Returned image pixels
  were actually displayed in this conversation, not only a URL.
- Existing bound CMS asset `6ac5e51e67662d3bd06a7f1e` was independently verified
  and reused, with prior failed allocation preserved in a recovery receipt.
  This is **not** a successful new Webflow allocation/upload or a new publication.
  A second real native replay returned `replay:true`, same asset and revision 7.
- Fresh connected MCP `get_article` before/after has EXACTLY identical fields and
  CMS hash `26f6c55b7ecb6a2c97e9ab05e5e38ae5cbf67c2ec8c2a417fc432a80fd92d9a9`.
  The same item remains bound. No create, CMS patch, publication, site publish,
  paid AI call or duplicate article was performed in this regression.
- Fresh live-CMS/media verification at `2026-10-07T07:27:32.911Z` checked both
  thumb and mobile-image; their shared URL decoded as JPEG, 124979 bytes,
  1280×720, exact approved SHA-256 `2b27242d…920dea71`, no fallback. Public HTTP
  200/canonical/hero hash, author-background paragraph and existing official body
  figure were also verified. This observation does not forge an Apropos
  publication approval/receipt for the earlier direct Webflow publication.
- Real `preview_submission` revision 7 returns full article/hero/body figure,
  no required missing fields, `bodyImages:deferred`, recommended `body-2`,
  `aiFinalChecks:human`, 0 DKK quote and `canAccept:true` even while the saved
  provider hold is true. The personally confirmed human-review choice has not
  been clicked; no prepared/published Apropos revision is claimed.
- Deployment-scoped `/mcp` error/fatal scan
  `2026-10-07T07:22:11.642Z`–`07:27:11.642Z` found no matching logs. This is a
  bounded observation, not a platform-wide or long-term guarantee.

## Remaining exact dependencies and resume

1. **New Webflow assets:** production `WEBFLOW_API_TOKEN` must have
   `assets:read` and `assets:write` for this site. Owner was asked once. Full access
   on a separately connected Webflow tool is not evidence of those Vercel service
   scopes. After an actual update, introspect securely again; use one retained
   permission-blocked receipt where applicable, not a raw reset/new identity.
2. **Personal final review/approval:** open the version-7 preview below and confirm
   the human check there. Deterministic preparation then enables a separate
   exact-version publication approval. Do not fabricate either click. Read status
   after each action/timeout. If CMS changes externally, inspect/refresh again;
   never blindly overwrite it. This unchanged live article is not republished just
   to claim test activity.
3. **Outstanding real-file matrix:** actual PNG/WebP/generated/edited native files
   and separately approved new body media have not been supplied/tested in this
   production session. Their unit tests are not real-client E2E evidence. After
   server asset access and selected files are available, import onto this SAME
   submission, approve the precise update and verify preserved text/SEO/rating,
   item identity and public byte identities. Never create a regression duplicate.

Personal preview:
https://ai.aproposmagazine.com/connect/chatgpt?submission=396904fb485abe48df3663e0b3d8c955a83ecc3670c323aa1c1c2838040785a2

Live article:
https://www.aproposmagazine.com/articles/boganmeldelse-i-mellemtiden-er-vi-ingen

## CMS-credit follow-up after personal approval, 10:00–10:06 Copenhagen

The owner personally accepted revision 7's zero-cost human-review preparation at
`2026-10-07T07:59:58.217Z`. Server stages retained both actual image hashes and
explicit `not_run/explicit_human_review` AI-check receipts. The CMS stage stopped
with `mcp_submission_cms_checks_failed`; its saved media-only intent identifies
the SAME item, with patch keys `thumb`, `mobile-image`, `foto-credit` only.
Fresh readback `2026-10-07T08:01:38.150Z` passed 25/26 checks. Only
`image:body-assets` failed. The actual, preserved official body credit is
`Bogcover: Lindhardt og Ringhof / BOGDK`, which the checker failed to recognize.
No missing user approval, missing second image, changed text or quota caused this
failure. CMS fields/hash are still exactly the baseline above.

v15 recognizes a nonempty `Bogcover:` attribution alongside the existing credit
labels; it does not assert rights, remove byte checks, alter captions or change
the Liv image-count policy. A regression reproduced the rejection before the
fix; named publisher credit now passes, but empty/missing credit still fails.
CMS readback proofs (including failed check IDs) are retained before generic
errors, accessible in saved stage status. Successful reconciliation preserves the
prior blocker on the stage and clears the current blocker only after fresh
passing readback. Personal approval/version and publication safeguards remain.

Local patched GET-only probe at `2026-10-07T08:06:01.274Z` passed **26/26** against
the real saved intent/current CMS. This was not a production deployment or state
mutation. 356 files / 4,991 isolated tests, TypeScript, focused ESLint and build
configuration security checks pass. Deploy and real MCP reconciliation follow;
do not claim the submitted revision is prepared until server readback confirms.

### Production recovery verified, 10:09 Copenhagen

- SHA `d259d66cc3c19c33eb51d16e4f1d7ed7e2569601`, deployment
  `dpl_2Fnmouhk5RMqzeqcJxaXfuaC5UZS`, READY with production alias
  `ai.aproposmagazine.com`; Next build passed, build duration 69.524 s.
- A real connected `reconcile_submission` call read the retained intent/current
  CMS and advanced the SAME revision **7** from blocked to **prepared**.
  Original personal preparation approval at `07:59:58.217Z` is unchanged.
  No new preparation, asset allocation, CMS patch/create, publication or paid
  AI call was started. CMS stage now retains the passed proof and prior blocker;
  current blocker/blockedStep are null.
- Production proof `2026-10-07T08:09:03.660Z`: **26/26 checks pass**.
  Fresh native `preview_submission` at `08:09:22.448Z` independently returned
  `publication.ready:true`, no blocker/dependency error/missing required fields.
  Prepared hash `8de7fd017f45e23ab36698b80e6c17b09a6b9b25f0fe54bfd4c352290b66669a`.
  Deferred `body-2` is still a recommendation, not a blocker.
- Fresh connected `get_article` confirms **all CMS fields exactly unchanged**,
  baseline CMS hash above and lastPublished still `2026-10-07T06:22:40.600Z`.
  This is not a new publication. Per-submission tracked API-cost actions are [];
  no claim about unobserved subscription usage/provider invoices.
- Deployment-scoped `/mcp` error/fatal scan `08:04:25.051Z`–`08:09:25.051Z`
  found no matching logs; bounded observation only. No new log drain/monitoring
  configuration was introduced.
- Resume: owner refreshes the SAME preview and performs the final exact-version
  publication click. No need to repeat preparation acceptance. Do not fabricate
  this second click or clear unrelated provider holds. New Webflow asset scopes
  and the remaining real-file matrix are separate outstanding work, not blockers
  for this existing-asset prepared revision.
