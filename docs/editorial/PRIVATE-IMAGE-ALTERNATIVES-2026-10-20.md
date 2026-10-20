# Private image alternatives (MCP v37)

The owner requested five minimalist illustrations to compare directly in chat,
then explicitly authorized correcting the pending-selection restriction. This
does not authorize replacing the selected cover, editing prose or publishing.

## Cause and repair

Generation preflight treated any pending private candidate as a global stop,
including an unrelated body-image proposal. The same check existed in the
operator authorization and one-shot claim transactions. This prevented the user
from requesting alternatives before deciding which one to use.

Private generation/staging no longer requires resolving all previous choices.
Preflight reports the pending count separately from generation blockers.
Each explicitly requested illustration still needs its exact canonical brief,
actual reference bytes and a fresh preflight. Automatic extra attempts are not
authorized. Failed/declined placements, protected prose, revision/brief binding,
reference validation, the media window and one-shot grant consumption remain.

Personal file choice, attachment, preparation and publication guards are
unchanged. No previous candidate is deleted, declined, selected or attached by
this release. No grant, budget, provider policy or article record is reset.

## Verification

Regression coverage stages five distinct private alternatives with the same
article revision and existing cover preserved, while CMS upload remains unused
and publication selection stays blocked. Additional coverage keeps failed
placements stopped until an explicit one-shot authorization, consumes parallel
claims once despite pending alternatives, and rejects missing references/stale
revisions. Existing owner, expiry, input-mode, declined-original and idempotency
cases remain; media-window rejection covers all three grant transitions.

Live verification and the five actual outputs are separate from simulated
regression tests. Hidden native generator processing remains unverified.

## Verified release and requested outputs

Seven isolated suites / 247 tests passed; TypeScript, changed-file lint,
configuration-security and diff checks passed. The first new grant test used
an incomplete candidate fixture (missing owner/origin); fixing the fixture made
the existing publication-selection guard observable. No production selection
guard was relaxed. Remote build passed (237 pages). The existing dependency
audit still reports 3 moderate / 7 high findings; not a clean-audit claim.

Source `c6ffada5446a4fd9339c215eb7df3e0ff7bea754` was pushed and deployed from
its clean Git archive. Deployment `dpl_4Wc3GmwUak6cdxwafz6PJnnYMn5X` reached
READY, passed protected OAuth-resource readback and was promoted. Independent
Vercel MCP lookup of `ai.aproposmagazine.com` resolves to that deployment/SHA.

Live native MCP preflight at `2026-10-20T10:03:49.160Z` reports canGenerate=true,
blockers=[], pendingCandidates=1 and personal selection still required before
attachment. The retained pending body candidate was not declined or selected.
No tool schema refresh was needed to observe the corrected server behavior.

The user-requested five illustrations were then generated with five built-in
image calls, each following fresh status/context, exact saved brief and passing
preflight. The full canonical prompt and actual local minimal-v1.webp reference
(SHA256 b93ed5de8b27684cfb488e7c1aa2567e9f9761152a5c5420b1cd426af89cdd10)
were passed via explicit arguments. This is observable input submission, not
proof of hidden generator processing. No paid backend AI or retry grant used.

All five originals and full brief/preflight/dispatch records are preserved in
`output/barsel-five-minimal-2026-10-20/manifest.json` and `1.png`–`5.png`.
They were shown inline, not imported, selected, attached or published. Visual
review found coherent text-free ink scenes; number 1 is more detailed, and
number 5 uses olive plus orange rather than the prompt's single accent. Neither
is misrepresented as independently certified exact compliance; no regeneration.

Final MCP readback preserves submission revision 3, content hash
`4f172f48627ddab5224bcc270232cc4d8a022981616039e3466775fb80ad5cc6`,
the original selected cover and the same pending candidate. Article publication
and its two body-image requirements are not completed by this comparison task.
