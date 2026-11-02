# Shared Story connection status for the editorial team

Milo's screenshot shows a saved prior Instagram receipt and a new Story attempt
blocked because the owner has not connected Meta on the hosted browser. These
are distinct events. Read-only production inspection confirmed the owner screen
still offers Tilslut Meta. No personal login or publication was performed.

Authenticated editors now receive a bounded shared readiness status from the
existing publish GET. It reads only the worker's /status and returns connected,
not_connected, not_configured or unavailable, never session data or login
controls. Only the owner retains access to the existing connection screen.
Timeouts and invalid responses remain unknown, not a claimed missing login.

The Story editor checks readiness before enabling publication, uses the editor's
Firebase bearer identity, and refreshes on return to the window or explicit
Kontrollér forbindelse. A team member sees an explanation that the owner must
connect the shared account; only the owner sees the connection link. Feed
publishing retains its separate Graph configuration. The Story link panel no
longer promises automatic linking while disconnected.

Prior receipts show their retained format: Instagram-opslag or Instagram Story.
The heading says Seneste udgivelsesforsøg. No receipt, date, channel result,
publication identity, retry lock, queued task, account access, credential or
saved draft is rewritten. POST still independently checks the connection before
claiming a new Story, and preserves exact replays of existing attempts.

Hosted acceptance remains open: personal Meta login, durable-session readback
and an explicitly selected real linked Story have not been completed by this
change. No retry, login, Story, feed post or Facebook comment was sent.

## Production verification

Source 0fbd7684eabe0eb2913d2828da7743cfd06ccfae, deployment dpl_E4ojYaX6V5n2PMP9gDfpFBG2viTP, production alias
ai.aproposmagazine.com confirmed by fresh readback. The exact release includes
the concurrent audio coordinator from base 8448ba299228ccbd0ae74769733856d3e3338608.
Turbopack, TypeScript and all 254 pages passed. Scoped lint and 65 focused
checks passed, including authenticated editor readiness, owner-only login access,
unknown response handling, non-dispatch, exact replay and unchanged draft sync.

Actual owner production UI independently read the missing shared connection.
Story Udgiv was disabled before any publication attempt; explicit Kontrollér
forbindelse returned the same status. At 390x844 the notice fits without
horizontal overflow, the existing mobile disclosure remains collapsed, and
the retained prior receipt says Instagram-opslag / Udgivet. Switching back to
the original Foto / 1:1 restored the existing title and subtitle and read Gemt;
feed Udgiv remained enabled. That temporary format check uses ordinary draft
autosave and was restored before ending verification. Browser error count: 0.

The actual React notice and receipt components were separately checked in a
local fixture for editor and owner: editor sees no owner login link, owner does,
and an unavailable server never asks for a new login. Fixture roles are test
data, not a real Milo session. Production editor access is covered by route
tests; no colleague account was entered. No post, Story, comment, personal Meta
login, credential change or automatic retry occurred. Hosted linked-Story
acceptance remains open. Evidence: output/team-story-status-20261102/.
