# Liv recovery, 26 September 2026

## Confirmed outcome

- User reported USD 18.98 API balance. Actual production visual and final factual
  assessment calls then succeeded. Provider hold revision 4 is unblocked.
- MOR article published through `/api/liv/operations/publish`, item
  `6ab80fd835b7f14765be83b5`. The final API response is HTTP 200, `published`, with
  CMS/live revision, public text, hero and two body images verified.
- URL: https://www.aproposmagazine.com/articles/mor-annoncerer-koncerter-i-aarhus-og-koebenhavn-punken-vil-stadig-hoere-til
- This was operator-assisted recovery, not a successful unattended daily run.
- Tomorrow's Amalie Smith story and a separate Kvinde ukendt reserve are now
  verified ready with CMS drafts, hero and two distinct body images each.
- No image generation, new MOR article, credit purchase, budget increase,
  Instagram posting or direct/manual CMS write was used in this recovery.

## Production fixes and evidence

| Release | Fix | Deployment |
| --- | --- | --- |
| `2663b40d8abdca0b63fab6a8a55ff472d9e383e1` | Preserve provider failures and resume only a ledger-proven quota-rejected visual request | `dpl_8PQhQkJrfwaCZFiWWzCE9fJ8PhAx` |
| `83bb152da38107ad644fc85af7418ddb33ec946c` | Pass exact edited illustration pixels to final assessment; never use an illustration as proof of real events | `dpl_E7raPWczTRrmKCpaqfKwuZApR6eS` |
| `266d76628101bb7c8a12f25db67963d24c8953b6` | Distinguish factual order from borrowed creative argument; deterministic Markdown heading repair and audited metadata correction | `dpl_4tGvM5UdboxPoUDcov86sR8uRS6W` |
| `f59a2dfd00e338e54e6a889d63a8f85138159e08` | Verify Webflow's omission of null optional fields without ignoring any changed content; exact explicit readback may proceed without publication backoff | `dpl_4HLQiYQmgP1vdqzN8DHywEFANNDj` |
| `41756e293566e80cdc797d663e7b9bade2f58721` | Use the research model for rare full-text source judgments; do not misclassify editorial HTTP 503 as an upstream outage | `dpl_EaicPit6AiA1dz4GRMbe82yZeQqt` |

Each deployment was checked READY with the exact SHA and production alias.
The last two releases passed 112 + 285 and 122 relevant mocked tests respectively,
plus TypeScript. Tests did not buy provider calls.

The stronger reviewer returned an independent judgment for Amalie, but two
redundant/malformed extra excerpts invalidated the whole response. The three
other pairs independently meet the required literal wording and two distinct
structural comparisons. Release `d08f20e5083313393e60a5cd7c03c1e9f125a96a`
selects a sufficient non-overlapping anchored subset and records excluded pair
indices, while preserving the immutable raw paid response. It never drops a
borrowed/uncertain finding to obtain approval. 154 relevant mocked tests and
TypeScript pass. Deployment `dpl_ENMMFFe6ywPZQ7g8sgRLr7sbfsgJ` was confirmed
READY with its exact SHA and production alias. The saved Amalie response then
passed this validation and returned `text_prepared`, without another judgment.

The next stop was `research_dated_sources_insufficient`: eight saved sources,
only one dated host. The source repair operation previously could not add better
evidence to a full list. Release `5fe12b9c93642b5fd038d168458029a0cd457698`
adds bounded, explicit replacement of undated leads with freshly retrieved dated
sources. It preserves the complete previous run, requires two dated hosts, keeps
dated existing evidence, and never grants quality approval or a retry. 55 tests
and TypeScript pass. Deployment `dpl_5vFQSNNuKvRTJmS2TXPAjDneg3SS` is READY with
the production alias and exact SHA.

