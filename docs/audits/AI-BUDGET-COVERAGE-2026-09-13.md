# AI budget boundary inventory

Read-only source inspection, September 13. This is a coverage inventory, not an
invoice or proof of runtime traffic. No paid model requests were made.

## Current delta after original inventory

- Live cf430c9 covers newsletter intro, inbox assistant/learning and translation.
- Local e46cc5f adds independent factcheck/TOV/moderation Writer ownership.
- Design headline/subtitle boundaries now use shared Writer accounting. Headline
  generation uses one call, no retry loop, no invented generic success fallback,
  and validates full output rather than truncating it. Removed obsolete fallback
  helpers remain recoverable in Git. API and better-copy alias remain available.
- No current source caller was found for either headline URL; therefore this is
  removal of a potential cost/quality problem, not measured production savings.
- Research-engine's old five-call/fabricated-fallback implementation was replaced
  in live b81651d. Remaining concerns below refer to historical source except
  where still explicitly open (quality-check, content-enhancer, media and
  standalone research-verification). Full-application cap is still unverified.

## Verified source architecture

`lib/openai.ts` creates `LivBudgetOpenAI`. Its fetch wrapper only reserves costs
when a server AsyncLocalStorage cost context exists. No context means ordinary
provider transport. Merely using this singleton does NOT enforce the budget.

| Boundary | Source evidence | Remaining action |
|---|---|---|
| Writer chat | `app/api/ai-chat/route.ts` wraps handler in shared writer context | Verify all internal downstream hops retain scope |
| Factcheck / TOV / moderation routes | Accept signed Liv context, missing header preserves manual behavior | Add own authenticated shared boundary for independent use |
| Accreditation completions and research | Explicit shared contexts, caps, zero retries in pending commits b04dff9 through c22fdba | Deploy together and verify policy activation |
| AI suggestions, analyze-research, generate-article, generate-webflow-fields | Shared Writer boundary, capped calls, zero retries and budget-denial response in 65f20a1 | Deploy and verify policy activation |
| Content-enhancer, quality-check, research-engine | Shared Writer request context across all five calls; nested ownership and denial tested | Deploy; reduce redundant stages and replace unsupported research fallbacks |
| Design editor helpers | Completion sites in more-clickbait and shorten-subtitle | Add budget and bounded output, test existing error handling |
| Generate-image | Text planning call plus image pipeline | Trace JSON/multipart transports, price support and failover before wrapping |
| Newsletter intro | `lib/newsletter/intro-ai.ts` direct completion | Add newsletter context; preserve send/draft behavior on budget denial |
| Liv inbox assistant / learn | Direct completion sites | Inspect callers and existing context, protect learning retries |
| Translation, standalone research-verification | Direct completion sites | Inspect caller chains and account all passes |
| Podcast uploaded-audio pipeline | `lib/podcast/run-pipeline.ts` downloads incoming audio, encodes AAC, updates manifest/CMS | No AI call in this inspected pipeline; do not invent AI spend or disable it |

The entries above are not exhaustive transitive proofs. Prioritize functional
request boundaries rather than adding a new cost scope for every helper. Reuse
parent context across nested work, disallow unsupported paid transports before
contacting providers, and preserve completed paid responses on settlement errors.

## Required proof before claiming 300 DKK covers the app

1. Inventory every provider transport and callable route, including image/audio,
   internal HTTP hops, direct clients and non-OpenAI services.
2. Each paid route must reserve against the same durable monthly ledger before
   transport. A route that cannot be priced must not silently bypass it.
3. Test concurrent calls across features, nested ownership, exhausted budget,
   provider ambiguity, streaming and disabled/mistyped config.
4. Verify exact deployed SHA and production policy without paid smoke tests.
5. Keep historical untracked spend and actual billing distinct from estimates.

The existing fullMonthlyCapVerified=false remains correct. Do not replace it
with true based on this inventory or on narrow unit tests.

## Editorial debt found while tracing budget boundaries

`research-engine` still makes five ungrounded completion requests and constructs
generic claimed media interest/expert opinions when JSON is empty or invalid.
These are not verified research. `quality-check` can substitute a score of 50
for invalid JSON; `content-enhancer` asks for full rewrites with small token caps.
Budget wrapping does not fix these functional problems. Inspect consumers and
replace unsupported success fallbacks before treating these paths as editorial
quality evidence. Do not delete the routes without tracing active consumers.
# Podcast source audit, after release 4590fcc

The checked-in podcast implementation does not synthesize or transcribe audio.
`app/api/podcast/process/route.ts` resolves metadata, creates a job, and chooses
the configured Cloud processor or the inline pipeline. Both
`lib/podcast/run-pipeline.ts` and `services/podcast-processor/src/pipeline.js`
download an existing incoming audio file, encode AAC using FFmpeg, upload audio,
update the manifest, notify, and mark the existing Webflow article. The processor
package depends only on Firebase Admin. The encoders invoke local FFmpeg, not a
paid model. Notifications are HTTP calls to the configured Firebase notification
function; they are not model calls in this repository.

Therefore do not build a speculative podcast AI reservation integration. Costs
for compute/storage/notifications are not AI model usage. This source inspection
does not prove the deployed external processor matches this checkout: verify its
configured target/revision before clearing the broad runtime exclusion. No job,
notification, audio upload or provider request was triggered by this audit.

Provider-constructor inventory across tracked runtime TS/JS found the OpenAI
singleton and guarded subclass, with other OpenAI imports type-only or APIError.
This narrows the next audit to shared-client call chains and configurable external
adapters, not hypothetical SDK integrations. It is not proof of complete budget
coverage: the guarded fetch still passes through calls lacking ALS context.
