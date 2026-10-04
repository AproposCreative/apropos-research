# MCP connection setup: visible evidence and current instructions

## Gap and scope

The owner asked where to find the MCP. The deployed setup page referred to old
ChatGPT menu locations, offered no copy control, and could not show whether the
owner had granted access or whether any tool had been used. The preceding reply
provided guidance but did not complete client acceptance. This continuation adds
the missing first-party onboarding evidence; it does not redefine the overall
MCP/editorial/evaluation/delivery goal as a setup-page release.

At 4 October 21:52:43 UTC a fresh read-only owner inventory found four retained
grant records, zero active grants, no truncation and an enabled account. Existing
production was `f6701d8`, `dpl_DCVqxBKjmweZS7BTDqs94nf4EXNU`, READY with the actual
production alias. These are dated observations, not a claim about subsequent
user actions.

## Change

- Keep the existing minimal dark panel, typography, close navigation and mobile
  one-column layout. No new dashboard or styling system.
- Instructions match the current official ChatGPT guide: Security and login →
  Developer mode; Plugins → +; Apropos MCP URL; OAuth and automatic registration.
  Account/workspace availability is not guaranteed. No shared API key is required.
- Copy the endpoint; if clipboard permission fails, select the exact address and
  provide a manual-copy instruction. Do not claim that a failed copy succeeded.
- Owner-only `GET /oauth/connections` reads existing grants, revoke-all watermark
  and successful tool audit evidence. It creates no OAuth grant, audit record,
  AI call, CMS mutation or background polling.
- The response contains no tokens, grant/client IDs, article text or audit bodies.
  First-party access is checked server-side; MCP tokens cannot read this endpoint.
- Expired/revoked/other-owner grants are ignored. A bounded, incomplete inventory
  returns unknown instead of asserting that no authorization exists.
- A saved authorization is not proof of a currently usable refresh token or
  ChatGPT-client acceptance. A success in the bounded audit window is evidence
  of a tool call, not necessarily the latest call or a successful publication.
- Status-read failure is distinct from disconnection. There is a 20-second
  timeout, manual retry and request cancellation on unmount/account change.

## Verification before release

- 47 focused connection/OAuth tests pass, including 21 new read-only status tests.
- Full isolated suite: **332 files / 4,683 tests passed**.
- TypeScript and scoped ESLint passed. The isolated production build also passed
  with security configuration validation, FFmpeg executable validation and 230
  generated static pages; `/oauth/connections` is a dynamic route. Temporary
  build-directory changes to TypeScript configuration were removed afterwards.
- An isolated service-issued owner browser session exercised the local page at
  390×844 and 1280×900. Both rendered correctly with no horizontal overflow or
  framework overlay. Copy succeeded; simulated clipboard denial selected the
  entire address and showed manual guidance. Injected fetch rejection and an
  accelerated abort timer showed a recoverable status error, not disconnection.
  Reload restored the real read-only status. No existing user browser was used.
- The browser helper's network-route interception did not produce a reliable
  failure signal, so that observation is not counted as a pass. Fetch rejection
  and timeout behavior were separately exercised in the isolated test page.

## Remaining acceptance

The owner's actual ChatGPT connection and selected edit/save/publication task
remain unverified. Do not use a temporary service-test grant as that evidence.
The generic draft-admission bridge, human quality scores, conditional document
extraction experiment and unattended Liv delivery remain as documented in
[the broader checklist](MCP-EDITORIAL-WORKFLOW-2026-10-04.md).

The existing provider hold and budgets are unchanged. No paid probe, new provider,
hold reset, team rollout or article publication is part of this change.

Official connection instructions checked:
https://developers.openai.com/plugins/deploy/connect-chatgpt