Audited source request `amalie-dated-kunstkritikk-20260926` returned HTTP 200,
`sources_added`. It replaced the undated Exhibitionary calendar with
https://kunstkritikk.dk/mythologies/ (actual published metadata: 26 August 2026).
The source confirms Amalie's dual practice and the upcoming Charlottenborg show;
its judgments are not copied into the article. The prior eight-source snapshot
is retained. Updated checkpoint hash:
`4bfac989cb4ba9bf14e68728e911eb79a4c97445bfb89ec79a259d6de0cbce3e`.

MOR's independent final assessment passed 18 claims, zero disputed. The metadata
and plain Markdown ending heading were corrected by the existing presentation
API and inspected again before publication. All original assessments were kept.
Payload hash after the presentation correction:
`8f6a3cf8783217804717b7f5a809c805804a4ac0d5062947da3e6832a7beb380`.

Webflow published once at `2026-09-26T18:44:15.241Z`. Its live projection omitted
`book-title: null` and `book-author: null`. Recovery only restored missing nulls
for comparison from a staged snapshot whose complete hash still exactly matched
the recorded publication intent. It did not patch or republish the live article.

## Media recovery

Amalie media job `735030ad35cdd27f6e73cc118ef71395715c1cb7fddab65b51f4c737796a4d29`
generated and durably saved all three originals. Both body assets completed.
The preliminary hero lettering screen marked the ridges on a bottle-cap-like
object. A paid retouch returned an unrelated photographic portrait and failed
the independent preservation comparison. That derivative must not be used.

Release `24a8333e2fb3bc708b58c2aaf01edc0484ec379e` adds one durable expert
confirmation of the unchanged original before buying a lettering edit. A clean
verdict requires a specific visual reason and empty lettering regions; malformed
or uncertain outcomes do not approve the image or automatically buy another call.
Legacy edits and failed comparisons remain intact. The edit prompt now explicitly
preserves illustration linework and materials rather than assuming a photograph.
22 mocked image tests and TypeScript pass; a further 89 mocked integration tests
pass. Deployment `dpl_AeGoMm7uSHrN8QCcqh7LxwWqePjj` was verified READY with the
exact SHA and production alias. The expert found a different small inscription
on a stone, not the preliminary bottle-cap region, so it did not approve the
unchanged original. Its result is retained.

This revealed a legacy cache bug: the old comparison verdict was reused for a
new composite that patched the expert's different region. Release
`dee880250b3882979eca282fc68d1081345aebae` adds one fixed, pixel-hash-bound
comparison of that corrected composite, reusing the existing paid AI edit.
It preserves the prior failed comparison and cannot retry uncertain calls or
reinterpret a verdict against changed pixels. 98 relevant mocked tests and
TypeScript pass. Deployment `dpl_GJSraz7ur1kDEUsDd9LidskSWbBF` is READY with the
exact SHA and production alias. API retry `amalie-confirmed-composite-20260926`
returned `media_prepared`. Cleanup receipt is complete, and independent visual
review passed all three saved images. No additional image generation/edit was
bought for this corrected region; only its hash-bound comparison was new.

The final factual assessment identified a genuine five-channel versus five-layer
error. Its automatic correction timed out without saved output in revision
`9b481283562daf970e8eefcc7bdaa95d237d5732b50471682fc88b78e51a062b`.
That unknown attempt and cost reservation remain untouched. Audited app request
`amalie-confirmed-factual-copyedit-20260926` corrected that wording and clarified
three fact/interpretation boundaries against the actual source and report. It
did not rewrite the article, replace images or grant any quality approval.
Revised article hash:
`bd90defb8022a17f84307bb050a6b2997856a5605bf9e5d72cfbadec6fcc0679`.
API retry `amalie-after-factual-copyedit-20260926` returned HTTP 200, queued=true,
item `6ab82089416876aaa71a730b`. Independent final assessment passed 22 claims,
zero disputed, with source-similarity, moderation, editorial voice, staged CMS
readback, field and publication-readiness checks all passing. It is NOT live.

