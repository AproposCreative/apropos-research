# SEO queue recovery, 5 November 2026

## Delivery objective

Correct TONY's public metadata and remove the rejected-proposal loop that consumed
the ChatGPT SEO task's limited daily capacity. Preserve article copy, editorial
headlines, CMS identities, Liv, existing audit history and provider budgets.

Acceptance distinguishes implementation, production deployment, public metadata
readback and a subsequently observed unattended cloud run.

## Evidence and cause

- TONY's Danish publication job entered the queue at about 07:01 Copenhagen time.
  It had not been claimed when the owner reported the inadequate title/meta.
- A Spider-Man proposal saved on 30 October contained a forbidden review dash.
  Save validation accepted it, CMS prewrite validation rejected it, and the immutable
  proposal repeatedly re-entered the queue. The two-job daily batch repeatedly
  resumed that same unwritten proposal.
- Danish and English versions consume separate reviews. Batch completion was not
  proof that all recent publications were reviewed.
- The existing processor is intentionally ChatGPT-first. This repair does not
  restore paid backend SEO models.

## Implemented repair

- Share review typography validation across proposal save, apply and CMS prewrite.
- Separate deterministic prewrite rejection from uncertain writes. Uncertain writes
  retain readback-only recovery; rejected proposals require an explicit revision.
- Add owner-only `revise_seo_review` and `get_seo_health`, also available through the
  authenticated owner SEO route. A revision is bound to the old proposal and full
  context, requires fresh CMS state, preserves old proposal/recheck/error, refuses
  active/pending writes and requires a new explicit recheck before apply.
- Recheck the proposal again after transactional claim so a concurrent revision
  cannot be overwritten by an apply using an earlier read.
- Prevent an unwritten technical rejection from starting a performance cooldown.
- Keep rejected proposals out of ordinary selection; prioritize publication events
  over archive work and abandoned reviews while reconciling uncertain writes first.
- Report overdue publication reviews, required revisions and bounded/partial scans.
  Aggregate actual batches without treating optional empty continuation batches as
  missing scheduled runs.
- Continue past previously checked candidates across the same bounded run, while
  retaining unfinished owned reviews and uncertain-write recovery.
- Provide stable Copenhagen request IDs for at most four two-job batches per run.
  Daily performance budget remains two. No changes to auth scope, Liv cadence,
  article text, images or Instagram activation.

## Release prerequisites

Production dependency audit found existing high/critical advisories. A separate
commit updates Next and matching tooling to 16.4.5, Zod to 4.6.6 and the required
body-parser, follow-redirects, undici and qs overrides. `npm ci --ignore-scripts`
was used. The resulting audit has zero high/critical and 11 existing moderate
findings. Two small existing JSX/memo compatibility fixes preserve rendered UI.

Validation receipts are recorded during release. The full baseline suite has one
known failure in `test/provider-boundary-architecture.spec.ts`: the unchanged
SoMe `shorten-subtitle` route imports the SDK directly despite its separate 10 DKK
reservation, provider hold, no-paid-call guard and zero retries. Both the route
and architecture test are identical to the base production release. Do not claim
the entire suite passed or weaken that test to hide this separate migration.

## Public metadata correction

TONY was corrected through claim/save/recheck/apply, with public readback at
2026-11-05T10:52:39.761Z:

- URL: https://www.aproposmagazine.com/articles/tony
- Title: Tony anmeldelse: Anthony Bourdains vej ind i køkkenet
- Description: Dominic Sessa og Antonio Banderas imponerer i Matt Johnsons film om
  den unge Anthony Bourdain. Læs vores anmeldelse af Tony, der får 5 af 6 stjerner.
- Non-SEO content hash before/after:
  `2d1ad8d9e7e8ec3b029c965b340eb1bd2c5e5e0148e220c499becaf7edaff305`.

## Cloud timer: activation remains a separate verification

Existing task: `6acb8f8eaaa88190b605cf30ca98e982`, Apropos SEO – ChatGPT-first.
Desired schedule: 09, 13, 17 and 21 Europe/Copenhagen, bounded to eight reviews
per run using `get_workflow(workflow="seo")` and its runContext request IDs.

At implementation time the schedule UI requires the owner's ChatGPT login.
Do not create a duplicate local automation, claim that deployment changed the
timer, or write `seoPostPublishControl/chat-schedule` as verified before observing
the existing cloud task's saved schedule. Until then health correctly expects the
existing daily 09 run. No timer-origin or unattended-success claim is warranted
from a manual repair or deployment receipt.

After login, update the same task's schedule/prompt, verify the saved UI, record
its actual effective day and verification time, then observe a real scheduled run.

## Release/readback checklist

- [x] TONY public metadata and unchanged non-SEO content verified.
- [x] Isolated code and minimal dependency prerequisites implemented.
- [x] Validation: 6,201 tests passed; the one unchanged SoMe architecture baseline
      failure described above remains. TypeScript passed. Full ESLint: zero errors,
      nine existing warnings; changed-file lint passed. Dependency/config security
      checks passed. MCP widget mobile/desktop normal, lost-ack, rejected and broken
      image scenarios passed with zero external requests/publications/paid AI calls.
- [ ] Push and deploy exact tested release; verify production alias/SHA.
- [ ] Recover Spider-Man through the production revision API and read back public
      metadata, preserved content and immutable revision history.
- [ ] Verify production health/tools and record remaining queue separately.
- [ ] Change and verify the existing cloud schedule after login.
- [ ] Observe unattended scheduled execution; manual checks do not satisfy this.
