# Editorial mail in the existing starred chat

Owner request: continue the 20 October mail handoff so Frederik can answer the
Rockstar inquiry from the existing starred editorial thread. No new thread,
schedule, automatic reply, paid model, send or publication was authorized by a
generic implementation request. The specific outgoing message requires the
owner's personal approval after seeing its complete text and recipient.

## Implemented

- Owner-only MCP search/read for Frederik and Liv, including bounded Sent searches
  for relevant examples. Independent EXAMINE/read-only IMAP sessions and BODY.PEEK;
  no ingestion cursor, Seen flag, legacy inbox setting or automatic job changes.
- Clean text and attachment metadata only. No HTML execution, remote images,
  tracking pixels, attachment previews or mail-supplied tool instructions.
- One versioned private reply per source RFC message ID and mailbox, guarded by
  source hash and revision. Existing guidelines and relevant sent correspondence
  are context, not a claim of model training. No backend AI.
- Inline MCP App with exact sender, recipient, subject and complete body. Only
  the owner sees mail. No CC, attachments or arbitrary recipients in this release.
- Personal **Godkend og send** uses a ten-minute UI-only token, bound to owner,
  OAuth grant and exact draft hash/revision. Token is only in `_meta`; the send
  tool is app-only/private. The model never approves or invokes it.
- Atomic durable `sending` claim before SMTP. Concurrent clicks, other tokens,
  transport timeout or lost acknowledgement cannot send again. Unknown outcome
  remains `unconfirmed`, without automatic retry. SMTP acceptance is not proof of
  recipient delivery; a Sent-copy failure does not discard SMTP acceptance.
- Existing mailbox credentials stay on the server. SMTP/TLS connection verification
  does not send a test message. Preserve sending stops and test-redirect guards.
- Owner-authenticated first-party API supports reads/drafts/status/connection tests
  only: no preview token issuance, approval or send endpoint. It rejects unknown
  actions, non-owners and foreign browser origins, rate-limits and prohibits paid AI.

MCP schema: `2026-10-21-v39` (70 tools). New tools:
`search_editorial_mail`, `read_editorial_mail`, `save_editorial_reply`,
`get_editorial_reply`, `preview_editorial_reply`, app-only `confirm_editorial_reply`.
The existing editorial desk adds an owner-only Mail button, without creating chats.

## Verification before release

- Full isolated suite: **390 files / 5,547 tests passed** with
  `RAGE_STORAGE_DIR=./tmp/vitest-rage`; no paid production tests.
- TypeScript, changed-source lint, safe-build-config and diff whitespace pass.
- Local browser/host fixtures: mobile and desktop; no auto-send on open, exact
  body, double click, lost acknowledgement/readback, uncertain outcome, rejection,
  expired token and absent token. Untrusted HTML remains text; no external requests.
- These fixtures do not prove that ChatGPT's current installed tool catalogue has
  refreshed or that a real SMTP send has happened. No personal approval simulated.

## Live acceptance

Pending at this source commit: exact deployment/alias verification, real owner
Rockstar search/read, SMTP login-only check and private reply draft. Record these
after release. A real send requires the owner's subsequent personal decision.
Never mark a generated draft sent or claim recipient delivery from SMTP acceptance.

The Barsel and Liv-observer flows, publication state, budget, provider holds,
credentials, mail autopoll and auto-response settings are outside this change.

## First live readback and routing correction

`157ed93db2cc6fc993e56f6b29bac9e3bfc6bf1b` deployed as
`dpl_ECrDg96HzQUWSjCzkKrnWXmGpoLD`, READY with the actual production alias.
Native `get_editorial_desk` returned `mailEnabled:true` at 06:59:26 UTC.
The session's model tool catalogue still contains the old names; no native
mail-preview call or real-host approval has yet been observed.

Owner API search/read works, HTTP 200/private-no-store. Initial service probe
omitted the required Origin header and was rejected before a mailbox operation;
the probe was corrected, not the origin check.
Header search for Rockstar found no matches. Bounded recent metadata located
the inquiry from Tobias/digitalPR about GTA VI codes; it was read successfully
at 07:01:46 UTC. No prior Rockstar/digitalPR correspondence was found in the
searched Frederik Sent folder. This does not prove absence from every mail folder.
No message body, personal contact details or credentials are committed here.

SMTP verification initially stopped on `mcp_mail_test_redirect_active` before
connecting. Read-only `/api/liv-inbox/settings` confirms the actual existing
policy: sending enabled, effective testRedirectTo=null, allowAllRecipients=true,
SMTP, autoRespond=false. The new checker had incorrectly treated the separate
accreditation sink as global. Corrected to use Liv's existing effective recipient
resolver at preview, durable claim and transport; accreditation code/env is unchanged.
Frederik's new personal-only sender is separate and never uses a Liv/accreditation
sink or sender. Its explicit mail emergency-stop/test flag still fails closed.
No allowlist, redirect, automation, account credential or sending env changed.

Regression: 70 focused tests plus typecheck/lint pass after this correction.
Financial/provider-policy and inbox-settings before/after hashes remain equal:
`cabe0e498f22ea9b74545f399aecd0eecf6005681948d9c90db35655c2602593`.
Local metadata-only evidence: `output/editorial-mail-live-*.json`.
SMTP authentication and user-visible exact draft remain to be verified on the
corrected deployment. Nothing sent and no personal approval simulated.
