# Mobile workspace navigation

The global fixed workspace toolbar overlapped the launcher on mobile. Removed it
and moved sync status, retry and resume controls into Mine artikler, next to its
existing entry points for versions and shared copies. The launcher now scrolls
on short screens rather than vertically centring content outside its viewport.

Verification before release:
- Typecheck and production build passed (nine existing tracing warnings).
- Draft shelf data tests: 2 passed.
- Real launcher and shelf components in isolated API-free browser fixture,
  390x844 and 320x568: last tile reachable, no horizontal overflow, no workspace
  controls on launcher, click-in shelf and close-to-menu work.
- Version/share callbacks fired and fixture recorded no runtime errors.
- No live generation, publication, mail or paid AI calls used for this UI test.

This release also contains previously committed opt-in reserve preparation code;
its production flag is not enabled by this change.
