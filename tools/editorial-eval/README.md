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
