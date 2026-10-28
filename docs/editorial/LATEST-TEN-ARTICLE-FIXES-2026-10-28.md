# Latest ten articles: corrections and production verification

Owner request: “Ret det hele”, following `LATEST-TEN-ARTICLE-AUDIT-2026-10-28.md`.
Completed 28 October 2026, final checks at 17:08–17:09 UTC.

## Result

The concrete audit findings have been corrected and published. All ten public
pages return HTTP 200, have one matching H1, unique SEO titles and descriptions,
correct canonical URLs, valid JSON-LD, and appear in the current sitemap.
Robots permits crawling. No horizontal overflow or broken visible article
images was found in Chromium at 390×844 and 1440×1000.

All 49 image roles now meet the existing image policy. On twenty cold page
loads (ten articles, two viewports), only the appropriate mobile or desktop
cover was requested; the visible cover loaded successfully in every case.

Barsel's mobile cover plus all body images decreased from **6,824,280 bytes to
850,608 bytes**, a **87.54%** reduction. This measures image payload, not the
entire page. Original files are retained; optimized derivatives are published.

## Article changes

| Article | Result |
| --- | --- |
| The Terminal List | Existing images, title, metadata and trailer field verified. No body iframe. |
| Nogen der kender nogen | SEO title now “Boganmeldelse: Nogen der kender nogen af Laura Ringo”. Owner's H1 retained. |
| Placebo | Images, credits, H1, SEO and schema verified; no editorial rewrite. |
| Deep Purple | Descriptive cover/mobile/body alt text, three specific captions retaining Niklas Mørup's credit, and two wording errors corrected. |
| Lanterns | Existing images, metadata and trailer field verified. |
| Barsel | Oversized cover/mobile and cake image converted through the deployed optimizer and read back from CMS. |
| Cæcilie Norby | Repeated unknown-photographer notices removed from captions; actual credits/source information retained. |
| Girls | Both body images resized by the deployed optimizer; duplicated caption credits removed; original publication date restored from its receipt. |
| Street Fighter | H1/SEO aligned to “Anmeldelse: Street Fighter (2026)”; alt text and captions added; known copy errors and long dashes corrected; cover source identified as Paramount. |
| The Whisper Man | H1 aligned to “Anmeldelse: The Whisper Man (Netflix)”; contradictory unknown-photographer wording removed while retaining the supplied David Lee/Netflix credit. |

Slugs, authors and ratings are unchanged. No new article was generated. Historical
publication receipts remain historical; these corrections do not count as new
unattended Liv deliveries.

## Shared template and future behavior

The two hero image elements and two related-card image elements now use
`loading="lazy"`. The main hero retains high fetch priority. Browser verification
shows that CSS-hidden responsive alternatives are no longer fetched. Existing
Webflow bindings, classes, images, and parallax behavior were preserved.

The deployed image optimizer from app commit
`10fde77fa4d1837c098922859cdca031b5b34236` was reused. Its previous deployment is
`dpl_6k2jtvszjFhe679TiDZR19hVc4aT`; this correction did not deploy new app code.

The Article schema no longer presents CMS creation time as first publication.
A new optional DateTime field `first-published-at`
(`9ab2c9e1d027c60a19b929c547ab32a8`) accepts a documented original publication
timestamp. The live footer validates it and uses it consistently in Article and
Review JSON-LD. Blank, unresolved, invalid or future values are omitted.

Girls has the original receipt timestamp **2026-10-23T13:08:49.244Z**, confirmed
in live CMS data, the public template and rendered Article JSON-LD. Other unknown
first-publication dates were not guessed or backfilled from `createdOn` or
`lastPublished`. Populating this field automatically for future publications is
not implemented by this change. The truthful fallback is to omit `datePublished`.
The known date is added in browser-rendered JSON-LD; raw server HTML contains the
inert date field but no fabricated publication date.

Canonical installed snapshots: `docs/webflow-embeds/article-review-footer-live.html`
and `docs/webflow-embeds/article-schema-live.json`. The older footer file is marked
historical so it cannot be mistaken for the installed version.

## Credits and source checks

Street Fighter's cover was visually matched to Paramount's official
[film article](https://cms-corp.paramount.com/news/street-fighter-brings-an-arcade-favorite-to-the-big-screen)
and its SF_FP_103R photograph. No individual photographer was supplied there;
the published credit names Paramount and explicitly leaves the photographer unknown.

The Whisper Man's David Lee/Netflix attribution was checked against
[Netflix Tudum's cast guide](https://www.netflix.com/tudum/articles/the-whisper-man-cast-guide).
Existing UIP body credits were retained, not extrapolated onto the cover.

The Terminal List's existing destination ID was confirmed on the official
[Prime Video listing](https://www.primevideo.com/detail/0NGB908JKDOZ29WLQ2GS45USOV?tr=gl).
A direct Node request returned 503; this does not establish a broken destination
or successful video playback. The URL was not replaced on that basis.

## Tests and release evidence

- Nine focused tests passed in `test/webflow-publication-date-footer.spec.ts`,
  including verified dates, missing/invalid/future/injection input, Article/Review
  consistency and preserved rating/author/type.
- Exact command: `RAGE_STORAGE_DIR=./tmp/vitest-rage node_modules/.bin/vitest run test/webflow-publication-date-footer.spec.ts`.
- Public audit: 10/10 pages; 49/49 image roles; 20/20 responsive cover network checks;
  10/10 URLs in sitemap; no metadata/image/layout/preservation assertions failed.
- Six minimal article patches have original snapshots and readback receipts.
  Girls' new date field was initially only visible in staged schema; full template
  publication made it live. The original mismatch and subsequent successful
  readback are both retained, without a second CMS write.
- Before site publication, staged/live CMS checks found no unrelated pending
  non-draft item changes. Existing drafts were not individually published.
- Webflow publication task **b8b2a509-ac66-42e7-a5c6-6d1917e67e4d** succeeded on the
  four existing custom domains. Live template and article readback followed.

Detailed local evidence is in `output/latest10-fix-20261028/`: patch plan and
receipts, image-repair receipts, schema/footer backups, preflight and publication
receipt. Final `after/` contains `audit.json`, `network.json`, `checks.json`,
`crawl.json`, public HTML and mobile/desktop screenshots.

This verifies technical publication and the audited SEO fields, not Google
indexing/ranking, physical iPhone Safari behavior, or end-to-end audio playback.
No paid generation, provider/budget change, email, Instagram action, Liv producer
restart or simulated personal approval was performed.
