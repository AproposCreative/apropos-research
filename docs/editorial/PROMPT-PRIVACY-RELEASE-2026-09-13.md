# Prompt Architect privacy release

Candidate `fd864a414fca0319551dcf8a5cc8b9d7e5a9b1e6`, deployment `dpl_CQacJVWX3HpgL42Rekoz9Q5zsZx7`.

## Changes and checks

- Versioned UID-scoped context and prompt-toggle browser keys. Legacy unowned data is ignored, not adopted or deleted.
- Architect component lifetime keyed by UID; obsolete requests aborted and late responses ignored. Preview requests include authentication; route checks verified editorial access directly and returns private/no-store.
- 3,337 tests passed. Production build/TypeScript passed, with nine existing file-tracing warnings.
- Isolated browser test of real Architect/ReactFlow: A's delayed response after switching to B did not show A's text; logout before another delayed response left only the login prompt. Legacy context was never sent. No uncaught errors. Navigation link/auth/HTTP were fixtures, not production accounts.
- Push succeeded without force or overwriting concurrent changes.

## Remaining

This is not a complete workspace privacy audit or production account-switch acceptance. Prompt toggles are per-user local preferences, not cross-device synced. The historical-alarm index still requires administrator creation; this privacy release does not resolve that independent dependency. No paid model requests, CMS changes or credential changes are required for this release check.

## Production acceptance

- Deployment `dpl_CQacJVWX3HpgL42Rekoz9Q5zsZx7` reached READY with the exact candidate SHA and `ai.aproposmagazine.com` alias.
- `verify-prompt-release.ts` called the real preview API with synthetic, non-private text. Anonymous POST returned 401; verified-owner POST returned 200, `Cache-Control: private, no-store`, `researchStatus: not_requested`, null web content and valid graph nodes.
- No prompt output or credentials were logged. Temporary Firebase client session was signed out/deleted. This proves the affected API path, not a production multi-account browser session.
