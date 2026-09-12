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

Production acceptance results are recorded after the deployed API test, not
inferred from unit tests or a READY deployment.
