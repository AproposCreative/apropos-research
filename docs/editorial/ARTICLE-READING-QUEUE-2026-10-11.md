# Saved article preview and review queue — 11 October 2026

## Scope and evidence

The owner asked to read saved work from failed Liv production dates in the same
article-style preview, then approve it personally. The former fallback link
incorrectly presented a preparation form before showing the complete article.

Implemented using the existing submission, draft catalogue, CMS mapping and
Liv archive services, with no parallel article storage or bulk CMS copies:

- Existing `/connect/chatgpt?submission=…` shows the complete saved article,
  cover, inline images/captions, byline and collapsible SEO before approval.
- Article rendering is deterministic. No paid model or image request is needed.
- The technical preparation and publication actions remain separate, version
  checked and personal. Loading a preview never approves or publishes anything.
- Failed image loads, failed current checks, stale quote/revision responses and
  failed refreshes cannot leave an actionable stale approval enabled.
- `/connect/chatgpt?review=1` lists up to 100 actual drafts/versions within the
  existing bounded 300-CMS-row / 100-run / 100-submission reads. Known CMS IDs
  group versions; equal titles alone do not justify merging. No new draft IDs.
- The owner-only `/api/editorial/review` reuses existing readers for historical
  CMS, checkpoints, own Writer and saved responses. No POST/write handler.
- Failed plans without text and archived writing attempts are separate from
  the draft queue. Attempts can be older versions of already published stories.
- Historical drafts can be read but cannot skip missing media, source/date
  checks or existing publication controls. Their preview is not a ready grant.
- Owner-only historical access and per-UID submission ownership are retained;
  every API response is private/no-store. Untrusted HTML is rendered as text
  blocks and HTTPS images, not executable imported markup.

Fresh native MCP inventory at 12:23–12:24Z found 15 draft/version groups in the
bounded window: three personal unpublished submissions, older CMS/checkpoints,
and a private Writer version of Wolverine (not a new unpublished article).
Read 234 CMS rows (complete), 66 Liv runs, 76 writing attempts and four personal
submissions. There are 57 text-bearing writing attempts, not 57 unique drafts.
October 4/6/8/10 old automatic runs have no article checkpoint. Their failures
must not be relabelled as completed drafts. Historical missed dates stay missed.

## Verification before release

- Full isolated suite: 366 files / 5081 tests passed.
- TypeScript, targeted ESLint and build-configuration security check passed.
- Real components tested in an isolated Chrome browser at 390px and 1280px:
  full text and three images visible before approval, no horizontal overflow,
  required unchecked checkbox and current-dependency failure block the action,
  no POSTs or actual personal approvals. Auth/API/media in this test are fixtures.
- Browser regression: `node scripts/test-editorial-reading-browser.mjs`.
- No production article mutation, paid retry, credential change, provider-hold
  reset, ledger reconciliation or Webflow site publication is part of this release.

Production deployment and real readback are recorded below only after success.
