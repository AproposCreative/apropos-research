# Permanent account mail release

- Production commit: `ec5b63b4b12d76f2493387c7a3fb62dd41986949`.
- Deployment: `dpl_CFREJpGjExEKp5F3HHsyckBy47R6`, READY, exact SHA verified.
- Production alias: https://ai.aproposmagazine.com
- Deployment URL: https://apropos-research-1n9jpehv8-frederik-kraghs-projects.vercel.app
- Next.js build and 3,305 tests in 221 files passed. Nine pre-existing filesystem tracing warnings remain.

## Live evidence

- Existing Resend sender domain `news.aproposmagazine.com` verified by provider domain readback. No key or DNS changes.
- POST `/api/auth/mail`, verification without authentication: 401.
- POST `/api/auth/mail`, reset with foreign Origin: 403; no send.
- One explicit owner password-reset request through the new production API: HTTP 200.
- Server operation `e19fae92-38e3-4cf0-9f57-9e4bf11c5dfa`: accepted.
- Resend message `648426ff-a967-474a-944b-b01ceb73782d`: `delivered`.
- The test did not follow the link, change a password or alter emailVerified. Provider delivery means recipient server delivery, not confirmation of inbox placement/opening.
- Post-release owner readback: access/workspace/versions/shares/media-sources/tips/feed all 200; anonymous workspace/shares/media-sources/tips 401. Liv queue and preparation enabled, three stories preserved.

## Behavior

Verification derives the recipient from a fresh revoked-token check and Firebase user readback. Reset returns a generic response before account lookup/provider work, using Next after. Only the three approved addresses can receive mail, subject to suspension checks. Durable attempt limits and sanitized status records are server-side. Login notices no longer claim confirmed sending for generic responses.

Actual verification-link completion for Casper/Milo and browser acceptance remain unproven. Automatic recovery of interrupted auth-mail operations and central operations alerts are not implemented by this release. The broader plan remains active. No broad runtime-log/drain audit performed; targeted live checks above are the release evidence.
