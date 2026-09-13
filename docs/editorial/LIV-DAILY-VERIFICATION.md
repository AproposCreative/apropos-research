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
