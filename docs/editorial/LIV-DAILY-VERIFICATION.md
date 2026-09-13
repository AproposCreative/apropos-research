# Liv daily publication verification

Target: one API-driven publication at 10:00 Europe/Copenhagen each day,
with a prepared next story. Seven consecutive verified days are required.

## Follow-up

Codex heartbeat `verific-r-livs-daglige-udgivelse` created ACTIVE September 13,
2026, daily at 10:20 local Copenhagen time. It checks existing publication state,
records evidence and reports actionable failures. This is a local after-check,
not the production scheduler or a guarantee that the desktop is running.
Production publication remains the Vercel daily job plus delivery-check cron.

Each daily record must include the actual publication timestamp, public URL,
CMS/public readback, automatic-run evidence, next-story readiness and budget
status. Missing timestamp or automatic-run evidence does not count as a verified
on-time automatic day. Preserve gaps and failures; never backfill invented proof.

## Baseline, not a completed seven-day series

September 13 operations readback at 16:00 UTC reported today's publication and
auto-publication enabled. Public URL:
https://www.aproposmagazine.com/articles/the-gentlemen-saeson-2-goer-privilegium-til-et-vaben
This recorded snapshot alone does not prove the exact publication time or an
unassisted 10:00 run. Do not count it as such without the underlying run proof.

September 13 feed readback at 16:09 UTC: three ready stories, no blockers;
Lucian Freud September 14, Frankenstein September 15, Klovn September 16.
Klovn's audited title-only revision and independent saved-state readback are
recorded in EDITORIAL-SIMPLIFICATION-2026-09-13.md.

## Daily records

No future-day evidence exists yet. Append actual checks here.

### September 13: independent public HTTP readback

At `2026-09-13T16:41:50.022Z`, an unauthenticated GET of the baseline public URL
returned HTTP 200 at the same URL, with a matching canonical URL and nonempty
article rich text. HTML title: “The Gentlemen sæson 2 anmeldelse: Klasse og
kriminalitet”; H1: “The Gentlemen Sæson 2”. This records the actual public text;
no headline was overwritten to match a saved draft.

At `2026-09-13T16:42:04.667Z`, HEAD requests to both distinct image URLs found
inside `.w-richtext` returned HTTP 200, `image/webp`, content lengths 79,458 and
77,384 bytes. Both image elements had descriptive Danish alt text; both figure
captions read “Foto: Netflix”. This verifies availability and markup, not visual
layout, licensing or whether the two files depict different scenes.

No authenticated application write, generation, publication or paid AI call was
made for these checks. The article is independently confirmed publicly reachable.
Exact publication timestamp, CMS readback and automatic-run provenance remain
unverified in this record; September 13 is still not counted as a verified
on-time automatic day.

### September 13: authenticated delivery-history readback

At `2026-09-13T16:43:17.249Z`, read-only Firebase Admin queries of
`livDelivery/manifest` and `livDailyArticles/daily-2026-09-13` found:

- Delivery slot state `published`, one attempt, item `6aa54ddfd3c29b324372d24b`.
- Delivery `checkedAt`: `2026-09-13T08:00:22.864Z`, or 10:00:22.864 Copenhagen.
- Daily history status `published`, same item; server completion timestamp
  seconds `1789286422`, nanoseconds `927000000` (08:00:22.927 UTC).
- Slot public URL matches the independent public check above.

Source review of `deliver-ready.ts` confirms `checkedAt` is copied from the
publication verification receipt, after CMS/public checks, rather than from the
scheduled display date. History completion is recorded immediately before the
slot is finalized. This materially supports a successful on-time server delivery.
It is not Webflow's actual publication timestamp. Neither inspected document
records caller/scheduler provenance; an authenticated manual call uses the same
worker. Keep scheduler provenance unverified, rather than inferring it solely
from timing. No production state changed during inspection.

### September 13: platform log correlation

Vercel runtime MCP query of production, 07:59–08:02 UTC, query `liv-daily`,
returned one GET `/api/cron/liv-daily-article`, timestamp 08:00:14, HTTP 200.
Grouped request-path query independently returned count 1. Deployment was
`dpl_FF7W7LJgJDn3sKPCyaTRSwndLexP`, branch
`codex/seo-post-publish-quality` (not the later 15ff3f0 release).
Together with the 08:00:22 receipt, this corroborates successful on-time endpoint
execution. The tool does not expose scheduler identity/user-agent here, so it
does not independently distinguish a scheduled invocation from an authorized
manual invocation. Do not manufacture that missing field.

The log includes PassThrough `MaxListenersExceededWarning` for error/close
listeners. HTTP 200 is preserved as the actual result, despite the log's error
level. A separate current-production query for
`dpl_6HkRqtMjm81NqycSUuh5KLb59Jeg`, 16:30–16:45 UTC, found the same warning on
GET `/api/podcast/public/episode` at 16:38:12, also HTTP 200. Investigate the shared
stream lifecycle; do not suppress warnings with a higher listener limit as a fix.
These logs alone do not prove a memory leak or a failed publication.
