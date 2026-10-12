# One personal approval in the article preview

Owner request: read and approve the article inside ChatGPT, with an optional
external preview, without returning to chat to announce approval or approving
the same version twice.

## Implementation

- MCP v23 (`2026-10-12-v23`) reuses `preview_submission`, the existing MCP App,
  submission records, CMS preparation worker, publication service and cron.
- Complete ChatGPT-first/human-review submissions offer **Godkend og udgiv**
  (or **Godkend og planlæg**) after the actual article, images and metadata.
  Missing images, inaccessible preview images or conflicting versions stop it.
- One genuine personal UI click records `publicationConsent`, including user,
  revision, content hash, editorial fingerprint, exact imported-media hashes,
  media-selection evidence and chosen publication time. A generated-image warning
  remains visible; the same explicit click can choose the shown images. No claim
  is made about the generator's hidden input.
- Preparation and publication then execute server-side, with no paid AI calls.
  The persisted consent authorizes the prepared version only when all editorial
  fields and selected media still match. Only technical normalization such as
  image dimensions is tolerated. A different version requires a fresh preview.
- `after()` starts the bounded continuation. The existing cron resumes the same
  consent after interruption, including the boundary after CMS preparation and
  before publication. Existing worker leases, CMS-write leases, duplicate guards,
  attempted-write markers and CMS/public readback remain in force.
- Double clicks and lost responses reuse the consent. A timed-out publish still
  reconciles the existing receipt; it is not blindly published again.
- The card polls read-only status for up to two minutes; the server continues
  independently. No "I approved" chat message is required.
- **Åbn eksternt** uses the same personal preview and consent. Sharing the URL
  does not grant another person access or approval rights.
- Older preparation-only approvals are NOT upgraded to publication consent.
  Existing legacy workflows, provider holds, budgets and Liv delivery history
  remain unchanged. A personally approved article is not unattended Liv delivery.

The UI-only confirmation tool still requires the opaque token from result
`_meta`, current OAuth identity/grant/scopes, expiry and exact version. The token
is not model-facing structured content. No model tool can invent personal approval.
ChatGPT may additionally display its own platform security confirmation; this
release removes the duplicate Apropos business approval, not host safeguards.

## Evidence before deployment

- Full isolated suite: 373 files / 5173 tests passed. After the final pending-state
  UI guard, all affected tests and browser fixtures passed again.
- Focused final server/widget regressions: 5 files / 42 tests passed, including
  one-click preparation/publication, double click, lost acknowledgement, crash
  after preparation, old-approval non-escalation, changed content/media, revoked
  membership, different owner, missing fields, scheduling and no repeated button
  at the prepared/automatic-publication boundary.
- Typecheck, changed-file lint and security configuration check passed.
  No new dependencies.
- Mobile (390 × 844) and desktop (1200 × 900) simulated MCP App hosts passed:
  opening does not approve; one click queues and automatic polling reaches the
  simulated receipt; optional external link works; no horizontal overflow.
  Screenshots inspected. These are isolated fixtures, NOT personal ChatGPT mobile
  approval, actual CMS publishing or evidence of unattended operation.
- The preparation/publication orchestration tests exercise the real local server
  services with external CMS/network transports mocked. They do not substitute
  for a genuine user's next production click.
- Python skill validator could not run because PyYAML is absent. The unchanged
  frontmatter and updated instructions are independently checked with the already
  installed Node YAML parser, without adding a dependency.

At read-only baseline verification, Kontrapunkt was already **published/revision7**
with hash `db73ca2a1384fdf3fdc65e7698544153e479ebe534c52c0c71e309479c250ade`.
Klubkultur was already **published/revision5**. Neither was published by this
implementation test and neither will be reapproved or republished to demonstrate
the change. Somebody Somewhere remains an existing unapproved draft/revision8,
hash `b8ce88481ad01a6a04d5e9a10d56d75455615a1354a6edfd9f07bce9bcc9f967`;
use only a read-only preview to verify the deployed new action.

## Official mechanism references

- https://developers.openai.com/plugins/reference
- https://developers.openai.com/plugins/build/chatgpt-ui

The MCP App is the approval surface, with standard `tools/call` and compatible
`window.openai` support. No browser-cookie authentication, external ChatGPT
endpoint, model purchase or manual CMS fallback was introduced.

## Release and fresh readback

- Source SHA: `a10678e6be7df79ed65f8a1bdb2830b24549bfad`.
- Deployment: `dpl_Dgs2X78EoBamZ157tCA4x7i4AjPk`, remote build succeeded,
  READY at `2026-10-12T11:12:50.413Z` with actual `ai.aproposmagazine.com` alias.
- Fresh connected Apropos MCP preview on the existing Somebody Somewhere
  submission returned the one-click offer `Godkend og udgiv`, revision8,
  zero missing fields, zero preview problems and no dependency error. The host
  does not expose its private confirmation bearer in model-facing tool output.
- Final authenticated status at `2026-10-12T11:14:22.897Z` confirms unchanged
  article, research, choices, media imports and content hash; still unapproved,
  `awaiting_preparation`, with no CMS item or publication consent.
- Article cost actions were empty before and after. No model call, article
  creation, media import, approval, CMS write or publication was performed for
  production verification. MCP error/fatal log query in the bounded release
  window returned no records; this alone is not full runtime proof.
- Read-only browser inspection of the primary editorial thread confirmed its
  older messages/cards still exist. No follow-up message was sent, no idea was
  started and no personal approval button was clicked. Request a fresh preview
  for the updated workflow; historical chat text is not rewritten by deployment.

See `SINGLE-APPROVAL-2026-10-12-production.json` for the sanitized receipt.
The implementation, deployment and real connected preview are verified. A real
person's next one-click publication has NOT been performed by the agent and is
not claimed as production end-to-end publishing evidence.
