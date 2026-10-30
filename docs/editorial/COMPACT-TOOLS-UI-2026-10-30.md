# Compact Apropos AI tools, 30 October 2026

Owner approved the compact SoMe editor and requested the same treatment across
Apropos AI, except AI Writer. The following “v8” was explicitly a typo.

## Implementation

- Shared scoped system font, black canvas, native gray groups, 8–16 px outer
  gutters, 44 px control targets and a single header row.
- Narrow tool panels use a native view selector instead of a second row of tabs.
  Larger panels retain segmented buttons. Container width, not browser width,
  determines the mode, including tools embedded alongside Writer.
- Newsletter theme and device preview use two labeled icon buttons. Existing
  mobile sheet actions, test recipients, schedule and send confirmations remain.
- Liv's upcoming/published tabs and settings now share the header. Story feeds
  use the available width without the previous overlaid second tab row. General
  editorial explanations are available in disclosures; actual failures, incomplete
  inventory, article content and approval states remain visible.
- The catalog uses grouped compact rows, preserves live availability and paused
  statuses, and keeps descriptions accessible to assistive technology. Hidden
  tools and stored work remain accessible without reactivating services.
- Webflow's technical connection/mapping controls are behind a disclosure.
  Connection errors remain visible. Tables scroll within their own container.

Coverage: Liv editorial desk, advanced delivery desk, inbox, accreditations,
SEO/Google, newsletter, push, podcast, analytics, image workshop, editorial cockpit,
prompt inspector, standalone settings/profile, research list/crawler, media
administration, queue/drafts, selected articles, storage administration, private
ChatGPT connection/review chrome and the shared tool catalog. The already approved
SoMe editor stays on its existing compact implementation. Public magazine pages,
newsletter/mail documents, podcast audio, content, approvals, provider policies,
budgets, automation and API behavior are outside this UI release.

AI Writer's editing/setup/settings sources and global stylesheet are unchanged.
The shared catalog is intentionally updated wherever it is opened; it does not
apply the tool theme to Writer's editing surface.

## Verification

- `node scripts/verify-compact-tools-ui.mjs`: 52 actual React client cases across
  320, 390, 768 and 1440 px. Checks single-row headers, touch height, no page
  overflow, browser errors, native/segmented view switching, preserved SEO form
  edits, newsletter preview toggles, image settings, and tool closing.
- All external network requests are blocked in those tests. Auth/service data are
  fixtures. Existing image-workspace autosave and editorial signal POST requests
  receive local fixture responses; no actual provider, SMTP, CMS or config writes.
- `node scripts/verify-tool-list-ui.mjs`: eight owner/staff/unavailable/panel cases
  across mobile and desktop, including hidden tools, routing and read-only calls.
- Actual Writer fixture rendered at 390 and 1440 px without browser errors and
  without the new tool-surface classes on the editing view.
- Nine protected Writer/global files match their original SHA-256 hashes exactly.
- Application TypeScript check passes using the existing isolated typecheck
  configuration, which excludes unrelated untracked output scripts.
- ESLint passes changed TSX files; the crawler's existing internal-link navigation
  warning remains on unchanged behavior. `git diff --check` passes.

Local screenshots and detailed receipts: `output/compact-tools-20261030/`.
Production deployment and actual alias/CSS readback are recorded below when verified.
