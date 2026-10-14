# Mandatory native image contract — 14 October 2026

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

Before release: full isolated suite 385 files / 5,336 tests passed, followed by
78 targeted tests including the added edit-parent and legacy-replay cases.
TypeScript and security configuration passed; lint has zero errors and the same
nine pre-existing warnings. No paid/native generation was used for tests.

`scripts/verify-mandatory-image-brief.ts` verifies fresh authenticated discovery,
canonical brief/reference bytes, stable brief replay, four safe negative import
cases, unchanged article/assets/approvals and unchanged financial state. It uses
an explicitly authorized temporary owner service grant, revoked in `finally`;
it does not simulate an editorial approval or native image production.

Release SHA, deployment and actual production readback are recorded after release.
