# Apropos editorial calibration

Initial scope: ten published reference candidates from the existing archive and
five retained AI drafts stopped by automated controls. Publication is not a human
quality score; a control failure is not a human rejection. This is a calibration
set, not a held-out test, since the references are already available to style sampling.
No live provider requests are used to build or report this set.

Run `npm run quality:report` for word counts, diagnostic flags, exact text hashes
and actual human score coverage. `-- --review-pack` prints the texts for review.
Before claiming calibrated quality use `-- --scores <file.json> --require-scored`.
That mode exits 2 until every case has a genuine, exact-version human rating.

Rate voice, facts, structure and publishability from 1 to 5 using the rubric in
`lib/editorial/quality-evaluation.ts`. 1 means new text required; 3 means material
editing; 5 means ready. Record one decision (`publish`, `minor-edit`, `rewrite`,
`reject`) and a concrete reason. Use the article's source URLs to evaluate factual
accuracy; language quality alone cannot verify a claim. The reviewer supplies
their real email and review time. Do not fill missing ratings with model output.

Scores file: a JSON array of `humanScoreSchema` records with `caseId`, `textHash`,
`reviewer`, `reviewedAt`, `source: "human"`, `scores`, `publishDecision`, `notes`.
Edited texts invalidate old scores. None of these records grants CMS approval.

Current human ratings: **0/15**. No measured quality gain, blind model winner,
finetuning result or percentage cost saving is claimed. Before model selection,
reserve a new set unseen by style sampling and compare anonymous outputs under
the same rubric. Avoid new paid comparisons until the human baseline is scored.

Keep the current image standard unchanged. A medium/high comparison needs the
same prompt, reference, dimensions and style and actual editorial image ratings;
pricing differences alone do not demonstrate equivalent image quality. Reuse
licensed/selected press assets and completed images in the meantime.
