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
- Broader MCP regression: 16 files / 229 isolated tests passed.

## Production verification

- Code SHA `a5f816d9e829cc86847cff32c8f16a7b1b7eb284`, deployment
  `dpl_3vya4dvihhiB6bTvr9kvn5Vy4uGj`, READY with `ai.aproposmagazine.com`.
- Welcome HTML returned 200 with starter prompts and no player/video references.
  All three former public MP4/JPG/VTT URLs returned 404. Existing browser tab
  reloaded and visibly showed the text guide with no player.
- Read-only outbox inspection: one already accepted v1 receipt, no pending mail.
  No real test email or replacement welcome was sent for this change.
- Anonymous MCP GET correctly returns 405 (POST-only); the first verifier
  expected 401 for GET and was corrected without changing application security.
- Post-release error/fatal scan for this exact deployment returned no matches
  in 11:41:06–11:46:06Z. This short window is not a long-term reliability claim.
  Drain inventory was unavailable (404); no monitoring configuration was changed.
- Existing emailed content cannot be recalled; its welcome-page link now opens
  the text guide. Deleted public media remains recoverable from Git history.
