# Individual image review (MCP v38)

## Requested outcome

The owner wants to approve or decline each barsel illustration separately and
then read the article without private alternatives being mistaken for its media.
No generation, personal selection, editorial approval or publication is part of
this implementation/release.

Story: a specific image card → authenticated personal selection API/UI bearer →
retained original and attachment → fresh article readback → per-image receipt.
The article and image-selection views are separate.

## Cause

The old external preview displayed every candidate but its shared action chose
`imageCandidates[0]`. The native card likewise had a single first-candidate
bearer. Selecting a file changes the article's media revision, so the other
retained candidates then failed the original full revision/hash check even when
their prose and placement were unchanged.

## Design and implementation

- Keep Apropos' existing black/white typography and article width. Quiet dark
  surfaces (#080808), white text (#f5f5f5), secondary text (#b0b0b0), rules
  (#333), white primary buttons. No new font, decorative gradient or animation.
- Two visible views: **Vælg billeder** and **Læs artikel**. Cover and body roles
  are named. Candidate pixels and their own **Godkend billede / Fravælg billede**
  controls stay together, including at 390px.
- Pending proposals are not inserted into the reading view. Existing attached
  media stay visible in the article and in the external view's folded inventory.
- Each native bearer binds an exact asset/hash/current review revision and stays
  exclusively in UI metadata, not model content. The external API also receives
  the clicked asset/hash/revision. Selection requires loaded pixels.
- A fresh personal preview may review the original after media-only changes.
  Protected prose/metadata and placement checks remain. Original generation
  revision, brief, input and request identity are immutable; current review
  revision is recorded separately. Old tokens are not automatically upgraded.
- The model-facing import cannot request a revision rebase. Only the internal
  personal-selection service supplies review context, checked again against the
  durable, exact-file personal receipt before attachment.
- Double clicks are blocked. Lost acknowledgements trigger readback, not a new
  generation or repeated personal choice. Success requires the same attached
  asset/hash or exact decline receipt. The final choice stays in the image view
  with its receipt until the reader explicitly opens the article.
- Personal publication consent remains separate. No budget, grant, provider hold,
  scheduler, original image or historical receipt is reset.

## Verification before release

Eight suites / 263 tests passed, including three distinct files selected in
non-first order across media revisions, old-token rejection, wrong-file hash
rejection, unchanged original requests/briefs, model-import rebase rejection,
prose-change rejection, decline after a media-only change and no publication.
TypeScript, changed application/test lint, configuration-security and diff checks
passed. The browser-script lint target is ignored by the existing ESLint config;
this is not represented as lint coverage for that script.

The actual external React component passed 14 isolated browser cases at 390 and
1200px (selection, decline, stale/missing pixels, already-selected continuation,
sequential choices and lost acknowledgements). The actual embedded MCP document
passed seven isolated host cases, including per-file tokens, non-first selection,
double click, missing pixels, old-host decline denial and lost responses.
No real production choice, CMS write or paid AI call was used for these tests.
Screenshots are retained under `output/individual-image-review/`.

Pre-release live MCP readback preserves barsel submission
`546794452af45693e3495ae29d4fe5d8912c33844aaa62db10b2ad8a94e36171`,
revision 3, content hash
`4f172f48627ddab5224bcc270232cc4d8a022981616039e3466775fb80ad5cc6`,
one existing attached cover and three private candidates (sock cover, nap body,
older café body). All three remain unselected; no publishing consent is added.

Deployment/live evidence is recorded separately after release. Isolated tests
are not evidence of a real person's production image selection.
