# Remaining budget coverage audit

Source inspected at `5b0164d`, September 13, 2026. No paid provider calls.

## What is established

- The application OpenAI singleton constructs `LivBudgetOpenAI`; shared mode
  rejects missing cost ownership before transport. Ledger transactions reserve
  capacity before calls and retain ambiguous reservations. Existing transport
  and ledger tests verify concurrency and denial behavior.
- The current source architecture test covers runtime SDK imports in app, lib,
  scripts and services. It does not establish behavior of separately deployed
  revisions or arbitrary external HTTP services.
- Accreditation has six model call sites, all enclosed in
  `withSharedCostContext({scope:'accreditation', ...})`: event-extract, event-date,
  intake-classify, studio-chat, dialogue-test and inbound-summary. All specify
  output limits and zero retries. The broad `accreditation_other_calls` warning
  is not evidence of an identified untracked call in this revision.
- Both `lib/podcast/run-pipeline.ts` and
  `services/podcast-processor/src/pipeline.js` read uploaded audio, encode with
  FFmpeg, store audio, update the manifest and notify. No model call was found.
  Infrastructure/notification costs are not AI-provider spend.
- `lib/podcast/trigger-processor.ts` can send a job to a configured independent
  Cloud Run service. Its deployed revision has not been matched to this source.
- Focused source search found no Anthropic, Replicate, ElevenLabs, Gemini,
  OpenRouter, Perplexity, Serper, Tavily or fal.ai integration in app/lib/services/
  scripts. This search is not a proof against every possible HTTP integration.

## Exact remaining work

1. RESOLVED for current production: Vercel deployment API readback identifies
   READY `dpl_52d78N2JUhZAmABCWdRk8RqgGsVm`, SHA
   `b903348198dc734e7c1b8b48a87e53e3b09178d0`. Its 193 environment-variable
   names do not include `PODCAST_PROCESSOR_URL`; only PODCAST_NOTIFY_URL and
   PODCAST_NOTIFY_SECRET are listed for podcast. Current project production
   metadata also has no processor URL. Thus the inspected inline FFmpeg path,
   not the independent Cloud Run processor, is selected. No new Google Cloud
   permissions or Cloud Run mutation are necessary. Notification configuration
   value inspection did not complete and no notification was sent.
2. Check every runtime provider boundary against the deployed application SHA,
   then replace generic exclusions with the actual scoped coverage. Preserve
   historical untracked spend as unknown; do not import guessed zero costs.
3. Distinguish prospective application enforcement from a provider-account invoice.
   Costs from other projects sharing the credential cannot be guaranteed by this
   application's ledger. Do not relabel `fullMonthlyCapVerified` as true solely
   because source searches or tests pass.

The target remains a covering 300 DKK application AI budget, not merely a new
status label. No coverage flags or policy totals were modified by this audit.

## Source-boundary follow-up, September 13 18:40 Copenhagen

Expanded the regression to include src, components and proxy.ts, in addition to
app/lib/scripts/services. Package scripts invoke src CLI entrypoints, so these
must not be omitted from a repository-level dependency check. Runtime re-exports
and TypeScript import-equals are now rejected too. Seven negative fixtures and
four permitted type/error-only fixtures exercise the detector itself; the actual
source-tree assertion also passes (12 tests total). TypeScript passes.

No additional runtime SDK bypass was found in these directories. This is source
evidence only: no paid request, credential change or production mutation occurred.
Literal or obfuscated direct HTTP remains outside this SDK-import assertion;
the existing transport tests separately cover guarded requests. The full monthly
cap and historical/invoice qualifications above are unchanged.

## Cross-scope allowance regression, September 13 18:52 Copenhagen

A source-isolated ledger test now submits four concurrent 80 DKK reservation
fixtures under independent Liv, Writer, SEO and accreditation run identities.
Only three are accepted into the same September ledger; the fourth is denied.
Settling all accepted results as ambiguous preserves all 240 DKK of holds, and
a further 80 DKK attempt is still denied. Thirty ledger tests and TypeScript
pass. These are mocked transactions, not a production spending experiment or
proof about historical provider invoices. No production ledger was changed.

## Discovery cache consolidation (e93d604)

The research-engine route now uses the existing Writer research cache after its
authorization and accounting checks. Exact topic/options, provider/model settings
and a credential digest partition entries. Good results are reused for ten minutes;
same-key concurrent requests share one in-flight operation. Missing credentials
disable reuse. Failures/weak evidence are not stored. The response remains no-store
at the HTTP layer, so this does not create a public CDN research cache.

Route tests prove same-credential concurrent/repeated requests make one mocked
lookup while a second credential makes its own lookup. Together with existing
cache expiration/isolation tests, 27 targeted tests pass; full regression at
e93d604 passes 3,156 tests in 197 files, and TypeScript passes. Cache is per-process:
cold starts, token rotation and different instances can still repeat work. No
production monetary savings have been measured. Deployment was dispatched as
`dpl_FXQSAgKnRiVBkPkjKgpbhis8Lxr4`; readiness requires separate verification.
# Provider reconciliation access check, 17:15 UTC

Production environment metadata was read at 2026-09-13T17:15:58.035Z.
Neither OPENAI_ADMIN_KEY nor OPENAI_ADMIN_API_KEY is configured. No
OpenAI billing/costs/usage-named key or OPENAI_PROJECT_ID was found.
No credential value was fetched or printed for this check.

This is evidence about configuration names, not proof of the privileges of
every existing credential or all possible external connections. No invoice
data has been obtained. `historicalCostsIncluded=false` and
`fullMonthlyCapVerified=false` must remain unchanged.

An account-owner supplied project-scoped usage/cost export for the month would
allow reconciliation without adding broad administrative credentials to the
application. Until then, distinguish the tracked application's reservation
limit from actual invoiced costs. Do not invent historical ledger entries.
