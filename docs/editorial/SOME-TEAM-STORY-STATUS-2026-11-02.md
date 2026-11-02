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
