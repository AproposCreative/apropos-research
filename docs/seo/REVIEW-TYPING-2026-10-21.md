# Review type mismatch: Street Fighter — 21 October 2026

Read-only diagnosis and implementation notes. Only this document was authored.
No application/template/CMS mutation, publication, paid call or schema expansion
was performed. Prioritize correct existing markup before adding more markup.

## Confirmed defect

The same film is rendered as `Movie` on Danish and `VideoGame` on English:

| Public URL | Browser result | Visible review label |
| --- | --- | --- |
| `/articles/street-fighter-2026` | Review → Movie, 4/6 | Filmanmeldelse |
| `/en/articles/street-fighter-2026` | Review → VideoGame, 4/6 | Game review |

Host: `https://www.aproposmagazine.com`. Actual Chromium observations at
`2026-10-21T16:02:33.318Z` and `.339Z` are saved in
`docs/seo/measurements/2026-10-21-technical.json`,
`browserVerification.pages`. Both raw HTML pages have Article markup; Review
is appended by JavaScript, not present as a server-rendered Review node.

Fresh independent public fetches and an isolated execution of the actual footer
with each page's Article JSON reproduced the same type and label. Both retain
the same name, rating and reviewer; the defect is the work-type classification.
The EN content/metadata also needs a separate locale review: its description is
Danish. Correcting the schema type does not translate or validate that edition.

## Exact source and injection point

- Versioned source: `docs/webflow-embeds/article-review-footer.html`.
- Webflow injection: **Articles Template footer custom code**, template page
  `67dbf17ba540975b5b21c208`, site `67dbf17ba540975b5b21c180`.
- Installation/publication evidence:
  `docs/editorial/SITE-PUBLICATION-2026-10-09.md`. The earlier
  `WOLVERINE-REPAIR-2026-10-09.md` called it uninstalled; the later site-publication
  receipt supersedes that checkpoint.
- Public inline JavaScript in both Street Fighter locales is byte-identical to
  this source's script after replacing the existing CMS rating token with `4`:
  **9,538 characters**, SHA-256
  `5b34dfde59853ae8a98b30f866e68d0abde081b348379cee10546336740dff36`.
  An in-memory unified comparison returned no diff. This proves the relevant
  public script source without relying solely on the historical receipt.
- The builder in `lib/seo-engine/review-schema.ts` is a separate implementation.
  Changing it alone cannot repair this live Webflow footer. The metadata writer
  still publishes only title/description, not generated JSON-LD.

The footer has two DOMContentLoaded handlers. The first creates a Review from
the Article node, rating and broad section/keyword matches. The second handler,
via `setTimeout(..., 0)`, recalculates type, updates the visible label and adjusts
locale/canonical. Both type decisions need a shared resolved result; fixing one
handler while the other can overwrite it is insufficient.

## Precise cause

The second handler joins `headline`, `description`, `keywords` and `articleSection`
as `coreText`, then uses:

```js
var isGame = /\b(gaming|videospil|spilanmeldelse|game review|video game|playstation|ps[45]|xbox|nintendo|switch)\b/.test(coreText);
// ...
if (book) type = 'Book';
else if (isEventReview) type = 'CreativeWork';
else if (isGame) type = 'VideoGame';
else if (seriesScore > movieScore) type = 'TVSeries';
else if (movieScore > seriesScore) type = 'Movie';
```

The current DA Article description mentions “filmen” and does not contain
“gaming”. Its explicit metadata says this is a film review. The current EN
description instead begins `Før “gaming” blev et ord...`; `isGame=true` wins
before any movie/series score. Its Article section is `Series &amp; Movies` and
keywords are merely `Reviews`, so no explicit work-type field is consulted.
The DA section is `Serier &amp; Film` and keywords are `Anmeldelser`.

This is a content-dependent heuristic defect, not a failure to parse JSON, a
rating error, or a difference between two deployed scripts. It also exposes a
cross-feature coupling: the automatic SEO system can legitimately edit a meta
description and thereby change both Review.itemReviewed type and the visible
review label. Changing the wording to avoid the trigger would mask the defect.
Simply making film words beat gaming words would misclassify real game reviews
that discuss films. More keywords are not a deterministic solution.

## Existing authoritative data

Read-only Apropos MCP returned current DA item `6acf781e73fc5cad8e209321`,
checked `2026-10-21T16:05:40.217Z`, CMS hash
`986bfb643d6759fa769455926bb263ef6c05e34c2500df7e1aafa0d785321b63`:

- Section `67dc6422013a1fa7681e0bb8` = Serier & Film.
- Primary topic `67e6f8f2e077ea42a9b95b87` = Anmeldelser.
- Topics include Anmeldelser **and Film** (`67dbf17ba540975b5b21c303`).
- Rating `stjerne=4`; book-title/book-author are null.
- No `article-type` or explicit reviewed-work-type field was returned.

A separate read-only current CMS options call confirmed these IDs and:

| Current canonical topic | ID | Specific work type it can support |
| --- | --- | --- |
| Film | `67dbf17ba540975b5b21c303` | Movie |
| TV-serier | `67dbf52a4ac2cf0073a9b0ef` | TVSeries |
| Gaming | `68f73f675da21fa296b1b6e7` | VideoGame |
| Anmeldelser | `67e6f8f2e077ea42a9b95b87` | Review format only; no work type |
| Festival / Koncerter | Existing references | Event coverage; does not establish event dates/place |

