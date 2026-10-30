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

### Production verified, 30 October 2026, 10:38 Copenhagen

- Release 303730e524f845836320cdf4a7247c81caea109a, deployment
  dpl_4pgqpagoEgpVyxwhQszyAGc5zbFx READY with actual ai.aproposmagazine.com alias
  and exact Git SHA independently read back before the feature configuration write.
- Clean application-source TypeScript check passes with the existing configured
  exclusions preserved and untracked output excluded; the unrelated output script
  was not edited. Targeted tests/lint/security checks passed as above.
- In a Firestore transaction, confirmed auto-2026-W44 had not started, then saved
  newsletterWeeklyFeatures/2026-W44 with the selected book ID and owner-request
  attribution. There was no previous feature. No historical send record modified.
- Rebuilt a local no-AI HTML preview using current live CMS and saved selection.
  Book is first, hero src matches its cover, and hero link matches its article.
  Both source-based intro and article list start with the book. Five articles
  selected, no duplicate book. No CMS/article timestamps changed.
- Actual production GET /api/cron/newsletter-weekly?dryRun=1 returned HTTP200,
  dryRun=true, weekKey=2026-W44, book first, five articles, skipAiIntro=true.
  No withAi flag, claim, send or new AI generation. Schedule readback is unchanged:
  enabled, Friday 13:45 Europe/Copenhagen. Current send is still not_started.
- Existing manual-send-history queries emitted missing-composite-index warnings
  during local selection; their existing fallback behavior was retained. This
  release neither claims complete historical exclusion verification nor changes
  indexes/history to select the book. Production dry-run feature verification passed.

Evidence: output/newsletter-check-2026-10-30/book-feature-receipt.json and
book-feature-preview.html. No mail was sent by this task. Actual scheduled
delivery remains a later event, not established by the successful dry-run.
