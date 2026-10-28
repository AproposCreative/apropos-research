# Liv overdue alert: correct policy cause and handoff

## Observed incident

The owner received the 28 October 10:15 Copenhagen alert describing the failure
as an exhausted budget/call limit. Native production status at 09:20:40.454Z
reproduced `budget_limit`. Private production context at 09:20:43.909Z identified
the actual saved cause as `liv_cost_manual_writer_only`. The scheduled identity
`a5a277f4a2f45c91276baf0f5e6d80cf4981dcf3ab991f87a184d2178de1c41f` has no saved
submission, public URL or CMS item. The day is late, not finally missed before
20:00 Copenhagen. Next-ready and separate ready reserve are zero.

The retained Saveus topic is an old failed-run hint. It is not a completed or
approved review. The weekly overview already applied the owner's 27 October
reviews/guides remit; the email still presented the old hint as today's work.

## Cause and change

`decidePreparation` mapped every `liv_cost_*` failure to `budget_limit`, including
intentional policy stops, invalid cost context and uncertain ledger state.
Status, UI copy and email handoff inherited that false diagnosis. The handoff
also recommended creating a new chat and invoking the legacy retry endpoint.

- Separate `paid_automation_disabled` for the deliberate manual-Writer-only
  stop, `budget_limit` for documented monetary/call ceilings, and
  `cost_control_blocked` for other cost guards. Every one remains blocked.
  No automatic retry, alternative or reserve is authorized by renaming it.
- Update the shared status/UI explanation and email/preview projection
  (`2026-10-28-v2`). Expose closed blocker codes; never export raw exceptions.
- Apply the existing review/guide screen prospectively to unadmitted topics.
  Keep the old topic as explicitly historical context. Do not rewrite stored
  plans, checkpoints, CMS identities, attempted deliveries or publication history.
- Continue in the existing editorial chat through `get_workflow(liv)` and
  `get_liv_production_context`. Inspect private submissions before concluding
  all work is absent. Do not recommend the paid legacy retry for a policy stop.
- Make clear that ledger ceilings are not paid-Liv authorization and that an
  alert does not prove the ChatGPT cloud producer is running. Personal approvals,
  cadence, cost policy, provider holds and the publisher remain unchanged.

## Verification

250 targeted tests across 13 files pass, including the exact October 28 incident,
true money/call limits, unknown cost guards, reserve/alternative blocking, private
diagnostic filtering, old-plan versus fresh-run precedence, current remit versus
published history, owner-only preview, deadline/off-day handling and immutable
alert retries/deduplication. The first run exposed an overly broad test assertion
matching the legitimate Danish phrase “private submissioner”; the corrected
secret-specific regression and its suite passed. TypeScript and build security
configuration checks passed. All transports in the send tests are mocked.

Native pre-release evidence: `output/liv-alert-20261028-before.json`.
Production deployment/readback will be recorded below after release. No article,
new mail, generation, paid retry or approval was requested by this verification.

## Delivery remains incomplete

This change corrects reporting and recovery guidance; it does not produce the
missing article, resume the cloud producer or meet unattended-delivery acceptance.
The last known producer pause was reported, not independently verified scheduler
state. The next safe production step is to inspect that existing producer and
continue a concrete review/guide through ChatGPT-first with preserved identity,
sources, media and required personal version approval. Never backdate a slot or
count operator-assisted recovery as an unattended publication.
