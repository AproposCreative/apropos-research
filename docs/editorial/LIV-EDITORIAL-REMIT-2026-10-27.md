# Liv: reviews and culture guides, 27 October 2026

Owner instruction: Liv produces reviews and concrete culture guides for concerts,
TV, film, books, museums/exhibitions and cultural experiences. No recruitment,
news, celebrity/industry announcements or racing other media to a headline.
Research reviews may synthesize 5–6 actually read original reviews without
firsthand viewing/attendance. New research reviews have visible AI marking.
This supersedes the earlier public-label-off setting for that new work, not old
published versions or personal approval receipts.

## Verified causes

- Trending topic selection rewarded broad music/culture terms and accepted
  “Soundvenue søger videopraktikant”. Other retained attempts included cancellations,
  festival announcements, SNL and celebrity news.
- Editorial discovery explicitly searched `nyheder`; screen-review signals were
  converted to analysis and default reserves were question-led features.
- Saved idea briefs instructed “ikke anmeldelse uden faktisk visning”.
- The writing brief allowed at most three opinion notes, incompatible with a
  five-to-six-review synthesis. The public AI flag was forced off in multiple paths.

## Implementation

`lib/liv/editorial-remit.ts` is the shared current rule. It screens discovery,
topic selection, new generation, production context, private submission readiness
and pre-write legacy delivery. It is a conservative structural screen, not a
claim of semantic fact-checking. Historical attempted deliveries retain read-only
reconciliation; archive content and approvals are never migrated silently.

- Liv voice v6 is canonical; v5 and v4 remain loadable for saved writer responses.
- `culture-guide` is available in the existing editorial-kind/schema; generic
  non-Liv writer formats and defaults remain available. Liv's format question
  offers reviews or guides.
- Review evidence uses `research[].kind=review` plus substantial reading notes:
  at least five distinct URLs and hosts, with 5–6 original reviews as the editorial
  target. Tracking variants do not count twice. Official/context/snippet records
  do not count. These are agent-reported reading records, not server verification
  of the content or independence of the publishers. Human/agent review must verify
  they concern the same work, season or concert.
- Research briefs can preserve opinions from five sources and search can collect
  twelve candidates. No new provider request was run to test this; existing spend
  controls still govern every production invocation.
- New Liv research drafts receive `aiGenerated=true` before content/version hashing.
  It remains bound to consent, preview, worker, normalisation and CMS payload.
  Existing approval hashes with the old false flag are unchanged. New preparation
  rejects a hidden label or insufficient review evidence.
- Current context includes the new directive and separately preserves stored plans
  and the assessment of the original topic. No failed plan or historical miss was
  rewritten into a ready article.
- The UI and native desk keep unsuitable ideas/drafts under “kræver ny vinkel”.
  They are still readable with their exact original sources, media and versions.
  Liv-authored guides without a scheduled-production identity are now included.
- Personal publication consent, API-only delivery, cadence, Instagram-off and
  paid-Liv restrictions remain intact. No scheduler restart or paid fallback.

## Read-only production-data audit

Checked at 2026-10-27T18:01:40.511Z. New local projections on actual production records:

- Active saved draft: Fire & Ice / Copenhagen Contemporary, revision 3, a museum
  guide, previously omitted because it had no automatic-production identity.
- Retained for rebrief: Walter White rev6; Christopher ticket-sales feature rev5;
  Strokes festival-announcement feature rev2; Somebody Somewhere commentary rev8.
- One unlinked active culture-guide idea (Louisiana); eight off-remit ideas retained.
  The already linked/published Kontrapunkt receipt is not a new active article.
- The complete bounded work scan reports no truncation. Old CMS/legacy lookups
  retain their documented 14-day window; all saved private Liv submissions in the
  bounded owner query are included.
- All queried submission revision/status/hash tuples unchanged before/after:
  `292d41e946d0c6a4cc4978f5fc868a8da899aa8a1730dacd51b37a092b5f83a8`.

Evidence: `output/liv-remit-production-audit-20261027.json` (private local receipt).
This cleanup does not supply a finished next review or reserve and does not satisfy
unattended publication acceptance.

## Verification and release

- 183 relevant Vitest suites / 3,661 tests passed at broad regression checkpoint.
- After final guide-inventory, format-question and prompt adjustments, 6 focused
  suites / 118 tests passed, including the added regression cases.
- Production build and TypeScript check passed. Both edited native widget scripts
  parse successfully. No real generation/publication/mail was used as a test.
- MCP version: `2026-10-27-v57`.
- Deployment and post-release native/browser readback are recorded below after
  the deployment finishes; build success alone is not a production claim.


### Production receipt

