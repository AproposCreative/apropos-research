# Private workspace acceptance checkpoint

## Conflict UI acceptance and read retry (local follow-up)

September 14: extended `verify-writer-resume-ui.mjs` with isolated conflict,
version-list/detail and idempotent restore transports. The actual Writer parent,
workspace hook/controller and version dialog are rendered together at 390x844.
The real server restore and workspace handlers remain covered separately by
the existing integration tests, not by this browser fixture's fake transport.

- Advance the fixture server revision after initial read, then explicitly resume
  the older client snapshot. Its next save receives 409. Writer displays
  `Konflikt: Begge versioner er bevaret` and retains the local title/text.
- Navigate through the real menu, Drafts and Gemte versioner. Select the conflict
  copy and use `Åbn som ny kopi i Writer`.
- Simulate server restore commit followed by a lost response. The dialog remains
  open with an error. Click restore again: the two POST bodies are identical,
  there is one operation receipt and revision remains 3, not a duplicate 4.
  The dialog closes and Writer adopts `restored-fixture-draft`. Fixture history
  contains both the newer server title and pre-restore local title. No uncaught
  browser errors. This does not prove live Firestore records were preserved.
- Found missing direct retry when reading versions fails. Added
  `Prøv at hente igen`, scoped only to read failures, using the same selection
  and authenticated fetch effect. Restore failures keep their existing retry.
- Verified 503 -> explicit retry -> empty successful list in the real dialog,
  without closing it, with zero mutation requests, no uncaught errors or mobile
  horizontal overflow. Screenshot inspected.

28 targeted controller/multidevice/server-restore tests and TypeScript passed.
No AI/CMS calls, no production workspace writes. This retry change is not yet
released. Real-account cross-device acceptance and Writer-to-Webflow-draft
acceptance are still open.

## Follow-up: remove competing chat cache (released September 14)

Release `5940383e1b7544b35b33e61e0fd741903232c219` is READY in deployment
`dpl_AARsV3npChSTnppAxNP3g7G5TCs1`, with `ai.aproposmagazine.com` assigned.
Full isolated regression: 3,408 tests in 237 files passed. Production build
passed, retaining nine known file-tracing warnings.
Post-deploy read-only check: `/ai` 200; its 16 script resources contain
`workspaceStatus` and the canonical `ai-writer-autosave:v2:` key, and no longer
contain the obsolete `ai-writer-draft:v2:` key. Anonymous workspace GET is 401.
This proves release delivery and the anonymous gate, not a production draft
write or a new Liv publication. No production workspace records were changed.

Reviewing the actual Writer UI found that MainChatPanel independently persisted
another browser snapshot and restored just its old title on mount. This could
rename fresh work without an explicit resume choice. Removed that secondary
writer/loader and its optimistic timestamp; chat now displays the parent
workspace sync status. The obsolete stored browser key is not deleted or
silently imported. The canonical local backup and cloud workspace remain.

Two architecture regressions guard against reintroducing that independent
store. All 27 focused workspace/ownership/controller tests and TypeScript pass.

Browser evidence, September 14: `scripts/verify-writer-resume-ui.mjs` renders
the actual AIWriterClient, MainChatPanel, DraftsShelf, WorkspaceVersions and
useWriterWorkspace/controller in StrictMode at 390x844. Auth, workspace API,
Firebase draft storage and unrelated feature panels are isolated fixtures.
No production records or paid providers are accessed.

- Open menu -> Drafts -> Fortsæt hvor du slap restores the saved title, chat
  text and notes; seeded obsolete cache title is never applied.
- Initial cloud resume discovery performs no PUT before the explicit choice.
- Resuming normalizes article defaults and saves through the existing hook.
  With fixture transport offline, both status displays show Ikke synkroniseret,
  no uncaught errors, and server revision stays 1.
- Reconnecting via the browser online event retries successfully; both status
  displays show Gemt, server revision 2 retains title, notes and chat text.
- Screenshot inspected after closing the automatically opened review drawer:
  saved title and text are visible in the mobile chat, with its save status.
  The review panel itself is stubbed and not verified by this fixture.

Fixture limitations: not real Firebase devices, not full conflict/version UI
acceptance, and not Webflow draft submission. The separate New action was not
accepted here because the isolated Firebase saveDraft intentionally rejects
writes. Server and browser were closed. Full regression/build/release were
subsequently completed as recorded above. The wider acceptance gaps remain.

## Integration evidence

`test/writer-workspace-multidevice.spec.ts` connects two actual
WriterWorkspaceSync controllers to the actual GET/PUT workspace handlers.
Only authentication verification and Firestore transport are fixtures.

Verified:
- Device B offers A's saved work for explicit resume, without an empty overwrite.
- Concurrent edits preserve the accepted server text and a separate conflict.
- A lost successful write response retries the same body, does not add a
  duplicate revision, and then saves newer local text.
- The owner-role fixture cannot read another UID's workspace by injecting its
  UID into the query string.

This is not real-device/browser or production Firestore acceptance. Existing
production drafts were not changed and no paid API work was performed.

## Local fix found during review

The local autosave waits two seconds; immediately hiding/closing the page could
leave the most recent queued edit unwritten. Added a synchronous local-only
flush on pagehide and hidden visibility state. Clearing work or changing owner
still cancels pending data; no old-user write is transferred to the next user.

31 focused workspace/autosave tests and TypeScript passed at the first checkpoint.
Added two lifecycle tests for hidden-only flushing and listener cleanup.

Browser fixture uses the actual autosave service and the same lifecycle binding
called by Writer. At 390 x 844, a click queued new text and immediately navigated
to a new page. The new page loaded that exact saved text, with no browser errors.
The fixture does not render the full Writer or use production user storage.
This covers normal page lifecycle events, not operating-system force termination
or browser storage failures.

## Release receipt

- All 3,406 tests in 236 files and production build passed. Nine pre-existing
  file-tracing warnings remain.
- Deployment `dpl_67Hky2EwJLREq7QzxPvtFub2YwZ1` READY for
  `344daf2c3b40da2ff8da09e37be3ec18c89f97c3`, production alias attached.
- Production `/ai` returned 200; served JavaScript contains pending autosave
  handling and the pagehide/visibilitychange listeners. Anonymous workspace
  access returned 401. No production workspace data was changed.
- Full-Writer cross-device/offline UX acceptance and the broader goal remain
  open; the isolated tests are not substituted for those requirements.
