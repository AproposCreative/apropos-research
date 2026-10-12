# Verified press-image handoff (Kontrapunkt)

## Scope and diagnosis

Owner-authorized repair of submission `cb5da79d939579d3b8b89777f497148c707bbdaac855c564be64eb1487a9f7cd`, starting at revision 3/hash `ad27d217cc5a3ccf51423184d4b2ed3886b100fc73bb6d901665c2a58ae6b359`.

Fresh official HTML from <https://designmuseum.dk/presserum-laboratorium-kontrapunkt/> contains WordPress `.wp-caption`/`.image-block` galleries with `data-srcset`, inline SVG placeholders and ZIP download links. The old extractor only covered captioned `figure` galleries. It also interpreted the Organization schema's `image.@id=https://designmuseum.dk/#/schema/logo/image/` as an image URL and stripped the fragment, yielding the homepage. No image-byte validation followed. The old cached result is preserved, not treated as a fresh source read.

This is an extraction/validation defect, not evidence of a Webflow permission or photographer licensing failure.

## Implementation

- `press-candidates.ts`: actual anchor/responsive/lazy image URLs, locally bound credits/captions, observed use-terms excerpts (not licence certification), complete raster decode, format/size/pixel/page limits and SHA-256.
- `public-media-reader.ts`: separate bounded press transport with two revalidated redirects, one deadline, DNS/IP pinning on every hop; no credentials/cookies, private networks, encoded bodies or unrestricted downloads. Existing native file transport still disallows redirects.
- `press.ts` / `submission-media.ts`: four page/24 unique raster-read limits, per-source/per-candidate diagnostics, explicit no-usable-images outcome, versioned cache and retained refresh history. Reused means historical, not fresh. ZIP/PDF downloads are explicitly unsupported; actual raster variants in the page are used, never manufactured by stripping suffixes.
- `preview_submission_press_image` returns a display-only thumbnail of hash-verified bytes. `import_submission_press_image` accepts saved search/candidate identity, not a fabricated ChatGPT file reference. It reuses `chat-image-import.ts` storage, upload receipts, exact-byte readback, original preservation, provided-asset locks and revision-controlled article attachment.
- Press originals get stable per-byte claims, provenance, observed credit, unknown rights, download URL, MIME, dimensions, byte count and SHA. Agent-reported visual suitability is explicitly not personal approval. No cropping, generation or licence invention.
- `textReadyForPreparation` is separate from media-complete `readyForPreparation` in ChatGPT/human-check flows. Missing press images route to finding/importing images; complete human-check drafts route to personal editorial confirmation, not price acceptance. Legacy worker retains its distinct input/image blockers and paid-work protections.
- MCP v22 adds two tools (59 total). Canonical submit/Liv instructions document the handoff.

## Verification before production

Local real-source inspection found decoded images with observed credits, and rejected the schema homepage as HTML. The museum negotiates WebP even for `.jpg` URLs; recorded MIME and hashes describe the actual delivered bytes, not the URL suffix. These files are not claimed to be the photographer's ZIP master originals.

Simulated tests cover spoofed HTML, empty/truncated/MIME-mismatched files, WordPress lazy galleries, unrelated credits, unknown rights, private-network redirects, redirect loops, ownership, stale revisions, source-byte changes, non-text-free covers, exact body anchors, durable import/replay and timeout recovery without another CMS allocation. A newer explicit revision can resume an unchanged press import intent while preserving concurrent text edits.

No personal approvals, publication or paid AI are part of this repair. Passing tests alone do not establish production operation.

## Released and verified 12 October 2026, 12:06 Copenhagen

- Code SHA `10a1bf074ced918fc1c85b6769f86a60b10e19c9`, production deployment `dpl_3zVLEG6VUi8ijHvReqhfebMtqeSm`, READY with actual `ai.aproposmagazine.com` alias. Remote build succeeded. Authenticated runtime discovery returned `2026-10-12-v22` and 59 tools.
- Fresh local verification: **372 test files / 5,156 tests passed**, isolated in `RAGE_STORAGE_DIR=./tmp/vitest-rage`; type-check, targeted ESLint, security configuration and diff whitespace checks passed. No new dependencies.
- Real authenticated `find_submission_images` read the original three sources, returned 23 decoded candidates, and explicitly rejected `https://designmuseum.dk/` with HTTP 200 / `text/html` / `media_response_rejected`. The 24-image budget was visible in diagnostics; a separate bounded search of the official Kontrapunkt About page found the cover. Both searches were fresh (`reused:false`), not the old cached result.
- Each selected image was retrieved through `preview_submission_press_image` and visually inspected. Exact source-served bytes were then imported through **`import_submission_press_image`**, not native-file-reference fabrication, direct CMS writes or paid image generation. All three original hashes also matched the prior local visual inspection.
- Same submission moved **3 → 4 → 5 → 6**. Final hash `0206cd5adc08e56c924589fcb3b274c471d29458c097d3319fc24bbb4c7ee0f8`; status `awaiting_preparation`. Fresh MCP preview at `2026-10-12T10:06:30.397Z` has one actual cover, two actual body-image blocks, `missing=[]`, `previewProblems=[]`, `quote.canAccept=true`. Next action is `open_personal_editorial_confirmation`, not a request to buy AI processing.

