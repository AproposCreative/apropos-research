# Native image preflight v30 — 14 October 2026

## Final production verification — 16:02 Copenhagen

Source **`ebd062ba9edbea0f55e031ea100a55e8ad170d03`**, deployment
**`dpl_D8wTmy1zu8y17GnCdpwHQLWkonN7`**, is READY with the actual
`ai.aproposmagazine.com` production alias. Fresh authenticated MCP discovery
returns **2026-10-14-v30 / 63 tools**. The corrected production build passed.

The four read-only article preflights completed
`2026-10-14T14:02:22.868Z`–`14:02:28.223Z`:

| Placement | Current section | Result |
| --- | --- | --- |
| Selfie cover | `914f1bb5458ceebecd73f3b65c4327ba836ae964a0ba4b513cae45062f175910` | Old/incomplete brief, no actual references, native input unobservable: STOP |
| Wooden block | `7092cb0add05e7d8252cab6bca04f360d812026d15712553b6ba3d58aae59891` | No supplied current brief/actual references, native input unobservable: STOP |
| Cafe table | `7a0a83eaa312d32fab492c323dca29fbf2427ae78b454cd6d368bc62c7576ae4` | No supplied current brief/actual references, native input unobservable: STOP |
| Child/playhouse | `a0483739179740862e338d9df1f1e0cc104ffa4989fa09c819a6f665baf6ac0e` | No supplied current brief/actual references, native input unobservable: STOP |

All report `canGenerate=false`, `canImportGeneratedImage=false`, zero actual
reference files, zero failure/import attempts, no personal approval. None now
incorrectly reports a content mutation. The article is still v2 with the exact
content hash below, four untouched historical briefs and zero stored subject
reference records. Full protected-state and financial hashes match both their
before/after snapshots and the earlier initial verification recorded below.
The temporary read-only grant was revoked; existing connections remain unchanged.

**No generation or import was performed. The safety gate is verified live; native
image production and semantic quality are NOT verified or enabled.**
To discover the two new tools in an already connected Work client, use its
official tool refresh/reconnect if they are absent. Updating discovery does not
resolve the native-input integration blocker or authorize a test generation.

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

Isolated suite after raw-URL protection: **386 files / 5,386 tests passed**
(`RAGE_STORAGE_DIR=./tmp/vitest-rage`, 15:55 Copenhagen). New preflight suite then had
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
Exact final release and live readback evidence are recorded at the top.

## Initial v30 live verification and diagnostic correction

Source `b8e4b4f214398ce4f9a92530be88e6cf638effd6`, deployment
`dpl_CzNCDy9nXoPSHy79YCumMNbyWNqU`, reached READY with the actual production alias.
At `2026-10-14T13:58:58.283Z`–`13:59:03.272Z`, authenticated discovery returned
v30/63 tools, and all four existing-article preflights returned `canGenerate=false`
and `canImportGeneratedImage=false`. The connected Apropos plugin independently
returned the updated preflight and STOP workflow. No generated/image import was
attempted. The temporary read-only service grant was revoked.

Before/after full article, briefs, references, media, versions, updates, stages and
approvals hash: `6db07e7ade7d2eb3bfcb54351b71a55f1f863f7e4d241ef127e7d5bdb41fbee6`.
Before/after financial snapshot:
`e3b2d498e807ab1cba45f4ca156ce81e5eb15d5b71ea496457fc31da07b69101`.
No paid AI, CMS writes, personal consent, publication or original-image changes.

That real readback exposed an imprecise diagnostic: the old cover brief has no
protected-content baseline, so it incorrectly also reported
`mcp_submission_image_content_changed`. The article was demonstrably unchanged.
A follow-up correction classifies absent baseline as `generation_brief_invalid`;
only an existing unequal baseline means content changed. A regression test and
live verifier assertion cover this distinction. No evidence or old brief is rewritten.

Final corrected suite at 15:59 Copenhagen: **386 files / 5,387 tests passed**,
including **48 new preflight tests**. TypeScript and changed-file lint also passed.

The remote install reported 10 dependency audit findings (3 moderate, 7 high).
This change does not modify the lockfile/dependencies or claim those findings
resolved. Passing `security:config` checks build configuration, not a clean
dependency vulnerability audit.
