# Native image preflight v30 — 14 October 2026

## Outcome and scope

This is a **fail-closed safety release, not a repaired native image generator**.
No supported authenticated observer of the native generator's actual input is
available in the current integration. Consequently new ChatGPT-generated/edited
image imports are stopped, and preflight returns `canGenerate=false`, even for a
perfect-looking client report. Do not describe this as working image generation.

No generation, image import, editorial approval, article change or publication is
authorized by this technical verification. Existing attached images, original
files, receipts and approvals remain intact. Genuine user-uploaded/press photos
remain supported without an AI brief. Backend paid generation, the Writer's
manual-only spending policy and all provider/budget state are unchanged.

## Changes

- `lib/editorial/native-image-integration.ts`: server-owned unavailable capability;
  no model argument, environment flag or client hash can enable it.
- `lib/editorial/image-preflight.ts`: new read-only `preflight_submission_image`
  checks owner, article/revision/hash, exact role/section, canonical v3 brief,
  actual privately retained style/reference bytes, ordered subject identities,
  decoded format/dimensions/hash, bounded reference bundle and prior failures.
  A second article read detects an observed race. This is not a bearer permit.
- `lib/editorial/chat-image-brief.ts`, `image-generation-evidence.ts`,
  `lib/image-gen/prompt.ts`: one canonical prompt, distinct style/subject/parent
  roles, separate single-scene illustrations and explicit preflight/STOP
  instructions. Forbid montage, panels, mockups, typography, text/logos,
  photorealism, photo fragments and 3D. Unknown semantic checks are not passes.
- `lib/editorial/chat-image-import.ts`: native integration stop before CMS or
  new attachment; historical attached/idempotent replays remain available.
  A repeated or new request ID does not bypass a failed placement. Known rejected
  bytes cannot be relabeled as a photo within the same submission.
- `lib/editorial/image-failure.ts`: private immutable quarantine, stable failure
  receipt, once-only download, byte/hash readback and acknowledgement recovery.
  Expired source/failed retention reports `originalPreserved=false`, not success.
  `preview_submission_image_failure` exposes an owned, decoded rejected original,
  clearly **not** an article image/approval. Originals above the bounded MCP
  image-response size stay preserved but are not silently resized for that tool.
- `lib/editorial/image-content-invariant.ts`, `submissions.ts`: protect prose and
  all non-image metadata through the final attachment transaction; preserve
  research/choices and approved-image locks. Ordinary creation/update cannot add
  raw image URLs in illustration mode to bypass import; unchanged historical URLs
  and text-only corrections still work. Real photo import uses the trusted path.
- `lib/mcp/server.ts`, `config.ts`: v30 / 63 tools, two new read-only tools,
  actionable failure receipts and updated initialization/workflow instructions.
  No client-supplied `verified` override. Personal selection/publication UI stays.

## Evidence limits and missing integration

Native generation happens outside the MCP server. MCP cannot prevent arbitrary
off-workflow native calls or prove hidden generator inputs. It **can** refuse to
attach their outputs through its generated-image path, as this release does.
Client-reported prompt hashes, visual booleans and reference lists are not an
independent trace. Semantic assertions are agent reports, not an OCR/vision
classifier. The tests do not claim to detect collage or logos from pixels.

The missing capability is a supported, authenticated native-host bridge that:

1. Observes/binds the exact canonical prompt and ordered **actual** style and
   subject images before dispatch, against fresh article/brief identity.
2. Binds that invocation to its actual output original/hash and durable receipt.
3. Enforces explicit personal retry decisions after a rejected attempt and
   required personal visual review/selection, without changing article content.

That bridge is not implemented or claimed available. No speculative endpoint,
browser/session workaround, paid API fallback or flag is supplied. Merely changing
`available` must never become an enabling strategy; a future supported adapter
needs its own end-to-end tests. Current stops have no automatic retry path.

Official documentation checked on 14 October:
[native image references](https://learn.chatgpt.com/docs/image-generation) describe
reference-image use; [plugin widgets](https://developers.openai.com/plugins/reference)
expose the plugin's own tool input and MCP `callTool`, not an independent trace of
native generator input. This describes the present verified integration gap,
not a claim that every future host will be incapable of such integration.

An unseen image deliberately misdeclared as a genuine photo cannot be reliably
classified by deterministic byte checks alone. Photo compatibility does not turn
unknown provenance into proof. Do not relabel generated files or change media
choices to bypass these rules. No universal pixel-level quality guarantee is made.

## Tests

Final isolated suite after raw-URL protection: **386 files / 5,386 tests passed**
(`RAGE_STORAGE_DIR=./tmp/vitest-rage`, 15:55 Copenhagen). New preflight suite has
**47 tests**. TypeScript, changed-application-file lint, safe-build configuration
and diff checks passed. No AI calls or paid image fixtures were used.

Coverage includes missing/wrong brief/article/revision/section, style bytes versus
hash-only references, required subject originals, client-observable prompt
changes, declared forbidden types/text/logos/photo/panels, incomplete semantic
review, fake native-input attestation, original quarantine, duplicate/concurrent
requests, lost storage acknowledgement, expired files, raw-URL/relabel bypass,
content/metadata races, retained locks/approvals, and real photo-path exemption.

`test/mcp-chat-image-import.spec.ts` deliberately mocks only the unavailable host
gate for generated **transport mechanics** fixtures. Its successful generated
attachment tests do not establish a working host bridge. The new preflight suite
tests the real production stop without that mock. Existing approval/publication
regression tests remain part of the full suite; the agent supplies no consent.

## Barselsartikel: read-only baseline

Submission `546794452af45693e3495ae29d4fe5d8912c33844aaa62db10b2ad8a94e36171`
is draft/awaiting preparation, revision **2**, content hash
`a26827edd659ebe4b6c85c99115fa0a567346b6374b89d4bf4da49069cc1f846`.
Its current v2 prose is the reference; do not restore initial v1 text.

Native status/media reads and service readback at `2026-10-14T13:37:08.328Z`
found four historical briefs, zero retained subject reference records, no attached
assets and no publication consent. Only one old cover brief matches v2:
`86095babd9c3b915822fd26a51aef389f5fec89115af4d2cba5f5a22d93421b9`.
It has no actual retained reference bundle; body briefs are v1. An old brief ID is
not current v3 handoff evidence. Photos possibly visible in another Work chat are
not silently fabricated as MCP file IDs or retained originals.

Four separate requested placements remain: selfie cover, wooden block, cafe
table, child/playhouse. The technical test checks current section identities but
does not save a new image plan or invent personal choices. All four must stop:
missing current complete briefs/original subject references, plus the unverified
native integration. **The article is not ready for safe generation.**

`scripts/verify-image-preflight.ts` performs fresh authenticated v30 discovery and
four read-only preflights. It creates/revokes a temporary read-only service OAuth
grant (not editorial consent), compares article/brief/assets/history/approval and
financial snapshots, and never calls get_image_brief, image import or generation.
Exact release and live readback evidence will be recorded after deployment.
