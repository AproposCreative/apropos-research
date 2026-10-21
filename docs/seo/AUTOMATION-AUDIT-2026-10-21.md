# SEO automation audit — 21 October 2026

Read-only application and runtime audit for the broader SEO/AEO/AI-visibility plan,
followed by a scoped configuration correction performed by the coordinating task.
No new claim, job, model call, CMS mutation, deployment or paid provider probe was
made. The coordinator saved and read back the existing cloud automation's prompt;
its daily time, identity and limits remain unchanged. This report and the adjacent
prompt note document that correction; the next natural run is not yet verified.

## Decision

The existing system should be repaired and extended, not replaced. It already
reviews filled metadata, can apply a justified change through ChatGPT without a
backend model call, and protects article content with versioned writes and public
readback. It is **not currently verified as a reliably completing daily service**:
the October 20 and 21 cloud runs stopped after a safely skipped stale candidate
even though their existing batches had more work.

The first repair is the consumer's skip/continue contract. The prompt correction
is now saved in the existing live automation; preserve the stale version guard.
Continue the same bounded batch after nonfatal skips; do not try to read an
unclaimed candidate as an owned review task. The next step is verification of a
naturally scheduled completed batch and its actual outcome. Good metadata must
remain good metadata; an artificial change is not an acceptable write-path
demonstration. **Live configuration corrected; unattended runtime repair not yet
verified.**

## Source and release boundary

- Audit checkout: `codex/geo-measurement-2026-10-20`, HEAD
  `97a4426ff5f5844b3a330e5a78e567a40a46a19c`.
- Fresh `git ls-remote origin refs/heads/main` returned
  `9d59320b4a8ce7470728530447a828630aca01ad`, dated September 11. It is an
  ancestor of this checkout, 539 commits behind it. Local `origin/main` is older
  still (`40909b56`, September 3). Neither is the current production baseline.
  No fetch/reset/rebase/deployment was attempted.
- Fresh Vercel MCP alias lookup returned READY production deployment
  `dpl_2ydaah5LBCyXZt3WLpdTP3xE2XtQ`, serving `ai.aproposmagazine.com`.
  This CLI deployment's MCP response did not expose a source SHA.
- The same deployment is independently recorded in
  `2cd04c07:docs/editorial/ONE-PREVIEW-PUBLICATION-2026-10-21.md` with source
  `d83f4019de8cb22995d6020b0ed0122d6fa002e1`. The main checkout's dated Liv
  observation also records this alias/SHA and `gitDirty1` metadata. This is
  release evidence, not a fresh certification that the entire uploaded tree was
  clean. A read-only Git comparison found no differences between that source and
  this checkout in `lib/seo-engine`, `app/api/seo-engine`, the SEO recovery route,
  Webflow webhook or `vercel.json`.
- Public `/api/health` returned `{"ok":true}`. That proves endpoint availability,
  not SEO queue health, analytics coverage or successful scheduled work.
- Local Next 16.3 route-handler and `after` documentation was read. No application
  code or dependency was changed; the unrelated `node_modules` link was preserved.

## What is implemented, and what is actually evidenced

