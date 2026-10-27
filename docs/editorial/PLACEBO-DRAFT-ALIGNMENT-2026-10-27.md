# Placebo: existing draft alignment, 27 October 2026

Owner requested completion of the existing Placebo review and supplied a replacement cover credited to Mads Perch. The same submission and never-published Danish CMS draft were retained.

- Submission: `e94f6abbcb8b9d92017f6fb83672652099eb1c24bf7638b80b2853b1bcca8db9`
- CMS item: `6adf649dce943c2409b8ad6e`
- Title: Anmeldelse: Placebo i K.B. Hallen – et langt farvel
- Current private revision: **10**, draft, personal publication approval absent.

## Applied and verified

1. Fresh CMS read confirmed draft=true, lastPublished=null and field hash `643bd1bf63c788af81c4f535bfd04c2a09df5b53bc71d2a5a2264401a3e5e984`. A bounded collection read found one matching article and no conflicting normalized slug.
2. Under the existing CMS write lease, normalized only the legacy slug from `placebo---sluk-telefonen-og-bliv-haengende-lidt-endnu` to `placebo-sluk-telefonen-og-bliv-haengende-lidt-endnu`. Readback confirmed all other fields unchanged; hash `62bb5365a579bae1bc2bc33f450a77b224354927be2c2c96c9f70352dcdc61f5`.
3. Existing `linkStagedSubmission` inspect/bind retained the same item, incrementing revision 7 to 8. Durable reconciliation request: `placebo-bind-existing-draft-20261027`. This was no publication approval.
4. Removed the literal `Intro: ` label and the redundant closing paragraph `Læs Apropos Magazines anmeldelse her (3/6 stjerner).` from both the private article and existing CMS prose. A temporary blocked revision 9 prevented normal approval while the correction was underway. Versions 8 and 9 were preserved; revision 10 restored draft status after exact CMS readback.
5. Durable correction receipt: submission subcollection `copyCorrections/placebo_copy_correction_20261027`. Final CMS and bound target hash both `c876e140519378c32d9f1709766357ad8446a46e3adbcd06c00bfd82de1cf0b0`.
6. Native `preview_submission` returned revision 10, `previewProblems=[]`, `missing=[]`, `dependencyError=null`, and `approval_required`. The private article retains the requested cover, credit `Foto: Mads Perch`, and three approved body illustrations. CMS media staging remains part of the normal single-approval preparation flow.

SEO title: Placebo i K.B. Hallen: Anmeldelse af 30-års jubilæum

Meta description: Placebo fejrede 30 år i K.B. Hallen med nostalgi og telefonfri koncert. Men holdt nærværet hele vejen? Læs vores anmeldelse (3/6).

No publication, personal approval, paid generation, new CMS item or social posting was performed. Temporary service environment files were used without printing credentials and removed afterward. Existing local service configuration was used; no credential configuration or access permissions were changed. The downloaded environment emitted an unrelated invalid PODCAST_NOTIFY_URL warning; no audio operation was invoked.

The current preview still requires the owner's version-bound **Godkend og udgiv** action. A clean preview is not evidence of public publication or of completed CMS media staging.

## Personal approval and accreditation regression

The owner subsequently clicked Godkend og udgiv for revision 10. Native status confirmed `publication_approved`; preparation stopped at CMS readback at 10:14:30.689Z. All checks passed except `field:presseakkreditering`. The existing review's pinned and current CMS value was `true`, while the shared Liv validator hardcoded `false`. Media staging had correctly retained the existing field.

The fix compares the explicit expected accreditation value (default false for normal Liv generation). Existing-target preservation travels in the server-derived inspection policy, not as a mutation of the approved article payload: this avoids invalidating the already accepted editorial hash. A changed CMS value still fails the preserved-field hash check. No accreditation value or personal approval is fabricated or overwritten. 97 focused tests pass, including legacy default rejection, retained true, changed-field rejection, read-only recovery of an older attempted stage, unchanged expected payload, and consent tests. TypeScript checking passes. Release/publication verification is recorded below after completion.

## Verified publication, 27 October 2026

- Production alias directly verified as READY `dpl_7ytA5rBNzVFi8WKDndZkSTa2eHkc`, source `be8611260939e8413c21040d0014cf4a846be9a8`, MCP v56. 160 focused tests across CMS readback, preserved targets, reconciliation, consent, continuation and publication passed; TypeScript and production build passed.
- Native reconcile recovered the existing attempted media stage at `2026-10-27T10:22:08.899Z`, all 23 CMS checks passed. Revision 10 and content hash `6a1a44952f45c32148a550e4b4d75226f8fdafbb52c6f930ea02ee98571d920b` remain unchanged. Approved article hash and prepared article hash both `1d157a7ebf9fdfe21c43254c73f8b1551edcace75ccfa8b250b9baccef457441`.
- The existing server continuation then published normally using personal consent `991ba564c28d1c3c0c4c38b4c607739a755013f6873b9839c0347070320ee1f6` accepted `10:14:16.790Z`. No second personal approval, CMS duplicate, manual publish bypass or paid AI call.
- Native status is `published`, `publicationConsentPending=false`, `publicationVerified=true`; existing item `6adf649dce943c2409b8ad6e`, Danish locale `67dbf17ba540975b5b21c225`. Webflow publication timestamp `10:22:50.252Z`; public receipt checked `10:22:52.282Z`, all four exact approved media hashes verified `10:22:53.270Z`. This is an owner-approved, assisted review, not an unattended Liv cadence delivery.
- Fresh public GET returned HTTP 200 at https://www.aproposmagazine.com/articles/placebo-sluk-telefonen-og-bliv-haengende-lidt-endnu . Correct H1, canonical, SEO title, meta description, Open Graph title/cover, Mads Perch credit, and all three illustrated body figures with descriptive alt text. Accreditation remains true, rating 3/6, author Peter Milo. Instagram unchanged/off.
