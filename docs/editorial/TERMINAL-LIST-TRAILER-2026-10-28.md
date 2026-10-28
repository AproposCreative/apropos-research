# Terminal List trailer and publication consent

The owner asked to finish publication, then explicitly required the trailer to
be stored in the CMS trailer field and removed from the article body.

## Verified cause

Submission `d3f0fd222aff78aebd9ea3ee5f01b8f758a1a91608f57a7373129adf268bbc9f`,
revision 11, was personally approved at 2026-10-28T14:07:10.673Z. Preparation
and every stored CMS check passed. Publication stopped at publication-consent
with `mcp_submission_preview_changed`, leaving item `6ae1fb83b14bf576bb768fce`
as a never-published draft. The original body contained the official trailer
link. Webflow preparation projected it into `videoTrailer` and `video_trailer`.
Those were the only differences between the normalized approved and prepared
articles. Consent bound the absent fields and correctly did not silently ignore
the mismatch. The personal approval was present; this was not a missing click.

## Code and validation

MCP v62 exposes validated HTTPS YouTube `videoTrailer` separately from the body,
normalizes it and displays it in both approval previews. Explicit trailer identity
remains bound to consent. Historical hashes are not rewritten. Comparison permits
only the exact automatic projection of a link already in unchanged approved
content/excerpt when neither trailer alias was explicitly supplied. A new URL,
changed prose, metadata, images or revision still fails.

83 focused tests passed across consent, worker, continuation, publication,
reconciliation, recovery, workspace and widget state. ESLint, security build
configuration, and simulated mobile/desktop widget checks passed. Whole-checkout
typecheck encountered an unrelated untracked output/ringo-bio-publish script error;
an isolated typecheck excluding output passed, as did production build/typecheck.
No dependencies, paid AI, mail or Instagram operations were changed.

Release `71d97a6cef6c82d6a1a8b510680156fff9fc3257`, deployment
`dpl_2qNSm5JijWhJmx6WQLJfn96rdKur`, is READY. Direct Vercel metadata verified the
SHA. The staged OAuth endpoint was checked before assigning ai.aproposmagazine.com;
fresh native Vercel lookup and Apropos preview confirmed the deployed flow.
Unrelated journal edits remain outside this commit and deployment upload.

## Article state, not a publication receipt

The connected client's cached tool schema rejected the newly deployed
`article.videoTrailer` parameter before dispatch. The existing server
`updateSubmission` function was therefore invoked with existing service auth,
active-owner verification, exact revision/request ID, and the no-paid-AI guard.
This used the same validated and audited update path; no CMS write or approval
function was invoked. Temporary environment material was removed.

Revision 12 has the exact trailer anchor and separator removed; its Prime Video
watch link, title, remaining prose and four body images are unchanged. The trailer
is saved as `https://www.youtube.com/watch?v=ycGRitcszLI`. Existing CMS identity,
revision-11 consent and its history remain intact. Readback at
2026-10-28T15:23:28.943Z reports awaiting_preparation / approval_required, no missing
images. Fresh native preview offers one Godkend og udgiv for revision 12.
The old CMS draft still awaits this new version's preparation; no publication
has been claimed. Do not manufacture a fresh click or reuse revision-11 approval
for changed body copy. The next step is the owner's personal approval in the
opened preview, followed by existing server continuation and public/CMS readback.

Evidence: output/terminal-consent-diagnostic-20261028.json,
output/terminal-trailer-deployment-20261028.json and
output/terminal-trailer-update-receipt-20261028.json. No approval tokens in receipts.

## Published after the owner's new approval

Before this turn ended, native status advanced to revision 12 / published /
publication_approved. The server completed the ordinary preparation/publication
path. No agent approval was manufactured. Fresh direct live CMS readback confirms
the same item is no longer a draft, lastPublished 2026-10-28T15:25:28.804Z.
The public URL returned HTTP 200 at 15:27:02.223Z with the correct H1, SEO title
and canonical. CMS video-trailer contains the official ycGRitcszLI video, and
the public HTML includes its player. CMS body contains no occurrence of that
trailer ID, retains the Prime Video watch link and all four body images.

Live: https://www.aproposmagazine.com/articles/anmeldelse-the-terminal-list-saeson-1

Evidence: output/terminal-published-readback-20261028.json. The previous pending
state above is preserved as chronology; publication is now verified. This is an
owner-approved submission, not an unattended Liv delivery.
