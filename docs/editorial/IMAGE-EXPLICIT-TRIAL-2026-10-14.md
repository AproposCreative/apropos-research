# V32: one explicitly authorized retry, not a failure reset

The owner replied “ja” to one new controlled selfie-cover trial in the current
Codex chat, using its native tool's explicit prompt and two local reference-file
arguments. This supersedes the exhausted V31 trial's no-further-attempt authority
only for this one cover. Bodies, personal image selection and publication are not
authorized. The prior failure/original remains immutable.

The existing workflow had no audited resume operation after a rejection. Added
`image-attempt-resume.ts` and a narrow operator script. No model-facing grant tool,
new provider, browser workaround, raw reset or parallel image pipeline.

The grant binds owner, exact article version/content/protected prose, placement,
brief, canonical prompt hash, ordered references, complete prior failure set and
one new request ID. It records the human decision and concrete host difference.
Only the verified owner can authorize through the service operation. The grant
expires after one hour before dispatch. A transaction consumes dispatch before
the native call; repeated/concurrent claims cannot authorize another call. A lost
claim reply requires readback, not a second generation. Import recovery remains
possible only under the same claimed request. Another rejection closes the grant
without deleting either original. All existing output and personal-choice guards
remain in force. No claim of observing hidden generator internals.

Local verification: 127 targeted tests passed, full isolated suite 386 files /
5,409 tests passed. TypeScript, changed-source lint and security configuration
passed. The scoped script is excluded by repository lint (one explicit ignored-
file warning), but included in TypeScript. Initial test failures caught a strict
schema mismatch and concurrent-claim replay result; corrected before release.
Read-only production-state rehearsal at17:14:32Z confirmed the unchanged v2
article, actual reference bytes and existing failure; it did not authorize or
generate anything. Live deployment and actual generation results follow below.

## Deployed and verified live

MCP `2026-10-14-v32`, source `7096b34d450d6285f5e5fb81396c1d4b7811841a`,
deployment `dpl_815sjAx2AjcFXwsMVQ883pphKMo3`, is READY with the actual
`ai.aproposmagazine.com` alias. Clean Git archive release, remote build/types and
official protected OAuth-resource readback passed before promotion. Unchanged
dependency audit: 10 findings (3 moderate,7 high); not resolved by this change.
No schema additions or account permission changes; another tools refresh is not
necessary for this patch. The native connector here still has the old optional
report schema; see the evidence distinction below.

Owner service operation authorized grant
`0fd50865a1e55d6378a04579dd9765f7994833d6700a1e2d389c3f5eda8482fd`
at17:16:30.149Z. Connected production MCP returned `canGenerate=true` at17:17:52Z
with the actual style/selfie references and no blockers. Dispatch was claimed
once at17:18:11.158Z. This is a technical retry authorization, not an image choice.

## Actual native result and private import

Exactly one built-in `image_gen.imagegen` call in this Codex conversation used
the saved full `prompt` and ordered `referenced_image_paths` (style, then selfie).
No wrapper, reconstructed prompt, context-only dispatch, paid backend API or
second attempt. Actual call arguments are saved in
`output/image-explicit-v32-trial/native-call-arguments.json`; original canonical
text is `canonical-prompt.txt`, SHA256
`866aa99a398b0c25a5ea42f42010a30bd3067fe1e95e2a233b491a8506da3e52`.
The actual tool invocation exposes these supplied arguments. It does **not**
expose hidden internal rewriting or prove exact engine execution.

The generated output was visually inspected: one graphic portrait matching the
selfie subject, saturated pink/cobalt/yellow, black contours and cream grain;
no visible text, logos, collage, panels, photorealism or 3D. This is an agent's
visual assessment, not an independent semantic classifier or owner quality score.
Decoded PNG is1448x1086 (landscape4:3, **not** a16:9crop),3,178,900bytes,
SHA256 `1a354c0e14c0c1f54fee88413e9343b855a3590a5107b549a893137b188073c1`.
Original preserved both in the native output directory and
`output/image-explicit-v32-trial/cover-original.png`; no alteration/compression.

Connected `import_submission_image` succeeded at17:19:46.886Z through the existing
native file adapter with request `barsel-2026-10-14-selfie-cover-explicit-v2` and
the same brief `d5ccaf998d6676ccf0b6b53b39d1488d5dcbc5f87bd519b04ddfcab6004dfe58`.
Private candidate `c190d0e5882f3cce6936b8ec605d47f2775d1c81ef1f47af2463d29e41806185`
is `awaiting_personal_selection`. No CMS asset, attachment, personal approval or
publication. The import report says `client_reported_match` and
`exactPromptExecutionVerified=false`. Its `inputMode=not_reported` is honest:
the cached connector schema did not expose that optional field. Actual explicit
arguments and the server-side grant are separately preserved; no forged field or
second import was used to decorate the receipt.

Connected preview17:20:25.797Z shows the same candidate, `selected=false`, no
preview problems/dependency error, and next action personal image selection.
Independent private-storage readback17:20:35.627Z verified exact hash/bytes/
dimensions and unchanged article v2/content/protected-prose hashes. The former
rejected PNG and failure receipt are unchanged. Finance before17:16:12Z and after
17:20:35Z matches `e3b2d498e807ab1cba45f4ca156ce81e5eb15d5b71ea496457fc31da07b69101`.
All audited MCP calls in this trial had `paidAiAllowed=false`; subscription usage
is not measured. Readback evidence: `output/image-explicit-v32-trial/readback.json`.
The read-only verifier was parameterized for this second request without replacing
the historical V31 evidence; TypeScript passed again.

Fresh native preflight17:21:18.885Z refuses additional generation with
`image_dispatch_already_claimed` and `image_selection_required`. No repeated
generation/import was performed to prove idempotence; that property has simulated
regression coverage and the real one-shot status above.

## Remaining boundary

This proves one successful explicit-argument native trial **here** through private
MCP staging. It does not prove the original Work conversation's context-only host
handoff fixed, sustained automatic quality, real personal selection or publication.
The owner can select the exact candidate through the existing preview. Three body
illustrations still need their own briefs and original subject-reference files;
none were generated in this one-cover authorization. Text remains verbatim.
