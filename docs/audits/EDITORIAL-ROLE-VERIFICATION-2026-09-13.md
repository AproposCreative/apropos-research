# Live editorial membership verification

Checked at 2026-09-13T15:57:16.977Z against ai.aproposmagazine.com.
Production version at start: cb4e465. Existing approved credentials stayed in
memory; no secrets or full access-list responses were printed.

One temporary verified external Firebase identity was used. Its email was under
example.invalid, and no email was sent. Membership changes used the application
administrator API with the existing administrator, not a direct membership write.

| Operation | HTTP |
|---|---|
| External user before membership, auth/access | 401 |
| Existing administrator approves editor | 200 |
| Same external token after membership, auth/access | 200 |
| Editor reads editorial/operations | 200 |
| Editor attempts admin/access GET | 401 |
| Existing administrator suspends membership | 200 |
| Same external token after suspension, auth/access | 401 |

Fixture uid: codex-role-audit-20260913-b837. Its Auth identity and membership
document were removed and their absence verified. The approval/suspension audit
records remain. No existing user, article, media, newsletter or publication changed.
No paid model calls occurred.

20 local role/route tests also passed, including atomic membership+audit writes,
server-owned updatedBy, invalid inputs and administrator-only reads/writes.
These do not substitute for remaining visual UI checks or every Firebase rule.
