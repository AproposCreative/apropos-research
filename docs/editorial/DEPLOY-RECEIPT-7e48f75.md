# Media fallback release

- Commit: 7e48f7579e77f2f29da410d7033f7e2b8da896da
- Non-force push and remote SHA verified.
- Full isolated regression: 3,127 tests, 194 files; TypeScript passed.
- Deployment: dpl_4hSAkCmViUzJoDg1LjzNpz5KhRTS
- URL: apropos-research-jh5fy4c79-frederik-kraghs-projects.vercel.app
- State: READY. Exact project production deployment id and SHA matched.

Authenticated API readback at 2026-09-13T16:00:32.953Z returned 200/private-no-store.
Liv autoPublishEnabled and today's published flag were true, no blocked items,
missing days or pending reconciliation. Budget returned monthlyLimitDkk 300 and
unscopedOpenAIBehavior deny_before_transport, with fullMonthlyCapVerified false.
No paid production image was generated to test the fallback; mocked tests cover it.
Runtime error/drain scan and visual UI proof remain incomplete.

Release includes blocked AI fallback for media-review lookup failures, safe
image failure responses and explicit unscoped OpenAI enforcement status.
Live role lifecycle verification is recorded separately in
docs/audits/EDITORIAL-ROLE-VERIFICATION-2026-09-13.md.
No paid generation/publication is part of this deployment verification.
