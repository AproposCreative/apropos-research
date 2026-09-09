# The Invite: actual Studio preview test

Date: 2026-09-09. Production UI build: 47f6a41.

## Method

Signed-in Liv > Indstillinger > Redaktion > Preview med retning.
Topic: The Invite (2026), Olivia Wilde: parforholdets facade.
Trending-only was disabled for this preview. No daily plan was saved.
No Webflow publish, article save, image generation or trailer upload was invoked.

The brief requested a clearly labelled research-based analysis, approximately
1000 words, no rating or invented viewing experience. It supplied A24, Nordisk
Film Biografer and Kino URLs, plus an official A24 trailer candidate, and required
verification of the Danish release date. No viewing notes were provided.

## Observed result: NOT publication-ready

- Generated headline: Når kærlighed bliver en invitation.
- Subtitle: Facaden i parforholdet er blevet endnu en social opgave.
- UI body word count: 715. Moderation count: 784, which includes additional text.
- Category: Kultur, not a verified film CMS reference.
- Slug: nar-kaerlighed-bliver-en-invitation.
- SEO title: Kærlighed som social opgave i parforholdet.
- Meta description: Udforsk hvordan kærlighed bliver en invitation i moderne
  parforhold. Bliv klogere på facaden og sociale forventninger.
- Primary keyword: kærlighed. Film title absent from SEO title and slug.
- Research URLs: 0. Verified claims: 0. Confidence: low.
- Source similarity skipped because sourceExcerpt was absent.
- Factcheck skipped with HTTP 400; not a completed factcheck.
- Moderation reported OK; TOV reported OK with 1142 characters of tips logged.
- Overall display said Pass with warnings, while auto-publish correctly said blocked.
- Incorrect lineup requirement was active for the film test.
- No research image candidates or trailer appeared in the preview.
- Writer/CMS preview remained empty. This was not a completed CMS handoff test.
- Browser logs separately reported insufficient Firestore permissions when loading
  user drafts. This is not proof of a failure in the server-side editorial collection.

## Editorial assessment

The output is a generic relationship essay rather than a film-specific analysis.
It repeats rhetorical structures and makes broad cultural claims without evidence.
It does not visibly label itself as a research-based analysis. No stars or claimed
cinema attendance were observed, but it still implies knowledge of film themes
without retrieved sources. It should not be published as an Apropos film review.

## Code-backed explanations and next fixes

1. The directive expander returned a shortened brief without the supplied source
   URLs. Preview passes the expanded directive, not a separately preserved source
   bundle, to the generator. Explicit source URLs need structured handling.
2. Generator research fallback can write from a title when no facts are retrieved.
   Generation should stop with a useful research failure instead.
3. isLineupTopic regex scans the entire directive, so the instruction 'ingen
   festival/lineup-afsnit' itself triggers lineup requirements. Use explicit article
   domain/type, not incidental or negated words in instructions.
4. SEO needs film entity preservation. The existing generator and payload also lack
   a dedicated verified trailer handoff.
5. TOV tips alone are not an editorial quality gate. Skipped checks must not be
   presented as an overall successful quality result.

The preview safety block worked; the full research-to-CMS workflow did not pass.

## Local remediation, not deployed

- Preview and cron preserve the original editorial brief alongside its expansion.
- Generation retrieves actual source text with the existing bounded, SSRF-safe
  reader. At least two readable source hosts are required; this does not establish
  editorial independence or verify every claim. Missing research stops generation.
- Sources retain retrieval time, available publication date and content hash.
- The existing Liv persona and Apropos style examples are retained. Instructions
  now require concrete evidence, independent structure, attributed outside opinions
  and research-analysis labelling without viewing notes. Source instructions are
  explicitly untrusted. These prompt rules still require output evaluation.
- Every retrieved source is checked against the generated article and SEO text.
  Twelve consecutive matching words block the result, including matches beyond
  the existing similarity check's truncated window. Existing similarity checks
  must also complete and pass. Legitimate quotations may be conservatively blocked;
  translated or structural plagiarism is not guaranteed to be detected.
- Negative festival instructions no longer activate lineup checks. Generic drafts
  no longer receive an invented festival paragraph as a fallback.

Local validation: 564 tests in 50 files passed; TypeScript/build and scoped lint
passed. Six compiled route imports passed and 207 deployment manifests excluded
temporary data, Git and root environment files. Build retains three existing
podcast tracing warnings. Final prompt-only edits were linted after the build.

Still pending: deployed output evaluation, strict SEO entity validation, truthful
overall quality status for skipped checks, verified trailer/CMS handoff and image
rights. No new article was published. Push/deploy require the current recovery
rule's separate rotation and exact-commit approval.
