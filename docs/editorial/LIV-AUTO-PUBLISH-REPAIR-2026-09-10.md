# Liv automatic publication repair — local verification

## Implemented

- The daily route no longer unconditionally ends in draft mode. With `auto_publish`, passing editorial/research gates, passing structural preflight and passing CMS/media readback, it calls the targeted, locale-specific publish operation.
- The final operation reinspects the draft and binds its evidence to a hash of the actual CMS fields. Changed fields invalidate the evidence before the write.
- Only one item and its Danish locale are published. There is no site-wide publication or Instagram action.
- A publish response is not evidence of success. The live CMS item must match the staged revision, and the public page must contain the title, body text and CMS images. Read-only propagation retries are bounded. Writes are not retried automatically.
- The old permanently failing image-rights check is replaced by technical asset checks: selected hero hash/alt/credit and at least two distinct credited body images, with matching CMS metadata, readable bytes and proportional sizing. This does not certify image reuse rights.
- The saved CMS ID remains recorded if publication or verification fails, preventing blind item recreation by the daily claim mechanism.
- Automatic mode now prepares one hero plus two distinct body images before the final editorial gates. Research reviews and film/TV coverage require actual credited photographs from configured official source hosts; there is no generated film-scene fallback. Other features default to original expressive Apropos illustrations, with the minimal style available in the shared preparation interface.
- Image discovery includes figure galleries and prioritizes configured producer/distributor pages, instead of stopping after four news thumbnails. Image-specific credits, source URLs and byte hashes are preserved; unknown rights remain unknown.
- The existing WebP encoder produces a 1920×1080 hero and proportional body images, each at most 450 KiB. Alt text/captions, three distinct source/output hashes, immutable storage readback and automatic visual review must pass. Prepared media is bound to the final article hash.
- Existing Firebase and OpenAI integration are reused. The generation-persistence skill guided deterministic job IDs, original paid-output storage and usage records (cost stays null where unknown). No dependencies, credentials or environment values were added. The key-handling skill kept tests independent of production credentials.
- Text is checkpointed before media preparation. Original paid image outputs and intermediate evidence survive later failures. Existing partial jobs require reconciliation rather than automatic paid retries. A stale daily run with saved text is not silently regenerated.
- The strict public URL reader remains unchanged. A separate own-bucket adapter accepts only public-token-bearing immutable Liv image paths, with bounded size, exact generation and matching hash. It cannot read unrelated/private Firebase paths through admin access.

## Verification

- 955 tests across 93 files passed locally, including 40 additional tests since the publication-only repair. Provider/storage tests use mocks; they do not establish live-service availability.
- TypeScript and production build passed. Existing broad file-tracing build warnings remain.
- Tests cover the successful automatic-publication branch, draft/human-approval modes, incomplete gates, changed draft fields, incorrect live identity/locale/content, missing public text/images and delayed propagation.
- No production CMS operation was executed for this repair.

## Not completed / release boundary

1. The Webflow connector has returned an explicit workspace-administrator restriction on collection-item access. This repair must not be deployed or invoked as an alternate route around that restriction. No production activation or live-article claim is justified.
2. Automatic media preparation is implemented locally, not exercised against production providers. It requires existing configured Firebase/OpenAI services; illustration generation respects `AI_IMAGE_GENERATION_ENABLED`. Missing official credited photos, unclear visual relevance, disabled generation or time exhaustion stop the run before CMS writes and preserve the text checkpoint. Source sites without discoverable per-image captions are not automatically accepted. Visual QA is model-based, not a guarantee of editorial quality or exact brand matching; no model fine-tuning was performed.
3. A recorded CMS item prevents duplication, but an uncertain publication still needs reconciliation of that same item, not a new article. Full automatic resume/reconciliation is not implemented here.
4. Public HTML verification is not a browser rendering audit. Production CMS/API permissions, actual environment mode/pause settings, image-provider operation and a complete fresh-article run remain unverified.

Reference: [Webflow item publishing](https://developers.webflow.com/data/reference/cms/collection-items/staged-items/publish-item) and [live item readback](https://developers.webflow.com/data/reference/cms/collection-items/live-items/get-item-live).

Next release requires restored administrator-approved access and an end-to-end production test without Instagram. The latest user-supplied recovery rules also require credential rotation and approval of the exact clean release commit before push/deploy; earlier broad approval does not override that latest instruction. No production access was attempted in this media-preparation change.
