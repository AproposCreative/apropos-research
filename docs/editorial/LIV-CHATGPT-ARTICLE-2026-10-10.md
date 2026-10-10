# Liv ChatGPT-first: 10 October article continuation

## Saved article, not a publication

On 10 October the owner requested completion of the missed day's article. The
existing cloud-created submission was resumed, not recreated:

- Submission `9cb959c7798307f33d43f81ce05a55b1748fec8d3f44d9c811c00eee08a2d011`.
- Production identity `scheduled/2026-10-10`; stable request `liv-scheduled-2026-10-10`.
- Revision 5, content hash `3de048059d96a35fa9a9d6fa49b965232e88e647ba1c8a413a77b7bd46a4d42c`.
- Title: **Somebody Somewhere: Venskab er ikke en trøstepræmie**.
- 608-word culture commentary; Liv Brandt; no review rating. SEO and current CMS
  topic IDs are saved. Original submission and earlier revisions remain.
- The broad contemporary-TV-trend premise was narrowed to the evidenced series.
  The series' 2024 ending is explicit; this is not fabricated 2026 release news.
- No CMS item or personal preparation/publication approval yet. This assisted
  recovery cannot count as on-time or unattended 10 October delivery.

## Source review

Read in full and added to existing research notes, with attribution, dates and
limitations (retrieval `2026-10-10T18:15:11.646Z`):

1. [James Kleinmann interviews Hannah Bos and Paul Thureen, 25 October 2024](https://thequeerreview.com/2024/10/25/interview-somebody-somewhere-creators-hannah-bos-and-paul-thureen-on-the-final-season-of-their-hbo-comedy-series/amp/).
   Supports creators' stated friendship focus and reciprocal Sam/Joel support.
   These are attributed intentions, not an independent review or industry trend.
2. [NPR/WLRN Bridget Everett interview, 5 December 2024](https://www.wlrn.org/npr-breaking-news/2024-12-05/bridget-everett-on-somebody-somewhere-series-finale-and-not-giving-up-on-yourself).
   Supports premise, Kansas/homecoming, Joel, final season and 8 December 2024 finale.

Older stored sources are preserved with caveats. WBD direct requests returned
403; no new complete read was claimed. Prime's available page used German copy/
CHF and does not establish Danish availability. No invented viewing, quotations
or scene-level assertions were added. Revision 5 corrects the relevant creator
attribution to Paul Thureen. Existing evidence is reused rather than re-purchased.

## Real media attempt and exact resume point

Three distinct 1920×1280 credited season-three stills were retrieved from the
interview's actual image URLs. Credit: **Foto: Sandy Morris/HBO**. Rights status
remains unknown; attribution is not a licensing claim. The selected cover has
no visible title/logo lettering. Body images are separate from the cover.
Originals are retained locally under `output/liv-2026-10-10-press/` (not committed).

| Role | Original filename on `i0.wp.com/thequeerreview.com/wp-content/uploads/2024/10/` | Bytes | SHA256 |
| --- | --- | ---: | --- |
| cover | `bridget-everett-jeff-hiller-1.jpg?w=1920&ssl=1` | 1427198 | `6d97f2e3e8064f3236b68fc6ead7d3f6b9e7f4492e114d189855f2c4ede14e65` |
| body-1 | `bridgett-everett-jeff-hiller-murray-hill.jpg?w=1920&ssl=1` | 1597554 | `f8b67a0b1797bdbda11f6541b2d34d3297322337b82c9a7a17433a4ecaf9ceee` |
| body-2 | `jeff-hiller-bridget-everett.jpg?w=1920&ssl=1` | 1329936 | `d68e59c5ea248f95af8c290de13ce52441ebdd9805f3e7e831fc354931b80d31` |

The real native MCP cover upload used request `liv-2026-10-10-press-cover-v1`,
expected revision 5. Original bytes reached Apropos storage; the Webflow step
returned `mcp_submission_webflow_asset_access_required`, HTTP 403,
stage `cms_asset_access`. Status readback at 18:16:44Z confirms retained asset
`0defc674e880a20d8c962361c3dd88d47f5c94d346d260ade34c1d6457bed665`,
`allocation_blocked`, `originalPreserved=true`, no CMS asset, not ready.
No repeat upload, direct Webflow bypass, generation, or fallback followed.

Required external change: production service credential must have `assets:read`
and `assets:write`. Browser action-time confirmation for the prepared credential
expansion remains pending; blanket delivery authorization is not that confirmation.
After the actual change, inspect scopes, read fresh submission/media receipts,
resume the same retained import idempotently, then import the two saved originals
against fresh section IDs. Current candidates: body-1 after premise section
`073504cb831d89cc48588a699403e8fe84e436af668090ef17563461f73b2cfe`;
body-2 after partner paragraph
`41c8fd4633a7a6457980b942a5c292a96652331576b9d71b72854109b11d8550`.
Recheck sections/revision before attaching. Show exact preview, obtain personal
preparation then publication confirmation, and verify CMS/public readback.

## Small workflow release: v18

- Existing production-context service now returns target date, preparation date,
  phase and state-specific next actions. Daily 08:00 cloud preparation is the day
  before the anchored publication date, including off days. Publication-day runs
  verify/reuse existing work, never silently rewrite a scheduled/approved version.
- Existing workflow adds claim/source/date/uncertainty notes, at most two targeted
  review rounds, current CMS IDs and continued safe text work under media failure.
- Preview read timestamps and widget revision/status guards prevent old/duplicate
  host responses from restoring stale content or consumed confirmation controls.
  This does not replace server-side revision and personal-confirmation checks.
- No added database, paid provider, budget change, old cron retirement, hold reset
  or public article write. Existing unattended acceptance is not silently relaxed.

Local verification: **365 files / 5072 tests passed**, isolated with
`RAGE_STORAGE_DIR=./tmp/vitest-rage`; TypeScript, targeted ESLint and safe-build
configuration passed. Tests include off-day preparation, DST/month boundaries,
scheduled/published reuse and actual embedded-widget replay handling. These tests
do not prove a future timed cloud run or successful new Webflow asset upload.

Cost readback `2026-10-10T18:21:52.190Z`: shared October unchanged at one historic
call, 0 DKK estimated usage, 1.2144 DKK reserved, one unknown. No new backend AI
call. Subscription usage and infrastructure costs are not measured by this ledger.

Deployment and saved cloud-schedule verification follow separately after release.
