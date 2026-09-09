# Liv research and voice v4: release candidate

Date: 2026-09-09. Based on production commit 349ba9d. Local implementation; not a live article approval or activation of automatic publishing.

## Evidence and changes

The previous production test timed out twice after 45 seconds and got zero legacy fallback sources. Its generated article then failed the character-4-gram threshold against Kino.dk. The actual diagnostic draft was a review-of-reviews, not the independent Apropos article requested. Those are the boundaries this candidate addresses.

- Discovery now asks for direct source pages and a short cited list, with low search context and explicit low reasoning for GPT-5/6. Existing model IDs, primary timeout and source retrieval/factcheck requirements remain. This is a latency-oriented repair candidate, not proof the live timeout is solved.
- A narrow subject extractor removes recognized editorial question clauses, while retaining actual titles with colons. The same subject is used by the fallback. It no longer searches the full The Invite thesis plus a list of abstract research instructions.
- Additional consulted source URLs are requested and parsed as leads with empty snippets, never invented evidence. Current API shape is documented in [OpenAI web search](https://developers.openai.com/api/docs/guides/tools-web-search). The installed SSD-gated SDK predates the include enum; a type assertion is limited to that documented enum, without changing dependencies or casting the entire request.
- One bounded structured fact-editor call replaces the old fact extraction, names call and name heuristic. Notes require existing source IDs and exact contiguous evidence from the fetched source. At least two hosts, three factual notes, no duplicate summaries and at most three opinion notes are required. Missing/invented evidence, malformed or incomplete output blocks generation.
- The writer receives the neutral notes with source identity and opinion labels, not the competitor article's complete prose. Evidence-note extraction is not semantic fact verification; the existing complete source-grounded factcheck must still pass.
- Liv v4 adds the Apropos reader promise, concrete cultural relevance, one original thesis and a counterargument. Critic roundups are not independent original reviews and must not become the article structure. Existing justified 1-6 rating format and AI CMS toggle remain, without added generic article badges or fabricated viewing experiences. Writer and daily generation load the same voice and hash.
- Source comparison now records method `word-5gram-v2`. Whole-text five-word sequences and the existing contiguous 12-word copy screen replace character fragments as the lexical veto. The old character score remains visible diagnostic data. Semantic threshold 0.85 and opening threshold 0.55 are unchanged. Failed/invalid embeddings still block. Oversized input fails explicitly.
- This is a metric change, not a claim that the old The Invite result was a false positive. The synthetic independent Danish control pair has character overlap about 0.16, so that pair alone would not have failed the former 0.18 gate. Copy, punctuation-disguise and rearranged-fragment controls are included. These are engineering controls, not a calibrated production plagiarism benchmark. The inherited embedding comparison still samples the first 4000 characters, not every semantic claim in the whole article.
- Image discovery moves after source acceptance and runs in bounded parallel batches, so a source-rejected article no longer waits on sequential image pages. Discovery still grants no image rights.

## Local verification

795 tests pass in 81 files. TypeScript passes. Production build passes with the same three existing podcast/SEO tracing warnings. All 207 fresh deployment manifests exclude tmp, Git and root env files. The canonical v4 voice is packaged in all six consuming routes; six built route modules import and reject unauthenticated calls as expected.

Tests and build use a clean process environment, npm lifecycle scripts disabled and isolated `RAGE_STORAGE_DIR=./tmp/vitest-rage`. No dependencies, credentials or tracked research datasets changed. Previous .next output was moved recoverably into a new local tmp/liv-release-build directory before rebuilding. No production API generation, Webflow write, Instagram action, daily-plan change or cron invocation occurred in this step.

## Remaining publication work, not hidden behind an Auto-live label

Read-only inspection confirmed the cron always saves a draft. Its `publicationBlocked` response is always true. `checkCmsDraft` and `inspectLivCmsDraft` intentionally return publicationReady=false, with unresolved image rights. Turning on an environment flag cannot complete this path. These guards have not been removed.

After exact-commit approval, deploy and repeat the first failed live boundary with the established The Invite brief. Inspect research attempts, actual source evidence, the independent article and original source passages. Do not call a passing mock or lower lexical score publication approval.

Then complete the separate image-rights/asset proof, trailer validation, CMS fields and readback, followed by a single item-scoped publication and live verification. The daily path still needs that validated preparation/publication integration plus persistent duplicate/retry recovery. Topic selection still uses older keyword ranking; v4 improves writing but does not by itself implement the proposed content-profile ranking or coverage balance. Durable blocked-draft storage and full-document semantic originality evaluation remain open.

Instagram is absent from the inspected daily cron and shared article writer; this candidate does not add social publication. The user's desired activation is conditional on a finished, accepted The Invite pilot and verified daily flow. No auto activation is claimed.

The local recovery rule still requires separate approval of the exact clean release commit before push/deploy. Existing credential rotation and reuse authorization is documented in SOURCE-VERIFICATION.md; no repeated key setup is needed.

Skills used: OpenAI credential gate (existing approved setup), verification (evidence at each boundary), cron-jobs (daily path inspection), Next.js bundling (fresh build and runtime packaging). The verification workflow does not proceed to CMS or social writes past the failed article boundary.
