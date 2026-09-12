# Current TV review: API acceptance test

Requested: one newly released TV-series review with argued stars, official online
photos, correct CMS taxonomy and economical preparation. Instagram stays off.

Chosen subject: The Gentlemen, season 2 (Netflix, released 3 September 2026).
Format: research-review; subject: tv-series; body: 450–650 words (target 550).
The voice must not fabricate first-hand viewing. Ratings follow stated arguments;
other critics' distinctive judgments retain attribution, without copying prose.

## Reused workflow, not a second writer

Authenticated `POST /api/liv/operations/prepare` explicitly starts one editorial
reserve per Copenhagen day. Its input is immutable. Identical requests can
continue durable saved stages; different input cannot replace paid work.
The shared `runLivDaily` still owns research, writing, cost accounting, media,
editorial gates, CMS save/readback and ready-queue admission. It does not publish
an extra daily article. Existing scheduled work and historical reserves remain.

Netflix Tudum article pages need a narrowly scoped HTML-size allowance and their
actual article-content selector. Photo discovery reads exact rendered image URLs
with per-image PHOTO BY credits, excluding related-story cards. General source
and asset security limits, no redirects/authentication bypass, remain unchanged.

The exact credited images are 1200×675 / 1200×800. Photography now selects the
largest native 16:9 output it can fill, either 1920×1080 or 1200×675. No photo is
enlarged. Saved evidence and CMS byte readback accept only those exact pairs and
still require matching hashes, file validation and the 450 KB budget. The legacy
manual image-preparation policy remains unchanged.

The one-card preview can show the next eligible reserve when there is no usable
scheduled story. This is presentation only, following the existing delivery
ordering, not a new paid queue or a change to publication selection.

## Evidence and cost acceptance

- Three explicit source URLs: Netflix Tudum, Soundvenue and What's on Netflix.
- Readable dated hosts are checked before writing. This avoids paid source
  discovery when the supplied evidence is sufficient.
- Canonical Liv TOV, original argument, explained 1–6 rating and bounded length.
- Hero plus two distinct official body stills; true captions/credits and ratio.
- Primary topic TV-serier; topics TV-serier and Anmeldelser; CMS Danish readback.
- Provider usage receipts grouped under `reserve-editorial-2026-09-12`.
  Usage-based DKK estimates are not a provider invoice or whole-account total.
- Identical completed-request replay must not create another draft or paid call.
- A saved/ready draft is not proof of publication or of all future daily runs.

## Production test, first pass

Release `4ab8a1da4be0ec5bcfff020d87b2293329f1f277` was READY on production
deployment `dpl_GRWPWCcgAdTAApYZ8hk6ZSVaLvev`, including the
`ai.aproposmagazine.com` alias. The authenticated preparation API produced a
saved 558-word TV review with 4/6 stars. It did not save to CMS: the old
similarity gate stopped at semantic cosine 0.892823 against Soundvenue.
The identical source hash, cached vectors and full-text lexical calculation
showed zero five-word overlap, no copied 12-word passage and opening score
0.07258. This is a review trigger, not evidence of plagiarism by itself.

Saved writer run: `22f6a890-794f-4041-84da-5ce28b5336d9`. Its original response,
research notes and sources remain unchanged. Five tracked calls (brief, writing
and three embedding cache misses) totalled 0.15092 DKK as a usage-based upper
estimate, not an invoice. No discovery or image-generation call was needed.

The acceptance test resumes this paid work after contextual similarity
review is implemented, not a replacement research run. An authenticated,
audited checkpoint-edit API was tested for small exact text corrections,
but the proposed manual “selvmodig” correction was not applied in production:
the later linked originality revision superseded that draft.
The contextual review returned a structural-dependence concern, but some
purported source excerpts contained ellipses and were not exact anchors. It was
therefore retained as an invalid/incomplete review, never converted to approval.
Its single paid result added 0.024816 DKK; cumulative estimate: 0.175736 DKK.
The original draft remains available. One explicit originality revision is now
allowed from that saved brief through an audited retry, using the configured
article model. A pre-call claim and immutable linked child prevent repeated
rewrite charges; the child must pass the normal checks. This is a text-quality
revision, not another discovery/research run or an exemption from source checks.
CMS and queue acceptance results remain pending until measured.

## Linked revision and media acceptance

Production release `6443204df550d6e4c1b359fb54e77a46c0dae94e`, deployment
`dpl_AzK6P686d195THvCMGP5tLpBNaWu`, was verified READY with the production
alias. The explicitly authorized single originality revision reused the saved
research and preserved its parent writer response. The resulting Sol review,
“The Gentlemen sæson 2 gør privilegium til et våben”, gives 4/6 stars and passed
the contextual source comparison. The next authenticated continuation returned
`media_prepared`, with three distinct official Netflix photos, not generated
illustrations. The following continuation returned `facts_revised`, preserving
those media while applying the normal factual correction stage.

At that checkpoint, 18 tracked model/embedding calls had a combined usage-based
upper estimate of 3.178776 DKK, including the rejected original, originality
revision and factual review. This is neither the final acceptance cost nor a
provider invoice. The largest charges so far were the Sol editorial assessment
(1.81904 DKK) and originality revision (1.0524 DKK). No paid discovery or image
generation was used. Automatic factual corrections are not silently counted as
free work.

The test exposed false economy in using the utility writer for an argued
review followed by a stronger corrective rewrite. Future research-review drafts
now select the configured article model directly; ordinary preparation still
uses the utility model. Saved responses are never regenerated because routing
changes. Three parameterized integration cases verify one writer call and the
appropriate model for each format/context. Full local verification: 137 test
files, 2256 tests passed; TypeScript, scoped ESLint and diff checks passed.

## Final-gate defect found by the real test

The next continuation stopped before CMS with `verification-complete`, not a
successful draft. Its paid factual report treated the concatenated excerpt/SEO
fields as duplicated or unfinished body prose and treated an explicitly identified
cultural interpretation as an unverifiable fact. The actual body is 547 words,
within the 450–650 policy. The failed report is preserved; it is not approval.
The accumulated 21-call usage estimate at this failure was 5.187528 DKK.

The assessment now accepts exact named CMS-field context. It must reconstruct
the original checked text exactly; unit IDs, literal text, fingerprints and
factual source validation remain unchanged. Compact field/unit offsets avoid
sending the article twice. Metadata still receives factual checks, while body
coherence is assessed on body prose. A versioned context hash makes old-method
reports ineligible for reuse without deleting them or reclassifying their verdicts.

An authenticated checkpoint retry can continue an owned explicit reserve after
a gate failure, preserving its revised article, all three paid photos and full
previous gate evidence. It cannot resume a CMS save with an uncertain outcome,
change the reserved brief, grant another writer or bypass gates. Exact retry
replay grants no new attempt. The current test uses this path after deployment.

Read-only production taxonomy verification confirmed these Danish items exist:
TV-serier `67dbf52a4ac2cf0073a9b0ef`, Anmeldelser `67e6f8f2e077ea42a9b95b87`.
Their assignment on the eventual saved article still requires CMS readback.