Production alias `ai.aproposmagazine.com` resolves READY to
`dpl_GTnJyQkPH9CHiXckEjiB6T67MqoK`, source
`f4f7e7117a6b3161d2cfb318dc74c016bb3dbdc4`.
Fresh native MCP readback returns the new remit, minimum five original reviews,
visible AI flag true, eight retained ideas and the four preserved drafts.
Christopher remains revision 5/hash
`941640735a1cc1f42b6dc615075e2fad7b3ef0fb1e3957423f5415c8c4033924`,
not ready, with `liv_review_or_guide_required`.

After reloading the existing signed-in browser, the production Liv feed visibly
shows the new direction, one active Fire & Ice guide draft, one Louisiana guide
idea, and the expandable “Tidligere forslag · kræver ny vinkel (12)”. Expanding it
shows the original four versions and eight ideas. No approval, generation, CMS
write or publication was performed during verification.

Receipts: `output/liv-remit-live-receipt-20261027.json` and
`output/liv-editorial-remit-live-20261027.png` (local).
The code change is deployed and observed; the automatic next-article/reserve
acceptance is still open, with no fabricated ready inventory.

## Owner-requested overview refresh, 31 October 2026

The screenshot showed the 6 October Fire & Ice draft and a 19 October Louisiana
idea. Native desk readback at 13:08:29.934Z confirmed that the saved brief really
had not been refreshed; this was not a client cache problem. The existing
redaction result thread contained no newer brief. Refresh remains a read-only
GET and does not start the paused producer or paid research.

Five new private suggestions were saved through `save_editorial_ideas` at
13:14:44.151Z with stable request `liv-editorial-brief-20261031-fresh-v1`:
Favoritterne, East of Eden, Animals, Tracey Emin at Louisiana and C.B. Evans at
Louisiana. Their official source pages were actually read and title searches
returned no matching CMS articles. They are leads with explicit research and
availability caveats, not finished articles, ratings or publication approvals.
The three proposed reviews still need complete reading/review evidence; the two
museum proposals are guides without stars or claimed attendance.

The Liv overview separates recent suggestions (seven days) and current saved
work (14 days) from expandable history. Selected ideas, prepared/processing work
and current/future dated work stay visible regardless of age. Historical records
are neither deleted nor rewritten. The brief date comes from saved source dates,
including briefs whose ideas already have articles, rather than the time of GET.
Existing bounded-query coverage and warnings remain intact.

Native readback at 13:15:53.386Z confirmed all five new suggestions, unchanged
old ideas and the unchanged Fire & Ice revision 3 / 6 October timestamp. Evidence:
`output/liv-overview-freshness-20261031/ideas-readback.json`. No article, approval,
CMS write, scheduler change, paid backend generation or budget change occurred.
This interactive refresh does not satisfy Liv's automatic-delivery acceptance.

Validation: 84 focused tests across idea storage, idea/work projection and the
approval feed; application TypeScript and safe-build configuration checks.
Production/UI readback follows the exact release deployment below.

### Production and consolidation receipt

Production `ai.aproposmagazine.com` is READY at
`dpl_HoSnAKjPMXrxz5N5nQXqwGcAwX9L`, source
`72db48ab6992b9bb77d5e353d1a166f4639037bd`.
The signed-in UI shows the actual brief date, six suggestions and collapsed
history (two items); expanding history shows the original Fire & Ice revision 3
and the 19 October Louisiana idea. The default desktop `/ai` still opens Writer
over the robot background with saved workspace recovery available.

The owner accepted the five suggestions from this chat and also requested
consolidation from other chats/searches. Read the relevant editorial, book,
concert, accreditation and SEO result threads without messaging or restarting
them. The old `Apropos idébrief` contains additional leads but overlaps with the
current East of Eden / Emin proposals and retained Carrie / Diplomat / Social
Reckoning ideas. Those retained records were not overwritten or duplicated.
Already published Terminal List and Ringo work was not imported as new ideas.
Old news, games and announcement features were not promoted into the current
Liv remit. Existing local scheduler configuration was inspected read-only;
SEO and external-mention searches are not article briefs.

One distinct review lead, Last Seen season 1, was rechecked against Apple TV's
official series and episode pages and saved at 13:23:30.725Z, request
`liv-collect-other-chats-20261031-v1`. It retains the original chat link and an
explicit September-brief caveat. Old ratings and claimed critic summaries were
not carried over as facts. No source claims that new reviews are already read.
The UI reads the same canonical private idea store as MCP; refresh does not
start a new search or establish an automatic future cross-chat ingestion job.

Native desk readback at 13:24:36.943Z confirms six current suggestions, identical
old idea records and an unchanged draft. Local evidence and browser captures:
`output/liv-overview-freshness-20261031/verification.json`, `live-overview.png`
and `live-history.png`. The error/fatal scan had no Liv entries; two separate
podcast RSS MaxListeners warnings were observed, so it is not described as a
globally clean runtime scan. A separate RSS readback is retained alongside it.
