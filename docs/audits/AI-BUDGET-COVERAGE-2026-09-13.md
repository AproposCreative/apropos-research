# AI budget boundary inventory

Read-only source inspection, September 13. This is a coverage inventory, not an
invoice or proof of runtime traffic. No paid model requests were made.

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
