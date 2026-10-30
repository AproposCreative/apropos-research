# Weekly newsletter feature: Nogen der kender nogen

Owner explicitly selected the book review as the top feature of today's weekly
newsletter. Selection applies only to Copenhagen send week 2026-W44, not future
weeks, historical previews, article dates or the site's editorial ordering.

Article: 6ae1f9da0e01d3d2ff34859f, “Boganmeldelse: Nogen der kender nogen”.
Targeted Webflow live read returned 200, published/non-draft/non-archived with
cover. This task does not update the article or publish/send any newsletter early.

## Implementation

`newsletterWeeklyFeatures/{Copenhagen send-week}` is a server-owned optional
document with articleId. Shared weekly preparation reads the selection for the
current automatic content window, resolves that exact live CMS item, places it
first and removes duplicates while keeping the eight-article cap. Owner selection
overrides previous-lead demotion/exclusion only for that item. Other articles
retain their selection/order. Hero image/link, first article and source summary
all receive the same reordered list. Historical previews ignore this override.

Missing/invalid/unpublished/archived/unreadable selected items fail closed instead
of silently replacing the requested feature. No new public API or client write
permissions. No AI generation, budget change or change to the 13:45 Friday schedule.
The separate requested AI-written intro remains unresolved; this selects the book
without pretending the excerpt-based summary is AI-written.

## Checks and release

12 focused tests pass: week scoping, dedupe/order/cap, excluded/previous-lead
override, hero/first article/intro agreement, no-choice and historical behavior,
invalid/missing item blocking, existing summary behavior. Focused ESLint and build
configuration security check pass. Full checkout TypeScript encounters an
unrelated untracked output/ringo-bio-publish-20261028.ts error; clean-source
TypeScript verification and production release/readback are tracked below.

Production choice/readback and deployment receipt will be appended after release.
