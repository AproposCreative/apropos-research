# MCP publication status after an uncertain response

## Reproduced defect

The existing MCP `publish_article` rejected a previously attempted publication
after Copenhagen midnight with `mcp_publication_reconciliation_required`. A
lost HTTP response could therefore hide a successful durable delivery receipt
from the same conversation. There was no independent publication-status tool.

An isolated regression reproduced the failure before implementation: the
publisher records an exact published slot and loses its response; the next-day
call with the same preview ID must read back the article, not publish again.
The original implementation failed that assertion. No real article was
published to reproduce the bug.

## Scoped repair

- MCP version `2026-10-05-v1`, 24 tools: new `get_publication_status` requires
  the existing publication scope and authenticated preview ownership.
- The first-party owner route exposes the same service at
  `/oauth/publication?id=<previewId>&view=status`. MCP tokens cannot impersonate
  the owner's first-party Firebase session.
- Matching is bound to item ID, preview/request ID, retained payload hash and
  the durable publisher's CMS snapshot hash. The latter includes a legitimate
  publication-date patch and is not assumed to equal the earlier preview hash.
- A historical `recordedPublication` is explicitly separate from current
  `publicationVerified`. Only the existing exact CMS and public-page verifier
  establishes current visibility. Failed readback preserves history but does
  not certify the article. Raw private errors are not exposed.
- Reads work after preview expiry, midnight or a publication pause. An attempted
  old-day `publish_article` is redirected to this read-only status check, not a
  new delivery dispatch. Normal current-day publication controls are unchanged.
- `deliveryFinalized=false` remains possible when live content is verified but
  the server has not finalized delivery history. This read operation never
  rewrites queue state, approval, preview, receipt or CMS content.
- The focused publication skill now directs chats to this status tool after a
  timeout and distinguishes operator publication from unattended Liv delivery.
  No paid AI call, new model, relaxed admission or site publication is added.

## Local verification

- Focused regression: **102 tests** across publication state, real SDK protocol,
  first-party status access and the existing CMS/public verifier.
- Full isolated suite: **333 files / 4,709 tests passed** with
  `RAGE_STORAGE_DIR=./tmp/vitest-rage`.
- TypeScript, scoped ESLint, diff checks, safe build configuration and a full
  production build passed. Temporary generated build-path changes are excluded.
- The publication skill passed the official skill validator using the existing
  isolated YAML dependency. The default Python environments lacked PyYAML;
  no global dependency or application runtime dependency was installed.
- Regression covers confirmation/expiry, all publication switches disabled,
  owner isolation, unrelated/incomplete receipts, changed payloads, wrong item,
  wrong canonical URL, invalid timestamp, failed readback and no state mutation.

## Production verification, 5 October 00:23 Copenhagen

- Exact pushed code: `9cd621ae5c50f2210d14c8c7fb7f2a3fd59d6298`, including
  implementation `63a39e1` and the final same-ID error-message safeguard.
- Deployment `dpl_2CXAK1V3SxGNAsM2tQc2SfwYRuPM` is **READY**, target production,
  with the actual `ai.aproposmagazine.com` alias and exact code SHA independently
  confirmed through Vercel. Immutable URL:
  https://apropos-research-r5z985qt0-frederik-kraghs-projects.vercel.app .
  Remote build/deployment completion is present in Vercel's build events.
  The earlier `63a39e1` deployment is superseded, not the final release.
- Service-authenticated checks against the actual production host ran
  **22:23:05–22:23:39 UTC on 4 October**. The endpoint advertised
  `2026-10-05-v1`, all **24 tools**, the strict read-only publication-status
  schema and the updated publication workflow from the deployed bundle.
- Anonymous, Casper and Milo requests to the first-party status route returned
  403. An MCP bearer could not impersonate first-party owner authentication.
  Owner access to a missing preview returned a private/no-store 409 with guidance
  to keep the same identity; MCP returned `mcp_preview_not_found`. Additional
  caller-supplied UID input was rejected by the strict tool schema.
- A temporary service OAuth grant exercised S256 owner authorization and only
  read operations. Only that test grant was revoked; its token then returned
  401. Audit history and pre-existing authorizations were preserved.
- The complete bounded read contained **0 real owner publication previews**.
  Therefore no positive real-publication recovery was available to test. That
  scenario is covered by isolated regressions, not claimed as live acceptance.
  No synthetic preview or publication record was inserted to manufacture it.
- Before/after hashes were identical for budget, provider hold, private
  workspace, queue entries/slots, shared ledger, image ledger and preview rows.
  No paid AI, CMS write or article publication occurred.
- The final real connection inventory showed zero active authorizations,
  complete inventory and `clientAcceptanceVerified=false`. The temporary
  service check is not the owner's actual ChatGPT connection.
- Configured Vercel drains: **0**. No telemetry service was installed. A
  deployment-scoped error/fatal scan for **22:23:00–22:23:39 UTC** returned no
  matching logs. This short release check is not a long-term uptime guarantee.

## Remaining acceptance

The owner's real ChatGPT connection and a chosen editorial task remain separate
from a service-protocol check. Generic draft admission, actual human quality
scores, a representative document-extraction gap and Liv's every-other-day
unattended delivery acceptance remain as documented in
[the workflow checklist](MCP-EDITORIAL-WORKFLOW-2026-10-04.md). This repair does
not clear the provider hold, create a reserve, buy checks or complete that goal.
