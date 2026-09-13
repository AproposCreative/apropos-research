# Onboarding follow-up, September 14

## Scope

- Email/password registration for the three permitted editorial addresses sends
  the first verification request immediately through the existing authenticated
  `/api/auth/mail` operation. No render effect or background resend loop.
- A failed mail step explicitly preserves the created account and directs the
  user to verification, not a second registration. An existing-account error
  directs the user to login/password reset.
- The Writer authentication dialog now links to email/password login, so Google
  is not a prerequisite. Existing verification checks and server access policy
  remain unchanged.

## Evidence

- 18 focused signup, verification, mail route, middleware and service tests pass.
- Isolated mobile browser fixture at 390 x 844 uses the real login/dialog and
  signup helper with fake auth/mail dependencies. Successful registration made
  one create and one send call, then navigated to the verification dialog.
  Failed sending made one create and one send call, displayed the account-created
  error and retained a working verification link. No uncaught browser errors.
- Fixture excludes the decorative remote Spline and logo assets. It is not a
  production delivery or end-to-end Firebase test. No team mail was sent and no
  paid AI operation was run by these tests.
- Casper/Milo delivery receipts are recorded separately in
  `TEAM-VERIFICATION-2026-09-14.md`; actual recipient verification/login remains
  separate acceptance evidence.

Release/build and exact production verification are recorded after completion;
this checkpoint alone does not establish deployment.
