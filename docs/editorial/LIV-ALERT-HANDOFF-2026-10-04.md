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

## Production release and readback

- URL: https://ai.aproposmagazine.com
- Target: production; framework: Next.js; status: READY with the actual alias.
- Code: `c3ae87a130ced87b47c5d09c97a7b9a366097480`.
- Deployment: `dpl_88FPXZTwnXKvuSCjD2ZihNQwzEGA`; build 92.736 seconds.
- Owner-authenticated preview verified at `2026-10-04T18:51:24Z`, HTTP 200,
  private/no-store, version `2026-10-04-v1`. Anonymous request rejected HTTP 401;
  route regression separately verifies non-owner 403 before data access.
- Real preview names **Dizzy Mizz Lizzy i Tivoli**, explicitly **only a planned
  topic**, not a completed article. It reports no article checkpoint, no CMS ID,
  missing registered cover/two body images/quality proof, and both the empty
  source-bank result and retained provider quota hold. It identifies
  `prepare-2026-10-04` and `reserve-2026-09-28` separately. Next due date is
  6 October, without a ready story; reserve 0/1.
- Provider revision 5 remains blocked; shared October still one call, zero
  usage-based estimated DKK, 1.214400 reserved and one unknown. The production
  verification asserted identical before/after budget and identical persisted
  4 October alert record. No paid calls, mail send/resend, publication or hold
  acknowledgement were performed by this verification.
- Error/fatal runtime scan restricted to this deployment, 18:50:45–18:51:40 UTC,
  returned no matching logs. This short scan is not a long-term reliability
  guarantee. Existing delivery checks/alerts remain scheduled; no new drain or
  monitoring service was installed.

The already received 20:00 mail cannot be changed. New alerts use this template;
previously accepted/uncertain mail payloads are deliberately retained. Production
content rendering is verified, not delivery of a new test email to the inbox.
