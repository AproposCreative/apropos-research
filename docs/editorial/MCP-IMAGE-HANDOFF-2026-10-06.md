# ChatGPT image handoff repair

## Scope and evidence

Owner requested the actual fix and deployment, not another diagnosis. Preserve
Fire & Ice submission `c3069f83503fbf3d443743682358ea85afc13724726fa4f6a7db6b625eb4cb8a`
and the existing generated cover. No new generation, paid AI test, publication,
provider-hold reset or changed security approval.

Two prior imports reached our handler and failed at the file-host check. The old
audit did not retain the rejected hostname, so the exact historical URL cannot
be reconstructed. The four-property server file schema and `openai/fileParams`
metadata were already correct. The model-facing string representation is not
itself proof of a broken schema; ChatGPT resolves native file references before
sending the server an object.

The original conversation was located via ChatGPT search: “Optimer artikel om
SAVEUS”, conversation `6a836b7d-4064-83eb-bc14-849085ca36fb`. Its later response to
the owner's “Check igen nu” reports a ChatGPT security rejection *before* import
reached the server. That is a distinct host-side barrier, not fixed or bypassed
by this release. No message or new generation was sent to that conversation.

## Changes

- Accept ChatGPT-resolved images from OpenAI's documented `*.oaiusercontent.com`
  content-domain family, instead of only `files.oaiusercontent.com` and its
  subdomains. Keep the existing exact `fileopenai.blob.core.windows.net` host;
  do not allow arbitrary Azure accounts, arbitrary HTTPS or local file reads.
- Preserve HTTPS/no-credentials, public DNS pinning, no redirects, raster MIME,
  stream-byte/time bounds and decoded-image checks. Public research transport is
  unchanged. Native file objects still require `download_url` and `file_id` and
  declare optional `mime_type` and `file_name`.
- Return safe file-specific recovery with a stable error and rejected hostname
  only. Never log or echo a signed URL, path, query, file contents or raw exception.
  Existing-file reuse is explicit; no automatic retry or regeneration.
- Return actual saved-image pixels as MCP image content after import. If thumbnail
  fetching fails, the successful durable receipt remains a success and points to
  preview/status; do not create another CMS asset.
- Brief/tool instructions request visible image output followed by the full
  article preview. They do not claim control over ChatGPT's native renderer.
- MCP version `2026-10-06-v8`; existing briefs, revisions and import receipts remain
  valid. The source prompt/style and existing artwork were not regenerated.

Sources checked 6 October 2026:
[OpenAI file input contract](https://developers.openai.com/plugins/reference),
[OpenAI content-domain guidance](https://help.openai.com/en/articles/9247338-network-recommendations-for-chatgpt-errors-on-web-and-apps).
The domain guidance supports the compatibility change; it does not establish
which hostname was used by the two historical failing imports.

## Verification

- Focused suite: 18 files / 263 isolated tests passed; includes local/sandbox
  references, misleading domains, mixed/private DNS, redirects, signed-URL privacy,
  actual WebP thumbnail decoding and successful-import/failed-preview behavior.
- TypeScript, focused ESLint and build configuration security gate passed.
- Full isolated suite: 352 files / 4,900 tests passed.
- Transport/provider fixtures are simulated; do not present these as a successful
  real ChatGPT file import. Full-suite and deployment/readback results follow below.

## Production release and readback

- SHA `c347197ea5a86150b53c52ff33ba79de15307904`, deployment
  `dpl_CMPwRD2A28Swa6g838HTTA54XoxE`, READY with `ai.aproposmagazine.com`.
  Vercel's Next.js production build completed in approximately one minute.
- Authenticated OAuth/PKCE readback on the actual production hostname at
  `2026-10-06T17:40:45.812Z` returned MCP `2026-10-06-v8`, 42 tools and the complete
  native file-input contract. Anonymous access still returns 401.
- Deliberately non-importable, unsupported-host fixture through the production
  import tool returned the new safe recovery and hostname, without echoing its
  synthetic signed query. No DNS fetch, file, original storage record or CMS asset
  was created. This was a negative transport test, not the real cover handoff.
- Readback confirmed the same Fire & Ice revision 3, unchanged article/content
  hash, 0 chat assets and an available article preview with no image previews.
  No paid calls, hold changes, article writes or public publishing were started.
- Temporary verification grants were revoked; existing team connections and the
  accepted welcome-email receipt were unchanged.
- Exact-deployment error/fatal scan `17:35:28.874Z–17:40:28.874Z` found no matches.
  This short window is not proof of long-term reliability. No monitoring settings
  or drains were changed.
- Browser export of the already visible generated image was attempted but timed
  out; no recovered local file is confirmed and it was not used for an import.
  The later ChatGPT security rejection is not bypassed by service credentials.

## Remaining acceptance

The existing cover must be handed over by ChatGPT through its authorized native
file input, attached to the original submission and then shown in the preview.
Do not make a new illustration, invent a download URL, obtain a browser session,
or use another route to bypass a host-side security rejection. If ChatGPT still
rejects the handoff before dispatch, report that boundary explicitly and require
the host's normal file authorization/re-attachment of the same file.
