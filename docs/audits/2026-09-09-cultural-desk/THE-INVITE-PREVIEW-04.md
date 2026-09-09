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

## b4d2039 deployment and retest

`b4d20397f54da04fcd313237d8b44f154afa6ca3` was pushed to main and became READY
in production as `dpl_2xfURKKHJGWsVhdnqbU3n48FYrYn`. The authenticated page
confirmed BUILD 1.0.0.b4d2039. One identical preview ran at 21:47:31 UTC.
Both searches passed without fallback: 8,575 ms and 10,923 ms, five leads each.
The run stopped earlier than article generation at 21:48:15.110 UTC with
`research_brief_evidence_missing`. The structured article format therefore has
not yet passed live validation. No CMS or Instagram writes occurred.

### Evidence-reference repair

Research now receives deterministic server-owned excerpts with source-scoped
passage IDs. Notes select an existing passage ID; the server resolves its exact
text before running the existing validator. This avoids asking a model to
transcribe a quotation exactly. Unknown IDs and cross-source references fail.
The writer still receives only neutral notes, not the original source excerpts.
The grounded factcheck still has to verify whether each claim is actually
supported: a valid passage ID alone proves neither entailment nor completeness.

Tests cover exact excerpt preservation, bounded deterministic segmentation,
rejection of fabricated/cross-source IDs and refusal to use model-supplied quote
replacements. No thresholds, fact/date rules or CMS gates are relaxed.

Evidence-reference repair validation: 822 tests in 82 files pass. Production build,
including TypeScript, passes. This fresh build reports seven broad tracing
warnings in existing accreditation/podcast/SEO paths (the preceding build showed
three), rather than a warning-free build. All 207 manifest exclusion checks and
six Liv runtime import/voice-packaging checks still pass.

## 90f33fc deployment and latest boundary

`90f33fcdf2f8b6f39b2e743eef4ae7447362a3a3` was pushed and became READY as
`dpl_Adnxc2syu91o66UM3SZgC1Kq6MjH`, including the production alias. The browser
confirmed BUILD 1.0.0.90f33fc. The obsolete local disabled push URL was replaced
with this repository's normal GitHub push URL under the new standing mandate.
No global Git security settings were changed.

One identical preview started at 21:53:10 UTC. Search again passed twice, without
fallback, in 9,862 and 10,273 ms with five leads each. Evidence references resolved
and the structured article response parsed. At 21:53:51.894 UTC the model returned
the explicit insufficient-evidence outcome. The UI shows
`article_evidence_insufficient`, reference `1788990790258-tp6pzvryg`.

This is NOT a completed review. The format contract can now express abstention,
but a ready article with accepted stars has not yet passed production verification.
The current API still exposes this business rejection as HTTP 500; a dedicated
422 response and explicit missing-evidence diagnostics remain useful follow-up.
The exact neutral brief and reason for abstention are not yet retained, so do not
guess which detail is missing or assert the film is inherently unreviewable.

Next: retain a source-bound diagnostic research brief, identify and retrieve the
missing relevant evidence, then retry generation and complete factual/originality
checks. Image rights/asset proof, trailer validation, actual CMS fields/readback
and item-scoped publication are still outstanding. No article publication, daily
plan change, cron execution or Instagram action occurred in these tests. The
existing Auto-live/active env display is not evidence of a working live cron.

Skills used: deployment/API for exact release checks, verification and browser
guidance for the authenticated flow, observability for production evidence,
OpenAI credential gate with existing approved reuse, Next.js bundling for release
validation. The verification workflow stopped at the first failed boundary before
CMS writes.
