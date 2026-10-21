# Barsel: one retained cover, explicit owner exception

Owner decision: “Ja, brug den eksisterende fil med tydelig historik”. This
authorizes staging the existing native edit, **not** manufacturing a successful
generation preflight, a personal UI selection, or publication consent.

## Exact scope

- Submission `546794452af45693e3495ae29d4fe5d8912c33844aaa62db10b2ad8a94e36171`.
- Existing CMS item `6ad7aa27843abbb71024e79f`, no duplicate article.
- Retained PNG SHA256 `afc6caef6c501fdaa28b8bd2e64d22107100e9703ed06d637b29c9d29f5097ae`,
  3,266,942 bytes, 1536×1024. Long light hair and beard, same sock composition.
- Parent asset `5ffea93a33b87a3901d4ee763d416b7e24eb066ab5cc52b0ec6869bae1dfb5d0`.
- Private revision 9/hash `ed8354cc139d08e30d2d8e94b326d22e5ee6b8180a9f91f961a98fcb09e72279`
  was read before implementation. Cake is already in this private revision;
  the public article still has the old cover and three body images.

The immutable server manifest binds owner, submission, CMS item, parent hash,
section, file hash/size/dimensions and a stable import identity. There is no
model-facing exception flag. An owner-authenticated binary staging route applies
the existing no-paid-AI guard, same-origin check, rate limit and strict byte cap.
It can only stage the exact retained PNG privately.

Origin remains `chatgpt-edited`; generation evidence remains `not_supplied`.
`preflightPassed`, `canonicalGenerationComplianceVerified`, and
`exactPromptExecutionVerified` remain false. No old failures, original files,
consents or generation receipts are rewritten. The warning is visible beside
the candidate and remains visible after attachment.

Personal preview selection is required before CMS asset upload/attachment. The
selection records the exception identity and honest flags. The final article
transaction rechecks exact current-version selection, original bytes/hash,
parent cover identity (including verified compressed derivatives), and permits
only removal of that cover URL. Text, metadata and all body images stay intact.
Existing publication consent is not upgraded: the ordinary personal publication
workflow is still required. No direct CMS patch, new image generation, budget
change or paid provider call is part of this operation.

## Verification before release

- Image/exception/selection/target/widget suites: 8 files, 261 passing tests.
- Exception/owner-mail/OAuth/protocol/consent/target suites: 8 files, 142 passing
  tests (overlap with the first run, not 403 unique tests).
- Additional worker/publication/route/media/readback/mail transport suites:
  10 files, 82 passing tests.
- TypeScript and targeted ESLint passed.
- Isolated browser widget fixture passed normal, lost-ack, rejected and broken
  image cases on mobile/desktop with CSP enforced. No actual approval,
  publication, paid AI or external requests were performed by that fixture.

## Owner-only mail access

Both mailboxes are restricted by the verified, active Firebase owner identity
on each MCP request, not by a client-supplied UID or admin-looking custom claim.
MCP wrappers and mail services enforce ownership, and private drafts also bind
the owner UID. Added regressions cover both mailboxes, every first-party action,
all mail tools, and non-owner admin identities (including Liv's own login).
Anonymous live searches for both mailboxes returned 401. This is not a live
impersonation test of another staff account. No message was sent or approved.

Deployment and exact-file live staging evidence are recorded below after release.

## Verified live, 21 October 2026 09:30 Copenhagen

- Production source `d1716433857968326b6c7696901eff539aee209d`, MCP v40,
  deployment `dpl_Adh65qVJQtUj8VgU4wKtsP7i27fB` is READY; direct lookup of
  `ai.aproposmagazine.com` matches this deployment and source.
- Exactly one owner-authenticated staging POST returned 200/private-no-store.
  Retained asset `a0a9743f6ca4522fc12d9d9ebcd23c81324dfbada60515ac37221241a473a0d3`
  has the exact PNG hash above, status `awaiting_personal_selection`, false
  preflight/compliance flags, `not_supplied` generation evidence, no personal
  selection, no CMS asset and no public URL.
- Authenticated first-party preview and native MCP preview both succeeded.
  One current cover candidate, explicit historical warning, four preserved body
  images including cake, no preview problem/dependency error. Actual retained
  pixels were available to preview. Private submission remains revision 9 with
  unchanged full-record hash. No regeneration, personal selection or publication.
- Fresh CMS readback still matches `e9fb14634554bed63fadb01a2061b3a7be057d57b702534b4cabccf0cc3229eb`
  and lastPublished `2026-10-20T18:27:14.463Z`. The public cover is **not changed
  yet**. The user must select this file in preview and approve the resulting
  media-only revision for publication. The server then handles technical checks
  and readback; do not simulate these personal actions.
- Financial/policy/inbox before-and-after hash is unchanged:
  `cabe0e498f22ea9b74545f399aecd0eecf6005681948d9c90db35655c2602593`.
  No mail content was read, no message sent and no paid AI called in this check.
- Anonymous requests to both mailboxes and the new staging endpoint return 401
  on the new release. Non-owner admin denial is regression-tested, not claimed
  as production impersonation.
- Evidence: private `output/barsel-existing-cover-live-1792567783653.json`.
  No credentials or personal confirmation tokens are in this evidence file.
- Additional isolated candidate-widget checks passed seven cases, including
  visible exception warning on mobile/desktop, separate candidate choices,
  missing pixels, decline, and lost replies. Actual approvals/CMS writes/
  generations: zero. These are fixture tests, not real user selections.

This release does not change Liv's scheduled producer, cadence, acceptance,
holds, budgets, mail auto-response setting or existing Rockstar draft.
