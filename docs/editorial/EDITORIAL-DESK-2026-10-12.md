# One editorial front door — 12 October 2026

Owner request: combine recommendations and existing article work in the existing
`⭐ Apropos – Redaktion · START HER` chat, with an explicit **Start denne idé**
choice. No extra AI platform, duplicate articles or paid backend generation.

## Implementation

- Reuses `writerWorkspaces/{uid}` for private idea records and import receipts.
  A bounded brief contains up to five ideas, original source notes and caveats.
- `save_editorial_ideas`, `get_editorial_desk`, `get_editorial_idea` and
  `start_editorial_idea` use existing OAuth scopes, UID isolation, audit and
  `withoutPaidAi`. MCP version `2026-10-12-v21`, 57 tools.
- Stable subject/angle and request identities prevent duplicate imports. A
  repeated brief cannot silently overwrite a selected idea. Selection uses a
  revision check and is recoverable after timeout.
- Selection does **not** create a blank article, execute a model or approve
  publication. It hands a stable `editorialIdeaId` / `requestId` to ChatGPT.
- `get_workflow(editorial)` reuses the canonical editorial context and existing
  submission workflow. Actual writing uses `prepare_submission`; continuation
  uses the same submission and `expectedRevision`. Liv dates/reserve identities
  are separate and cannot be passed along with an editorial idea identity.
- The MCP App displays idea cards and saved article previews. Button messages
  contain IDs and fixed instructions, never source-provided instructions. Plain
  text rendering, HTTPS source links and no external widget fetches.
- `preview_submission`, image handoff, CMS mapping, personal preparation and
  version-bound publication approval remain unchanged. No CMS/site publication
  or provider/ledger reset is part of this release.

## Evidence and boundaries

- Isolated full suite: **372 files / 5,142 tests**; typecheck, focused lint and
  security configuration passed. Test storage: `./tmp/vitest-rage`.
- Real browser with isolated host verified selection → refreshed selected state
  → fixed ChatGPT handoff, and preview → read request with no approval. This is
  a simulated host, not yet evidence of a native ChatGPT user click.
- Draft/idea overviews explicitly report bounded coverage. Ideas and sources
  are unverified leads, not finished stories or editorial fact approvals.
- Deployment, authenticated runtime, native ChatGPT discovery and cloud schedule
  integration must be recorded below when observed. Future scheduled runs are
  not verified by saving their configuration.

## Existing destinations

- Primary: https://chatgpt.com/c/6acb2584-2f20-83eb-a335-031a584b8d3b
- Existing idea chat: `6aa85b2f-7ff8-83eb-bf06-c0f977db85ee`, weekly task
  `6aa96adde16c81919ebdae85a26c26b9`.
- Existing Liv cloud task: `6aca1ef7152c8190a8e9f2ce3d0b2ff3`.
- SEO remains separate. Existing history, articles, assets and approvals remain
  intact; no new research article is chosen for the owner during integration.

## Production and native ChatGPT acceptance

- Release `cbd849d28a608ade643d97953f67f3c53cc2adfb`, deployment
  `dpl_3ET8F5crBjTPP1WHBNwX2DNTVvCW`: READY with the actual
  `ai.aproposmagazine.com` production alias. Built from exact Git SHA.
- Authenticated MCP initialized v21/57 tools. Imported the five leads from the
  owner's existing weekly brief through `save_editorial_ideas` at
  `2026-10-12T08:28:49.725Z`; identical replay at `08:28:51.593Z` reused all IDs.
  Request `editorial-brief-2026-10-12-v1`. Dates/events/source contents in that
  imported brief remain explicitly **unverified**; no proposed rating imported.
- All five remain `suggested`; no selected idea, generated article or new CMS
  item. Current unpublished submissions were reused, not reconstructed.
- Widget resource, editorial workflow, caller-UID rejection and bounded inventory
  verified on authenticated production. Temporary verification grants revoked.
- The first global unchanged-record assertion correctly detected a concurrent
  change to the separate October 12 submission. Fresh status showed its existing
  publication receipt at `08:28:52.461Z`; this integration neither approved nor
  published it. Its article revision/content hash remained the previously saved
  version. Do not overwrite the concurrent publication or claim the entire record
  was unchanged during that first pass.
- A separate read-only pass finished `08:30:35.241Z`, with identical before/after
  hashes for provider hold, shared/image ledgers, Writer and the three protected
  submissions. This is not a fresh provider billing-balance measurement.
- Refreshed the **existing** Apropos plugin's tools through its official UI; no
  permission, account or CSP setting changed. Native ChatGPT then rendered all
  five idea cards, Start buttons and the two actual private drafts in the existing
  primary chat. Its **Opdatér overblik** button successfully called production.
  Native read audit `08:33:51.905Z`, refresh `08:34:15.303Z`, all
  `paidAiAllowed=false`. No real idea was selected just to test the button;
  selection/follow-up was tested in the isolated host and service regressions.

## Existing cloud schedule integration

- Updated task `6aca1ef7152c8190a8e9f2ce3d0b2ff3` in place, name now
  **Apropos Redaktion – Liv og idébrief**. Daily 08:00 Denmark time and all prior
  Liv cadence, reuse, no-paid-AI and personal-approval rules retained verbatim.
- Added Monday-only, maximum-five idea brief with source verification, stable
  weekly request and saved-work deduplication. It saves through MCP, never chooses
  all ideas or authorizes extra automatic stories. Finish each run with the shared
  editorial desk and main-thread link.
