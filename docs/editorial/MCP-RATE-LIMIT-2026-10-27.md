# MCP rate limit during the Ringo book workflow

## Evidence and cause

The owner reported RATE_LIMITED in Korsgaard-anmeldelse while trying to start
illustrations for *Nogen der kender nogen*. Read-only production inspection at
2026-10-27T21:09:09.532Z found the owner's 20:00 UTC `tools` bucket at exactly
240. Its last accepted request was at 20:26:32.685Z. The complete bounded audit
contains only **63 executed tools during that hour**. Many of those calls read
or saved the existing book-reading notes. The last recorded tool was
`get_workflow` at 20:26:32.796Z. The failed image attempts reported in the chat
were later, around 20:34–20:37Z. The next hour's native reads succeeded.

The old `/mcp` route charged every HTTP POST to this same 240/hour bucket,
including stateless initialization, discovery, notifications and rejected
protocol negotiation. Therefore transport overhead exhausted the editorial
allowance. No failed HTTP request ID is available: the old catch returned 429
without logging a rate diagnostic. This is not evidence of an image-provider
credit failure or a missing image grant.

Evidence (private local output, no credentials/identities/content in the file):
`output/mcp-rate-limit-audit-20261027.json`. The diagnostic uses existing service
access, reads only, and does not clear counters or alter approvals. An initial
compound audit query required an index; a bounded timestamp query with owner
filtering before output succeeded without adding an index. Vercel's extra
observability metrics required an add-on; none was purchased or enabled.

## Change

- Keep **240 actual validated, authorized tool calls per user per UTC hour**.
  Check atomically inside the common tool wrapper, before any handler executes.
  A new OAuth grant or reconnect does not provide a second allowance.
- Bound all authenticated HTTP POSTs separately at **1,200/hour per user** to
  accommodate up to five transport requests per logical call. SDK validation,
  the 510,000-byte body limit, authentication, scope and owner checks remain.
  Discovery, notifications and rejected negotiation spend transport allowance
  only. Each tool in a batch spends its own logical allowance.
- Tool exhaustion is a normal MCP error result with the exact reset timestamp,
  remaining wait, limiter/scope, and `operationStarted:false`. It instructs the
  client to preserve state and wait, without new connections, image attempts or
  purchases. Transport exhaustion remains HTTP 429 with `Retry-After`.
- Both limits produce sanitized diagnostics. Actual tool rejections are also
  recorded in the existing audit. Neither log contains prompts, bodies, source
  URLs, tokens, grant IDs or user identifiers in console output.
- New v2 counter namespaces distinguish the corrected units; old counter
  documents are retained. No provider, payment, editorial cost limit or image
  approval policy changed. Public OAuth endpoint limits are unchanged.

## Verification

Targeted OAuth, protocol and rate-limit tests cover stateless overhead, atomic
quota enforcement, user isolation/reconnects, exact hourly retry, bounded
transport, preserved old buckets, rejected protocols, personal access rules,
no execution after a limit, and batch accounting. TypeScript and the build
configuration security check pass. Deployment and production readback are
recorded below after release.

No new image, article, publication, mail or paid AI call was created by this fix.

## Released and verified

- **Implemented and pushed:** `201971af3c6f4d4a4b38050520eaea5267065430`.
- **Tested:** 76 targeted tests pass (31 OAuth, 41 protocol, four rate-limit),
  TypeScript passes, build configuration security check passes. The final
  protocol run includes the additional batch regression test. No production
  flood/quota-exhaustion test was performed.
- **Production:** `dpl_84JXfGyUJaoshnSWffPUfWosu5Yi` is READY and serves the actual
  `ai.aproposmagazine.com` alias with that exact Git SHA, confirmed again after
  native MCP readback. Server version is `2026-10-27-v59`.
- **Native connection:** `get_reader_progress` at 21:18:50.776Z and
  `get_workflow(submit)` at 21:18:52.906Z both completed successfully on v59.
  The durable readback at 21:19:09.307Z shows **eight transport requests and
  exactly two logical tool calls**. The old current-hour bucket remains eight,
  unchanged. This verifies the new accounting, rather than treating a natural
  hourly reset or READY deployment alone as the fix.
- **Book state:** Laura Ringo's *Nogen der kender nogen* remains revision 20,
  with client-reported reading coverage 136/136, both boundaries observed and
  no gaps. `independentlyVerified:false` and `fullBookTextStored:false` remain
  unchanged. The submit workflow still documents `first_attempt`; there was no
  new image grant, generation, image import or publication.

Production evidence: `output/mcp-rate-limit-production-readback-20261027.json`.
The production audit is complete within its bounded 15-minute window.
