# Mobile MCP refresh failure, 15 October 2026

## Verified evidence

The owner found the real **Genindlæs** control in ChatGPT's Apropos AI connection.
Screenshots at 12:23–12:24 Copenhagen show **Fejl ved genindlæsning af værktøjer.
Load failed**. Reconnecting or repeatedly opening new conversations had not made
`claim_submission_image_attempt` available. Do not prescribe blind repetition.

Production alias lookup at approximately 10:28Z resolves to
`dpl_J29GiHJdXmBTBWXygfZMc2bGEZqp`, source
`c9479583f9c5cab42beb56ca901d79e027e86704`, MCP v35.
Bounded Vercel **request logs**, 10:20–10:28Z, show two discovery-shaped bursts:
OAuth resource/authorization metadata 200, an initial MCP 401, token refresh 200
in the first burst, then MCP 400/200/202 responses. OpenID discovery returns 404;
OAuth authorization-server discovery succeeds. This alone does not establish an
authentication defect. Relevant HTTP 400 request IDs:

- `r9lbf-1792059811235-1da368133e68`
- `7wxnl-1792059816286-12d1ac952e49`
- `gngdk-1792059875706-4abe67768efc`
- `7s9gl-1792059883350-0ce69da34017`

No console entries or grouped errors identify the rejected JSON-RPC method,
protocol header or response body. HTTP 200 does not prove successful ChatGPT
catalog ingestion; HTTP 400 may be a rejected discovery probe with fallback.
The exact cause of the user's refresh failure is **not yet established**.

Fresh supported service-auth read-only inspection at 10:30:45Z succeeded:
initialization v35, 64 registered tools, correct public claim descriptor and strict
input schema. The diagnostic OAuth grant was revoked after inspection; existing
connections were untouched. Article revision 2, original assets, grants and
financial ledger hashes were unchanged. No claim/generation/import/CMS/publication.
Preflight now stops on the expired authorization; it is not renewed as part of
connection diagnosis. Evidence is retained locally in
`output/image-retry-v35/inspect-2026-10-15T10-30-45-080Z.json`.

## Narrow diagnostic change

The route previously discarded SDK transport error details. A fixed-category
logger now records rejected authenticated MCP requests, status, release version
and a date-shaped protocol version only. It never logs raw errors, request or
response bodies, tokens, identities or article content. No transport version is
accepted or rewritten; security, tool descriptors, image controls and personal
approval rules are unchanged. Local `output/` diagnostics are excluded from future
deployment uploads; originals are retained locally.

30 protocol tests passed, including three new rejection/redaction/fallback tests.
Type check, targeted ESLint, build-configuration security check and diff check
passed. These tests do not prove that ChatGPT can refresh its catalog.

## Resume / acceptance

Verify the diagnostic release and one synthetic, read-only rejected protocol probe.
Then ask for **one** new personal Genindlæs attempt with the time/result. Correlate
the actual runtime category; do not confuse the synthetic probe with the user's
failure. If the client still fails after successful server discovery, the missing
evidence is the ChatGPT-side refresh error/trace. Do not bypass the host catalog,
claim a grant directly, fabricate native input proof, or generate an image to test.
The task is not solved by this diagnostic deployment alone.

## Diagnostic release verified live, 12:36 Copenhagen

Source `4dd94c21bee6ea7667b9b3845ea0da24e239ba8b` was committed and pushed on
`codex/image-preflight-v30`. Deployment `dpl_FJizrJ134VPWKwSngbiQh3GqkwPD`
is READY; a fresh direct `ai.aproposmagazine.com` lookup resolves to it. Vercel
metadata carries the unambiguous source prefix `4dd94c21`; the full local/pushed
source SHA is above. MCP tool schema stays v35; no new metadata-refresh requirement
was introduced by the logging-only release.

Remote build/typecheck and 237 static pages succeeded. The install used existing
locked dependencies with lifecycle scripts disabled. It reported the existing
10 dependency findings (3 moderate, 7 high); no dependency upgrade was attempted.
Deployment dry-run verified the diagnostic module is included and local
`output/image-retry*` evidence is not uploaded.

At 10:36:06.191Z a supported service-auth check verified all 64 server tools and
the public claim descriptor again. One deliberate **synthetic** `2099-01-01`
protocol-version probe returned HTTP 400, followed by a successful supported
`tools/list`. Production request log
`ggczj-1792060554449-1f37b2a826e4` independently records
`mcp_transport_rejected / unsupported_protocol_version / 2099-01-01`.
This proves the new diagnostic logging works, **not** that the user's original
HTTP 400 had this cause. The temporary diagnostic OAuth grant was revoked.

Evidence: `output/image-retry-v35/inspect-transport-2026-10-15T10-36-06-191Z.json`.
Protected original/article history, revision 2, previous grants and financial
hashes remain identical. Zero dispatch claims, paid AI calls, imports, approvals,
CMS writes or publications. Image preflight remains stopped after the last
authorization expired; it was not renewed. The Work catalog in this session
still lacks the claim tool. One new user refresh/time/result was requested after
verification; the exact refresh root cause remains open pending that observation.
