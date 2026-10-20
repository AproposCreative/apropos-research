# Apropos AI visibility: repeatable measurement

Delivery scope: establish dated, reproducible evidence of AI referrals and technical eligibility. Do not equate a deployment, valid schema, indexed search result or llms.txt with an AI recommendation.

## Metrics

| Metric | Definition | Source and grain | Limitation |
|---|---|---|---|
| Identifiable AI sessions | Sessions attributed to an explicitly recognised AI service hostname | GA4 property 484743571; sessionSource × sessionMedium; completed 28-day windows | Lower bound; missing referrers and unknown hosts are not attributed. Google AI features cannot be separated from Google organic here. |
| AI engagement | engagedSessions / identifiable AI sessions | Same GA4 query/window | Null if denominator is zero; provider flags retained. Low volumes are volatile. |
| Citation frequency | Answers linking to Apropos / completed answers, separately per platform and fixed question set | Fresh, unseeded AI search answers with saved question, date, platform and citation URLs | Currently unmeasured. Do not count missing runs as zero or use this SEO conversation as an independent answer. |

Technical checks are diagnostics, not a fourth visibility score. No arbitrary target or inferred causal uplift is asserted.

## Run

From a checkout with the project's existing dependencies:

```sh
node scripts/geo/public-audit.mjs tmp/geo/public-YYYY-MM-DD.json 500
node scripts/geo/ga4-baseline.mjs tmp/geo/ga4-YYYY-MM-DD.json YYYY-MM-DD
RAGE_STORAGE_DIR=./tmp/vitest-rage node --test scripts/geo/ai-referrals.test.mjs
```

The final date is the end of the current 28-day GA4 window. Omit it to leave three calendar days for processing. GA4 dates use the property's reporting timezone. Authenticate using the existing approved service-account environment (`GA4_PROPERTY_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`), never pasted secrets or committed env files. Scope is analytics.readonly. Scripts make no CMS writes or model calls. Files are create-only: use a new filename for each observation.

The public audit bounds article selection to 500 and other sitemap URLs to 100. A smaller limit selects an evenly spaced sample in sitemap order, not the newest articles. It respects a conservative robots stop and inspects server HTML, including JSON-LD and snippet restrictions. It does not validate editorial accuracy, rendered layout, backlinks, bot IP accessibility, field-level schema requirements or actual Google index status. Non-self canonicals are review findings, not automatically errors. Missing author Person schema is an opportunity, not a prerequisite for AI search.

No new schedule is enabled by these scripts. Reuse the existing SEO operation for reviews; do not create a competing metadata writer. A future scheduled measurement must preserve the explicit access-failure state rather than report missing data as zero.

## Fixed citation benchmark v1

Use Danish questions below in fresh conversations with web search enabled, without naming Apropos or providing URLs. Keep platforms separate (ChatGPT Search, Perplexity, Google AI Mode where actually accessible). Save the full answer privately plus question ID, platform/model if visible, timestamp, search-enabled state and citation URLs. Record unavailable/no-AI-answer distinctly; denominator includes only completed answers. Compare the same question set over time; do not silently replace poor-performing questions.

1. Hvilke danske anmeldelser kan jeg læse af Baby Reindeer?
2. Hvad skriver danske kritikere om Netflix-serien Untamed?
3. Hvor kan jeg læse danske anmeldelser af The Invite?
4. Hvad er der skrevet om Justices koncert på O Days?
5. Hvilke danske kulturmedier skriver om Lucian Freud?
6. Hvor finder jeg danske kulturkritiske essays om Frankenstein?
7. Hvilke danske medier anmelder både musik, film og kunst?
8. Hvor kan jeg læse uafhængig dansk kulturkritik uden reklamer?
9. Hvilke danske anmeldere skriver om nye streamingserier?
10. Hvor finder jeg danske anmeldelser og essays om samtidskultur?

Current status: **not run on independent AI-answer surfaces**. Search-engine result listings and this task's context-conditioned answers do not substitute for that evidence.

## References

- [Google: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features): ordinary SEO applies; no special AI schema/file is required, indexing and serving are not guaranteed, and AI feature performance is included in overall Web search reporting.
- [OpenAI crawler documentation](https://developers.openai.com/api/docs/bots): distinguish search crawling from model-training crawling. A public GET from this audit does not impersonate or verify OpenAI's actual crawler network access.
