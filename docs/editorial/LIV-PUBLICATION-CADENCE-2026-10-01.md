# Liv: every other day from 2 October 2026

## Owner request and calendar

On 1 October the owner explicitly reduced Liv stories to every other day because
daily volume and cost were too high. The new policy takes effect today, with the
first scheduled publication **2 October 2026, 10:00 Europe/Copenhagen**, then
4, 6, 8 October. Use continuous calendar-day parity from that anchor, not a cron
day-of-month `*/2` rule, weekdays or elapsed 48-hour intervals. Thus 30 October
is followed by 1 November; publication stays at 10:00 across winter time.
There are 15 scheduled publication dates in October. This is not a promise that
provider charges fall by exactly half: failed work, reserves and other tools
have costs of their own.

## Bounded preparation and preserved work

- One shared policy controls the automatic publisher (including the legacy
  path), transaction selection, preparation, reserve scheduling, weekly view,
  operations and missing-publication alarms.
- Prepare only an unfilled due-today slot and the next publication date. On an
  off day, prepare the next due date only, not a separate daily article.
- Retain one durable reserve. No new reserve identity merely because time passed.
- Old plan rows, paid text, media, receipts, failed runs and reservations stay
  intact. Do not rewrite or discard them to align the calendar.
- Off days show as `Udgivelsesfri`, without new missing-publication alarms.
  Previously uncertain external writes still reconcile; verified history remains
  visible. A separately explicit owner publication is not an automatic run.
- Scheduled Vercel checks remain frequent for status/reconciliation. They do not
  imply paid generation on each invocation or each calendar day.
- Budgets, provider hold, editorial safeguards and Instagram-off are unchanged.

## Verification

Local isolated regression: **313 files, 4,353 tests passed** on 1 October.
TypeScript and focused ESLint passed. Tests cover month/year boundaries, Danish
midnight, DST, due/off-day preparation, reserve reuse, transaction enforcement,
ambiguous CMS readback, honest weekly states and due-day alarms. AI responses
were simulated; no paid test generation was requested.

### Production readback — 1 October, 10:28 Copenhagen

- Release `fbd1c26463b80fa0eeb9dd76b2280bff2a55a7ae`, deployment
  `dpl_EQQq5y7jVFKjkXWVanfc9EUV6nn6`: READY and assigned to
  `ai.aproposmagazine.com`. Vercel runtime ties all five checks below to this SHA.
- Authenticated operations and feed returned 200/private/no-store on the real
  production origin. Interval is 2, today is `off_day`, `overdue=false`, next
  date is `2026-10-02`. Week has due dates 2/4/6 and off days 1/3/5/7 October.
- An operator-started request to the production delivery route at `08:28:26Z`
  returned `{status:"off_day",day:"2026-10-01",nextDay:"2026-10-02"}`. It did
  not publish. This check is not an unattended-publication acceptance result.
- Registered cost totals were identical before and after: one October call,
  0 DKK usage-based estimate, 1.214400 DKK reserved, one unknown. No preparation
  or paid test request was made. Provider remains blocked at revision 5.
- Ready stock is still zero and reserve 0/1. The next plan is an old Thirst Trap
  brief with `skipped_no_topic` history; later visible briefs are likewise not
  finished or newly verified. Current-source/duplicate checks remain necessary
  before any future paid recovery. No existing brief or paid work was erased.
- The existing follow-up automation was updated in place to the new cadence,
  next-publication readiness and three consecutive scheduled deliveries. It
  still checks preparation/status, quietly when unchanged; it must not buy daily
  inventory or report off days as publication failures.

Passing tests, this off-day response and a READY deployment are not proof that
the next scheduled article will publish while provider credits remain blocked.

## Remaining delivery dependency (not resolved by this change)

At the 1 October morning observation the provider rejected research with HTTP
429 `credit_balance_exhausted` / `insufficient_quota`. The provider hold is true,
revision 5. October has one registered call, zero usage-based estimated DKK and
1.214400 DKK reserved, with one unknown outcome. No numeric live provider balance
was read. No ready next article or reserve existed. Keep the hold until fresh
evidence of credit recovery; never buy a test call merely to demonstrate activity.

The broader acceptance is now three consecutive **scheduled** publications with
unassisted preparation, a ready next-publication story, a separate ready reserve
and a usable seven-day overview. The previous daily objective is superseded
prospectively, not retroactively declared successful.
