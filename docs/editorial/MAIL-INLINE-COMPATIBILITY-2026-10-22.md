# Inline mail preview compatibility — 22 October 2026

## Objective and verified boundary

Show the exact private One.com mail and personal send control inside the
conversation, followed by the actual receipt. No additional real mail sends.
Owner-only access, immutable revision/hash consent and exactly-once SMTP remain
unchanged. The already accepted Gmail test is the production readback fixture.

## Findings

- The native connector still exposes the V1 `save_editorial_reply` description
  and schema (body/source/revision/request only, explicitly no CC). The deployed
  V47 server exposes the V2 recipient/CC/BCC/subject schema. Thus its native tool
  catalog is stale, not the production implementation.
- Commit `157ed93d` advertised `ui://apropos/mail-reply-v1.html`. V2 changed the
  address to `mail-reply-v2.html` and removed V1 registration. A client retaining
  the V1 descriptor consequently requests an unavailable resource. This is a
  concrete backwards-compatibility bug; the exact host resource request was not
  previously logged, so it is not proof of the sole cause of the missing card.
- The compatibility bridge assumed `window.openai.toolResponseMetadata` was
  always flat `_meta`. Current ChatGPT may supply the full MCP envelope under
  `mcp_tool_result`/`call_tool_result`. Pairing it with a separate `toolOutput`
  lost private confirmation metadata and could combine different snapshots.
- Initial height could be consumed before bridge readiness without ever being
  reported to the parent. This is fixed without changing content or consent.

## V48 repair

- New V3 canonical resource; V1 and V2 addresses remain supported aliases with
  the current safe UI. Registered MIME remains `text/html;profile=mcp-app`.
- Canonical envelope normalization, old flat compatibility, safe malformed
  result handling and current-version/monotonic-state guards.
- Height is reported after successful initialization, with capability-detected
  `notifyIntrinsicHeight` support for compatibility hosts.
- The existing card immediately renders SMTP/IMAP/delivery distinctions. Where
  the host exposes `sendFollowUpMessage`, one receipt message is requested only
  after this card's human send click and persisted SMTP acceptance. Opening an
  old receipt never creates a new notification or mail. No tokens/source/body
  are included in the receipt notification. No retries of notification or SMTP.
- Privacy-preserving `mcpUiAudit` records only resource/version/time/user for
  authenticated resource reads. A read proves delivery of HTML, NOT rendering.

## Verification

- 80 targeted tests in five files passed (including 10 actual-script inert-host
  tests and three protocol tests for the current and historical resource URIs).
- TypeScript, scoped ESLint and build configuration security check passed.
- Tests use synthetic consent fixtures, mocked SMTP/IMAP and isolated storage.
- Live release and actual native-host rendering are still pending at this
  source checkpoint. Do not treat passing tests or READY deployment as UI proof.

## Existing real test (read-only observation)

Draft `ed72643237279aaf3517b53c04eae2611b70b54612d17a5d35b5ed837eb3a7ce`,
revision 2/hash `bec15ba2bfd9ac5e738e414bc628f6d70fe3a76845c70b4126a900155193ff6a`:
personal approval recorded 11:01:56.906Z; SMTP accepted 11:01:58.825Z (13:01
Copenhagen). Only `frederik.emil.kragh@gmail.com`; no CC/BCC. Verified IMAP
`INBOX.Sent Messages`, UID92/UIDVALIDITY1744113469, MIME SHA256
`a696baa6547ade4e706bc06f214881574c02592dad8b727b7425eb341e5c25b8`.
Active draft removed. Recipient delivery and device display not yet independently
verified. No resend or real approval was performed by this repair turn.

## Official contracts checked

- [UI resources and cache keys](https://developers.openai.com/plugins/build/chatgpt-ui)
- [Canonical metadata and optional follow-up API](https://developers.openai.com/plugins/reference)
- [Separate server/resource/component/host failures](https://developers.openai.com/plugins/deploy/troubleshooting)

These are the OpenAI Docs contracts used for the compatibility repair. The
verification skill keeps resource delivery distinct from visible host rendering.