The DA article therefore already has a deterministic Film signal that the footer
does not read. Do not assume primary topic is always the subject: here it is the
format Anmeldelser. The multi-reference `topics` field matters.

The EN item's full CMS reference fields were not successfully retrieved in this
subtask; only its public Article metadata/runtime and translated navigation are
verified. Before implementation, read both actual locale items and confirm their
typed references. Do not invent an EN ID or silently copy a DA reference over an
independently edited EN edition.

## Recommended minimal implementation

1. Resolve work type from explicit structured editorial data. Reuse a real
   authoritative type field if one exists and is verified; otherwise use the
   existing specific primary/multi-reference topic identities. For this item,
   Film maps to Movie. Broad section labels and the format Anmeldelser/Reviews
   cannot distinguish film, series and games.
2. Expose the resolved stable type or scoped taxonomy identities to the footer
   through inert CMS-bound data. Validate the actual Webflow binding capability
   for multi-reference topics before selecting its exact template structure.
   A scoped collection list of this article's topics is preferable to scanning
   arbitrary links. The public site footer links to **all** topics on every page;
   using all `/topics/` anchors would give every article Film, Gaming and Series.
3. Map stable topic identities to canonical schema values shared across locales.
   Localize only the display label. If localized topic IDs differ, explicitly map
   verified equivalents; do not infer type from English/Danish prose. The same
   known work must resolve identically regardless of description wording.
4. Make one resolver feed both DOM handlers' type/label decisions, or consolidate
   that duplicated decision while preserving DOM-ready/canonical behavior.
   Once a structured type is selected, the delayed handler must not reclassify it
   from prose. Preserve book-title/book-author and distinguish book author from
   reviewer. Preserve existing event-review restrictions and unknown data.
5. Conflicting structured types need a conservative outcome and diagnosis, not
   arbitrary first-match priority. Use generic CreativeWork only when the work,
   review format and rating are actually supported; otherwise omit the specific
   Review and keep Article. Never create an Event from topic name alone or force
   Movie from the combined Film & Series section.
6. Preserve rating, content, reviewer, canonical, dates, media and design. Do not
   correct the type by rewriting article/meta copy. Treat the EN language issue
   as a separate editorial task. Install only a reviewed small diff against a
   fresh template read and coordinate the shared Webflow publication.

An optional dedicated nonlocalized `reviewed-work-type` enum could later simplify
ambiguous cross-media pieces, but adding a field and bulk-populating the archive
is unnecessary for the proven Street Fighter repair if both locale references
already establish Film. Do not make a new metadata writer for this.

## Required regression fixtures

Run the actual footer artifact, including both handlers, rather than testing only
the unrelated server schema builder. Use captured compact Article data plus
scoped structured taxonomy fixtures; do not import article bodies into tests.

| Fixture | Expected invariant |
| --- | --- |
| Street Fighter DA: actual current metadata + Film/Anmeldelser, rating 4 | Movie, Filmanmeldelse, exactly one Review |
| Street Fighter EN: actual `gaming` description + verified equivalent Film topic | Movie, Film review; unchanged 4/6/name/reviewer |
| Metadata permutation on the same Film reference: gaming, Xbox, Nintendo, “switch”, no film word, empty description | Type/label remain Movie; no metadata-driven change |
| Real Gaming reference with film/cinema/series mentioned in title or description | VideoGame in DA/EN; reverse precedence regression |
| TV-serier reference with film/gaming comparisons | TVSeries in DA/EN |
| Dedicated book title/author + film/game references in prose | Book; actual book author distinct from reviewer |
| Anmeldelser only + combined Film & Series section | No unjustified Movie/TVSeries/Game guess |
| Conflicting Film and Gaming topics without explicit reviewed-work type | Conservative diagnosed fallback, no arbitrary type selection |
| Unrated article, invalid/zero/>6 rating | No Review |
| Concert/festival review without verified event facts | Preserve current omission/restrictions; no fabricated Event |
| Footer navigation contains all topics but scoped article taxonomy contains Film | Navigation must not influence result |
| Existing Review marker / replay / locale canonical fix | No duplicates; one stable locale URL/id; preserved dates and label |
| Unresolved CMS token, quotes/HTML in bound values, unknown identity | No script interpolation/injection or guessed type |

Current evidence: the existing `test/webflow-review-footer.spec.ts` suite passes
**7/7** in isolated storage but contains no Street Fighter/cross-media collision
fixture. An ephemeral VM reproduction with the exact current public Article
inputs returns Movie/Filmanmeldelse for DA and VideoGame/Game review for EN,
matching Chromium. No test source or application code was changed in this audit.

## Release acceptance

Before any shared-template publish: verify actual DA/EN CMS topic references,
prove supported scoped binding and run the collision fixtures against the exact
candidate footer. After a coordinated release: inspect raw Article and actual
rendered Review on both Street Fighter pages plus game/series/book/unrated/event
controls; assert correct types, one Review at most, preserved labels/rating/dates
and no unrelated design/content changes. Check a normal metadata change cannot
alter the structured type. No deployment or public fix is claimed by this note.
