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
the title. Live inspection caught a second story-posting button: retain one
action in the header, keep progress/receipts visible, and label reset “Nulstil”
instead of “X”. Posting, receipt classification and consent handlers are unchanged.

## Verification (local / isolated)

- Full isolated Vitest: **381 files / 5262 tests passed**,
  `RAGE_STORAGE_DIR=./tmp/vitest-rage`; 7 new catalogue/cache/timeout tests.
- TypeScript and changed-file ESLint passed. Local production build passed
  security config, TypeScript and 237 pages before the final shared-header reuse;
  the final source also passed the remote release build, including TypeScript.
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

- Main implementation: `4fd75a4b26eee3d41ddc00c98a9b2d921a668a0a`.
- Final source, including the single story action:
  `4eab3147c94f432fb2350e8843135a3f2964151b`.
- Production deployment: `dpl_AWJ8FidRm1icVHvb8gPxM2arzfiz`, READY with the
  actual `ai.aproposmagazine.com` alias; remote build and type checks passed.
  The intermediate `dpl_HUxxvyZMQ7aqnsQ5TnTe5HpCvs9V` is superseded.
- Authenticated, read-only runtime check at **2026-10-13T13:59:14.448Z**:
  `/api/editorial/tools` returned HTTP 200 and private/no-store, the updated
  labels, eight visible catalogue entries and four unchanged hidden entries.
  “Mine artikler” is added by the UI. No legacy tools or Instagram were enabled.
  Receipt: `output/platform-polish/production-tools-readback.json`.
- Actual owner browser checked the live launcher at desktop and 390×844,
  and The Whisper Man's square/story design with its real CMS image and Amiri
  typography. Final UI reports build `1.0.0.4eab314`. The final story view has
  exactly one “Post til Instagram Story” button and a visible “Nulstil” control.
  The temporary viewport override was reset and the tab returned to the launcher.
- A real live PNG download completed at **2026-10-13T13:59:20.596Z**:
  1080×1080, image/png, **1,145,315 bytes**, SHA-256
  `6f7d35b8175ba1b90ebf0306c1164108bb68583f72f4f8beb31f20d75562f49a`.
  Visually verified: real cover, title, rating, italic subtitle, increased
  whitespace below it, and CTA on the white/photo boundary. Original retained
  in Downloads as `apropos-social-square-1791899960569.png`; byte-identical
  evidence copy: `output/platform-polish/live-whisper-square.png`.
  The browser automation's download waiter timed out despite the completed
  download; filesystem and image readback confirmed success before any retry.
  No second download or remote posting was needed.

No article, social post or personal approval was submitted. Live posting is not
claimed verified by the export. AI chat code and global styles remain untouched;
authentication permissions and publication controls were not changed. Unrelated
local editorial journals and AGENTS changes remain outside this release.
