# Apropos platform polish — 13 October 2026

## Scope and design contract

Owner requested more space below the social-card subtitle, one coherent startup,
GSAP motion, and calmer spacing/language across the tools. AI chat is explicitly
excluded. This release changes the launcher, shared tool headers/sections and
SoMe chrome, not every screen's inner form or editorial workflow.

BYQ Supply access was verified and **Dark Tech — Obsidian canvas for modern
systems** (`cmosuqtup000jxo9xsc3u94zh`) read through the connected library.
Use its quiet hierarchy, near-black surfaces and spacing rhythm as reference,
not its marketing-page layout, oversized gaps or blue accents.

- Preserve Apropos's monochrome palette and existing Poppins/Amiri typefaces.
- Scoped surfaces: black canvas, #0a0a0a panel, #141414 field, #171717 raised
  control, white text, #b3b3b3 secondary text, subtle white rules.
- 4px rhythm; 20–32px responsive gutters, 24–28px list rows, 12px panels,
  44px header tap targets. No icons in the tool list.
- One logo reveal and a thin indeterminate GSAP line; never a fake percentage,
  extra minimum duration or animation-dependent readiness. Reduced-motion users
  get a static mark and short fade. Failure to load GSAP leaves the logo usable.
- Danish labels such as Sociale medier, Pushbeskeder and Trafik & overblik.
  Hide technical terminology in normal tool descriptions; preserve real errors.
- No changes to MainChatPanel, AIWriterClient, chat prompts, message/composer
  logic, global CSS, article text, approvals, provider holds or publishing policy.

## Actual causes and changes

### Startup

The old AuthProvider held children behind a **minimum 2-second logo screen**.
Only afterwards could ToolList mount and request `/api/editorial/tools`, showing
another “Henter værktøjer …” state. The old exit fade also lasted 1050ms.

Startup now fetches the **same authenticated user/owner-scoped TanStack query**
while the existing auth loader is visible. The menu immediately reuses it.
Token retrieval and HTTP are bounded together at 6 seconds; HTTP 401/503,
malformed responses and timeouts never become healthy status. A real failure
shows a concise warning/retry alongside available navigation rather than an
endless loader. No automatic retry loop. Existing authentication/access checks
are retained. Focus/token refresh does not unmount an active editor.

The artificial delay is removed; the exit is 320ms (100ms reduced motion).
GSAP 3.15.0 is exact-pinned and dynamically imported with effect cleanup.
No new service, paid generation or analytics request.

### Social-card spacing

The shared canvas renderer adds **32px at 1080px export width** after the
subtitle, not between its lines. That is about 11px on a 370px card. Headline,
subtitle, font sizes and positions remain unchanged. CTA and image boundary
move together; the CTA centre stays 10 canvas px below the boundary. The old
minimum-photo clamp could pull the boundary into longer text and is removed.
Existing text-fit limits remain. PNG preview/download and JPEG posting use the
same renderer. No subtitle is added or shortened by this spacing change.

Standalone and embedded SoMe now reuse the same responsive header. Narrow
screens place format/theme/export actions on a second row, not squeezed beside
the title. Posting, receipt classification and consent handlers are unchanged.

## Verification (local / isolated)

- Full isolated Vitest: **381 files / 5262 tests passed**,
  `RAGE_STORAGE_DIR=./tmp/vitest-rage`; 7 new catalogue/cache/timeout tests.
- TypeScript and changed-file ESLint passed. Local production build passed
  security config, TypeScript and 237 pages before the final shared-header reuse;
  the final source must also pass the remote release build.
- Production dependency audit: zero vulnerabilities. Existing development-only
  audit backlog is not claimed fixed by this release.
- `verify-platform-startup.mjs`: 8 browser fixtures: desktop/mobile, slow API,
  timeout, unavailable API, rejected access, signed-out and reduced motion;
  one request across startup/menu, separated account cache, no artificial 2s wait,
  focus does not reopen loader, no horizontal overflow. GSAP actually runs in
  the slow fixture. Fixture latency is **not** a production speed measurement.
- `verify-tool-list-ui.mjs`: 8 owner/staff/menu/error fixtures.
- `verify-social-card-spacing.mjs`: 12 real-browser geometry cases using the
  production-bundled **Amiri** fonts, both formats/themes, Whisper Man's exact
  subtitle, longer headline and absent subtitle. Baseline Git source
  `d3c263ec6889eb948db4c1ab5810825318471e4f`: exactly +32px when a subtitle exists,
  unchanged text/font coordinates, identical PNG/JPEG layout, positive photo
  area and no CTA/text overlap. The comparison photo is an explicit fixture.
- `verify-social-subtitle-ui.mjs`: actual SoMe view, actual shared header and
  bundled Amiri at 320/390/1440px; automatic fit, saved ChatGPT variants,
  manual edit/restore, format isolation, local PNG export and 44px header buttons.
- `verify-social-feedback-ui.mjs`: 14 actual-view simulated posting cases;
  successful/partial/unknown/timeout/rejected/lost receipts stay distinct, one
  simulated POST each, **zero remote publishing**.

Local screenshots/geometry receipts: `output/platform-polish/`,
`output/social-subtitle/`, `output/social-feedback/` (not tracked).
These fixtures do not establish successful live social posting or a colleague's
personal ChatGPT approval. They neither approve nor publish an article.

## Release and live verification

Pending exact commit/deployment and authenticated production UI readback.
Previous live alias was `cc8e3425b06fbe81b621678ce2125364361a48d3`,
`dpl_6AoXePhebA3KbeoL23DLGjBSkCu2`, READY; unrelated local editorial journals
and AGENTS changes are preserved outside this release.
