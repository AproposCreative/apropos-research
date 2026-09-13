# Media-account isolation continuation

## Production observation before implementation

Read-only authenticated application APIs at 2026-09-13T22:52Z reported:
- Auto-publication and preparation enabled, no overdue daily publication.
- September 14 Lucian Freud, September 15 Frankenstein and September 16 Klovn
  are ready, with no recorded publication blockers. September 14 is not yet
  published; this is not a publication receipt.
- Shared tracked usage upper estimate 48.39712 DKK, 309 calls; not an invoice or
  full monthly spending total. No paid generation was initiated for this check.

## Local changes, not yet released

- Legacy MediaProvider read/wrote account-ambiguous `mediaStates` localStorage,
  loaded personal source data once, and auto-enabled newly returned source IDs.
- It now reads the current user's API choices with an explicit token and
  no-store, ignores late request responses and gates rendered data by owner UID.
  Old unowned browser data is preserved but not imported. Unused local-only
  toggle methods were removed after checking callers.
- Source-load failure is explicit with a retry action in MediaNav.
- Alle medier now matches article domains to actual personal source IDs,
  respecting disabled choices and preventing unrelated URLs from matching by
  a misleading source label. No fallback to all sources on missing choices.
- Nine focused selection/matching tests and TypeScript pass.
- Known legacy publisher counters and bookmarked slugs now resolve to saved
  source IDs. Canonical zero counters are not replaced by legacy nonzero values.
- Successful panel add/toggle/delete notifies the mounted source context with
  the acting UID; other users' events are ignored and fresh API reads are used.
- Mobile browser fixture uses the real panel plus MediaProvider. One selection
  immediately updated the consumer; delayed A read after switching to B left B
  empty; read failure displayed an explicit error; returning to A restored only
  A's saved API data; logout cleared the consumer. No uncaught fixture errors.
  No production source data or paid APIs were touched by these tests.

## Remaining acceptance before release

- Full regression/build and exact deployment/readback. Do not claim the local
  changes have fixed all private workspaces or are live.
