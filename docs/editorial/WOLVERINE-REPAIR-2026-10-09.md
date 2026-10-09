# Wolverine: article repair live, shared template pending

Verified 9 October 2026, 10:19–10:21 Europe/Copenhagen.

## Scope and acceptance

Owner requested the audit's fixes and automatic image compression without paid
AI calls. They explicitly confirmed `presseakkreditering=true`. They separately
authorized a full Webflow site publication **only if unrelated changes would not
be included**. This release is human-article maintenance, not unattended Liv.

- [x] Existing Wolverine article updated, no duplicate CMS item.
- [x] Peter Milo, 4/6, slug, category/topics, press disclosure and human authorship preserved.
- [x] Original large body image compressed without changing the motif; mobile derivative added.
- [x] Second distinct official screenshot, descriptive locale-specific alt/captions/credit.
- [x] Duplicate opening sentence removed, three headings and a relevant internal link added.
- [x] Read time 4 minutes; complete English translation authored in the chat, no translation API.
- [x] CMS and public readback for both locales; public paragraphs match the repaired CMS text.
- [x] Durable automatic compression fix deployed; actual publication webhooks exercised for both locales.
- [ ] Shared Review template patch installed and published.
- [ ] Sitemap refreshed and Wolverine URLs verified in sitemap.
- [ ] Raw HTML `og:type` changed from `website` to `article`.

The last three are not claimed complete. Full site publication was not performed.
The owner subsequently explicitly chose **“Vent til næste fælles sitepublicering”**.
Those shared-site changes are therefore deliberately deferred, not an open request
to publish the site now or to ask for the same approval again.

## Production release

- Code: `e083fb33dbd0b416a6a6af7637656d00cacf68a9`.
- Deployment: `dpl_GSpqzYsKvij5Xnb4NQFy1LPXG1Zy`, READY, exact SHA and
  `ai.aproposmagazine.com` alias verified through Vercel API.
- Full isolated test run for that release: **359 files / 5,021 tests**.
  TypeScript, focused ESLint, diff checks and security build configuration passed.
- New prepared Webflow footer has a further **7 isolated tests** executing both
  actual DOM-ready callbacks. This is separate from the deployed full-run count.

The actual 8 October Webflow publication did invoke the old webhook. It failed
with `Connection error.` in the AI image inspection path before compression.
`WEBFLOW_ARTICLE_WEBHOOK_OPTIMIZE` was not disabled: its env default is true.
An initial activation diagnosis was corrected before repair.

Published-image maintenance now calls deterministic compression directly, with
no paid visual inspection. The normal application/Liv image admission continues
to run the existing editorial image checks. No provider hold or budget changed.
Creation events cannot promote an unpublished article. The new maintenance path:

- requires a live article and identical staged/live fields for the selected locale;
- uses the shared CMS write lease, fresh before-write hashes and durable receipts;
- retains prepared derivatives, records uncertain writes and reads back after timeouts;
- patches only image-bearing fields on that live locale, never the whole site;
- verifies untouched fields, alt text and byte identity after Webflow rehosting;
- returns a real error for failed compression instead of pretending success.

## Article receipts

Item `6ac7a31e994128467aa26e6a`, collection `67dbf17ba540975b5b21c2a6`.

