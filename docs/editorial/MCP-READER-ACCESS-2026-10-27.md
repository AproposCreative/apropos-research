# Ebook reader access and completed-reading handoff, 27 October 2026

## Findings and limits

The owner reported a new private KK Reader link failing with
`net::ERR_BLOCKED_BY_ADMINISTRATOR` in the existing ChatGPT conversation
**⭐ Apropos – Redaktion · START HER** (`6acb2584-2f20-83eb-a335-031a584b8d3b`).
The private loan URL is deliberately not copied into this document.

Live native `list_reader_sources(sourceUrl)` returned no existing source for
that loan. `get_workflow(read)` returned the existing workflow, before this
release. Neither response is proof of browser access or a working full reading
flow for this loan.

Read-only `read_thread` confirmed that the conversation reported both
`Browser access requires the originating browser context.` and an unavailable
Cloud Browser, before later reporting `net::ERR_BLOCKED_BY_ADMINISTRATOR`.
The readback exposes conversation messages, not the underlying navigation tool
trace or administrative rule. The exact browser used and blocking policy remain
unverified. The assistant's later suggestion to open another Work task is not
an observed successful recovery, and no new task was created or messaged here.

Chromium maps the administrator-blocked code to managed browser policy and
contact-administrator guidance. This is not evidence of loan expiry or a
library outage. Reference: Chromium `chrome/common/localized_error.cc`,
https://chromium.googlesource.com/chromium/src/+/32352ad08ee673a4d43e8593ce988b224f6482d3/chrome/common/localized_error.cc

This Codex session exposes local computer-use and web tools, but no supported
remote Work Cloud Browser. No alternate browser, proxy, shell download, hidden
book endpoint or credential extraction was used to circumvent the reported
restriction. The book's title, author and contents remain unobserved.

## Changes

- `list_reader_sources` accepts an optional, strict `accessReport` for an exact
  source URL. It distinguishes a user-reported failure from one observed by the
  current chat, and unavailable browser from administrator-blocked browser.
  Diagnostics work before a book's title is known and never create a fake source,
  reading batch, access probe or loan-expiry claim. The call remains read-only.
- `save_reader_progress` supports `browser_blocked_by_administrator` for an
  already registered source. Existing checkpoints and notes are preserved;
  blocked calls cannot contain read ranges, layout or checkpoint updates.
- Read instructions distinguish MCP storage from actual browser capability.
  No blanket assurance that the workflow works; no automatic repeat-login,
  upload-file, alternate-client or new-task workaround for this error.
- Complete saved reading can be reused without browser access: all paginated
  notes must still be retrieved before writing. A complete coverage report
  remains client-reported and is not independently verified comprehension.
- Fixed a separate regression in the new Liv remit: completed ebook reading
  was also being required to supply five external reviews. A server-created
  reading snapshot, matching book identity, gap-free coverage and both boundaries
  now provide an alternative review basis. No public input can inject that
  snapshot. Missing/partial reading or another work still cannot use this route.
- New snapshots explicitly bind book title and author. Older snapshots use the
  server-retained original article identity. A metadata edit cannot substitute a
  different book while retaining the old reading evidence.
- Liv AI marking, personal version-bound publication approval, image checks,
  budgets and cadence remain in place. No existing records/approvals migrated.
- MCP version `2026-10-27-v58`; remit clarification `liv-reviews-guides-2026-10-27-v2`.

## Validation

- Reader, submission and remit focus: 65 tests passed.
- Wider affected MCP/submission/editorial regressions: 43 suites, 1,043 tests
  passed with isolated `RAGE_STORAGE_DIR=./tmp/vitest-rage`.
- TypeScript `tsc --noEmit`: passed. Production build: passed.
- Tests cover owner isolation, unknown-title diagnostics with zero network/write,
  repeated reads, preserving coverage under a block, complete-note reuse,
  incomplete reading, injected evidence, wrong book/medium, old snapshots,
  metadata-edit conflicts and preserved personal consent.

Production receipt will be appended after exact deployment/readback. This fixes
MCP diagnostics and the book-to-review handoff, not the host's browser policy.
The new loan has not been opened, read, reviewed or published. No paid AI call,
book download, browser/login-policy change, mail or publication was performed.
