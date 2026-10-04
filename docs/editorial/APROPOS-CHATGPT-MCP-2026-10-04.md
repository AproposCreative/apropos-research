# Apropos i ChatGPT: private owner pilot

Latest release: **2026-10-05-v2**, code `f1fc0b8`, deployed and service-verified
on 5 October at 00:57 Copenhagen. It adds ChatGPT-supplied shortening with a
personal review and the existing Liv CMS service, without paid AI. It retains read-only publication status after
midnight, the [sequential-save repair](MCP-SEQUENTIAL-SAVE-2026-10-04.md),
retained-work discovery, shared exact-copyedit preview/apply, concrete editorial
diagnostics, short on-demand workflows and 20-article metadata regression:
**28 tools total**. The setup page also shows connection evidence.
See [external-shortening evidence](MCP-EXTERNAL-SHORTENING-2026-10-05.md),
[publication-status evidence](MCP-PUBLICATION-STATUS-2026-10-05.md),
[v4 evidence](MCP-SEQUENTIAL-SAVE-2026-10-04.md),
[v3 metadata evidence](MCP-METADATA-REGRESSION-2026-10-04.md) and
[v2 acceptance and remaining boundaries](MCP-EDITORIAL-WORKFLOW-2026-10-04.md).
The v1 evidence below is historical, not the latest deployed SHA. Actual owner
ChatGPT-client acceptance remains pending; no live article was published as a test.

## Product boundary

This adds a thin, authenticated MCP interface over the existing platform, not
another writer/CMS/queue. Frederik can use his ChatGPT conversation to research,
write and work on retained Liv material, then save through Apropos. ChatGPT's
subscription limits still apply; this is not API credit and does not turn a
ChatGPT subscription into a Vercel background worker. Hosting/CMS/database work
still has its normal costs. No savings percentage is claimed.

The existing Liv cadence, budgets, provider hold, source/media/editorial checks,
private user workspaces, receipts and Instagram-off policy are unchanged.
Casper and Milo do not have access to this pilot. No team release is implied.

## Connect

Owner settings → Integrations → **Apropos i ChatGPT**, or
https://ai.aproposmagazine.com/connect/chatgpt .

In the owner's ChatGPT web account, enable developer mode where available in
Settings → Security and login → Developer mode. Open Plugins → +, create a
private connection named Apropos, and use:

```
https://ai.aproposmagazine.com/mcp
```

Select OAuth and let ChatGPT register the public client automatically. Sign into
Apropos with Frederik's verified account and approve the requested scopes.
Availability and organization admin policy remain the ChatGPT account's rules.
No API key or shared team password belongs in the conversation.

The setup page now includes a copy button and an explicit read-only connection
check. It distinguishes retained authorization from an observed successful tool
call and never presents either as a completed edit/publication or real-client
acceptance. See [connection setup verification](MCP-CONNECTION-SETUP-2026-10-05.md).
Current ChatGPT menu reference: https://developers.openai.com/plugins/deploy/connect-chatgpt .

Suggested first request:

> Hent Apropos' redaktionelle regler, Livs stemme, den friske Liv-status og mit
> arbejdsrum. Forklar, hvilken historie der er gemt, hvad der mangler og hvad vi
> kan gøre uden et nyt betalt API-kald. Brug din research i denne samtale, bevar
> kildelinks, og gem mit udkast, når jeg beder om det. Publicér ikke endnu.

Disconnect all connections from the same first-party page. Revocation applies
immediately to every grant and outstanding code; reconnect to grant access again.

## Tools and existing systems

