# Apropos i ChatGPT: private owner pilot

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
Settings → Apps, create a private app named Apropos, and use:

```
https://ai.aproposmagazine.com/mcp
```

Select OAuth and let ChatGPT register the public client automatically. Sign into
Apropos with Frederik's verified account and approve the requested scopes.
Availability and organization admin policy remain the ChatGPT account's rules.
No API key or shared team password belongs in the conversation.

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
| Read | `get_editorial_context` | Canonical Apropos rules, Liv/selected author voice and hashes |
| Read | `get_liv_status`, `get_liv_work`, `get_saved_writing` | Real blockers, seven days, saved checks/checkpoints/paid text; not new generation or human scores |
| Read | `get_costs` | Existing ledgers/receipts, estimates and unknowns; not a provider bill |
| Draft | `open_article`, `save_draft` | Existing private Writer workspace, optimistic revision, history/conflicts preserved |
| Draft | `edit_liv_checkpoint`, `edit_saved_writing` | Existing restricted audited copyedit operations; not new approvals/retry grants |
| Draft | `save_webflow_draft`, `get_save_status` | Canonical new-draft save or targeted staged copyedit and receipt reconciliation |
| Publish | `preview_publication`, `publish_article` | Existing ready Liv path, exact-version first-party human confirmation, delivery receipt and public readback |

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
   If CMS changed after an ambiguous save, preserve both and investigate; no
   automatic force-write/lock deletion.
6. Publication is separate. A personal/CMS draft is **not** automatically admitted
   to Liv's ready manifest. Missing checks are reported; the connector cannot
   override them or silently buy checks. A currently eligible ready Liv article
   receives a ten-minute pinned preview with cover/body images and text.
7. Frederik opens the first-party confirmation page and approves that version.
   MCP tokens cannot approve it. `publish_article` then invokes the normal exact
   item/locale delivery operation. The operation is recorded as operator-started,
   not an unattended cron success. Hash changes/expiry require a new preview;
   uncertain delivery reuses the same durable identity.

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
