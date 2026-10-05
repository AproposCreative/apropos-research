# MCP login: disappearing form on window focus

## Report and diagnosis

The owner reported a white page while entering the password in the ChatGPT
connection window. The existing production was `71b383693a3a5fc6e90aa4fd988c014db64a92e2`,
deployment `dpl_ANKsCy7f47eFmbECEU4tcBuXqfgp`.

The Chrome connection window could lose its entire visible form when the password
input was focused/filled, without submitting credentials. It subsequently
returned with the input empty. No application JavaScript exception was captured.
Two scoped Vercel runtime-log queries timed out; they are not evidence of clean
server logs.

`AuthProvider` revalidates the saved Firebase session on window focus. If that
session has not been accepted, it sets `loading=true`, removes all children on a
non-AI route, and resets the login component. Password-manager/window-focus
interactions can therefore erase a login attempt. The connection component's own
loading message was unreachable because its parent removed it first.

A local-only fixture running the real auth provider and connection component,
with a simulated rejected persisted session, reproduced the detached password
input before the change. No real password was read or submitted. A separate
service-authenticated read of the production access endpoint returned 200,
`allowed=true`, `owner=true`; the owner account was verified and not disabled.
That check does not prove the user's browser session or actual ChatGPT connection.

## Repair

- Window-focus revalidation remains enabled, but runs in the background and
  does not unmount the sign-in form. Stale identity/capabilities are still cleared,
  and the existing generation guard still rejects stale responses.
- `/connect/chatgpt` keeps its own dark shell mounted during initial/sign-in
  checks. It shows a meaningful loading status rather than an empty document.
- Token refresh and the access response have a shared 20-second deadline;
  timed-out requests are aborted, and a late token cannot start another request.
- Explicitly denied access, unavailable checks and timeouts remain distinct.
  The form now shows the access error instead of silently restarting.
- Explicitly authenticated fetches no longer fetch the same token a second time.
- No server-side authorization, owner-only scope, OAuth confirmation, publication
  check, provider hold, budget, saved work or team access was loosened or changed.

## Verification before deployment

- 57 focused tests pass (access client, OAuth and connection inventory), including
  10 new checks for permissions, malformed responses, timeout, network errors and
  late-token suppression.
- Full isolated suite: **344 files / 4,813 tests pass**, with
  `RAGE_STORAGE_DIR=./tmp/vitest-rage` and the existing no-paid-API test guard.
- TypeScript, scoped TS/TSX ESLint and safe-build configuration validation pass.
  The standalone `.mjs` fixture is excluded by the existing ESLint configuration;
  it was executed and exercised in Chrome, not counted as linted.
- Local Chrome fixture now reports `PASS: Samme felt og indtastning bevaret`
  after focus revalidation. Simulated successful sign-in reaches the explicit
  `Forbind ChatGPT` consent button without automatically granting access. No
  browser errors were captured.
- Reproduce the isolated UI manually with `node scripts/mcp-login-ui-fixture.mjs`,
  open `http://127.0.0.1:3935`, enter a disposable test value, and select
  `Genkontrollér gemt session`. The fixture never contacts production, Firebase,
  AI or CMS services.

Production verification is recorded below after the exact release is ready.
The owner's actual password login and final ChatGPT consent remain theirs to
perform and must not be inferred from simulated/service checks.