| Scope | Tools | Boundary |
| --- | --- | --- |
| Read | `list_articles`, `get_article` | Danish staged CMS records, bounded pagination, current field hash |
| Read | `get_workspace` | Authenticated user's Writer workspace and version history only |
| Read | `list_editorial_work`, `get_workflow` | Bounded saved-work discovery and focused review/edit/publication guidance |
| Read | `preview_copyedit`, `review_draft` | Exact revision-bound proposals and concrete findings; no new factual approval |
| Read | `get_metadata_test_cases`, `review_metadata_candidate` | Twenty saved archive cases and exact-version SEO regression checks; no model call, quality score or CMS write |
| Draft | `apply_copyedit` | Apply the exact preview to the private workspace; atomic replay receipt and unchanged media |
| Read | `get_shortening_context`, `get_shortening_status` | Existing checked, ready, never-published Liv draft; exact baseline and saved proposal/review/receipt status |
| Draft | `preview_shortening`, `apply_shortening` | ChatGPT-supplied paragraph shortening, personal first-party review and shared audited CMS save; no paid generation or implicit publication |
| Read | `get_editorial_context` | Canonical Apropos rules, Liv/selected author voice and hashes |
| Read | `get_liv_status`, `get_liv_work`, `get_saved_writing` | Real blockers, seven days, saved checks/checkpoints/paid text; not new generation or human scores |
| Read | `get_costs` | Existing ledgers/receipts, estimates and unknowns; not a provider bill |
| Draft | `open_article`, `save_draft` | Existing private Writer workspace, optimistic revision, history/conflicts preserved |
| Draft | `edit_liv_checkpoint`, `edit_saved_writing` | Existing restricted audited copyedit operations; not new approvals/retry grants |
| Draft | `save_webflow_draft`, `get_save_status` | Canonical new-draft save or targeted staged copyedit and receipt reconciliation |
| Publish | `preview_publication`, `publish_article` | Existing ready Liv path, exact-version first-party human confirmation, delivery receipt and public readback |
| Publish | `get_publication_status` | Read-only same-preview recovery, including after midnight/pause; historical receipt is distinct from fresh CMS/public readback |

Host-native ChatGPT browsing is not an Apropos API research call. Supplied
research is stored with URLs and dates and marked unverified. Imported prose is
not quality evidence. Arbitrary code, database access, raw URL fetches, credential
access, AI generation, budget changes and provider-hold reset are not MCP tools.

An independent AsyncLocalStorage guard rejects paid AI at both the transport and
ledger boundary throughout every MCP operation, including nested helpers.

## Saving and publishing

1. Read workspace revision; `open_article` binds a CMS article server-side, or
   `save_draft` creates a private draft. The prior workspace version is archived.
2. Edit in ChatGPT; `save_draft` uses the expected revision. Conflicts retain both
   versions rather than overwriting the newer work. Never supply a colleague UID.
3. `save_webflow_draft` creates a new draft through the existing canonical Writer
   path with exact workspace preflight and durable CMS create/reconciliation.
   Existing articles opened through MCP accept targeted text/rating/SEO edits
   only. URL, author/topic/reference and media changes use the dedicated existing
   editors. Cover and all body assets are preserved. Other CMS fields are not
   rewritten. Existing published articles get staged field changes, never an
   `isDraft` flip, unpublish or live-publication request.
4. Existing CMS text edits require the opening CMS hash and a fresh read before
   PATCH; readback must match expected fields and original publication flags.
   Webflow does not provide an atomic compare-and-swap with its external editor:
   the immediately-before-write check plus readback detects observed conflicts,
   but this is not a promise to lock another editor's Webflow session.
5. Repeated saves reuse receipts. Unknown writes keep their marker and are read
   back, never blindly repeated or assigned a new identity. `get_save_status`
   can reconcile a staged save even after the personal workspace has moved on.
   Verified saves advance the bound CMS baseline, so another precise edit can be
   saved without reopening. A newer unsaved workspace or concurrently reopened
   binding is preserved. Use the returned `cmsHash` for the next save. Older
   receipts lacking the captured baseline explicitly require reopening.
   If CMS changed after an ambiguous save, preserve both and investigate; no
   automatic force-write/lock deletion.
