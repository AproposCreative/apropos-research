# Production receipt: e93d604

- Commit: `e93d60473416b23fbfd198e621bf2d0450dc2c06`.
- Deployment: `dpl_FXQSAgKnRiVBkPkjKgpbhis8Lxr4`, READY.
- URL: `apropos-research-h8m7b205x-frederik-kraghs-projects.vercel.app`.
- Production target ID and SHA matched September 13 16:56:52 UTC.
- Full isolated regression: 3,156 tests in 197 files passed. TypeScript passed.
- Anonymous POST of empty JSON to production `/api/research-engine` returned
  401 Unauthorized, no-store, at 16:56:53 UTC. No paid research was requested.

Research cache scope and concurrent reuse are covered by mocked route/cache
tests, not a live spending experiment. Actual savings remain unmeasured.

Early error/fatal log scan, 16:55–16:57:05 UTC, returned the previously observed
PassThrough MaxListenersExceededWarning on GET `/api/podcast/public/episode`
at 16:56:43, HTTP 200. Do not claim a clean error scan or that the warning is
fixed. No evidence of a research failure appeared in this narrow query.
Previously inspected log drains: zero. Seven-day and budget verification remain
open; prepared articles and production ledger were not modified by this release.
