# Private workspace sharing release

- Production SHA: `c3b9b587bc7e8df74adca2aa6e1914be68591a11`
- Vercel deployment: `dpl_CjJ3arXuKYY6bndhBTeVKPHmD2UM`, READY.
- Deployment URL: https://apropos-research-n8vb1bgzd-frederik-kraghs-projects.vercel.app
- Verified production alias: https://ai.aproposmagazine.com
- Framework: Next.js. Release adds immutable sharing, copy-to-own restore, sharing dialog and UID-scoped pending retry receipts.

## Verification

- Full isolated regression: 3,297 tests in 218 files passed. TypeScript and diff checks passed.
- Isolated React StrictMode browser fixture: preview/consent gate, simulated failure, identical retry after closing/reopening, copy callback and modal dismissal passed. Mobile 390px had no horizontal overflow. No uncaught browser errors. This fixture has mocked auth/API and is not a colleague-account production acceptance test.
- Production authenticated Frederik GET: auth/access, writer/workspace, writer/workspace/versions, writer/workspace/shares, liv/media-sources, editorial/tips, liv/delivery/feed all 200. Private routes return private/no-store.
- Production anonymous GET: writer/workspace, writer/workspace/shares, liv/media-sources and editorial/tips all 401.
- Production Liv feed readback: queueEnabled true, preparationEnabled true, three stories. No publication or queue changes were made by this verification.
- Credentials stayed in memory. No actual private workspace was shared, no paid AI calls, no CMS mutation.

## Remaining acceptance

Actual verified colleague sharing/copying across devices, pagination beyond 50 shares, complete private-state recovery/Mine artikler integration. Broader plan still includes permanent verification/reset delivery, operations alerts and daily-publication/provider-invoice evidence. Deployment readiness is not publication evidence. No broad runtime-log/drain audit was performed in this release.
