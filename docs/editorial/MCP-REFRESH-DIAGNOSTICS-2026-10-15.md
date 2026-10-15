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
