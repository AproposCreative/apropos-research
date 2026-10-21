# Deterministic article review type

21 October 2026. Implementation and tests, followed by verified production release.

`docs/webflow-embeds/article-review-footer.html` now resolves type once from
explicit article-scoped taxonomy and dedicated book metadata. Headline,
description, keywords, broad section labels and global topic navigation cannot
change the resolved type. One deferred DOM-ready handler uses the same result
for JSON-LD and the localized visible review label.

## Binding contract

- The Designer supplies exactly one hidden `[data-apropos-review-metadata]`
  container containing the **current Article's Topics collection list**. Each
  bound topic slug is plain text in `[data-review-topic-slug]`. It is not a list
  of every topic in the site.
- The footer adds inert `template[data-apropos-primary-topic]` with a plain-text
  `topic:slug` reference binding. This is used only when the scoped list contains
  no recognized topic. The template reference must be checked in compiled staging
  output before release; an unresolved token supplies no classification.
- Verified topic slugs: `film`/`movies` → Movie; `serier`/`series` → TVSeries;
  `gaming` → VideoGame; `anmeldelser`/`reviews` → review format only;
  `koncerter`/`Concerts` → concert; `festival` → festival. Values are trimmed and
  compared exactly after lowercasing. No substring or prose matching remains.
- Existing inert book-title/book-author fields remain. A nonempty dedicated book
  title supplies Book evidence; the title prefix “Boganmeldelse:” alone does not.
  Book authors are distinct from the article reviewer. Conflicting specific types,
  including a book title plus a different medium, do not receive first-match
  priority.

A recognized work type with a valid existing 1–6 rating yields Review. An explicit
review-format topic with a work name and valid rating can yield CreativeWork when
the medium is missing or conflicting. Without either evidence, only Article
remains. A concert/festival topic always omits Review/Event markup, including mixed
work/event taxonomy; it retains the localized editorial review label for rated
articles. No event dates or locations are invented. Unrated/invalid ratings hide
the review label.

The hidden container receives `data-review-resolution` (`typed`, `generic-review`,
`missing-type`, `conflicting-types`, `event-omitted` or `event-type-conflict`) for
nonvisual diagnosis. No CSS, layout, imagery, prose, rating or byline is changed.
Canonical/locale repair and review-wrapper removal remain. Existing Review nodes
are updated without duplication, including nodes inside `@graph`; removing an
event Review does not remove its Article graph sibling.

## Verification

`RAGE_STORAGE_DIR=./tmp/vitest-rage node node_modules/vitest/vitest.mjs run test/webflow-review-footer.spec.ts`

**55/55 tests pass.** The actual artifact executes in a VM through DOMContentLoaded
and deferred callbacks. Fixtures cover captured Street Fighter DA/EN metadata,
SEO-word permutations, game/series controls in both locales, separate book authors,
review-only/broad-section fallback, conflicting types, event omission, global
navigation isolation, primary-topic fallback, unresolved/hostile-looking plain
text, invalid ratings, replay, canonical URLs and graph preservation.

Shared-release acceptance is recorded in
`REVIEW-TYPE-RELEASE-CHECK-2026-10-21.md`: actual Designer binding and exact compiled
footer verified on 438 article pages, all 524 production paths matching approved
staging, unchanged ratings and Book metadata, plus live browser controls for film,
game, series, book, generic review and event omission. The scoped repair is now
verified live; these checks do not claim unrelated SEO completeness.
