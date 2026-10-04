# Offline editorial calibration

This isolated developer tool runs Promptfoo **0.123.1** against 35 saved texts.
It is not installed by the application, not bundled for Vercel and has no model
provider. It does not make a ChatGPT subscription available to backend cron jobs.

From this directory, `npm ci --ignore-scripts --no-audit --no-fund` installs the
pinned development-only lockfile. From the project root, `npm run quality:offline`
exports saved outputs and runs deterministic assertions with no inherited API
credentials, no app .env working directory, telemetry disabled and no database
write. Outputs/reports go to ignored `tmp/editorial-offline-eval`.

The numeric Promptfoo score is **record integrity**, not editorial quality:
nonempty fields, exact text hash and no fabricated approval/human score.
Stock phrases and em dashes are review flags, not human rejection. The separate
35-case Vitest regression verifies that a scoped edit preserves all unrequested
prose/names and media. Neither test proves factual accuracy, improved Danish or
better model-generated titles. No new output was bought for these checks.

`npm run quality:report` remains the shared human calibration report. Genuine
scores, exact text hashes and a new held-out set are prerequisites for claiming
a measured model/prompt quality gain. The current archive is not a holdout.

No model-graded assertions, remote generation or `share`/upload command belongs
in this offline workflow. Do not point Promptfoo at production secrets.
Primary format reference:
https://www.promptfoo.dev/docs/configuration/expected-outputs/#running-assertions-directly-on-outputs

## Twenty-article metadata regression

`npm run quality:metadata` checks the unchanged SEO/meta baseline for 20 explicit
archive articles. It also writes `candidate-template.json`, `review-context.json`
and reports to ignored `tmp/editorial-metadata-eval`. The full source context is
local, not uploaded to an evaluator service. Six baseline articles currently have
existing rule findings; a passing unchanged baseline does not certify them.

To compare saved proposals produced in the owner's own ChatGPT conversation:

1. Copy the generated candidate template to a separate JSON file. Edit only
   `proposed.seoTitle` / `proposed.metaDescription`; keep all 20 IDs/source hashes.
2. Run `npm run quality:metadata -- --candidates path/to/saved-candidates.json`.
3. Read `comparison.json`: before/after findings, newly introduced or worsened
   findings and exact field diffs requiring semantic review. Promptfoo exits
   nonzero if a proposal introduces a detected regression. Unknown fields, stale
   source versions, duplicate IDs and incomplete sets are rejected.

Checks cover primary-name preservation, new numeric tokens needing evidence,
existing forbidden SEO phrases, em dashes, character corruption, HTML and
increased length beyond the app's existing SEO caps. They do not prove all names,
new claims, grammatical Danish, humor or reader value correct. Every changed field
still carries explicit human/semantic review questions, not a made-up score.

The same pure evaluator is exposed in the owner MCP as `get_metadata_test_cases`
(list or one full source) and `review_metadata_candidate` (one exact-version
proposal). No CMS writes, paid AI, new editorial permission or provider probe.
Promptfoo itself remains local and excluded from Vercel; it is not the live server.
