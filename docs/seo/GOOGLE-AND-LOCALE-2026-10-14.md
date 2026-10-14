# SEO: real Google context and honest locale diagnostics — 14 October 2026

## Scope and verified causes

Owner reported the morning ChatGPT SEO result: Kontrapunkt kept, Danielle
Dahlhus EN needs_editor, Google unknown for both. This repair reuses the current
queue, Google service account, MCP, immutable reviews and public receipts.
No new platform, paid model, job reset, translation job or publication.

1. Google was **not disconnected**. Authenticated production `/api/ga4/status`
   at 07:34:03Z returned HTTP 200 and a successful Data API report with **505
   active users over its last-seven-days window**. Direct Search Console reads
   succeeded. The natural 06:15 scan completed at 06:15:20.254Z, collected
   **1,401 rows** and considered 37 opportunities. Rows are not unique articles.
2. Publication-quality jobs previously stored `google.evidence/context=null`.
   Only performance jobs received Google evidence. The chat's “unknown” was
   therefore a missing review-context field, not a connection diagnosis.
3. The complete GSC window was **14 September–11 October**, with the existing
   three-day collection lag. These articles were published on 12 October.
   No returned rows for their exact URLs are not proof of zero traffic or an
   indexing fault. The new real read at 07:44:49–54Z found Kontrapunkt GA4
   **2 pageviews / 1 active user / 1 engaged session** in **16 September–13
   October**; Danielle EN returned no GA4 rows. Do not label the latter zero.
4. Danielle's public `/en/articles/danielle-dahlhus---det-ma-du-ikke-sige`
   really contains Danish prose/metadata despite English HTML locale/canonical.
   DA and EN returned HTTP 200. Automatic paid translation is disabled
   (`enabled=false`, `envDefault=false`) and stays disabled. SEO-only permission
   does not authorize rewriting or removing a whole language edition. Owner was
   asked once whether to prepare an English translation or retain only Danish;
   no response had been received when this evidence was recorded.
5. A terminal `needs_editor` item incorrectly left the daily batch “incomplete”
   after two hours. It is now settled **with editorial attention**, never counted
   as a verified publication or as a technical stalled-run failure.

## Implementation

- `post-publish/google-context.ts`: bounded, no-paid, exact canonical URL/host
  and locale-filtered GSC totals + up to ten sanitized queries and GA4 article
  metrics. Separate periods/statuses, finite metric validation, 20s timeouts,
  no redirects/retry loop. Query-request failure retains valid page totals.
  `available`, `no_rows`, `not_configured`, `access_denied`, `unavailable` are
  distinct. Missing/invalid metrics are not synthesized as zero.
- New publication-quality claims save the context once. Replayed claims/status
  calls do not fetch Google again. Performance jobs retain their existing
  comparable-evidence admission and daily limit; isolated article data never
  grants performance-change permission.
- Existing `get_seo_task` gains optional `refreshGoogle=true` for explicit
  diagnostics. Fresh data is returned **outside** the immutable review context;
  context/proposal hashes and receipts are preserved. Owner HTTP route matches
  the MCP contract, with owner auth/private-no-store unchanged.
- `language-check.ts`: conservative full-body Danish-function-word warning for
  EN pages. It is not a language certificate/fact check. Clear conflicts gate
  metadata application even if ChatGPT's recheck mistakenly accepts them. No
  automatic translation, slug/byline/rating/content mutation or new approval.
- Connection health now probes actual Google property data, not token minting
  alone. A configured Webflow credential is still described as configuration,
  not proof of write access or automatic execution.
- Canonical SEO workflow explains data lag, partial/absent data, full-language
  follow-up and short human-readable reports with links instead of raw task IDs.
  Existing cloud task/schedule unchanged. MCP release version **v28**.

## Preservation and tests

- Kontrapunkt task
  `a135e268fbe50a547cfc72ccbe73eed62e474fd1c12547d79c02f66efbf8f1fb`
  remains kept with its 07:03:41.236Z public receipt. No repeat apply/rewrite.
- Danielle EN task
  `11248a8165bc408404f6e1afd9265de870b128146986d2bf94e61f1cebcf1fec`
  remains needs_editor; the Danish original and all article fields are untouched.
- Full isolated Vitest: **384 files / 5,293 tests passed**. New regressions cover
  Google 403/timeout/invalid/no-row/zero responses, locale filtering, query
  failure, no duplicate reads on replay, ownership, immutable diagnostic refresh,
  language conflict preventing writes and settled-but-attention batch status.
- TypeScript, changed-file ESLint and build security config passed. Production
  dependency audit: **0 vulnerabilities**; development-only findings are not
  represented as fixed by this SEO change.
- Real Google integration before deployment: `output/google-context-live-predeploy.json`.
  Main checkout diagnosis: `output/seo-google-diagnostic-2026-10-14T07-34-08-389Z.json`.
- Diagnostic financial snapshot unchanged:
  `70342608df4fb60c0354d9e7a267429945cd76a69ba7a8c4687d180e675307a0`.
  October: one historical shared call, 0 DKK usage estimate, 1.2144 DKK reserved,
  one unresolved call, no image month row; provider hold true/revision 5.
  No numeric provider balance, subscription savings or SEO uplift is claimed.

## Release/live acceptance

Pending exact deployment and authenticated production readback. Passing tests
and pre-deploy Google reads do not establish the deployed MCP result or a future
unattended cloud run. Danielle's whole-language editorial decision remains open.
