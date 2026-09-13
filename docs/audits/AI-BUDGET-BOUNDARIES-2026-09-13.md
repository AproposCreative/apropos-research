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

1. Read production podcast processor configuration and deployed revision using
   supported Google Cloud API access. Match its artifact/source before treating
   the checked-in non-AI pipeline as evidence for that service. gcloud is absent
   locally and no connected Google Cloud tool was found; existing scoped service
   credentials may still support read-only REST inspection. Do not grant Owner
   or change the service merely for an audit.
2. Check every runtime provider boundary against the deployed application SHA,
   then replace generic exclusions with the actual scoped coverage. Preserve
   historical untracked spend as unknown; do not import guessed zero costs.
3. Distinguish prospective application enforcement from a provider-account invoice.
   Costs from other projects sharing the credential cannot be guaranteed by this
   application's ledger. Do not relabel `fullMonthlyCapVerified` as true solely
   because source searches or tests pass.

The target remains a covering 300 DKK application AI budget, not merely a new
status label. No coverage flags or policy totals were modified by this audit.
