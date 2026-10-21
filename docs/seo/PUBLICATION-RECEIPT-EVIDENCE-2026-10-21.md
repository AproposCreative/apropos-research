# Additive publication evidence — 21 October 2026

## Delivered code scope

The verification receipt now retains **`webflowLastPublishedAt`**, the actual
validated `lastPublished` returned by Webflow's live item read. It remains
separate from the verification's `checkedAt` and any requested/scheduled time.
This is an observation of the latest Webflow publication at that read, **not an
original or first-ever publication date**.

Four production files changed:

- `lib/liv/publish-verified.ts`: includes the provider value in the existing
  verified receipt after CMS identity/version and public text/image checks pass.
  The recovery verifier remains read-only. No CMS PATCH/publish was added.
- `lib/liv/delivery-policy.ts`: optional receipt field for new saved evidence;
  historical slots without the field remain valid and unchanged.
- `lib/liv/deliver-ready.ts`: persists the first observed provider value on the
  existing delivery slot before recording history. If history/finalization fails,
  later read-only reconciliation cannot overwrite that saved observation with a
  newer republish time. Existing archived delivery receipts retain the field
  through the unchanged slot archival mechanism.
- `lib/editorial/submission-publication.ts`: the ordinary main-row receipt keeps
  the value through its existing receipt spread. An immutable private receipt is
  also created under
  `editorialSubmissions/{submission}/publicationApprovals/{preparedHash}/receipts/{fieldDataHash}`.
  That path represents this exact approved publication, not every future
  publication of the article. Its first saved receipt is never overwritten on
  reconciliation. A later approved version has its own approval identity/history.

The journal transaction checks the current publish token, approved hash and
saved CMS field hash. A repeat with an existing receipt leaves it untouched;
it does not call a changed observed timestamp a failed publication. Failure to
save evidence retains the existing attempted-publication recovery path, which
uses reads rather than another publish. The main-row receipt can reflect a newer
verification while the earlier journal remains intact.

No planned-time contract, approval hash, publication cadence, authentication,
dependency, webhook, field mapping, CMS date, site sorting or public schema was
changed. The existing optional `publish-date` behavior was not repurposed as an
original-date field. The concurrent production writer's newer
`publishedTarget: { ...row.publishedTarget, ... }` preservation must survive
integration; the additive patch does not intentionally change that line.

## Why this is the safe boundary

A read-only production inventory at `2026-10-21T16:50:50.962Z` found:

| Existing evidence | Coverage returned | Date evidence available |
| --- | --- | --- |
| Published `editorialSubmissions` | 7 rows; query not truncated | All have verified public receipts with `checkedAt`; none stores actual Webflow `lastPublished` |
| Published Liv delivery slots/archived receipts | 16, 11–29 September | `checkedAt` and workflow day; no actual provider publication timestamp |
| Published `livDailyArticles` | 16 rows; query not truncated | Completion time; no `liveReceipt` provider timestamp |

The Barsel article's current submission receipt is from its 21 October
republication. A current main-row receipt is therefore not a dependable source
of its original publication date. These aggregate reads used existing approved
Firebase credentials in process; no credentials, private article bodies or
raw submission records were saved in this report.

Webflow's official publishing change documents that unpublishing resets
`lastPublished` to null. A null timestamp before a later publish is therefore
not sufficient evidence that an item has never been public. Neither CMS creation,
requested time nor a current last-published value is a valid automatic historic
backfill. See [Webflow's CMS publication state changes](https://developers.webflow.com/home/changelog/2025/6/23).

The broader public-data problem remains documented in
`PUBLICATION-DATE-REPAIR-2026-10-21.md`: native Article schema uses Created On,
whereas Topics dates and Featured sorting use mutable Published On. This small
code change preserves better future evidence; it does not claim those public
bindings or all historical dates are repaired.

## Verification and release status

Targeted isolated run: **5 files / 136 tests passed**:

- `test/liv-publish-verified.spec.ts`: actual provider time returned, distinct
  requested/creation dates, null draft does not manufacture first-publication
  fields, read-only recovery and existing content/image/hash guards preserved.
- `test/liv-delivery-worker.spec.ts`: saved evidence survives duplicate ticks
  and a history failure followed by reconciliation observing a later republish.
- `test/liv-delivery-policy.spec.ts` and `test/liv-delivery-store.spec.ts`:
  existing cadence, reserve, ownership and storage behavior remains covered.
- `test/submission-publication.spec.ts`: main-row evidence and immutable
  approved-version journal; repeat reconciliation does not overwrite the original
  saved observation and does not publish again.

`RAGE_STORAGE_DIR=./tmp/vitest-rage` was used. TypeScript `--noEmit --incremental
false` passed, and `git diff --check` passed. Existing dependencies were reused.
No real publication, CMS write or model call was made by this patch's tests.

At handoff this is **implemented and locally verified, not deployed or verified
on a new production publication**. The coordinating task owns integration on the
current Liv release. Accept live evidence only when an actual authorized future
publication or its existing recovery path stores the new provider field and
the matching immutable record. Do not publish an extra article to manufacture
proof, and do not relabel older `checkedAt` receipts as original dates.