| Role | Source / observed credit | Webflow asset | Verified delivered file |
| --- | --- | --- | --- |
| Cover | Kontrapunkt About, work situation; photographer not stated | `6accb0ad0c0e115ac9b4872e` | WebP, 3840×4321, 702,336 bytes |
| DSB body section | Museum press page, **Andrea Sonne** | `6accb0db3e4b54fe78937886` | WebP, 1200×800, 120,280 bytes |
| Exhibition body section | Museum press page, **Daniel Rasmussen** | `6accb0f7ae8d575025b46139` | WebP, 1200×800, 130,156 bytes |

The cover has no observed visible text/logo/watermark. Graphic design text/logos in the body photos are the article's subject, not cover exceptions. The source-served portrait cover is preserved without a new crop or retouch. Credit is explicitly `Kilde: kontrapunkt.com (fotograf ikke oplyst)`, not an invented photographer. No explicit reuse terms were found on these source pages; all rights records remain `unknown`. Public availability and press-page labels are not a licence certification.

Independent public CDN GETs at `10:06:40.929–10:06:41.273Z` verified HTTP 200, `image/webp`, complete decoding, nonzero bytes, dimensions and **exact SHA-256 equality** for all three assets. Actual source/download URLs, request IDs, section IDs, hashes, source-page hashes, credits and readback receipts are in [the production evidence](PRESS-IMAGE-FLOW-2026-10-12-production.json). The original files and local visual previews are also retained under the worktree's `output/kontrapunkt-press/`.

All three original import operations were replayed after reading the saved state. They returned `replay:true`; the complete asset receipts and submission revision stayed unchanged, with three assets total and no additional upload. Network timeout, allocation ambiguity and concurrent-revision rebasing were covered by isolated failure-injection tests; no artificial production timeout is claimed.

Rendered original prose, non-media metadata (including SEO, slug and byline), research records and choices equal the revision-3 baseline exactly. The existing `textPreserved` field compares full HTML to the initial submission, so it is not the measure for preservation across this image-only repair. Explicit before/after hashes are retained instead. No article CMS item, personal preparation/image/publication approval or public article was created by this operation.

Before/after provider and October shared/image ledger hashes are identical through `10:06:45.586Z`; article cost actions are empty and MCP reports `paidAiCalls:0`. This does not measure subscription or hosting costs. Provider hold, budgets, old reservations, Liv cloud tasks and Instagram are unchanged. Only temporary scoped verification OAuth grants were revoked; the owner's existing connections were not changed.

### Remaining personal step and honest UI boundary

[Open the same article preview](https://ai.aproposmagazine.com/connect/chatgpt?submission=cb5da79d939579d3b8b89777f497148c707bbdaac855c564be64eb1487a9f7cd), inspect the actual photos and confirm the editorial version personally. Technical preparation and the separate version-bound publication step remain protected. No assistant approval was substituted.

The real authenticated MCP preview and real CDN bytes were verified. An optional standalone-browser check reached the normal login gate; the available Google accounts were not the owning Apropos account, so no alternate account or extracted browser session was used. This is not claimed as an authenticated browser-rendering test. Clients caching the old discovery schema may need their existing Apropos connection's official tool refresh to expose the two new tools; no new permission scopes are needed.

### Changed files

Production: `lib/image-gen/press-candidates.ts`, `lib/image-gen/press.ts`, `lib/image-gen/runtime.ts`, `lib/liv/public-media-reader.ts`, `lib/editorial/press-image-import.ts`, `lib/editorial/chat-image-import.ts`, `lib/editorial/submission-media.ts`, `lib/editorial/submission-contract.ts`, `lib/editorial/submission-worker.ts`, `lib/editorial/submissions.ts`, `lib/editorial/workflows.ts`, `lib/mcp/server.ts`, `lib/mcp/config.ts`.

Tests: `test/editorial-submissions.spec.ts`, `test/image-gen-press.spec.ts`, `test/liv-public-media.spec.ts`, `test/mcp-chat-image-import.spec.ts`, `test/mcp-protocol.spec.ts`. The two release-evidence documents accompany these changes. Existing storage, CMS uploader, article model, approvals, audits and receipts are reused; no parallel publishing system was added.
