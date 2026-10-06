# MCP welcome: remove the video

Owner request: colleagues have individual ChatGPT accounts; the welcome video is
unwanted and must be removed. This does not authorize public directory publication.

## Change

- Keep the existing welcome URL as a short text guide with starter prompts.
- Remove the player, poster, captions and public MP4. Render source remains
  archived under `tools/onboarding-video`; the removed media is recoverable in Git.
- New welcome emails use text guidance, no video thumbnail or watch link.
- Unsent old queue entries use the current template on first dispatch. A retired
  template with an uncertain previous send is held for reconciliation, never
  rewritten under its old idempotency key or resent. Accepted receipts stay intact.
- No new welcome to existing users, bulk email, paid AI call, hold/budget change,
  article mutation or access-policy change.

## Local verification

- 51 isolated welcome/OAuth tests passed, including old unsent, uncertain and
  accepted messages, once-per-user delivery and removed player/assets.
- TypeScript, focused ESLint and build-configuration security gate passed.
- Production deployment/readback: pending at this commit.
