# Document-extraction experiment: 5 October 2026

## Outcome

The conditional extraction comparison is now executed, not just proposed.
The application's `retrieveSource` rejects both real PDFs with
`Kilden returnerede ikke en direkte HTML-side.` This is its intentional MIME
boundary, not a provider-quota failure. It must not be removed merely to make a
test pass. The production reader and inbox metadata-only policy remain unchanged.

Four pages were rendered with Poppler and inspected. The two-page Charlottenborg
press release is dated **27 January 2017**. The two-page Amalie Smith / Clay Theory
handout covers **4 October 2019 to 19 January 2020**, not the 2026 Levende exhibition.
They are historical format fixtures, never current Liv article evidence.

| Parser (pinned) | Charlottenborg | Bilingual Clay Theory |
| --- | --- | --- |
| pypdf 6.10.0 | Selected checks pass | Selected checks pass |
| pdfplumber 0.11.9 | Selected checks pass | Interleaved columns and two broken dates |
| Docling-native 2.133.0 | Selected checks pass | Selected checks pass |

The manifest checks short names/dates, page identity and whether the full Danish
body precedes the English body. It does not prove every word or factual claim.
Docling retains 81 and 160 native text-item bounding boxes respectively. pypdf
provides the page-level provenance needed by this comparison without that extra
structure. No learned layout model, OCR, table parser or cloud service was tested.
All parsers leave the photographic first page without invented text.

**Decision:** do not add Docling to the application's runtime or introduce a paid
crawler on this evidence. Docling-native beats this default pdfplumber path but
has no demonstrated text-check advantage over pypdf on these two documents. This
is not a broad parser ranking. A production PDF reader would still need a bounded
server ingestion design, document-kind/source-date handling and representative
scanned/long/private-document tests. No Mac process becomes a Liv dependency.

## Reproduction and safety

- Harness, exact source URLs/hashes, pinned wheel lock and compact observation:
  `tools/document-eval/`. Read its README for commands and interpretation.
- All dependency wheels were resolved/reviewed before isolated installation.
  Docling's MIT-licensed native distribution was used without model/cloud extras;
  no application package or npm lockfile changed. `pip check` passed.
- Child environment excludes credentials, proxies and Python hooks. Isolated
  working directory, network audit guard, no model downloads/telemetry, and
  byte/page/text/time limits. This is not an OS security sandbox for arbitrary
  native code. The fixed public fixture hashes are mandatory.
- Raw PDFs and text stay in ignored temporary storage. Committed evidence contains
  source identities, text hashes and findings, not full copyrighted press text.
- Two runs returned identical page hashes/findings. The comparator correctly
  exits 1 for the known pdfplumber defect; it is not disguised as all-green.
- **12 Python harness tests** passed, including missing/reordered/corrupted text,
  changed hash/size, directory escape, credentials, network and timeout handling.
- **336 Vitest files / 4,749 isolated tests** passed, including unchanged source
  security gates and two deployment-isolation tests. TypeScript, scoped ESLint,
  safe build and diff checks passed. Next production build passed.
- All **279 local build trace files** were inspected: none includes either
  offline evaluator or its temporary PDFs. MCP's server trace is still present.
- Zero paid AI calls, CMS writes, publications, budget/hold resets or human scores
  were created by this experiment. Extraction is `extracted_unverified`.

The only production configuration change explicitly excludes this developer
directory from Vercel upload and server tracing. It adds no user-facing PDF feature.

## Production verification, 5 October 01:23 Copenhagen

- Code: `8f6e87ae084cf0b40ef471592aad3e7a4a53b52a`, pushed to
  `codex/liv-daily-recovery`.
- Deployment: `dpl_6VZSagm2eWgfq2Vx45Uf2jQ4gD7p`, **READY**, target production.
  Immutable URL:
  https://apropos-research-efnfqrtw8-frederik-kraghs-projects.vercel.app
- Both the authenticated deployment API and the independent Vercel connector
  returned the exact code SHA and `ai.aproposmagazine.com` alias. The project's
  production target also points to this deployment. Only the pushed Git snapshot
  was deployed, not unrelated local changes.
- Read-only service-authenticated checks against the actual production alias ran
  **4 October 23:22:53–23:23:02 UTC** (5 October 01:22–01:23 Copenhagen).
  `/connect/chatgpt` and OAuth protected-resource discovery returned HTTP 200;
  the page retains frame denial and discovery names the correct `/mcp` resource.
  Owner connection inventory, editorial operations and provider status succeeded.
- Compared with the pre-deployment **23:17:44–23:17:49 UTC** baseline, the shared
  and image ledger hashes were identical. October shared remains one tracked,
  unresolved call, 0 DKK usage estimate and 1.2144 DKK reserved. Reservations and
  app estimates are not the provider's bill. No paid AI call was made.
- The stored provider hold remains blocked at revision 5. This is not a fresh
  numerical provider-balance check. No hold, budget, queue, article or reservation
  was changed by verification.
- 5 October is correctly an off day; next publication is 6 October, with no ready
  next story and zero of one reserves. The API reports blocked saved preparation
  with `provider_quota_exhausted`, not an active writer or a finished article.
- The complete owner connection inventory still reports no active authorization,
  no successful tool call on an active grant and `clientAcceptanceVerified=false`.
  This release check did not create a temporary grant or repeat editorial writes.
- A deployment-scoped error/fatal log scan for **23:22:50–23:23:05 UTC** returned
  no matching logs. This is a bounded release observation, not an uptime guarantee.
  The prior MCP functional acceptance remains separate; this config-only release
  does not change its version or tool contract.

## Remaining goal gates

The real owner ChatGPT connection and owner-selected editorial acceptance remain
separate from service tests. Generic imported drafts still have no automatic
admission bypass. Human calibration needs genuine editor scores. Liv's blocked
provider and every-other-day publication/next-story/reserve conditions are not
fixed by this experiment. The overarching goal is not complete.
