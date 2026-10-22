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
- Live release is verified below. Actual native-host rendering remains
  unverified. Passing tests or READY deployment are not UI proof.

## Live release and remaining host boundary (13:33 Copenhagen)

- Source `0391dc3233542ffdca287e9746c859fe5e15cb9e`, branch
  `codex/image-preflight-v30`, MCP `2026-10-22-v48`, was committed and pushed.
- Staged production build `dpl_5sGc9TKdyKtAYh2TPmvkGtKbt1aM` was READY and
  returned `{"ok":true}`/HTTP200 from `/api/health` using existing Vercel auth.
  Deployment protection was not weakened. Direct metadata confirms the full
  git SHA. `gitDirty=1` reflects preserved untracked `output/`; tracked source
  was clean. No dependencies changed; build reported 14 existing advisories.
- The custom production alias still pointed to the expected previous release
  before promotion. The exact staged deployment was promoted, then direct
  `ai.aproposmagazine.com` lookup verified its ID/READY state at 11:32:06Z.
- Native `preview_editorial_reply` succeeded at 11:32:35.801Z on V48 and returned
  the unchanged accepted test, signature and SMTP/IMAP receipt. No approval,
  generation, IMAP change or SMTP send was performed.
- Readback at 11:33:12Z found that successful tool audit but zero owner
  `mcpUiAudit` resource reads since 11:32Z (both queries uncapped). This means no
  new resource delivery was observed; it does not exclude a cached UI resource
  or prove a particular client failure. The MCP Apps side-panel inventory was
  empty, but that inventory does not include inline-only cards.
- The current native connector still exposes an older tool schema. The
  supported next step is **Refresh** on the existing custom Apropos connection,
  not removing/reinstalling it or changing scopes. The browser's ChatGPT Plugins
  page was logged out, so no refresh was possible there. That temporary tab was
  closed. No login/session extraction or connection mutation was attempted.
- One concise user visibility question was issued. Do not claim the missing
  inline card or optional follow-up notification is verified until the user or
  the actual host UI confirms it. Do not send another test to prove rendering.

Read-only evidence: `output/mail-inline-readback-1792668726094.json` and
`output/mail-inline-readback-1792668792008.json`. Financial/policy/inbox hash is
unchanged at `d582960e928ba6877f4aba670df2f5fa5b186253d63cff61ac38e1cce3d7170f`.
The verification skill stops at this unresolved response-to-host-UI boundary;
it does not turn successful backend tests into user-visible acceptance.

### Exact resume step

After the owner refreshes the existing connection or confirms the card is
visible, re-read the same accepted test and open its native preview once.
Inspect the new resource audit and actual card. If it is visible, verify the
exact sender, Gmail recipient, server-rendered signature and four separate
receipt stages. Do not click any send control. If the host still does not load
the resource, preserve these observations and escalate the client boundary
without weakening personal approval or replacing One.com with Gmail.

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
- [Refresh existing custom connection metadata](https://developers.openai.com/plugins/deploy/connect-chatgpt#refresh-metadata)

These are the OpenAI Docs contracts used for the compatibility repair. The
verification skill keeps resource delivery distinct from visible host rendering.
