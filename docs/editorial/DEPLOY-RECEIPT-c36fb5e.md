# Production receipt: c36fb5e

- Commit: `c36fb5e8551180c4ebf4c71bb949a94798e76b07`.
- Deployment: `dpl_DCwtcCA5fAw7omRacAJrBU9ygm4W`, READY.
- URL: `apropos-research-j5sjvup8z-frederik-kraghs-projects.vercel.app`.
- Production target ID and SHA matched at September 13 16:50:21 UTC.
- Full isolated regression: 3,154 tests, 197 files passed. TypeScript passed.

At 16:50:23 UTC, public GET `/api/podcast/public/episode` without slug returned
400 with `Cache-Control: no-store`, expected safe “Mangler slug” JSON and the
correct magazine CORS origin. No storage request is made by this invalid-input
path. Actual storage failure was not induced in production; safe 500 error text
and no-store behavior are covered by mocked route tests. Successful-response
caching is preserved by tests.

The release includes provider-boundary regression coverage and the podcast
error disclosure/cache fix. It does not claim to repair the PassThrough listener
warning. Vercel MCP error/fatal scan of this deployment, 16:48–16:50:39 UTC,
returned no matching logs; this narrow early window is not a long-term health
guarantee. Preflight drain listing returned zero; monitoring uses Vercel logs.

No paid AI calls or article mutations were needed for this release. The daily
publication and full budget completion requirements remain open in the plan.
