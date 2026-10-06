# Apropos AI: welcome video after MCP activation

**Withdrawn later on 6 October at the owner's request.** The video is no longer
served or included in new welcome emails. The historical evidence below is
retained; see `MCP-WELCOME-VIDEO-REMOVAL-2026-10-06.md` for the replacement.

## Scope

Requested: use latent-spaces/brag after the chat-first MCP update, create a short
overview and automatically send it to people connecting MCP. The code builds on
the 9c7efd6 chat-first release; it does not certify its still-open human mobile
publication pilot, change billing holds, publish articles or enable Instagram.

## Implementation

- 36-second Danish, silent, square 1080p MP4, 1,487,815 bytes, H.264/yuv420p,
  faststart. Apropos logo, black/white design, fictional labelled examples.
  Includes drafts, targeted changes, canonical chat image prompt, real film
  stills, in-chat preview, SEO and separate price/version approval.
- Public `/connect/chatgpt/welcome` page: controls, no autoplay, poster,
  Danish captions and equivalent text/prompts. No login needed to watch; no
  private article data. The normal app and MCP authorization stay protected.
- Successful authorization-code exchange atomically creates one per-user
  `mcpWelcomeMail` outbox record alongside its grant. Failed login/consent,
  code reuse, refresh and reconnection never create another welcome.
- Next `after()` attempts delivery after returning the token. Authenticated
  `/api/cron/mcp-welcome` retries pending jobs every ten minutes, independent
  of the Mac. No backfill/mass mailing and no new AI invocation.
- Before dispatch: fresh verified team membership, active account, matching
  non-revoked grant and current email. Recipient is not supplied by a model.
- Transactions/leases stop concurrent workers. Resend uses a permanent
  per-user hashed idempotency key and frozen recipient/content. Timeout is
  unknown, not failure; retry with identical key/content only. Maximum five
  attempts inside 23 hours, then `needs_reconciliation`, never blind resend
  beyond Resend's 24-hour dedup window. Request timeout eight seconds.
- Receipt is `accepted`, not “delivered”. Retain provider ID for independent
  delivery readback. No credentials/token/short-lived private link in mail.

## Local evidence

- Final isolated suite: 351 files / 4,877 tests passed, including cron
  authentication. Targeted OAuth/welcome: 47 passed.
- TypeScript and focused application/test lint passed. The local production
  build passed; final deployment additionally builds the exact pushed release.
- Hyperframes 0.8.137 check: zero lint/runtime/layout/contrast errors, 38/38
  sampled contrast checks. Seven advisory warnings reviewed (flat scene
  nesting and repeated logo); rendered contact sheet has all six scenes.
  Motion sampling disabled, not claimed as passing.
- Real local Chrome playback completed all 36 seconds without media error.
  At 390×844, no horizontal overflow and poster/player/prompts were readable.
  This is responsive desktop verification, not a real iOS device test.
- Decoded frame 0 is a complete branded title, not a blank frame. Its visual
  composition matches the 2-second poster; compressed frame hashes need not
  match. All six settled scenes were reviewed in the rendered contact sheet.
- Brag and pinned Hyperframes used only in isolated local generation. Source,
  storyboard and reproducible recipe in `tools/onboarding-video`; no new
  application packages, cloud renderer, paid AI test or newsletter subscription.

## Production verification, 6 October 2026

- Pushed code SHA `107668e00c51e80c63f6d6cc3b7502d008fd910d`.
  Deployment `dpl_6FcgfSmENpHh1x2gwiSs9Vfrkm6S` is READY with that exact
  commit and the `ai.aproposmagazine.com` alias. No budgets/holds changed.
- Public welcome HTML, poster and VTT returned HTTP 200 with correct types.
  MP4 range read returned 206, `bytes 0-1023/1487815`, `video/mp4`.
  Public production page and player were opened in Chrome at 390×844 with
  no horizontal overflow. Playback reached `ended=true`, 36/36 seconds, with
  no media error. Screenshot: `/tmp/apropos-mcp-welcome-live.png`.
- Anonymous cron requests are rejected by the API proxy with 401 (the route's
  own unauthenticated handler test returns 403). This two-layer distinction was
  corrected in the local verifier, not by weakening production authentication.
- Authenticated production cron-handler smoke check returned
  `{ "processed": 0, "results": [] }` after the welcome receipt was accepted.
  This operator-started empty-queue check is not evidence of a scheduled retry.
- One owner-only service-authenticated PKCE activation created the outbox and
  sent exactly one message, attempt 1. Provider ID
  `01a110d9-1fe0-7122-9a3a-72fd83d31eda`. Saved receipt `accepted`;
  independent Resend readback `last_event=delivered`. This means accepted by
  the recipient's mail server, not proof that Frederik opened/read the email.
- A second activation reused the identical saved receipt without another send.
  Both verification grants were individually revoked afterwards; existing
  ChatGPT connections were untouched. No colleague activation or mass mailing.
- The service-authenticated verifier is a local operator script, not a browser
  session extraction or human Google-login test. It performs no article edit,
  generation, publication, AI-credit purchase or hold reset.

Automatic welcome delivery after a successful token exchange is now verified.
Simulated timeout/receipt-loss retries are tested; no real delivery failure was
intentionally created just to exercise the scheduled recovery path.
