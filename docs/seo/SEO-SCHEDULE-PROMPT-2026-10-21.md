# Minimal SEO schedule prompt correction — 21 October 2026

Target: the existing “Apropos SEO – ChatGPT-first” cloud automation. The coordinator
saved this scoped correction and reopened the task editor to verify it. No new
automation, time/frequency change, increased limit or application-code change is
part of the correction. **Live configuration corrected; the next natural run is
not yet verified.**

## Verified conflict

The coordinating agent inspected the current full prompt in the schedule UI.
It already specifies at most three claim calls, the same request ID and a
two-task limit, but also says:

> Stop ved konkret versions-/rettigheds-/datakonflikt og bevar arbejdet.

The October 20/21 runtime results show the consumer applying this stop too broadly
to `article_changed` in a claim's skipped candidates while `hasMore=true`.
The read-only task-history interface exposes only those final results; an attempt
to read the scheduler ID as a thread did not resolve. The full prompt is therefore
not reconstructed from thread history here. Only the sentence above was replaced
with the paragraph below, preserving the remaining prompt, schedule and permissions.
The exact full before/after prompt is retained in
`SEO-SCHEDULE-RECEIPT-2026-10-21.json`.

## Replacement paragraph

Skeln mellem en sprunget kandidat og en konflikt i en opgave, du faktisk har
overtaget. `article_changed` i `claim_seo_tasks.skipped` er et sikkert skip af en
forældet kandidat og må ikke stoppe hele kørslen. Brug kun `get_seo_task`,
`save_seo_review` og `apply_seo_review` på opgaver returneret i `tasks` for dette
requestId; slå aldrig en identitet fra `skipped` op som en overtaget opgave.
Hvis `hasMore=true`, gentag claim med præcis samme requestId og argumenter inden
for de eksisterende højst tre claim-kald og højst to opgaver. Er grænsen nået med
`hasMore=true`, rapportér kørslen som afgrænset og batchen som uafsluttet. Ved
versions- eller datakonflikt i en overtaget opgave: bevar den, undlad nyt
forslag/omskrivning og fortsæt kun andre uafhængige opgaver, som allerede er
overtaget, hvis det eksisterende workflow tillader det. Ved uklar CMS-skrivning
følges kun det eksisterende readback-forløb for samme gemte input. Rettigheds-/
autentificeringsfejl eller provider-/budgethold stopper ændringer; ingen omgåelse,
betalt retry, nye requestId'er eller forhøjede grænser.

## Capacity and cost boundary

Three claim calls do **not** guarantee two reviews or exhaustion of the batch.
`claimSeoTasks` inspects at most four candidate rows per call. Twelve skipped
candidates can consume all three calls without claiming an article; a later
eligible candidate can remain unexamined. Skips do not count against the two-task
limit. Replayed claims return already claimed tasks, so consumers must count
unique task identities and preserve existing saved proposals/receipts.

Maintain the existing three-call/two-task ceiling. This correction removes an
unnecessary early stop; it does not increase the allowed maximum. More complete
use of the already allowed calls may still consume more subscription tokens and
ordinary Google/Webflow/Firestore work than an erroneous first-call stop. No
exact cost saving or cost invariance is claimed. No new paid backend model call,
provider unhold or budget increase is authorized by this paragraph.

For predictable completion without a larger limit, separately improve eligible
candidate selection so known cooldown/lock/terminal cases do not crowd out work,
while retaining the final fresh article/version/evidence checks. Observe queue
age and real arrival rate first. Stale candidates are marked terminal by the
existing claim implementation; other skips such as cooldown can remain active
and recur. Do not solve that by deleting history, lifting locks or changing good
metadata. A bounded run may be healthy in its safety behavior and still leave
the service's delivery objective unmet.

## Acceptance after the existing schedule is saved

1. **Completed:** coordinator reopened the same task editor after saving; exact
   prompt readback matched (3,109 characters). Receipt recorded
   `2026-10-21T16:02:48.009Z`, `savedMatches=true`; screenshot
   `output/seo/schedule-saved-2026-10-21.png`. The conflicting sentence was replaced;
   daily 09:00, the existing automation identity and limits are unchanged.
2. At the next naturally scheduled run, preserve one `apropos-seo-YYYY-MM-DD`
   request ID based on Europe/Copenhagen and the original arguments. At most
   three claim calls and two unique claimed tasks; no alternate request to bypass
   the cap. Use the workflow's full-context read and saved-proposal recheck rules.
3. A stale skipped candidate followed by `hasMore=true` must cause another
   same-request claim when a call remains. No `get_seo_task` is made for skipped
   identities. Already completed returned tasks retain their existing receipts.
4. Final report distinguishes applied, kept, editorial attention, safe skips,
   blocked access, and budget-bounded incomplete batch. `hasMore=true` at the
   cap is explicitly incomplete, not a successful full batch. `hasMore=false`
   alone is also insufficient if a claimed task is unresolved.
5. Claim batch completion only when its claim selection is full/exhausted and
   every returned task is settled. Applied/kept require their public receipt;
   `needs_editor` is settled with attention, not verified live improvement.
6. Record actual natural-run evidence before claiming the runtime repair is
   verified. No extra review or metadata change is run merely for demonstration.

Items 2–6 remain to be observed after the next natural run. No manual run, new
claim/apply or live write test was performed; unattended verification remains false.

Code basis: `lib/seo-engine/post-publish/chat.ts`, `chat-contract.ts`,
`chat-health.ts`, and `chat-queue.ts`. Audit and observed production IDs are in
`AUTOMATION-AUDIT-2026-10-21.md`.
