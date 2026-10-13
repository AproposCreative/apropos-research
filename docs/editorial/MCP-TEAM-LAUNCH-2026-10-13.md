# MCP v27: team-launch hardening

## Objective and boundaries

A colleague connects their own verified Apropos account, opens their private work,
reads the real saved preview and personally approves exactly that version once.
The existing server continues and the chat reads status/receipt after interruption.
No second chat approval, paid backend model, test article or simulated human consent.

This release preserves existing CMS identities, originals, source notes, reader data,
publication receipts, queues and provider holds. Instagram stays off. It does not
claim unattended Liv delivery or change the historical delivery acceptance.

## Implemented

- Shared welcome copy for the web guide and email: **Godkend og udgiv/planlæg**,
  optional external preview, private ownership and honest subscription/hosting
  limits. Welcome v3 applies only to unsent/new welcomes. Accepted old mail is not
  resent; an uncertain old send is retained for reconciliation, not rewritten.
- Fixed an observed widget logic defect: a lost approval acknowledgement used to
  overwrite a successful fresh status read with an obsolete connection error.
  Current server state now wins after readback; actual rejection/read failure is
  still visible. Cancellation no longer falsely says nothing was approved.
- Shared article-widget CSP declaration and enforced browser fixture. No direct
  widget API access; the host tool bridge remains the only write path.
- CI now gates high/critical **production** dependency advisories and exercises
  the browser fixture. A 15-minute job bound prevents hanging checks.
- Reusable explicit service-authenticated read-only release check:
  `scripts/verify-mcp-release.ts`. Uses existing verified owner/editor accounts,
  only temporary read-scoped OAuth grants, requires an existing completed welcome
  to avoid unsolicited mail, revokes its own grants and preserves real connections.
  If the colleague has no completed welcome, only first-party app privacy is read;
  their new MCP OAuth activation remains for a personal pilot. No personal login or
  article approval is impersonated.

## Dependency scope and residual findings

Production audit before: **11 high-classified dependency entries** (including
propagated entries, not 11 independently demonstrated exploitable app defects).
After targeted updates: **0 known production vulnerabilities**, fresh npm audit
13 October 2026. This is registry evidence at a point in time, not a security guarantee.

Updates: Axios 1.20.0, Nodemailer 10.1.0, sharp 0.35.5/libvips 1.3.4,
grpc-js 1.14.5, busboy 3.2.3, undici 7.30.0, source-map-js 1.2.2 and patched
brace-expansion copies within their respective major versions. Firebase 12.3.0
and Next 16.3.8 remain unchanged. grpc-js is explicitly overridden within 1.x;
we did **not** apply npm's suggested Firebase downgrade. Nodemailer 10 requires
Node >=20 (local/CI Node22); its bundled types replace obsolete @types/nodemailer.
Actual MIME compose/parse and JPEG/PNG/WebP codecs are tested, not merely mocked.

The full development audit still reports **7 high / 3 moderate propagated entries**
in build/lint chains: braces/micromatch/fast-glob/chokidar/Next ESLint/Tailwind,
plus postcss-selector-parser. Published braces latest is 3.0.3 with no patched
release in that line at inspection. These tools consume repository build patterns,
not this MCP's incoming article/image payloads. They are **not fixed** here.
Track their upstream repair/build-tool migration separately; do not downgrade
Next or silently migrate Tailwind's major version to make the audit green.
Do not run untrusted build commands locally. CI is time-bounded and least-privilege.

