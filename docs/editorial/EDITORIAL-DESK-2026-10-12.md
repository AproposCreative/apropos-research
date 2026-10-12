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