| Capability | Implementation | Deployment / runtime evidence | Remaining distinction |
| --- | --- | --- | --- |
| Review after publication | Webflow webhook calls the shared hook for actual published locales; both filled and empty fields enter `publication_quality` | October 21 Barsel task has `source=webhook`, saved full article, keep decisions and public receipt | Queue admission is immediate; ChatGPT review is scheduled at 09:00, not guaranteed immediately after publication |
| Metadata-only safe write | Live/staged comparison, full non-SEO content hash, CMS lease, saved intent, per-field locks, cooldown, duplicate check, exact public metadata readback | Historical applied production receipts; current October 21 keep receipt re-read through MCP | Keep verifies review/readback, not a new CMS PATCH; end-to-end current write availability was not exercised |
| Google opportunity collection | Daily 06:15 UTC and Monday 06:30 UTC scans feed the same queue | October 6 documented 37 opportunities and one admitted review; October 14 natural scan documented 1,401 rows and 37 opportunities | These are dated observations, not today's counts and not counts of applied improvements |
| Google context in new article reviews | Separate GSC/GA4 statuses and dated metrics; no rows stays unknown; diagnostic refresh cannot change immutable proposal evidence | October 21 Barsel context includes HTTP 200 from both APIs with `no_rows` | This validates that article's successful read at 07:01Z; it is not complete property coverage or proof of zero traffic |
| ChatGPT-first processor | Owner-scoped claim/context/save/apply, no-paid boundary, legacy processor exclusion and resumable saved proposals | Fresh native workflow and task status work; October 20/21 cloud results exist | Daily runs occurred but did not complete their batches; runtime reliability remains open |
| Recovery and operational health | 15-minute recovery, discovery cursor, daily batch health, stalled review/readback warnings | Historical authenticated production/cron receipts; current code remains present | Monitor records/warns; it does not resume a stopped ChatGPT conversation or send an operational alert itself |
| Schema generation | Deterministic Article/WebPage/Review/Event builder, rating 1–6, known dates and entity IDs | Implementation/tests exist; October 20 public audit found Article-family markup on 428 article URLs | Generated SEO-engine JSON-LD is still `generated_not_published`; the public Webflow markup is a separate implementation |
| AI visibility measurement | Repeatable GA4 referral classification, public technical audit and fixed ten-question citation protocol | October 20 aggregate baseline and 513-URL technical audit are saved | Independent answer citations remain unmeasured; no measurement scheduler or per-change 28-day effect report is implemented |

Primary code: `lib/seo-engine/after-publish.ts`, `post-publish/{chat,chat-queue,
chat-health,jobs,policy,cms,discovery,google-context,performance}.ts`,
`opportunity-engine/{cron,engine}.ts`, `app/api/webhooks/webflow/route.ts` and
`vercel.json`. The inspected application hook has a production webhook caller;
separate direct Liv/Writer call-site coverage was not established. Do not count
supported `publish_app` source labels as proof of each publication route.

## P0: daily batches stop on recoverable candidate skips

Fresh cloud result evidence:

| Date | Existing task | Observed result |
| --- | --- | --- |
| October 20 | `8e793d96-cc34-8329-b7d4-fcbd7040a3e1`, “Apropos SEO – ChatGPT-first” | 0 changed, 0 kept; `article_changed`; follow-up `seo_chat_task_not_found`; stopped with `hasMore=true` |
| October 21 | `a24f4c8f-29f4-8321-8241-2ecaf947ad2e`, same title | 0 changed, 1 kept; another `article_changed`; stopped with `hasMore=true` |

Read-only MCP confirms the October 21 claimed task
`72a0f8eccff21c1671593d1a6631230bfe48b6f0f1ca5b2a552656df8773da25`
is `kept`, reason `no_unlocked_improvement`, with public receipt
`2026-10-21T07:02:15.057Z`. Its public URL is
https://www.aproposmagazine.com/articles/jeg-gik-paa-barsel-og-endte-i-en-religioes-uldsekt.
A fresh public GET at `2026-10-21T15:58:47.316964Z` returned HTTP 200 and matched
the saved title and description exactly. It did not rerun review or mutate a
receipt. Both saved Google reads returned HTTP 200/no_rows, with GSC period
September 21–October 18 and GA4 period September 23–October 20.

Read-only status attempts for the two skipped candidate IDs reproduced
`seo_chat_task_not_found`. That response is consistent with ownership protection:
`ownedJob` requires a `chatgpt-first` reservation belonging to this owner, whereas
skipped candidates have never become owned ChatGPT tasks. It is not evidence that
the entire queue or the Google connection is broken.

`claimSeoTasks` already marks an unclaimed changed candidate stale and advances
the batch's checked cursor. It inspects at most four candidates per call and
explicitly returns `hasMore` plus an instruction to repeat exactly the same
request ID/arguments. Its response nevertheless calls skipped identities
`taskId`, and its generic resume text mentions `get_seo_task` after a timeout.
That ambiguity contributes to treating a routine candidate skip as a fatal
owned-task failure. The coordinating task subsequently inspected the full current
schedule prompt in its UI. It already required the same request ID, at most three
claim calls and two tasks, but also says “Stop ved konkret versions-/rettigheds-/
datakonflikt og bevar arbejdet.” That broad stop conflicts with safely continuing
after a stale candidate skip. The minimal exact replacement and acceptance checks
are in `SEO-SCHEDULE-PROMPT-2026-10-21.md`. The coordinator saved that scoped
replacement and reopened the same task editor. Receipt
`SEO-SCHEDULE-RECEIPT-2026-10-21.json`, recorded `2026-10-21T16:02:48.009Z`,
contains exact before/after text and `savedMatches=true` (3,109 characters).
Screenshot: `output/seo/schedule-saved-2026-10-21.png`. Daily 09:00 is unchanged.
No manual run, extra claim/apply or CMS test write was used. The next natural
run and full batch completion remain pending; unattended verification stays false.

