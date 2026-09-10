# Liv automatic publication repair — local verification

## Implemented

- The daily route no longer unconditionally ends in draft mode. With `auto_publish`, passing editorial/research gates, passing structural preflight and passing CMS/media readback, it calls the targeted, locale-specific publish operation.
- The final operation reinspects the draft and binds its evidence to a hash of the actual CMS fields. Changed fields invalidate the evidence before the write.
- Only one item and its Danish locale are published. There is no site-wide publication or Instagram action.
- A publish response is not evidence of success. The live CMS item must match the staged revision, and the public page must contain the title, body text and CMS images. Read-only propagation retries are bounded. Writes are not retried automatically.
- The old permanently failing image-rights check is replaced by technical asset checks: selected hero hash/alt/credit and at least two distinct credited body images, with matching CMS metadata, readable bytes and proportional sizing. This does not certify image reuse rights.
- The saved CMS ID remains recorded if publication or verification fails, preventing blind item recreation by the daily claim mechanism.

## Verification

- 915 tests across 89 files passed locally.
- TypeScript and production build passed. Existing broad file-tracing build warnings remain.
- Tests cover the successful automatic-publication branch, draft/human-approval modes, incomplete gates, changed draft fields, incorrect live identity/locale/content, missing public text/images and delayed propagation.
- No production CMS operation was executed for this repair.

## Not completed / release boundary

1. The Webflow connector has returned an explicit workspace-administrator restriction on collection-item access. This repair must not be deployed or invoked as an alternate route around that restriction. No production activation or live-article claim is justified.
2. The daily generator currently returns image suggestions; it does not automatically produce the selected hero and two prepared body images. Existing preparation is tied to a saved desk story and explicit selection. That pipeline still needs automatic selection/preparation with proper provenance, relevance checks and bounded execution time. Otherwise new daily articles correctly remain drafts for missing media.
3. A recorded CMS item prevents duplication, but an uncertain publication still needs reconciliation of that same item, not a new article. Full automatic resume/reconciliation is not implemented here.
4. Public HTML verification is not a browser rendering audit. Production CMS/API permissions, actual environment mode/pause settings, image-provider operation and a complete fresh-article run remain unverified.

Reference: [Webflow item publishing](https://developers.webflow.com/data/reference/cms/collection-items/staged-items/publish-item) and [live item readback](https://developers.webflow.com/data/reference/cms/collection-items/live-items/get-item-live).

Next release requires restored administrator-approved access, completion of automatic media preparation and an end-to-end production test without Instagram. No further editorial approval from the user is required.
