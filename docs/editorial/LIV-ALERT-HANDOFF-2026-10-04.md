# Liv delivery emails: actionable handoff

Owner requested enough information in delivery emails to hand the incident to
a new ChatGPT chat. This changes notification content, not publishing authority,
budgets, preparation admission or provider holds.

## Implemented

- Subject identifies the article/topic as well as the date and outcome.
- A short status explains whether the title is a queued article, saved draft,
  candidate or only an unverified plan. Unknown is not reported as missing.
- Closed, human-readable blocker explanations and corresponding recovery steps.
- Saved text checkpoint, media placements, missing assets/checks, CMS identity,
  relevant primary/alternative/reserve run IDs and retained writer pointer.
  Reserve records never supply the scheduled article's title or failed gates.
- Snapshot timestamp, next scheduled date/reserve readiness, recorded monthly
  estimates, unknown reservations and provider-hold timestamp/revision. No claim
  to know the provider balance or billed amount.
- A self-contained copy-to-ChatGPT section with repository, record locations,
  authenticated read endpoints, safe resume path and existing spending/editorial
  constraints. It explicitly asks the next chat to refresh state and obtain
  authorized project access rather than guess or request secret keys.
- Owner-only `GET /api/liv/delivery/alert-preview?day=YYYY-MM-DD` renders the same
  current snapshot without sending an email, generating content or writing CMS.
  Due dates only; private/no-store; rejects non-owner access before reading data.

The snapshot uses bounded saved-record reads and existing cost/hold summaries.
No model call, paid research, image call or full CMS scan is added to mail sending.
Ordinary cron polls do not load the new context. Existing accepted notifications
are not resent; ambiguous notifications retain their exact payload and provider
idempotency key, including legacy payloads. Existing alert timings are unchanged.
Provider exceptions, source snippets, prompts, credentials and signed links are
not exported. Snapshot/read failure falls back to explicit unknown status.

## Verification

- 318 test files / 4,410 isolated tests passed with
  `RAGE_STORAGE_DIR=./tmp/vitest-rage`; 30 focused alert tests.
- TypeScript, focused production ESLint, safe build configuration and whitespace
  checks passed. No dependency changes or paid test calls.
- Regression covers content, plan/ready distinction, partial media, failed gates,
  selected reserve isolation, provider/budget distinction, secret-free exports,
  read failure, correct dates, owner access, simultaneous notifications, legacy
  ambiguous payload preservation and unchanged retry-window behavior.

Production verification is recorded below after deployment. This release does
not resolve the existing provider block or satisfy unattended delivery acceptance.
