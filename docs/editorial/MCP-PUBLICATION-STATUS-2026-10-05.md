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

## Production verification

Pending the scoped deployment and authenticated read-only verification. Positive
recovery of a real owner publication must not be inferred from mock tests or a
READY deployment. No synthetic production publication/preview will be inserted
to manufacture acceptance.

## Remaining acceptance

The owner's real ChatGPT connection and a chosen editorial task remain separate
from a service-protocol check. Generic draft admission, actual human quality
scores, a representative document-extraction gap and Liv's every-other-day
unattended delivery acceptance remain as documented in
[the workflow checklist](MCP-EDITORIAL-WORKFLOW-2026-10-04.md). This repair does
not clear the provider hold, create a reserve, buy checks or complete that goal.