- UI confirmed saved task and next run **13 October 08:00 GMT+2**. Existing UI
  reports “Same chat for every run.” No new schedule or manual Run now.
- Paused the replaced task `6aa96adde16c81919ebdae85a26c26b9`; UI confirmed
  **Paused / Resume**. Its original prompt and conversation are retained. This
  prevents duplicate Monday research; the first merged Monday run is still future.
- The primary chat is the common **data/interaction entry point**, not a claim that
  ChatGPT silently merges old conversation histories. If the host supplies a
  separate scheduled result view, the shared MCP state and primary-thread link
  remain the bridge. Future timer delivery is not yet verified.

## User operation

Open the starred primary chat and write **Vis redaktionen**, or use the existing
live desk. Select **Start denne idé** for one idea. ChatGPT checks its premise,
researches and continues the existing submission flow. **Åbn artikelpreview**
opens saved drafts; only the owner's separate personal approval can publish.

The design skill kept this in the existing monochrome preview style with readable
source caveats and a single explicit start action, rather than a new dashboard.

## Continuous collection and website start action, 31 October 2026

The owner requested automatic collection of future suggestions from other chats
and completed searches into the existing Liv overview, and expandable ideas with
a start action. This is collection of existing recommendations, not permission
to run the paused Liv producer or automatically select/write/publish an article.

All editorial chats use the canonical private `save_editorial_ideas` store. MCP
instructions require saving recommendations before claiming they are saved.
Desk responses expose the original `topicKey` so another chat can reuse it.
A separate scheduled collector in this local conversation checks for changed
editorial result chats every 30 minutes. Local scheduling requires the Mac and
ChatGPT desktop app to be running; this is not a server-hosted ChatGPT-history
subscription or an instant webhook. The independent read-only Liv observer and
paused producer remain unchanged.

Collector contract:

- Work in this checkout. State is private, local JSON at
  `output/liv-idea-collector/state.json`; preserve existing watermarks/receipts.
- List existing threads; inspect only Apropos editorial/idea/review chats and
  completed editorial searches. Exclude this implementation conversation, SEO
  repair results, mail, technical operations and unrelated personal projects.
  Seed sources are `6aa85b2f-7ff8-83eb-bf06-c0f977db85ee`,
  `6acdcb78-6a40-83ed-a824-7ec067b96f5f`,
  `6acb2584-2f20-83eb-a335-031a584b8d3b`,
  `6acc9d84-cf74-83ed-a0a4-11f13e9e36fc` and
  `6a836b7d-4064-83eb-bc14-849085ca36fb`.
- Use listing timestamps only to find changed chats. Read actual messages with
  cursors before importing; titles/summaries are not reading evidence. An active
  search has no completed recommendation yet. Do not mark unread pages as done.
- Read the canonical desk before saving. Match the actual work/season and angle,
  reuse existing topic keys/IDs, and check CMS coverage for proposed new work.
  Do not create a fresh duplicate because an old idea is retained or selected.
- Import explicit review/culture-guide recommendations only, never every search
  hit, status-mail topic, news item, job, announcement or already published work.
  Retain source chat URL, source date and concrete source links with reading
  notes. Old ratings, quotes and source claims are unverified until actually
  checked. Unknown reading coverage remains unknown. No first-hand invention.
- Use `save_editorial_ideas`, at most five per batch, with stable request/topic
  keys. Preserve existing ideas, selected work, article revisions, media and
  approvals. Store message/hash and idea-level progress after confirmed readback;
  a partial batch must remain queued. After timeout read back before retrying the
  same request; never use a new request ID to evade a conflict or rate limit.
- No messages to other chats/people, producer/scheduler changes, paid backend AI,
  article selection, preparation, CMS writes, publication or budget mutations.
  Do not call `start_editorial_idea`; the owner starts one chosen idea in the UI.

The website refreshes just the private idea projection once per minute while
visible and on return/focus. It preserves expanded cards, selections and stored
work. Connection failure retains old data and displays an honest short message.
Opening a card lazily reads its full angle, practical reason, sources and caveats
from authenticated `/api/editorial/ideas?id=...`. A personal Start click calls
the same revision-bound `startEditorialIdea` function as MCP. No blank article or
publication approval is created. Lost responses are read back, not blindly posted
again. Existing submissions link to their original preview.

The website cannot inject a message into an existing ChatGPT conversation. After
selection it supplies a fixed ID-only start message, a copy action (manual text
fallback when clipboard access fails), and the existing starred editorial chat.
The owner pastes that message there to start ChatGPT work. A copied message or
opened chat is not reported as actual research, generation or publication.

Validation before release: 130 focused tests, application TypeScript and safe
build configuration. The actual UI in an isolated host verified expansion,
sources, visible automatic refresh with an open card, double-click protection,
lost-response readback and continuation with the same idea and one saved
selection. Fixture polling was accelerated to two seconds; production is 60.
No real production idea was selected as a button test. Release, live readback
and schedule receipts are recorded after they complete.


Collector schedule receipt: `saml-apropos-id-er`, ACTIVE heartbeat attached to
this existing local conversation, every hour at :00 and :30. Notifications are
limited to failed runs. Native view rendered the task; its saved configuration
confirms the same thread and cadence. Five seed source-message watermarks were
preserved in `output/liv-idea-collector/state.json`. A manual metadata pass found
all five sources and no timestamp newer than the already-read snapshots, so no
new imports or repeated deep history reads were performed. This verifies the
collector checkpoint and schedule configuration, not a future scheduled run.
