# Normal Stories while hosted article links are unfinished

The owner explicitly requested normal Story publishing for Milo and the editorial
team before the server Meta login is complete. This supersedes blocking all
Stories until the linked-Story connection exists. Keep the existing black UI,
Poppins Foto design, mobile controls, server publishing and personal confirmation.

When the hosted link connection is ready, Story still selects the linked route.
Otherwise, a configured normal Instagram publisher enables Udgiv. The confirmation
says Udgiv Story på Instagram uden klikbart artikellink and Udgiv uden link. It
freezes an explicit storyLinkMode=none in the approved snapshot and request. No
extra export or personal Meta login is required to use this existing normal route.

The server uses the existing Graph STORIES publisher only for this explicit mode
or the preserved legacy non-hosted contract. A requested article link still
requires the browser connection and never falls back on failure. Feed posts
remain separate. No new dependencies, credentials, permissions or worker change.

The retained approval records the optional mode. Missing historical values and
all publication IDs stay intact. Link mode is deliberately excluded from both the
semantic duplicate identity and the existing client request journal: changing
modes cannot resend an existing or uncertain Story. Existing operations replay
their original receipt and delivery. A plain Story creates no hosted task and
its new receipt explicitly says it has no clickable article link.

No real Story or feed post is published during implementation or UI verification.

## Production verification

Source 92bb29653c28090c4102444a9d482a1fea08febb, deployment dpl_FfmY3XED5pcfm5T7msy3AkX4f1AD, production alias
ai.aproposmagazine.com confirmed by fresh readback. The exact release includes
the prior mobile editor, shared-status and audio changes. Turbopack, TypeScript
and 254 pages passed; scoped lint and 83 focused checks passed in the isolated
release worktree. The editor-route test uses a non-owner identity, verifies the
normal STORIES payload and stored approval, and proves no browser task, fallback
or repeated media_publish is created by mode changes. Linked requests still
stop if their connection fails. Historical and queued identities remain locked.

Actual authenticated production with the link connection missing: selecting
9:16 enables Udgiv and explains that normal Stories have no clickable article
link. Opening Udgiv shows the exact no-link confirmation and an enabled Udgiv
uden link button. At 390x844 the dialog fits without horizontal overflow. The
final send was never clicked; Annuller closes it. Restored the original Foto /
1:1 format, unchanged title/subtitle, and read Gemt. Normal feed Udgiv stays
enabled. Browser error count: 0. Format verification uses ordinary autosave and
was restored before ending the test. No Milo account login or real Meta post
was performed. Server route execution is covered with mocked provider responses,
not represented as a new live publication.

The initial staged deployment dpl_61BeiH2HaDe6nqAgbXXeev8FVVer carried an
incorrect manually entered SHA label. It was canceled with CANCELED readback
before promotion. The replacement command reads the exact SHA from the release
manifest and checks it against the worktree HEAD. Only the exact replacement
above was promoted. No credentials, session access, worker or environment
variables were changed. Hosted clickable-link acceptance remains separate and
open. Evidence: output/plain-stories-20261102/.
