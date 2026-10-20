# Apropos profile and section introductions

20 October 2026. First implementation slice of the accepted premium proposal.

## Delivery state

- Saved in Webflow and verified on `https://apropos-magazine.webflow.io`.
- Production is not published by this task. Readback of `https://www.aproposmagazine.com/om` still shows the previous copy.
- Site `67dbf17ba540975b5b21c180`.
- Latest staging publish receipt: `653a33dd-af78-44b7-ab15-868e6dce41af`, `customDomains: []`, `publishToWebflowSubdomain: true`, `publishScope: site`.
- Single-page production publishing failed with HTTP 400, `Invalid parameter: pageId`. This is a publication capability/request problem, not evidence of a successful release.

## Exact scope

About page `67dbf17ba540975b5b21c217`:

- Four existing string nodes changed; copy and exact node IDs are in `PROFILE-COPY-2026-10-20.json`.
- SEO title: `Om Apropos Magazine | Kultur med holdning, uden reklamer`.
- SEO description: `Apropos Magazine er et uafhængigt dansk kulturmedie. Læs om vores dækning af musik, film, serier, kunst, bøger og gaming. Gratis og uden reklamer.`
- Page element tree remains 76 nodes. Only the four intended string contents changed; existing styles, elements, children and attributes are preserved.
- The static English About page was not translated in this slice.

Sections collection `67dbf17ba540975b5b21c2ae`:

- Added optional PlainText field `editorial-introduction`, ID `ceb685a61be551153ada7c242cd45590`.
- Saved Danish and English introductions on the existing Music, Culture and Series/Movies items. Names and slugs are unchanged.
- Section IDs: Music `67dbf17ba540975b5b21c309`; Culture `67dbf17ba540975b5b21c30a`; Series/Movies `67dc6422013a1fa7681e0bb8`.
- Danish CMS locale `67dbf17ba540975b5b21c225`; English `690ca0f6b0d13d8788354156`.
- Exact copy is saved in `WEBFLOW-PROFILE-AFTER-2026-10-20.json`.

Sections template `67dbf17ba540975b5b21c212`:

- Added one Paragraph `14254c95-bc4e-b32d-8d5b-615da3bcfca9` immediately after the existing visible H1.
- Bound its text to the new CMS field. Reused `Subhead`.
- Applied the scoped combo class `.subhead.section-editorial-intro`, ID `cd67b2a6-e933-ce65-8764-7cef0ab4170e`, with only `margin-bottom: 24px`.
- One unused standalone class with the same label was also created during tool-schema discovery, ID `e1f9af86-0beb-f60a-231d-c2dfca0a2fa2`; it is not attached to any element. No existing shared style was modified.
- Element tree comparison: 198 before, 199 after. Only the new paragraph and its parent's child list differ. No existing elements were removed or altered.

No article item, author, Liv workflow, authentication, dependency, app code, animation or URL was edited.

## Verification

- HTTP 200 and expected new copy on staging `/om`, `/sections/musik`, `/sections/serierogfilm`, `/sections/kultur`, `/en/sections/music`, `/en/sections/series-movies`, `/en/sections/culture`.
- New About SEO title and description verified.
- Desktop visual inspection of Music and About.
- Mobile 390px inspection of Music and About: document scroll width equals 390px; no horizontal overflow. Music intro computed font size is 19px, width 366.625px and margin-bottom 24px. Temporary browser viewport override reset.
- Live/staging Home comparison: identical visible text, 32 article links, 81 image URLs, metadata, normalized body markup and ten inline script hashes. Page-specific CSS is identical. Shared Webflow CSS includes changed modal/popover base rules, and bootstrap JS includes changed runtime chunk hashes. This is a Home comparison, not proof that every pending change across the site is ours.
- Before snapshots and the final element tree are saved beside this report.

## Release coordination and resume

The owner has already authorized scoped deployment; no new per-commit approval is required. Full-site publishing includes pending changes beyond the individual page. Liv task `01a08533-1099-7121-989d-fb0f5da99c36` confirmed that the barsel submission remains private at revision 4, without a CMS article or publication permission. Its image work has not changed Webflow templates. That task did not audit other site-wide changes.

The API lists 26 pages. Only About, Sections Template and Home have modification timestamps after the previous production full-site compile of 9 October. Home has already been compared as described above.

Important: CMS `lastPublished` is advanced by a staging publish, including for already public articles. It cannot be used as proof of production publication or as the sole test for pending content. The release check compares actual live and staging content instead.

The completed public comparison covers all 512 unique paths from the production sitemap plus nine additional staging sitemap paths. All nine additional article paths already return HTTP 200 on production; their absence from the production sitemap is not evidence that the articles are drafts. One transient staging HTTP 500 on `/articles/o-days-2026-guide` was read back as HTTP 200 with matching content. No unexpected article text, metadata or custom-script changes were found. On 237 English pages, canonical DOM comparison reduces the differences to Webflow-generated `srcset`/`sizes` and attribute ordering.

### Concrete release blocker

Full-site staging publication changed displayed hero-card dates on six topic pages. Examples: `/topics/anmeldelser` and `/topics/koncerter`, Cæcilie Norby, change from `Oct 19, 2026` to `Oct 20, 2026`; `/topics/film` and `/topics/kultur-mening` change from Oct 16 to Oct 20; the affected English movies/reviews pages change from Oct 15 to Oct 20. The date differences are real visible content changes, not harmless runtime hashes. `/featured-articles` retains the same 25 cards but changes their order from Cæcilie → Kontrapunkt → Street Fighter → Whisper Man to Cæcilie → Street Fighter → Whisper Man → Kontrapunkt.

The suspected cause is dependence on mutable Webflow publication metadata, but the exact legacy binding is not proven. Read-only MCP inspection of topic hero date element `21da636a-b814-9994-4fb8-84b2a66475c7` exposes no text/date setting in `all_raw_settings` or `query_settings`. Bindable-source discovery does not expose the system created/published fields. The Articles collection's only custom DateTime fields are `start-dato` and `slut-dato`, which are event dates and must not be substituted for publication dates.

Production remains unchanged. No guessed date substitution, hidden date, changed Featured sorting, bulk article migration or CMS article write was made to work around the blocker. The confirmed good profile copy, new Section field, bindings, backups and staging verification are preserved.

Safe resume: inspect the actual legacy date binding and Featured collection sorting through a supported Webflow capability; establish an authoritative, durable original-publication date source before changing date or ordering semantics. Fix and verify those dependencies on staging, including a second staging publication proving date/order stability. Then perform supported full-site publication to the existing custom domains and read back About and all six section pages on production. Do not treat staging `lastPublished` as historical publication evidence, or event/creation dates as interchangeable with original publication dates.

Existing domain IDs: `69ba9549f0d43160390aea96`, `69ba9548f0d43160390aea67`, `68a5d29d57af0ed31343b7be`, `68a5d29c57af0ed31343b79e`.

The larger proposal's curated section modules, editorial-method page, accurate author-role work and subsequent citation benchmark are not implemented by this slice. Wikipedia remains research only; see `WIKIPEDIA-ASSESSMENT-2026-10-20.md`.
