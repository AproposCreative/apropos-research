# The Invite: authenticated preview and diagnostic repair

Date: 2026-09-09. This is a failed article test, not a publication record.

## Observed production run

Studio build `63a8a6c`, deployment `dpl_Hs7kdDuxfH6ke7KCzQY5zfLMNiUT`.
One authenticated preview was requested at 19:43:44 UTC. It ended at
19:45:36 UTC with HTTP 500 and `source_similarity_unapproved`.

The brief selected research-review, 1-6 stars, about 950-1100 Danish words,
film-specific analysis, original Liv voice, attributed criticism, no invented
viewing experience and no copied phrasing. Trending-only was disabled for this
single preview. No daily plan, cron execution, Webflow write or Instagram action
was requested or performed in this test.

Seven explicit research URLs were supplied:

- https://a24films.com/films/the-invite
- https://kino.dk/film/100011240
- https://www.nfbio.dk/film/invite
- https://soundvenue.com/film/2026/08/the-invite-sjaeldent-har-en-aften-vaeret-saa-kaotisk-sjov-og-ubehagelig-som-i-olivia-wildes-geniale-nye-film-689439
- https://www.kulturbunkeren.dk/the-invite/
- https://www.timeout.com/movies/the-invite-review-2026
- https://kino.dk/nyheder/hyldet-af-anmelderne-ny-stjernespaekket-komedie-kaldes-et-lille-mirakel

The trailer candidate was https://www.youtube.com/watch?v=OJ19I9q_hOQ,
identified by A24 channel metadata, not proof of player/region availability.
Kino lists Danish premiere as 13 August 2026. The article must not describe
9 September as premiere day. A distributor credit alone does not prove image rights.

Vercel logs show both automatic research calls timed out and fell back to
`legacy_web_search`, which returned zero sources in both calls. The generator
nevertheless reached source comparison. The code requires readable text from
at least two different hosts before generation; explicit/remembered URLs are
therefore the available path in this run. Logs do not establish which or how
many of the seven supplied pages were successfully retrieved. Do not report
all seven as verified by the application.

The existing generator discarded the failed comparison's scores, source identity
and completion flag. Consequently this run cannot distinguish threshold rejection
from incomplete verification. The generated article is not available in the
preview response and has not been editorially read or approved.

## Local repair

- Preserve safe comparison diagnostics: source hostname, content hash, completion,
  failure category, reason and scores. Do not log article/source bodies or URL queries.
- Distinguish threshold rejection (422) from incomplete comparison (503) in preview
  JSON. Explicitly return `gatePass: false` and `canAutoPublish: false`, no article,
  and `Cache-Control: no-store`. Existing UI displays the specific error message.
- Incomplete inputs, provider errors and invalid/zero embeddings are not approvals.
  The shared safety gate does not mislabel unavailability as excessive similarity.
- Preserve all existing embedding, lexical and opening thresholds, verbatim
  screening, source requirements, factcheck and CMS publication requirements.

This repair improves diagnosis and fail-closed behavior. It does not resolve the
unobserved cause of the production similarity rejection, fix search timeout,
calibrate plagiarism detection, recover the discarded article, or publish a review.

## Validation and release boundary

- 700 tests passed in 67 Vitest files, including provider failure, invalid vectors,
  literal/semantic overlap, generator propagation, preview authentication and
  safe failure responses. External generation is mocked in these local tests.
- TypeScript passed; final Next production build passed. Existing three broad
  filesystem tracing warnings remain in unrelated podcast/SEO paths.
- Build configuration and deployment-manifest recovery checks passed.
- No dependencies, env values, credential access, tracked research data or Vitest
  storage configuration changed. Lifecycle scripts remained disabled. The current
  SSD-gated local installation was reused, not a recovery copy.
- Vercel API and Next.js skills guided scoped log inspection and route error handling.
- No push/deploy is included. A new exact commit requires separate approval under
  the local recovery rule. Existing untracked CONTENT-PROFILE.md and IMAGE-RELEASE.md
  are preserved and excluded from this diagnostic release.

Next: deploy an explicitly approved diagnostic commit; rerun one preview and use
the actual source/score/failure result to repair the cause, without removing sources
or relaxing gates to obtain a pass. Then assess the real article and complete image
rights, trailer, CMS draft/readback and publication verification. Instagram excluded.
