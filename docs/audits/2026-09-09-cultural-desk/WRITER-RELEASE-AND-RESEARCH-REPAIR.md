# Writer release and research repair

Date: 2026-09-09. Production release succeeded; full editorial acceptance is still pending.

## Released and verified

The user approved push/deploy after the preceding report identified Writer commit
`ee7bc6c460d75621278e4a83928e815db525c078`. Remote main was checked as
`c9fc7c39d452970cc3e3faf63c5177731c7e9826`; there were no tracked local changes.
An exact, non-force push of ee7bc6c to main succeeded. The permanent disabled
origin push URL was preserved. Prior credential rotation/reuse approval remains
documented in SOURCE-VERIFICATION.md. No credentials were read, created or changed.

- Vercel production: `dpl_x13Ezkanvnoi5A82pSyhyTbraMsP`, READY.
- Alias: https://ai.aproposmagazine.com . Build duration approximately 56 seconds.
- A fresh authenticated browser tab visibly showed `BUILD 1.0.0.ee7bc6c`.
- Writer displayed all six length templates and “Gem kladde i Webflow”.
- Research source selection showed Berlingske, BT, GAFFA and Soundvenue.
- Soundvenue initially had no stored articles. One explicit refresh returned 200;
  runtime logs recorded 10 discovered, 10 successfully fetched, 10 added, zero
  failures, zero pruned; ingestion duration 15,253 ms. These are production
  Firestore research records, not Webflow articles.
- The ten Soundvenue articles appeared in Writer. Selecting the Matthew
  McConaughey/The Rivals of Amziah King article displayed source text, key points
  and a link to the original. This verifies that source's selection/summary flow,
  not all media or generation quality.
- Firestore reported a missing composite index for source/publishedAt. Its existing
  fallback returned 200 and the selected articles. No index or database migration
  was performed.

## First failed live boundary

Writer's Analyze step returned 500 at 20:55:20 UTC. Request reference
`1788987320469-gh0u4l3jn`. The provider rejected `max_tokens` and requested
`max_completion_tokens`. UI correctly showed “Ikke analyseret” and a retry action.
No retry of the unchanged failing build or progression to article generation/CMS
was attempted. The displayed research prompt also still contained an obsolete
800–1200-word instruction independent of the selected template.

## New local changes, not part of ee7bc6c

### Research transport

- Timeout now aborts the transport and is always cleaned up. Liv's two parallel
  primary searches receive 45 seconds each, then at most 15 seconds for fallback.
  Other callers retain the configured/default 15-second primary budget. Invalid
  values fall back; the primary maximum is 60 seconds. This is not a total deadline
  for the entire article pipeline; the existing route remains capped at 300 seconds.
- OpenAI requests disable retries, require web search, reject incomplete responses,
  and bound output to 3000 tokens. Existing configured models remain unchanged.
- Preserve the cited research brief rather than only short citation windows.
  URLs from citations require HTTPS and no embedded credentials. Actual source
  retrieval, date checks and fact verification remain separate requirements.
- Do not discard partial primary sources for an empty/weaker fallback. This does
  not turn a failed quality check into a pass.
- Logs now distinguish each attempt's duration, timeout, quality failure or exception
  and safe HTTP status. Total duration includes failed attempts. Provider bodies,
  source text and query text are not added to these diagnostics.

Request behavior checked against [OpenAI web-search documentation](https://developers.openai.com/api/docs/guides/tools-web-search).

### Blocked Liv preview

- Source-similarity failures can return the exact compared generated text, its SHA-256,
  model and voice version to the authenticated preview caller in a separate
  `blockedReview` object. There is no `article` payload or publish control.
- HTTP remains 422/503, `ok`, `gatePass` and `canAutoPublish` remain false, and the
  response is no-store. Later gates are not called after this failure.
- The error's review text is a private field, excluded from generic error serialization
  and the safe diagnostic logger. Original source full texts are not returned.
- UI renders the diagnostic as escaped plain text and labels it unapproved. It lasts
  only in the active preview session; durable blocked-draft storage is still missing.
  Stale request responses cannot overwrite a more recent preview result.
- Similarity thresholds are unchanged. Comments no longer equate a threshold with
  proof of plagiarism. No calibration or false-positive verdict is claimed.

### Writer analysis and prompt

- Replace unsupported max_tokens with max_completion_tokens, omit temperature,
  bound the request to 45 seconds without retries, and pass cancellation.
- Require authenticated access in the route and send the existing user token from
  Writer. Validate input types and bound text supplied to analysis.
- Reject malformed, incomplete or truncated analysis instead of inventing a “Stabil”
  fallback. A single article is not a time series, so the trend is explicitly
  “Ikke dokumenteret”. Suggestions remain research leads, not verified findings.
- Use the canonical selected template for the visible research prompt's word range.
  Explicitly prohibit fabricated quotes, facts and viewing experiences.

## Verification and remaining acceptance

782 tests passed in 80 files, including 43 new tests relative to ee7bc6c. TypeScript
and a fresh production build passed. Safe-build configuration and 207 fresh
deployment manifests passed without tmp, Git or root env files. Tests used a clean
environment with npm lifecycle scripts disabled and `RAGE_STORAGE_DIR=./tmp/vitest-rage`.
No dependency installation or changes; no tracked research-data changes.

The new changes require approval of their exact clean commit before push/deploy.
Then repeat the failed Writer analysis and The Invite preview. Inspect the actual
blocked text, evaluate similarity with independent Danish examples and copying
controls, and only then proceed through factcheck, image rights, trailer and CMS
write/readback. No “perfect article” or verified autonomous operation is claimed.
Neither Webflow writes nor Instagram actions occurred in this step.

Skills: deployments-cicd/vercel-api guided exact-release checks; agent-browser was
unavailable as a CLI, so the existing browser integration was used. Observability
identified the live model-parameter error. Verification stopped at that failed
boundary. Next.js and React review guided authenticated, uncached diagnostic output
and stale-result handling. The OpenAI credential gate reused the already approved
Vercel setup without retrieving credentials.