The truncated SEO title was then corrected through the presentation API,
request `amalie-clear-seo-20260926`, revision
`506c467f8f4c4ed27709dfd800f3b0cfef7879a3e1db394ff244d2b554100828`.
SEO title: **Amalie Smith: Levende på Kunsthal Charlottenborg**.
Readback confirms isDraft=true, lastPublished=null, publicationReady=true,
publicationBlockers=[], final payload hash
`dba63064d13c1debdb2ceb5c11a8e6426009c07f7e47e8438f5f4ae7e6a4214c`.
Owner-authenticated feed shows the story as ready for September 27 and seven
dated week rows. The other five future rows are not all completed articles.

The image-text-cleanup subflow is charged to the separate image-gen ledger,
not the Liv ledger. Its real call costs must be counted separately when reporting
spend. No budget limits or unknown reservations were changed.

## In progress, not yet accepted

- September 27 Amalie Smith is now ready, as verified above. Its saved writer
  child `47cf87ee-54ab-4500-9fba-dc1e73a8652b`, earlier assessments and all paid
  image versions remain retained.
- The separate reserve is now ready, as verified in the final acceptance below.
- Owner-authenticated weekly API returned seven dated statuses, not seven ready
  articles. Live mobile UI has not been verified: the available browser is logged
  out and browser control reports an unattached debugger. This does not block the
  server flow; no browser authentication/session fallback was used.
- A subsequent unattended delivery remains necessary for the overall goal.

## Budget snapshot before Amalie resumption

Production shared ledger: estimated usage 155.124456 DKK, reserved 28.950904 DKK,
886 tracked calls, 18 unknown calls, 300 DKK configured monthly budget, 115.924640
DKK remaining allowance. These are app estimates, not the provider's invoice or
credit balance. Existing unknown reservations remain reserved.

Existing daily heartbeat `verific-r-livs-daglige-udgivelse` remains active at
10:20 Europe/Copenhagen; it performs read-only verification, not publication.
Vercel remains responsible for scheduled execution independently of the Mac.

## Reserve press-source recovery

The normal preparation API created `reserve-2026-09-26`, **Kvinde ukendt er
Danmarks Oscar-bud**, preserving writer checkpoint
`5048c5f7a9f0e0fa8f80f08af16d4ebda8efbce1c3307c1ddb31f223114cba3a`.
It stopped before any paid media stage with `liv_media_credited_photos_missing`.
The generic source selector did not understand DFI's public Ritzau press room.

Audited source request `reserve-dfi-press-gallery-20260926` returned HTTP 200
`sources_added`, appending the real DFI Venice-awards press page without changing
the article or its existing sources. Release
`7c788991fc2e6b3bad849d79d17e5a67eb9865d5` adds exact public original-download
extraction from this verified publisher's credited one-image gallery figures.
It rejects other publishers, unrelated figures, ambiguous credits, mismatched
release IDs and fabricated thumbnail transformations. Unknown reuse rights
remain unknown. It uses saved source pages and performs no new AI research.
91 relevant mocked tests and TypeScript pass. Read-only production-source probes
found four original JPEGs, 2200–8192 pixels wide, with actual Nordisk Film,
Aleksander Kalka and Jacopo Salvi credits. These probes did not generate or save
CMS assets. Deployment and reserve completion are verified separately below.

Deployment `dpl_7jXJ33QgS1ixhkaFBbAboLyQhRV7` was verified READY with exact SHA
and production alias. An additional 92 mocked delivery/recovery/public-fetch
tests passed. API retry `reserve-dfi-originals-20260926` preserved the source
plan and saved the hero, but stopped in text inspection: the shared image reader
and WebP encoder permit 80 MP, while text-free storage incorrectly stopped at
30 MP. Both selected body-photo originals are above that lower limit. Their
cleanup records have no original, no provider stages and released leases;
there is no uncertain paid call to repeat.

