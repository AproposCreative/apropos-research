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

At implementation handoff this was **implemented and locally verified, not yet
deployed or verified on a new production publication**. The coordinating task owns integration on the
current Liv release. Accept live evidence only when an actual authorized future
publication or its existing recovery path stores the new provider field and
the matching immutable record. Do not publish an extra article to manufacture
proof, and do not relabel older `checkedAt` receipts as original dates.

## Production rollout and authenticated read checks

The coordinator integrated the additive patch on the current Liv release in the
separate `seo-publication-evidence` worktree and promoted it. A fresh Vercel
canonical alias/deployment read at `2026-10-21T17:06:22.660Z` independently confirmed:

- Canonical application: `https://ai.aproposmagazine.com`.
- Deployment: `dpl_65R9f3KxEgBXmj8TT3cRHeiDqk8x`, `READY`.
- Source: `290545ec5a7ce4967d670453a8353de4e0e55dea`.

The release branch is `codex/seo-publication-evidence-2026-10-21`, based on
the latest coordinated Liv commit `afcc25dc` and its production code
`0d117672f9a7b8c1c9089e8cbf825e66ff14a709`. The integration retained the
newer `publishedTarget` spread. Its isolated integration run passed 126 tests
across publication verification, delivery, submission targets and accreditation,
as well as TypeScript, scoped lint, the build-configuration security check and
Vercel's production build. Dependencies and deployment configuration were not
changed. Existing dependency audit warnings remain a separate maintenance item.

The deployment was built with production settings without initially assigning
the custom domain. Before promotion, the canonical alias still matched the
coordinated `0d117672` release; after promotion it matched `290545ec` above.
Both the staged deployment and canonical production returned `200` from
`/api/health` and `401` from an unauthenticated `/api/editorial/submissions`.
The checks did not bypass application authentication or expose credentials.

After the coordinator's promotion signal, three supported authenticated native
MCP reads succeeded against the canonical application:

1. `get_workflow(seo)`: unchanged workflow hash
   `118b265516f253f6e9ce42faf49738d44d6c66308342e6976864ed4d3deeefe1`,
   zero paid AI calls, `unattendedVerified=false`.
2. `get_seo_task` for the existing Barsel keep: still `kept`, same context hash
   and `07:02:15.057Z` public receipt, `writeStartedAt=null`. No Google refresh.
3. `get_submission_status` for the existing published Barsel submission:
   revision 10, still published, same `07:36:00.371Z` saved receipt,
   `preparationStarted=false`. Its old receipt correctly lacks the new optional
   provider field; this read did not manufacture or backfill evidence.

Independent read-only Firestore comparison against the pre-promotion baseline
at `17:04:37.647Z` confirmed that all four business-record hashes were unchanged:

| Record | SHA-256 of canonical saved record, before = after |
| --- | --- |
| Existing daily SEO batch | `cc6eb4894616fc5b61293abc93a7502a3677be280d2a07277b2bdfcd3c424e1d` |
| Existing kept SEO task | `b68c16276bd22bef81e5ba461e655f4830881aa8c7427cca42a75006c3769d9c` |
| Published Barsel submission | `d8303ee5b2ecb4f09963dd0cc714cc987103250c3b6738e0a1afeed9c961d3c5` |
| Its saved publication receipt | `5cae8ccf252d8726e9e52148003921d005c90e114306c6420b8c1a8ac1731c04` |

The legacy submission's new journal remains empty, as expected: reading an old
receipt must not create a new verified publication record. Today's claim count
remained exactly three, all from the already documented natural/assisted batch;
no additional claim or review occurred during rollout checks. The local read-only
health evaluator against production Firestore returned `completed`, one completed
task and no current-day issues at `17:06:21.521Z`; previous-day attention was
preserved. This evaluator result is distinct from an authenticated deployed HTTP
quality endpoint check, which was not performed without an existing owner session.

The native connector's ordinary read-operation audit is expected. No CMS write,
publish, proposal save/apply, reconciliation mutation, new application session,
paid model call or manufactured article was used. Existing approved credentials
were loaded in process only for the bounded database/alias reads. A local missing
`tsx` dependency in the isolated release checkout was handled by reusing the
existing audit-checkout runtime; nothing was installed or changed in the release.

**Current acceptance:** deployed and authenticated existing-flow compatibility
verified. The new provider field and immutable journal on a newly authorized
production publication remain unverified until that publication naturally occurs.
This release and the operator-assisted SEO completion do not establish unattended
SEO operation, first-ever publication dates or repaired historical date bindings.
