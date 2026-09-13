# Email verification recovery release

- Production deployment `dpl_TmsSVfdifXvGe1F3eoAdTQNEDitU` READY.
- Exact production target SHA `517306f7c2b15eb163c31196c505e99a171d04f4`
  independently verified at 2026-09-13T17:27:51.912Z.
- `/ai` HTTP 200; its referenced production JavaScript contains both
  verification action labels. This proves delivered code, not a rendered
  signed-in browser flow or mailbox receipt.
- 3,167 tests / 200 files passed; TypeScript passed. Five dedicated action tests
  cover explicit sending, cooldown, failed-send retry, account change and server
  rejection after verification. No real email sent or account modified.

The domain/allowlist policy is unchanged. The question whether access should be
limited to exactly the three named colleagues remains unanswered. Production
mail delivery and a real user's completed verification remain unverified.