Release `1242d0e8bc0c75da0b28981b6376155de06d12aa` aligns the input bound with
the existing 80 MP raster validation and keeps the 24 MB byte bound. Originals
stay byte-identical in storage. AI inspection still receives at most 1280×1024;
local retouch work is bounded to a 3840 px long edge, above the 1920 px CMS output,
to avoid scaling pixel arrays/CPU with very large source photos. No paid image
generation or retouch is introduced by this fix. 102 relevant mocked tests pass
(including the added oversized-header rejection) and TypeScript passes.

Deployment `dpl_GtA1NAXV8KRZWAy1XKBfQmKzrVPb` was verified READY with the exact
`1242d0e8bc0c75da0b28981b6376155de06d12aa` SHA and production alias. Retry
`reserve-large-press-input-20260926` returned HTTP 200 `media_prepared`, reusing
the saved plan and hero. The normal preparation endpoint then continued with
the remaining final assessment and CMS stages. Media-prepared checkpoint hash:
`580b3bfc6b970a0579e1313f9ff036fd014ab41c877253247d6b863fb2e6b70e`.

## Final verified inventory and remaining acceptance

Normal preparation returned HTTP 200 `queued: true`, item
`6ab8260bb4645496e05abb36`. The independent factual assessment passed 28 checked
claims with zero disputed; originality, moderation, editorial voice, CMS draft
readback, fields and publication readiness all passed. All three stored photos
were also inspected visually. Hero is the film still; body photographs depict
May el-Toukhy and Mathilde Arcel at Venice, as identified in DFI's captions.
No illustration generation or text rewrite was bought for this reserve.

Metadata-only request `reserve-clear-seo-20260926` then staged a concrete Oscar
news description, preserving the existing SEO title and all article/media data.
The initial request omitted the required unchanged seoTitle and was rejected
before mutation; the corrected request succeeded. Revision
`bbf99ee82705cb127d32ad8485888ff8557059fdaaefec5b80aa3e1ee04dd9ee`, final payload
`49a68d9d19dd5a6508e1655e4faad7d2808b64c3bdd0cbaac30407f749fe7781`, field hash
`a90dcc153c6228f9f4d04dff3def1a0ef603cf8a79bcf8d32efeeca093aa26fa`.
CMS readback: isDraft=true, lastPublished=null, publicationReady=true,
publicationBlockers=[]. Reserve expires 2026-10-01; it is not a second publication
today. The next preparation request returned `no_unstarted_work`, not a new
billable generation.

Owner-authenticated feed returned `total: 2`, both items ready, automatic queue
and preparation enabled. Read-only manifest health reports published=true,
overdue=false, reserves=1 of target=1, missingDays=[], blockedItems=[],
needsReconciliation=false. The public MOR URL still returns HTTP 200.

Budget snapshot: Liv/shared recorded estimate 171.951504 DKK, reserved
29.357368 DKK, 928 calls, 19 unknown; available allowance 98.691128 DKK under the
unchanged 300 DKK budget. Image-gen estimate 18.733688 DKK, reserved 0.026432 DKK,
90 calls, one unknown, under its separate unchanged 150 DKK budget. Reserve run
used 17 shared-ledger calls, plus separately recorded lettering checks. These
figures are tracked application estimates, not provider invoices or a freshly
read OpenAI credit balance. Unknown reservations remain untouched.

The seven-day overview contains actual statuses: today published, tomorrow
ready, Christopher and Dizzy blocked, and three later briefs awaiting preparation.
It does NOT represent seven completed articles. The bounded paid inventory is
one next-day story plus one reserve, as required by the savings policy.

The overall goal stays active. September 27 at 10:00 Europe/Copenhagen is the
next unattended publication to verify; the existing 10:20 read-only heartbeat
remains active. Neither today's assisted recovery nor an enabled switch proves
unattended daily reliability. No claim of three consecutive automatic successes
is made. Latest verified production code remains
`1242d0e8bc0c75da0b28981b6376155de06d12aa`; this document does not change runtime.
