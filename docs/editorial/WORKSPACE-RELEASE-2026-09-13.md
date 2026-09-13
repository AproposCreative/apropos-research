# Workspace release, September 13

- Exact production SHA: `ff2af6836848f404817cc6e501a1465e2224df93`.
- Deployment: `dpl_7e517qB9hDvn49Ab1ZS3oVWs8cEZ`, READY.
- Verified production alias: https://ai.aproposmagazine.com.
- Build URL: https://apropos-research-eu03efu3e-frederik-kraghs-projects.vercel.app.
- Push advanced the existing branch from `50271b4` without divergence or force. Unrelated uncommitted files were excluded.
- Local full regression: 3,287 tests, 216 files passed. Previous full build passed; Vercel built the exact release successfully. Nine prior local filesystem tracing warnings remain unresolved.

## Live read-only verification

Executed `verifyWorkspaceRelease` using an authenticated verified owner token, with secrets only in process memory. No workspace/article/test data written.

| Route | Owner result |
| --- | --- |
| `/api/auth/access` | 200; owner capability true |
| `/api/writer/workspace` | 200; private/no-store |
| `/api/writer/workspace/versions` | 200; private/no-store |
| `/api/liv/media-sources` | 200; active Soundvenue source confirmed |
| `/api/editorial/tips` | 200; private/no-store |
| `/api/liv/delivery/feed` | 200; 3 stories, queueEnabled true, preparationEnabled true |

Anonymous workspace, shared-source and tip requests each returned 401.

## Limits and remaining acceptance

This proves deployment identity and these API read/access paths, not every feature or daily publication reliability. No new article was generated or published by this release check. Actual multi-device saves, offline/conflict/browser UX, colleague acceptance, explicit private-draft sharing, permanent auth email delivery, remaining operations alerts, and full plan completion remain open. Broad runtime error/drain audit not performed in this check. Seven real daily publications and provider invoice reconciliation remain separate evidence requirements.