- [Danish live article](https://www.aproposmagazine.com/articles/marvels-wolverine-anmeldelse)
- [English live article](https://www.aproposmagazine.com/en/articles/marvels-wolverine-anmeldelse)

Selective live PATCH returned HTTP 200, then individual locale publication
returned HTTP 202 with the same item ID and no errors. Before each write the
saved original/current staged/live state was compared. Before item publication
the newly verified field hash was compared again. No other staged content was
promoted. Hero bytes were preserved even where Webflow assigned a new asset URL.

| Locale | Actual lastPublished | Verified field hash |
| --- | --- | --- |
| da | `2026-10-09T08:15:08.307Z` | `3a6af2462306a167326bb406387d90a9d0daf7a31d5c4a6671277a702aa1b8ab` |
| en | `2026-10-09T08:15:34.051Z` | `ce76b88763bad9772d1e4a52ae70965bcee3b0ba3a54195ec92d89b003edf88a` |

Durable maintenance audit: `editorialMaintenance/wolverine-2026-10-09-v1`, with
original fields, prepared derivatives/patches, locale write/publication receipts
and public verification. Local reproducible scripts/snapshots are in ignored
`tmp/repair-wolverine-20261009.ts`, `tmp/wolverine-english-20261009.ts`,
`tmp/verify-wolverine-repair-20261009.ts`, and `tmp/wolverine-repair-*.json`.
No credentials are in this record.

Private MCP Writer was safely refreshed to revision 8 after readback, archiving
revision 7. It now reflects the actual article. This is not a new personal
publication approval or an automatic Liv run.

## Image results and provenance

| Asset | Original bytes | Published bytes | Output |
| --- | ---: | ---: | --- |
| Existing body screenshot | 3,625,066 | 104,004 | WebP 1200×675 |
| Additional official screenshot | 443,598 | 36,980 | WebP 1200×675 |
| Mobile key art | 217,132 | 68,960 | WebP 1200×675 |

The first body image is **97.1% smaller by file bytes**. This is not a measured
page-speed/Core Web Vitals improvement or a measured AI-cost percentage saving.
Desktop hero's existing 217,132-byte 1920×1080 artwork is retained. Source
logos/copyright marks are preserved. No image generation or AI cleanup ran.

Official source: [PlayStation game page](https://www.playstation.com/en-us/games/marvels-wolverine/).
The additional screenshot is `marvels-wolverine-essex-screenshot-03-en-15sept26`
from the page's `gmedia.playstation.com` media. Source attributes ©2026 MARVEL /
Sony Interactive Entertainment, developed by Insomniac Games. Credit does not
prove a reuse licence: stored rights status remains unknown.

Both body images were decoded and visually inspected before publication; public
readback downloaded and matched their SHA256 bytes. Mobile browser width 390px
showed both images clearly within 367px body width, no horizontal overflow.
Desktop/English browser width 1280px also showed no horizontal overflow. Lazy
images were checked after scrolling into view, not misclassified while unloaded.

## Automatic production evidence and costs

Real item publication triggered the new policy
`published-compression-2026-10-09-v1` for both locales:

- DA receipt `53f279aaf54f7a189089787dfb5f80ad0dfd48443cd7e8c7c0db34e3dcb2c84e`,
  checked `2026-10-09T08:15:11.176Z`.
- EN receipt `c9a759e24c3f66a95279a547b1acf0c29ea781a6252dcd1f7160c8d9e0e62db4`,
  checked `2026-10-09T08:15:35.927Z`.

Both return `no_changes` and zero failed images: the manually prepared
deterministic derivatives were already compliant. This proves real webhook
execution and non-reprocessing, not a new production test of oversized-image
encoding. That branch was isolated-test verified; the same encoder created the
live derivatives. No fake test article or repeated production write was used.
The bounded console-log query was empty; the durable receipts are the evidence.

October shared ledger is unchanged before/after: one call, zero usage estimate,
1,214,400 DKK micros reserved and one unresolved call. No October image-gen row.
No paid model, image-generation or translation request. Storage/Webflow requests
are ordinary service API operations; no blanket claim of zero hosting cost.
Local Firebase byte reads emitted MaxListenersExceededWarning; CMS/public byte
verification still completed. This is recorded, not claimed to prove a leak or
an article failure. An omitted local storage-bucket env was corrected before
the successful readback; no production setting was changed.

## Shared site changes: explicitly held

All collections were inspected in DA and EN. The only timestamp candidate,
The Invite's EN row, differed by 33 ms but exact staged/live fields were equal.
No real pending CMS field change was found. Static page timestamps were older
than the latest full site publish, but this does **not** prove that all global
style/settings/design changes are already live.

The current Webflow publish dialog has no complete change diff. Activity-log
API returned `403 not_enterprise_plan_site`; single-page publishing requires
Enterprise and cannot be used here as a scoped fallback. We did not publish
the whole site on assumptions. The owner was asked once whether other design
changes are already published or to defer until the next coordinated release,
and chose to defer. No site code was installed or published.

Current raw HTML still has `og:type=website`. Current runtime Review still has
`itemReviewed.name=Marvel’s Wolverine Anmeldelse` and the duplicate review label.
The sitemap still omits this URL despite item `includeInSitemap=true`.

`docs/webflow-embeds/article-review-footer.html` is a **local, uninstalled release
candidate**, based on a fresh read of Articles Template page
`67dbf17ba540975b5b21c208`. It preserves book metadata/author distinction,
rating/author/type/canonical logic and changes only review title/work-name
handling. It does not change Open Graph metadata. Tests cover DA/EN Wolverine,
prefix form, book-author preservation, internal words and unrated articles.

Resume at the next owner-coordinated site release, not through automatic polling:
establish a safe site release window; reread current head/footer and
compare to the saved source before applying the small footer diff; determine
the source of raw `og:type` and change it without duplicate tags; recheck all
pending CMS/design work; publish only approved destinations; verify raw HTML,
runtime Review for game/book/unrated examples, and sitemap. Never overwrite a
newer template or call the local candidate a live fix.
