# Review footer: verified production release

21 October 2026. Read-only GET comparison and local execution tests. This check
does not perform Webflow writes or publication.

**Implementation:** 55/55 footer regression tests pass. See
`REVIEW-TYPING-IMPLEMENTATION-2026-10-21.md` for the exact binding and conservative
fallback contract. Root installed the artifact and published staging with task
`0998cc0c-f993-483b-987c-74044786b482`.

## Complete staging comparison

Fresh production baseline and staging each returned all **524 sitemap paths**
successfully, with 8 concurrent GETs maximum and no missing/extra paths. After
removing only the agreed inert metadata elements, the following are unchanged on
all pages: metadata, existing JSON-LD, article-link order, DOM tags/classes/inline
styles/animation identities, unrelated inline JavaScript, external JavaScript
URLs and stylesheet URLs. Topic/featured/homepage dates and order are unchanged
in both locales.

All **438 article pages** have exactly one hidden article-scoped taxonomy wrapper,
resolved primary-topic markup and exactly one copy of the approved candidate
footer. Source validation permits only replacement of the single CMS rating token
by its compiled numeric value; arbitrary script differences are not allowed.
Every compiled rating is unchanged from the baseline. Dedicated book metadata is
also unchanged.

Street Fighter has exactly `anmeldelser, film` in Danish and `reviews, movies` in
English, not the site's entire topic navigation. Its resolved primary references
are `anmeldelser`/`reviews`. Both compiled rating-4 footer scripts have SHA-256
`e7a399444d7e9e24835c926e5fa7de4cf78b0fad2a7f96a3f05a97c2be0c6c99`.

## Additional differences, retained in receipts

1. `/presse` contains two unrelated visible copy-button changes:
   `Kopiér kort præsentation` → `Kopiér den korte præsentation`, and
   `Kopiér udfoldet præsentation` → `Kopiér den lange præsentation`.
   The user subsequently approved publishing these pending button labels; root
   confirmed that the corresponding short/long pair was included in that scope.
2. Six existing footer/subscription images have generated `sizes` changed from
   `(max-width: Npx) 100vw, Npx` to `100vw`: five 800px assets on 522 pages each and
   one 3840px asset on 502 pages. No other image attribute changes exist. Each
   source set's largest candidate equals the old cap exactly. A width-descriptor
   candidate model tested every integer viewport 320–1920 plus 3840/5120/7680 at
   DPR 1/2/3: **28,872 cases, zero differences**. Above the cap both select the
   largest available source for DPR ≥ 1. With unchanged CSS/DOM, this supports
   compiler serialization rather than a layout or normal-DPR resource regression.
   The model does not certify browser cache heuristics or DPR below 1; the raw
   differences remain recorded rather than silently normalized away.

## Runtime checks reported by root

Root inspected the compiled staging pages through the browser after DOM-ready:

| Control | Observed result |
|---|---|
| Street Fighter EN | Movie, 4/6; Film review, Casper Fiil unchanged |
| Street Fighter EN metadata wrapper | Exactly reviews/movies; hidden, computed display none, zero rectangles |
| Wolverine EN | VideoGame, 4/6, Game review after deferred rendering completed |
| Alien: Earth DA | TVSeries, 5/6, Serieanmeldelse, explicit serier topic |
| I mellemtiden er vi ingen | Book, 5/6; book author preserved separately from reviewer |
| Untamed | CreativeWork, 4/6; only review-format taxonomy, so no guessed medium |
| Cæcilie Norby | Koncertanmeldelse, event-omitted; Article only, no Review/Event |

These are root's browser observations, distinguished from this agent's complete
raw-HTML/source comparison and VM regression tests.

## Reproduction and status

`scripts/verify-webflow-review-release.mjs` performs bounded, unauthenticated GETs:

```sh
node scripts/verify-webflow-review-release.mjs capture production-before
node scripts/verify-webflow-review-release.mjs capture staging docs/seo/REVIEW-TYPE-PRODUCTION-BEFORE-2026-10-21.json
node scripts/verify-webflow-review-release.mjs details staging docs/seo/REVIEW-TYPE-PRODUCTION-BEFORE-2026-10-21.json
```

Receipts: `REVIEW-TYPE-PRODUCTION-BEFORE-2026-10-21.json`,
`REVIEW-TYPE-STAGING-2026-10-21.json`, and
`REVIEW-TYPE-STAGING-DETAILS-2026-10-21.json`. Full captured HTML is retained locally
under `tmp/review-type-release-2026-10-21/` for exact investigation.

## Final preflight

At 17:04:50Z the saved Articles Template footer was byte-identical to the tested
local candidate (9,935 characters). The site's last-updated and staging-compiled
timestamps remained unchanged. Eight new staging GETs covering Street Fighter,
press, Film topics and featured pages in both locales matched the earlier complete
HTML snapshots byte-for-byte. See `REVIEW-TYPE-PREFLIGHT-2026-10-21.json`.

There is no dedicated pending-change diff API available. These saved-source,
timestamp and public-output checks establish the observed integrity; they are not
a claim that an unavailable change inventory was inspected.

## Production readback

Root published the approved release with task
`b72ce984-ccdd-4cbd-87e2-4bd5bbeabf72`. A fresh Webflow site read confirms all four
custom domains compiled at **17:05:44.979Z**. Staging was not republished.

The production crawl completed at **17:07:27.576Z**: all **524/524 paths returned
200** and matched the approved staging version for every compared field. There
were no sitemap, text, metadata, existing JSON-LD, article-order, image, DOM
structure, unrelated inline-script, external-script or stylesheet differences.
All 12 topic/featured/homepage controls remained unchanged.

All **438 article pages** also match the approved taxonomy scope, compiled footer
and primary reference exactly. Ratings are unchanged from pre-release production;
book metadata is unchanged. No unresolved binding or hidden-wrapper error was
found. The production acceptance flag is true in
`REVIEW-TYPE-PRODUCTION-AFTER-2026-10-21.json`; detailed readback and publication
state are saved in `REVIEW-TYPE-PRODUCTION-AFTER-DETAILS-2026-10-21.json` and
`REVIEW-TYPE-PRODUCTION-PUBLISH-2026-10-21.json`.

Root independently repeated the live browser checks: Street Fighter EN is Movie
4/6 with Film review and the hidden reviews/movies scope; Wolverine EN is
VideoGame 4/6; Alien: Earth is TVSeries 5/6; I mellemtiden er vi ingen is Book 5/6
with Frederik Drescher Kluth as work author and Liv as reviewer; Untamed remains
the conservative CreativeWork 4/6; Cæcilie Norby remains event-omitted with Article
only. Both approved press-button labels are live. Desktop evidence is
`output/seo/review-type-production-desktop-2026-10-21.png`.

The attempted browser viewport resize did not apply; its measured width remained
2560px. No mobile browser proof is claimed, and the old staging file named
`review-type-staging-mobile-2026-10-21.png` is not valid mobile evidence.

**Final status:** the scoped Review-type correction and approved press-button copy
are published and verified live. Article text, ratings, layout structure, dates
and ordering were preserved. This verification makes no claim about unrelated
SEO completeness or guaranteed search/AI visibility.