Recommended minimal repair:

1. Update the existing cloud instruction to distinguish fatal service/auth errors,
   unresolved writes and nonfatal skips. Continue after `article_changed`, stale
   evidence, cooldown and already-reviewed outcomes while `hasMore=true`.
2. Make the server/tool result unambiguous: skipped entries are candidate/job
   identities, not retrievable owned tasks; return a structured next action with
   the exact existing batch request. Preserve backwards compatibility if the field
   name is changed. Do not weaken `ownedJob` or rebase an old proposal silently.
3. Stop claiming once the same batch is full or exhausted. Keep the two-task and
   performance admission limits. After an uncertain apply, reconcile the same saved
   intent; never replace it with a fresh proposal or direct Webflow write.
4. Add a consumer/contract regression with more than four candidates: stale first
   candidate, an empty intermediate page and a later eligible article; same-request
   replay must complete without duplicate reviews or CMS writes. Retain distinct
   auth failure and pending-write cases that really must stop.
5. Verify a natural scheduled run through completion, including the no-change
   outcome when appropriate. Observe three consecutive complete daily batches as
   an operational acceptance target, with queue age and any editorial exceptions
   shown separately. This is a proposed SEO reliability criterion, not a claim
   that Liv's separate publication acceptance has been met.

The existing cap of three claim calls can inspect at most twelve candidate rows.
All twelve may be safely skipped, leaving `hasMore=true` and zero claimed tasks;
the two-task limit counts claimed tasks, not skips. The prompt repair must retain
the cap and report that outcome as an incomplete bounded batch. Do not create
another request ID to get around it. Acceptance requires the exact same request
ID/arguments across continuations, no status/save/apply calls on skipped IDs,
at most two unique tasks, and a settled result with public receipts where needed.
If that capacity repeatedly leaves eligible work behind, prioritize a separate
eligible-selection/queue-age improvement without removing safety gates or raising
the budget. Completing a prompt edit is not evidence of runtime batch completion.

## P1: close the remaining automation gaps

### Explicit service level and coverage

The current cloud schedule is daily at 09:00 Europe/Copenhagen; a batch admits
at most two tasks. Publication at 10:00 may therefore wait about 23 hours before
the next routine metadata review, longer with backlog or both language editions.
The code's two-performance-claims/day safeguard is separate from the cloud batch's
two-total-task limit. Neither should be increased without observing demand.

Expose queue age, oldest eligible publication, pending/performance counts,
completed/kept/applied/editorial-attention counts and last natural completed batch.
Define a realistic review deadline with the current capacity. Verify new article
enqueue for a real Liv, Writer and direct Webflow publication using the actual
published locale, event and resulting job, without manufacturing publications.
Discovery is a safety net for the last 72 hours, not proof that every old article
has been reviewed. Older archive work is deliberately bounded/manual.

### Editorial exceptions and locale

`needs_editor` is correctly visible as attention and is not a successful rewrite.
Define a concrete resolution owner/action for conflicting facts, language-edition
mismatch and source ambiguity. The documented Danish-body/English-locale case
must be rechecked before planning a translation or unpublishing it. Metadata-only
automation must not silently rewrite its whole article. No current status of that
particular October 14 exception was fetched here.

### Analytics learning and measurable outcomes

Performance admission requires complete comparable equal windows of at least
14 days, at least 200 impressions in each, evidence no older than three days,
and a 28-day cooldown. These safeguards are sound; missing data cannot justify
loosening them. At this traffic level many useful articles will receive
content-based quality review, not statistical performance rewriting.

