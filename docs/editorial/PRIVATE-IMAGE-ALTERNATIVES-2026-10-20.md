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
