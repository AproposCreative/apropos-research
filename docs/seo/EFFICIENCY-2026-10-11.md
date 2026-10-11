# SEO transport and inventory efficiency

## Objective and scope

Owner approved development after the next-step recommendations. This release
implements compact responses and bounded review-inventory reuse, and checks
the remaining operational evidence. Reuse the existing queue, proposals,
receipts, processor guards and cloud task; no new database, provider or scheduler.
The separate 28-day effect-report feature is not implemented in this release.
No traffic benefit, subscription token saving or monetary saving is claimed.

Story: ChatGPT receives and reads the complete article/dated Google evidence,
saves its exact review, rechecks against that same full context, then receives
a compact result through Apropos MCP/API. Server write gates remain independent.

## Implemented contract (MCP v20)

- Claim still returns full context, without truncation. Existing clients can
  continue calling get_seo_task with taskId alone to retrieve all saved context.
- Optional knownContextHash on get_seo_task suppresses context ONLY on exact
  match. Omission or mismatch always returns the full saved context. New chats
  and chats that lost the article must omit this parameter and read it again.
- Save/apply return compact status: context=null/contextIncluded=false, stable
  contextHash, article identity/title/URL, proposal and before/after, current
  field locks, recheck provenance, write intent and actual public receipt.
  contextRetrieval explicitly describes full recovery. Editorial reading is
  still required; a client-supplied hash is not proof of reading or freshness.
- The authenticated private/no-store API mirrors this. Owner/scope checks and
  the no-paid-model boundary are unchanged. Terminal apply retries only replay
  existing receipts; transport changes do not grant publication approval.
- Canonical workflow instructions avoid an unnecessary second full read after
  claim. Cached old tool schemas remain usable (get defaults to full); clients
  need refreshed discovery to send the new optional parameter.

## Review inventory, not a write cache

- One request-local reader is constructed inside each bounded claim call.
  Same-locale tasks share a complete traversal for at most one minute from
  its start. Languages are separate. Another request starts from scratch.
- No cross-request singleton, durable duplicate state, cache service or stale
  fallback. Failed/partial traversals throw and are discarded, without retry.
  Changing totals, repeated page IDs and totals smaller than returned rows
  also fail closed instead of claiming complete uniqueness.
- The final apply path still performs a completely NEW live traversal while
  holding the existing locale uniqueness lease. The CMS adapter independently
  rereads the item and verifies version/locks immediately before writing.
  Concurrent external Webflow writes cannot be made transactional by caching;
  this release does not claim a global CMS snapshot or relax existing safeguards.

## Verification before deployment

- Full isolated suite: 371 files / 5134 tests passed on October 11 at 16:14Z.
  Type-check, security/build config and diff check passed. Lint: zero errors,
  nine pre-existing unrelated warnings. No dependency changes.
- Tests include two claims sharing one traversal, separate locales, expiration,
  partial/failing pages, concurrent new duplicate before write, full recovery,
  mismatch/ownership rejection, current locks in compact status, timeout/replay,
  actual MCP SDK discovery and no-paid-model guards.
- Read-only NEW code against FOUR real saved production tasks at
  16:16:05.465Z verified unchanged proposal/recheck/receipt and full recovery.

| Existing task | Full JSON bytes | Compact JSON bytes |
| --- | ---: | ---: |
| I mellemtiden er vi ingen | 10267 | 4424 |
| Wolverine DA | 10158 | 4566 |
| Wolverine EN | 9530 | 4190 |
| Syd for Solen | 12903 | 5636 |

These are serialized-response comparisons, not compressed wire bytes, tokens,
latency or billed money. The inventory call reduction is isolated-test evidence,
not yet a newly claimed production batch. No real article was claimed for proof.
The rotated production Webflow token is intentionally sensitive/non-exportable;
local credential inspection was stopped without weakening secret protection.

Complete protected state hashes at 16:16Z remained unchanged before/after:

- Jobs: 84b65e734bea1b446d126eb4f95ea39cdbb536ac225b86b861ac2632c9fcaf46
- Shared ledger: a94a613eef3f7d2bb029dde9d5f0935ecfe01581d4d13d0b001784a1230e76ea
- Image ledger (absent): 74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b
- Holds: dabf304be7cbda0d37c92f666d640f2ec114d2b13b2774ddcfd5da10416e08de

## Fresh operational distinction

Before this release, actual production alias remained 269f7181 /
dpl_6NWVevgtJRifv3xFH5pGGHvT8yCS. Authenticated health at 16:10:50Z returned
today's two completed keep receipts and no issues. The existing cron monitor
had advanced to 16:00:33.805Z without this observer invoking it. A bounded
console-only scan at 15:59–16:02Z returned no output; quiet logs do not prove
missing invocation. No new unattended metadata PATCH has been observed; do not
change valid metadata for that demonstration. Full logged-in browser UI remains
unverified from the earlier release; this release changes no UI component.

Vercel Node.js region/duration configuration remains unchanged. Official limits
and Fluid compute references checked before release:
https://vercel.com/docs/functions/limitations
https://vercel.com/docs/fluid-compute

Production release and authenticated compact/full/replay evidence follow below
only after exact deployment and readback.