Implement the still-missing 28-day post-change report on existing immutable
receipts: exact title/meta before/after, change date, GSC queries/clicks/
impressions/CTR/position, GA4 landing engagement and clear incomplete-data states.
Compare dates and seasonality; avoid attributing all change to metadata. This is
an outcome report, not model retraining or a claim of causal optimization.
Preserve article identity and distinguish search demand from a metadata defect.

## P1/P2: schema and AI visibility, without another writer

`webflow-adapter.ts` publishes only title and description. OG fields and JSON-LD
are explicitly `generated_not_published`; schema generation does not mean that
those generated values reach the live template. Audit the actual Webflow head and
footer before integrating anything, since the old Review runbook describes a
client-side injector and may no longer describe all current public markup.

Use one canonical schema source per entity/page, with automated assertions on
the resulting HTML: correct Article/Review type, real 1–6 rating, author identity,
publisher, canonical URL, language and preserved dates, with no duplicate or
conflicting nodes. The current `schemaAuthor(name, profile)` always emits Person;
it has no explicit human-versus-editorial-persona distinction. Do not reuse it to
invent a human profile for Liv or add generic Person markup to every author page.
Fix identity semantics before any shared-template rollout. Event dates/place
must remain verified input; no invented event schema to chase a score.

The October 20 audit's parsed JSON and Article-family presence are positive
structural evidence, not rich-result eligibility, all-field correctness or AI
recommendation evidence. Eight author pages lacking Person schema are an optional
semantic opportunity, not eight proven failures. Coordinate any shared Webflow
change and verify representative film, series, music, book/art, guide and persona
pages before widening scope.

Reuse `AI-VISIBILITY-MEASUREMENT.md`: a dated monthly GA4 AI-referral report and
the same independent ten-question citation panel per actually accessible answer
service. Record unavailable separately. The saved baseline is 27 identifiable
AI sessions versus 20 over completed 28-day periods, not all AI traffic or proof
of SEO uplift. No claim of being “leading” or reliably recommended by AI follows
from schema, llms.txt or a technical score.

The premium proposal's profile, press, sector introductions, editorial principles
and contextual links complement the program. They require factual/editorial
review and should not be converted into an automatic sitewide body rewrite.

## Verification performed and limits

- Read current implementation, delivery/ChatGPT/operations/Google docs, premium
  proposal, AI measurement method and dated baseline.
- Fresh native MCP workflow and three read-only task status requests; no task
  claims. Current workflow hash matches the October 14 delivery's documented
  `118b265516f253f6e9ce42faf49738d44d6c66308342e6976864ed4d3deeefe1`.
  `unattendedVerified=false` is a conservative static workflow field, not by itself
  a live scheduler diagnosis. Actual cloud receipts above are the stronger evidence.
- Fresh Vercel alias, application health and public Barsel metadata GETs.
- Narrow isolated Vitest run: **4 files / 56 tests passed** for ChatGPT claim/
  apply, operational health, Google context and CMS adapter. These are mocked
  service regressions, not proof of natural timer completion. Existing shared
  dependencies were used; no installation or broad build was necessary for this
  read-only audit. `RAGE_STORAGE_DIR=./tmp/vitest-rage` was enforced.
- No owner API session or active Firebase/GA4 credentials were available in this
  process. Only filenames under the known temporary measurement directory were
  inspected; no credentials were printed or copied. Current full queue size,
  health record, webhook registration, today's scan/admission totals and timer
  configuration were therefore not independently re-read from the database.
- No article was changed to manufacture evidence; no current Morningscore score,
  complete Google indexing coverage or independent AI citation rate is asserted.

## Recommended delivery order

1. Verify the saved skip/continue prompt correction through complete natural
   daily batches; make any further contract repair only if the observed result
   requires it.
2. Make queue coverage, age, exceptions and post-change results visible and dated.
3. Verify actual published schema, resolve persona identity and make template
   validation part of existing delivery checks.
4. Run a small evidence-selected editorial/internal-link pilot, preserving design,
   opinions, dates and Liv's every-other-day cadence.
5. Repeat the existing GA4/citation measurement method; decide further work from
   observed outcomes rather than promising perfect SEO or AI placement.

Before implementation, base the coordinated release on the verified current
production source and preserve concurrent Liv/UI/mail work. This older feature
branch is an audit location, not a production release candidate.