6. Publication is separate. A personal/CMS draft is **not** automatically admitted
   to Liv's ready manifest. Missing checks are reported; the connector cannot
   override them or silently buy checks. A currently eligible ready Liv article
   receives a ten-minute pinned preview with cover/body images and text.
   For shortening an already checked, ready, never-published Liv draft, first use
   `get_shortening_context` and `preview_shortening`, then have Frederik review
   the exact candidate at its personal link. `apply_shortening` uses the shared
   safe CMS operation. `get_shortening_status` reads back uncertainty. This does
   not give generic imported drafts a bypass into the ready manifest.
7. Frederik opens the first-party confirmation page and approves that version.
   MCP tokens cannot approve it. `publish_article` then invokes the normal exact
   item/locale delivery operation. The operation is recorded as operator-started,
   not an unattended cron success. Hash changes/expiry require a new preview;
   uncertain delivery reuses the same durable identity.
8. After a timeout use `get_publication_status` with the original preview ID,
   including after midnight or when publication is paused. It does not publish
   or change the queue. `recordedPublication` is history; current
   `publicationVerified` requires the existing exact CMS/public-page verifier.
   `deliveryFinalized=false` must not trigger another publication to repair
   history. Server reconciliation owns that finalization.

There is no paid retry/generation tool or arbitrary publication bypass in this
pilot. Republish of a historical article outside the ready Liv flow remains in
the existing editorial system. Animation, new AI image generation from MCP,
Claude support and team enablement are later scoped changes, not hidden extras.

## Security

- Streamable HTTP via official MCP SDK 1.32.0, stateless JSON responses.
- HTTPS OAuth authorization code + S256 PKCE, exact documented ChatGPT callbacks,
  state/issuer/resource binding, browser-bound HttpOnly cookie and same-origin
  consent. Fixed issuer/audience, no user-supplied redirect origin.
- Access tokens last 15 minutes; rotating refresh tokens 7 days, grant 30 days.
  Code/access/refresh secrets are hashed at rest. Refresh replay revokes the family.
- Each access checks fresh Firebase account verification, disable/revocation,
  editorial allowlist and exact owner email. No positive access cache.
- All OAuth/MCP state is Admin-SDK-only under the existing default-deny rules.
  Bounded request bodies, endpoint/tool rate limits, private/no-store responses.
- Restricted scopes, strict input schemas, untrusted source labels, executable
  markup rejection, first-party publication confirmation and operation audit.
- No raw exception, token, prompt or article text in the MCP audit collection.
  Connection page denies framing and referrers. Existing authentication is not
  relaxed for the rest of the application.

## Verification and remaining rollout gate

Automated tests cover OAuth binding/replay/revocation/roles/scopes, stateless SDK
negotiation, workspace isolation/conflicts, staged-only writes and idempotence,
uncertain write recovery, publication blockers/version confirmation and no-paid
boundaries. They use simulated services; no paid AI demonstration is permitted.

Deployment, actual endpoint readback, production owner-authenticated MCP reads,
ledger invariance and visual checks are recorded below after release. A successful
API/SDK test is not a claim that the owner's real ChatGPT app is connected.
The final client acceptance requires that private ChatGPT connection and a real
owner-selected article. No arbitrary live article will be published as a test.

Pre-release: 324 files / 4,493 isolated regression tests pass (83 focused MCP
tests), plus TypeScript, scoped ESLint, safe build configuration and whitespace
checks. The initial mobile/desktop browser inspection found no horizontal
overflow, error overlay or uncaught page error; it caught a missing Tailwind black
background token, fixed with the project's explicit black color. The local
unauthenticated preview lacks production Firebase config; real OAuth requires
the production verification below, not an invented local login result.

The dependency review identified the pre-existing Next.js ImageResponse RCE
advisory GHSA-vcvr-r3jv-pc5j. Following the Next upgrade guide, Next and its matched
tooling were patched from 16.3.3 to 16.3.8 (no major migration/codemod needed).
The SDK is pinned; `ip-address` is pinned to 10.7.3 to avoid its affected transitive
version. Post-patch production audit reports zero critical and 11 high findings
in other existing dependencies. This is not a claim of a clean dependency audit;
major Firebase/Nodemailer migrations and unrelated audit remediation are not
bundled into the MCP rollout.

