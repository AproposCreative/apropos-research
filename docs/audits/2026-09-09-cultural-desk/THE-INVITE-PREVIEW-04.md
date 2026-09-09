# The Invite: production research and structured article contract

## Standing authorization

On 2026-09-09 the user replaced the earlier per-release approval restriction with
standing authorization for necessary project changes, push, deployment and
publication, including necessary existing production access and installation
scripts. The root AGENTS.md records this mandate. No further release approval
question is required. Instagram remains excluded. Quality controls remain.

## Production test of 5930d4f

Commit `5930d4f96e3894628671c6ee3e7f30cce8fb7902` was pushed to main without
force. Vercel deployment `dpl_HvTPtbGfGwLkaaFT3csTHxKiPh1e` became READY for
production and ai.aproposmagazine.com. The authenticated page displayed BUILD
1.0.0.5930d4f. No credentials were downloaded or printed.

One The Invite preview was submitted at 21:39:54 UTC with the established source
brief, research-review format and trending-only disabled. No daily plan was saved.

Production logs confirm two successful OpenAI research searches:

- 13,434 ms, five sources, no fallback.
- 14,558 ms, five sources, no fallback.

This replaces the previous test's two 45-second timeouts. Search leads are not
the same as fact-verified claims. The flow passed evidence-note construction but
stopped at 21:40:47.251 UTC with HTTP 500 and `research_rating_invalid`.
The old raw generated response was not retained. It is therefore unknown whether
the missing rating was a formatting error, an omitted rationale or an abstention.
There is no published article, CMS write or Instagram post from this test.

## Repair

The shared generator now requests a strict JSON schema with separate title,
subtitle, intro, content, numeric rating and rating rationale. The fragile
label-based article parser is removed from this path. Runtime validation still
rejects invalid/missing fields, unrequested stars, ratings outside 1-6 and
rationales outside 30-600 characters. No score is inferred or invented by code.

An explicit `insufficient_evidence` outcome allows the model to abstain. Provider
refusals and incomplete responses stop before SEO and publication. The schema
does not make an article factual or authorize it for publication; existing source,
similarity, factual, image and CMS controls remain unchanged. Provider shape was
checked against [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## Local checks

816 tests in 82 files and TypeScript pass. The integration tests verify the strict
request contract, preservation of rating into the CMS payload, refusal/abstention
handling and unchanged source-copy rejection. Tests use the isolated local store;
no dependencies, keys or tracked research data changed. Fresh production build
passes with three existing podcast/SEO tracing warnings. All 207 manifests exclude
tmp, Git and root env files. All six Liv route imports pass and package voice v4.
Live retest is recorded below when complete.

Skills used: deployment/API for exact release checks, verification and browser
guidance for the authenticated flow, observability for production evidence,
OpenAI credential gate with existing approved reuse, Next.js bundling for release
validation. The verification workflow stopped at the first failed boundary before
CMS writes.
