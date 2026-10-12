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

No personal approvals, publication or paid AI are part of this repair. Production release/readback evidence will be appended after the real same-submission operation; passing tests alone do not establish it.