Security advisory: https://github.com/advisories/GHSA-vcvr-r3jv-pc5j

References used for protocol/account compatibility:
- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/plugins/build/mcp-server
- https://developers.openai.com/plugins/deploy/connect-chatgpt

## Production release and acceptance, 4 October 2026

- URL: https://ai.aproposmagazine.com/connect/chatgpt
- Target: production. Status: READY.
- Code commit: `57166ac3feab8e450631693b84d08c8abae2a52a`.
- Deployment: `dpl_8JXzKUiAsGFQpe4DLXDiuS8cGTRN`.
- Immutable URL: https://apropos-research-qfgr8wm1v-frederik-kraghs-projects.vercel.app
- Framework: Next.js 16.3.8. Vercel build-to-ready interval: 101 seconds.
- Production target and `ai.aproposmagazine.com` alias independently matched the
  code SHA. Remote production build succeeded; no dirty local files were uploaded.

Service-authenticated acceptance ran **19:48:06–19:48:47 UTC** (21:48 Copenhagen).
The isolated temporary OAuth connection completed discovery, public-client
registration, browser-bound owner consent, S256 exchange, stateless MCP
initialization, all 16 tool schemas and refresh rotation. Anonymous MCP requests
returned 401. Real service-authenticated Casper and Milo sessions returned 403
at the private pilot's consent boundary. MCP tokens could not approve first-party
consent/publication. The temporary grant was revoked and a subsequent MCP request
returned 401. This did not disconnect any user-created connection.

All eight read tools succeeded against actual production data: articles,
individual CMS article, private workspace, editorial context, Liv status,
retained Liv work, archived paid writing and costs. CMS readback included
`6ab8eafeba2f51d17fc87b36`, **Artigeardit i Royal Arena: Vi køber også noget at
glæde os til**. The archived writing read used
`eb99845e-7d07-4974-ad32-275240f9be23`; it remains retained, unapproved work.
An ineligible historical article returned `ready: false` from publication preview.
No real article was saved, changed, queued or published to demonstrate the tools.

Before/after hashes matched for the shared budget, provider hold, owner's
workspace, delivery entries/slots and both October cost ledger documents.
There were **zero new paid AI calls**. OAuth/test audit records are deliberately
retained. These checks do not resolve the existing provider quota blocker or prove
unattended Liv delivery.

The production login page was visually inspected at desktop width 1280 and mobile
390×844. Black/minimal styling, login controls, no horizontal overflow, no Next
error overlay, no uncaught browser errors, and the close link to the normal login
route were verified. The browser was isolated and closed afterwards. Owner
consent was verified through the real API, not claimed as a completed human
ChatGPT-client login. Local screenshots: `tmp/mcp-production-desktop.png` and
`tmp/mcp-production-mobile.png`.

### Post-deploy observability

MCP request logs during **19:48:00–19:49:00 UTC** contained 14 requests: twelve
HTTP 200 and the two expected HTTP 401 denials (anonymous and revoked). No failed
MCP request was observed in that window. The wider early-release error scan
found the known PassThrough listener warning on an HTTP 200 public podcast
request, not a MCP failure. The same warning was independently present on the
previous deployment (`c3ae87a`) immediately before release and is documented in
`docs/audits/STREAM-WARNING-2026-09-13.md`; this release does not claim to fix it.
The fatal-level query returned no matches. These are bounded observations, not
a claim that the application has no errors.

Configured drains: **0**. Existing Vercel request logs, application operation
audit, delivery alerts and analytics remain; no external log forwarding was
installed. No warning was hidden by increasing listener limits.

### Remaining human acceptance

Frederik must add the private connection in his actual ChatGPT account using
the setup page above, then choose an article for the first real edit/save.
Availability depends on the account's app/developer-mode policy. The app is
implemented, deployed and service-tested, **not yet proven connected to his
ChatGPT conversation**. The first real approved publication must be checked
through its existing CMS/public receipt; mock tests do not replace that proof.
Casper/Milo rollout, Claude compatibility and API-free autonomous background
generation are not included in this private pilot.
