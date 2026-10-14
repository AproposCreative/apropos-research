# Mandatory native image contract — 14 October 2026

## Released and verified live at 14:53 Copenhagen

Source `4319804138994f98cdf60dffd063c8b0cd93d43f`, deployment
`dpl_5GtD3kzmMc9kvaQpzxhcdGidYiSF`, is **READY** with the actual
`ai.aproposmagazine.com` production alias. MCP discovery returns **v29 / 61 tools**.
The connected Apropos plugin also returned the new mandatory workflow, subject
reference handoff and explicit press-photo exemption.

Authenticated production verification at `2026-10-14T12:53:01.046Z` used the
existing private art submission
`c3069f83503fbf3d443743682358ea85afc13724726fa4f6a7db6b625eb4cb8a`, revision3.
No article, asset attachment, version or approval changed. The test saved only
the canonical brief and private immutable style-reference original, then read
the same stable brief again. No image was generated or submitted for upload.

- Brief: `615bb6718bb3fbf9971dba5db055dfafdabccf1da12cde604d43a2b957248911`.
- Actual reference:415,373bytes, decoded successfully;
  SHA256`0ef077580da7c9ed5b4c64a6973acc3dde536af0bb7a40776f45bf59c5bcff01`.
- Canonical prompt SHA256:
  `5509a803dd13ad42bada0a15167e76818dd82fe592e818de1a9f8d626a5b72a9`.
- Four deliberately non-importable fixtures were rejected with
  `mcp_submission_brief_required`, `mcp_submission_generation_report_required`,
  `mcp_submission_output_inspection_required` and
  `mcp_submission_generated_image_type_invalid`. No fixture download/CMS upload.
- Before/after article/assets/versions/approvals hash:
  `37a24803f79a30e34fdc29dc5e284a9aa20e3a7d1ed3e8c57a347de6af7434f5`.
- Before/after shared/image ledger, provider holds and manual-only policy hash:
  `e3b2d498e807ab1cba45f4ca156ce81e5eb15d5b71ea496457fc31da07b69101`.
- Temporary service grant revoked; existing connections and welcome state unchanged.
  Zero paid AI calls, personal approvals, CMS writes or publications.

Final full isolated suite: **385files / 5,339tests passed**. TypeScript,
security configuration and diff checks passed; changed application files have
no lint warnings/errors. Repository lint retains nine pre-existing warnings.
Native generation, the scheduled cloud host's image handoff and a real new subject
photo generation were **not** tested by this release; do not infer those from
the successful contract gate, fixture tests or deployment.

## Scope

The owner requires a canonical MCP brief before every native generation/edit.
This release replaces the v1 permissive **new-import** path, which accepted an
absent/mismatched generation report and deferred the decision to personal selection.
Historical assets, receipts and personal choices are not rewritten or upgraded.
Existing attached imports remain replayable without another upload.

## Central controls

- `get_image_brief` binds article, content hash, revision, role and section;
  returns the canonical prompt and decoded **actual** style image. Immutable
  private reference originals and hashes are retained. Missing/invalid actual
  style bytes block the brief, not merely its import.
- `store_submission_image_reference` accepts an existing native user-uploaded
  subject photo without a generation brief, CMS attachment or article change.
  Its stable request/reference identity survives retries; signed URLs are not
  stored. `subjectReferenceIds` plus `subjectReferencesRequired=true` bind the
  actual originals into the brief. Edits also return the retained parent pixels.
  Reference bundles over 3MB raw stop explicitly to fit the host response limit;
  originals are never silently resized. All lookups enforce submission ownership.
- `assertGenerationContract` centrally rejects new generated imports without a
  current v2 brief, exact prompt, exact ordered references and a file-SHA-bound
  inspection report. Declared collage/mockup/photo/multi-image or visible text,
  logos/watermarks are rejected. Decoding, landscape dimensions, hashes and
  original/CMS receipts remain deterministic checks. All illustrations are
  separately generated per placement; get fresh context after each attachment.
- User-uploaded **photos** and verified press-source photos still need no AI
  brief. Undeclared origins and generated files labeled as photos are rejected.
- Previously personally approved images cannot be silently replaced through
  native/press import or general submission updates. Current/historical approvals,
  selection and publication receipts are checked before upload and again in the
  final transaction. A concurrent approval preserves a completed upload without
  attaching it, never discarding its original or allocating again on retry.
- No image generation, model purchase, personal approval or publication is
  performed by these MCP operations. The fixed manual-Writer policy is untouched.

## Evidence limits

The MCP server cannot intercept arbitrary native-tool calls outside this workflow,
see hidden generator inputs, or independently classify raster subject/style/text.
Its instructions require pre-generation handoff; its import gate enforces the
saved contract and the client's actual report. `exactPromptExecutionVerified=false`
remains explicit. Output inspection is **agent-reported**, not server OCR or a
personal image choice. Never fabricate a report or obtain a new brief as
retroactive evidence for an old generation. A false origin/inspection declaration
is not independently detectable from arbitrary pixels by this deterministic gate.

## Verification

Before release: full isolated suite 385 files / 5,339 tests passed, including
78 targeted tests covering edit-parent references and legacy replay.
TypeScript and security configuration passed; lint has zero errors and the same
nine pre-existing warnings. No paid/native generation was used for tests.

`scripts/verify-mandatory-image-brief.ts` verifies fresh authenticated discovery,
canonical brief/reference bytes, stable brief replay, four safe negative import
cases, unchanged article/assets/approvals and unchanged financial state. It uses
an explicitly authorized temporary owner service grant, revoked in `finally`;
it does not simulate an editorial approval or native image production.

Release SHA, deployment and actual production readback are recorded above.
