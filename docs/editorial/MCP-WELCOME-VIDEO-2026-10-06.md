# Apropos AI: welcome video after MCP activation

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

- Initial full isolated suite: 351 files / 4,876 tests passed. Added cron
  authentication assertion afterwards; targeted OAuth/welcome: 47 passed.
- TypeScript and focused lint passed before the final public-layout review;
  production build passed. Final release checks recorded below.
- Hyperframes 0.8.137 check: zero lint/runtime/layout/contrast errors, 38/38
  sampled contrast checks. Seven advisory warnings reviewed (flat scene
  nesting and repeated logo); rendered contact sheet has all six scenes.
  Motion sampling disabled, not claimed as passing.
- Real local Chrome playback completed all 36 seconds without media error.
  At 390×844, no horizontal overflow and poster/player/prompts were readable.
  This is responsive desktop verification, not a real iOS device test.
- Brag and pinned Hyperframes used only in isolated local generation. Source,
  storyboard and reproducible recipe in `tools/onboarding-video`; no new
  application packages, cloud renderer, paid AI test or newsletter subscription.

## Acceptance still to verify for this release

Exact pushed SHA → READY production alias → public page/assets/range playback →
protected cron → one owner-only service OAuth activation and mail receipt.
Service OAuth is not a human colleague Google-login test. Do not call provider
acceptance inbox delivery or mail opening.