Primary compatibility references:
[Nodemailer changelog](https://github.com/nodemailer/nodemailer/blob/master/CHANGELOG.md),
[sharp 0.35.5](https://github.com/lovell/sharp/releases/tag/v0.35.5),
[grpc-js 1.14.5](https://github.com/grpc/grpc-node/releases/tag/@grpc%2Fgrpc-js@1.14.5).

## Local verification completed

- Clean `npm ci --ignore-scripts` baseline; targeted lockfile update inspected.
- Isolated full suite: **380 files / 5,255 tests passed**, 13 October 12:16Z,
  with `RAGE_STORAGE_DIR=./tmp/vitest-rage`; provider transport guard active.
- TypeScript, changed-file ESLint and secure build configuration passed. Production
  Next build passed with real mail/codec dependencies; 237 static pages generated.
- Browser fixture: 390px mobile and 1200px desktop; actual widget HTML, enforced
  CSP and negative blocked-fetch control. Four scenarios passed: normal one-click,
  lost acknowledgement, rejected revision and broken image. Double click produces
  one confirmation; stale notification cannot bring approval back. No external
  network, article write, paid AI or real publication in the fixture.
- Existing tests verify cross-user/private access, immediate revocation, scope
  escalation denial, PKCE and token replay; revision/media binding; timeout
  recovery with preserved CMS identity; no-paid-AI transport and ledger guards.
- New real-library checks preserve Danish email text, reply headers, message IDs
  and attachment bytes through MIME composition and parsing. No email was sent.

Browser run locally: `MCP_TEST_BROWSER_CHANNEL=chrome npm run test:mcp-widget`.
CI uses installed Chromium with `npm run test:mcp-widget`. This is a simulated
host, **not** evidence of actual ChatGPT mobile rendering/personal colleague use.

## Real prior single-approval evidence, not a new test publication

Whisper Man submission `fba542e0dea6eb8b11abb30fd5d651039f8e09f4ddecd711cdbf0ce1fac66d71`
received personal external-preview consent for revision10 at
**2026-10-13T11:21:40.107Z**, after the v26 repair. Same CMS item
`6ace000e6400e97c7469979a` published 11:21:48.689Z; public/CMS receipt
11:21:50.840Z, media receipt 11:21:51.927Z. Four original media hashes verified,
no fallback; public HTTP200 at 11:24:05.245Z with title/canonical/Netflix/trailer.
This supersedes the **dated** 11:20 pre-approval state in the Whisper repair journal.
No agent click or new publication is needed to demonstrate this again.

## Release acceptance

| Boundary | Status |
| --- | --- |
| Implementation, isolated regressions, CSP browser fixture, local build | Passed |
| Exact release SHA / production deployment / public welcome | Passed, v27 details below |
| Live MCP discovery + owner private read + refresh/revoke | Passed via service authentication |
| Editor private app boundary | Passed: other user's submission denied |
| Fresh editor MCP OAuth | Not run: first activation may send welcome; personal pilot |
| Fresh preserved article/ledger readback after deployment | Passed, details below |
| Real owner one-click publication | Verified on v26 above; preserve receipt |
| Colleague's own ChatGPT login and mobile preview | Requires personal pilot |
| Colleague's own one-click publication of an actual chosen article | Requires personal pilot |
| Unattended cloud image/whole Liv delivery | Separate, not claimed by this release |

## Small human pilot before broad rollout

1. One colleague connects their **own** verified Apropos login in ChatGPT. If the
   client holds stale tool metadata, refresh the existing connection's tools and
   start a new chat; do not create duplicate connections.
2. Ask “Vis mine kladder”, confirm their private view, then open an actual selected
   article preview on their phone and desktop. Never share another person's login.
3. When genuinely ready, personally click **Godkend og udgiv** once in chat OR
   the optional external preview. Close/reopen and confirm the same stored status
   and live URL. An interrupted chat is a readback task, not a second approval.
4. Record account role (not token), host/device, revision, consent timestamp and
   public receipt. A successful service-auth test does not fill this human row.

No bulk colleague invite, new credentials, access policy or outbound mail is part
of this release. Technical evidence and personal-pilot evidence remain distinct.

## Deployed and verified, 13 October 2026 12:25Z

Runtime release **`cc8e3425b06fbe81b621678ce2125364361a48d3`**, MCP **v27**,
deployment **`dpl_6AoXePhebA3KbeoL23DLGjBSkCu2`**, READY with actual
`ai.aproposmagazine.com` alias. Remote clean install, TypeScript, safe configuration
and production build passed; deployment completed **12:23:11.268Z**. No environment
or credential changes. Branch `codex/mcp-team-launch-2026-10-13` contains release
plus subsequent documentation/verifier-only evidence commits.

- Public welcome **HTTP200 12:24:09.485Z**, exact one-click/no-second-chat-confirmation
  guidance present, old API-price requirement absent.
- Service-authenticated owner **12:24:04–12:24:24.950Z**: anonymous401, PKCE,
  v27/60 tools, confirmation tool app-only, exact released widget HTML/CSP,
  workflow and own submission list passed. Refresh token produced a working bearer;
  revoking the temporary test grant made it401 immediately. Welcome unchanged,
  real connections untouched. This is not a personal ChatGPT login test.
- Casper's first new MCP activation was deliberately **not run**: no stored welcome
  existed, so OAuth would create a new mail outbox. No outbox was fabricated or
  suppressed. Alternative first-party service-authenticated private read at
  **12:25:17.374Z** returned409/`mcp_submission_not_found` for the owner's article,
  private/no-store, no article data. The editor MCP/human rows remain open above.
- Native connected MCP returned Whisper `published/revision10`, publication-approved,
  no missing media, same content hash and CMS item. Independent public **HTTP200
  12:24:25.668Z** confirmed exact H1/canonical, Netflix link and trailer. No republish.
- Final read **12:25:17.546Z** confirmed protected submission byte-equivalent state
  hash and unchanged finance hash
  `2c77ab6264c4b91394ad6de7741cad384c4ce280c53b200e22464ba326aac1a8`:
  one historical API call, zero DKK usage estimate, 1.214400 DKK reserved,
  one unresolved result, no image month row, provider hold true/revision5.
  No paid AI, article write or personal approval by this verification.
- Browser fixture also passed with installed Playwright **Chromium143 build1200**,
  not only local Chrome. An asynchronous CSP-event timing issue in the test harness
  was fixed by waiting for the actual violation event; CSP was not relaxed.

The CI checks are committed and locally reproduced; a GitHub Actions run on main/PR
is not claimed for this branch-only push. Technical rollout is live; full team
acceptance still requires the small actual colleague pilot and tracking the explicit
development-tool security backlog, not another artificial article publication.
