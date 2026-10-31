# Podcast episode metadata, 30 October 2026

Owner request: include the actual article covers, current episode titles and short descriptions in the existing Spotify RSS feed. Keep existing audio production working.

## Cause and implementation

The article resolver omitted Webflow's actual `thumb` field. Existing manifest entries had the common show artwork, and publication/title/description corrections were never reconciled into RSS.

The RSS feed now overlays metadata from **published** Webflow items (`/items/live`), retaining the raw audio manifest. Established CMS IDs remain bound across later renames. Exact slugs are matched first; normalized slugs and legacy full-title matches are allowed only when unique. Title matching is exact, never fuzzy. Unmatched or failed entries retain their previous data. Language filtering and duplicate selection happen before presentation changes.

A metadata-only authenticated cron runs every 15 minutes. Owner-only `POST /api/podcast/metadata/sync` uses the same bounded worker. Each batch handles at most 20 changed episodes with two artwork workers and a durable exclusive lease. A failed/expired request resumes from committed per-episode metadata; it cannot regenerate or send audio. Last good metadata survives upstream failures. Anonymous/non-owner requests are rejected.

Approved published cover images are proportionally contained in 1400 x 1400 sRGB JPEGs, at most 450 KiB, without cropping or AI editing. These podcast-only derivatives have content-addressed paths, create-only storage writes and byte/hash readback. Source URLs and actual supplied credits remain in private metadata records. Original website images and CMS fields are untouched.

The canonical RSS endpoint and Firebase `podcasts/feed.xml` mirror share the metadata overlay. The public website/iOS audio manifest stays unchanged. GUIDs, episode selection/order, enclosure URLs/bytes, publication dates, authors and duration values stay intact. Narration, jingles, ElevenLabs and audio encoders are unchanged.

## Validation

- 42 focused podcast tests passed, including published-only source fields, short descriptions, unique matching, protected episode identity, language selection, actual JPEG encoding and no-crop letterboxing, pagination failures, idempotency, interrupted leases, last-good preservation, owner/cron access and degraded public RSS.
- App TypeScript validation passed with generated output and unrelated scripts excluded.
- All nine protected AI Writer files retain their earlier hashes.
- No new dependencies, paid AI calls, CMS publications, mail sends or audio regeneration.

## Production verification

Release: `56ff4b863eda1a12be70a6e0f4654ae79ec08884` (initial implementation `67096b7f`).
Deployment: `dpl_EKJFSATFcT2qqhjj26wiX4SfsvVJ`.

Verified at **2026-10-30T15:30:36.164Z** against the production alias:

- 119 episodes / 119 distinct GUIDs, in the same order as before.
- 117 episodes now have their own published article cover, current title, short description and working article link. Every derived image was fetched publicly and decoded: 1400 x 1400 JPEG, within 450 KiB. All 117 article links returned HTTP 200.
- Two historical Asta Kamma August recordings retain their common show cover and original metadata. Their two legacy article URLs return 404 and no matching article could be found in current CMS. No image was invented, no recording removed or merged. These are explicit source gaps, not successful individual-cover matches.
- All 119 artwork URLs, including the two show-cover fallbacks, returned decodable square JPEGs. All 119 descriptions are nonempty and at most 600 characters.
- Book title is now `Boganmeldelse: Nogen der kender nogen`; Deep Purple is `Anmeldelse: Deep Purple - Royal Arena`. Their actual published covers are present. The book artwork was also visually inspected.
- A second completed synchronization updated zero entries, with zero failures. The two missing article sources remain reported as unmatched; `complete` is intentionally false.
- Enclosure URLs/byte counts, original publication dates, authors, durations and GUIDs match the before snapshot. Original raw manifest generation remains `1793201330830175`, SHA-256 `6c7e95c09d881e271bff2b4d22924f8e855deab3e361d19999d8cb378fa1a250`.
- The Firebase RSS mirror equals the canonical feed. Anonymous metadata-write request returned HTTP 401.
- Vercel project readback confirms crons enabled, the new `*/15 * * * *` definition attached to this exact production deployment and existing cron secret configured. This is configuration evidence; no natural timer execution is claimed from that readback.

A legacy LP source image was actually 9504 x 6336 despite its `2400w` filename. The podcast encoder handles it within the same 80MP bound used by the shared image encoder, with concurrency limited to two. Its verified podcast derivative is 1400 x 1400 / 104747 bytes. The website original was preserved; this does not certify that legacy website asset against the website delivery limits.

Evidence directory: `output/podcast-metadata-20261030/`. No credentials or authenticated session tokens are saved there.

Canonical feed: https://ai.aproposmagazine.com/api/podcast/rss

Spotify account claiming/refresh is separate. Feed readback does not demonstrate a Spotify directory refresh or successful ownership verification.


## Owner artwork correction, later 30 October 2026

The owner rejected the letterboxed article photos shown by Spotify and selected the app's existing cover design for **all** episodes. This supersedes the earlier visual implementation above.

The authoritative reference is the read-only native `PodcastPlayerManager.brandedNarrationArtwork` implementation and `PodcastRepository.enriched`: mobile image before thumbnail; centered aspect-fill on a square; a white strip across the bottom 19%; original black Apropos wordmark centered inside, at most 50% of strip height and 70% of square width. The podcast display crop changes only a derivative, never the selected original or website image.

The actual app logo SVG was copied unchanged into `public/podcast/apropos-logo-black.svg`. SHA-256: `e9c57776ccb161b46b97518cfb02a8732e2328a4fe31dad2ccc5f28fd25b1f04`. No generated or substituted logo. The app checkout was read only; no iOS code, build, binary or account was changed.

Artwork is versioned `ios-white-band-v1`; version participates in metadata reconciliation and reuse checks. All previous photo-only covers are therefore replaced once, despite unchanged source URLs, and later title-only changes still reuse the verified artwork. Two missing-source historical episodes use the app's dark-image fallback with the same white strip and original logo. The show's separate channel cover remains intact.

Local validation: 46 focused podcast tests and app TypeScript validation passed. The Terminal List sample and the missing-photo fallback were visually inspected. New tests cover the mobile-image preference, visible white band/original logo, old-style replacement, branded missing-photo fallback, stable episode identity and idempotency. Serverless tracing explicitly includes the original logo file.

Production verified **2026-10-30T16:20:19.330Z** on the alias for code `443ad14583021d1a9354827240f7b92031c19cd2`, deployment `dpl_5Q9S5ETjmuRA1UVJgoGWdvykj2zY`:

- All **119 episode covers** were publicly fetched and decoded as 1400 x 1400 JPEGs within 450 KiB. Every image has the native white band and visible centered black wordmark, checked on actual decoded pixels.
- 117 article-specific metadata records migrated in six bounded batches, zero failures. The two missing-source episodes use the app-style dark fallback; their original source gap remains explicit.
- All 117 stored records declare `ios-white-band-v1`. A repeated synchronization updated zero records and had zero failures. Previous originals and earlier display derivatives remain retained.
- All 119 GUIDs, ordering, audio enclosures/byte counts, dates, durations, authors, titles, descriptions and article links match the correction's before snapshot. Raw manifest generation and SHA-256 remain the earlier values above. RSS mirror equals the canonical feed.
- Original logo SVG and branded fallback are publicly HTTP 200. Logo bytes equal the app asset hash above. The live Terminal List cover is byte-identical to the visually checked sample: SHA-256 `0b54fc1774fe190a87371f0d822d73d41a6abb41bea2dc276f41059f2267bf08`, 149403 bytes.
- No paid AI, narration, CMS edits, mail, account/credential changes or iOS deployment. All nine protected Writer hashes are unchanged. Anonymous metadata write remains HTTP 401.

These are actual feed/image readbacks. Spotify's separate cached display has not been claimed as refreshed by this verification.
Evidence: `output/podcast-app-artwork-20261030/`.
# Terminallisten sæson 2: første RSS-cover, 31 October 2026

The owner reported the new episode with a black app-branded placeholder in
Spotify. The retained narration receipt for
`ai-terminallisten-saeson-2-anmeldelse` was written at 12:34:14 UTC with the
show-cover fallback. Its article-specific artwork metadata was written by the
existing reconciliation at 12:45:35 UTC. The feed exposed the new audio between
these stages, letting Spotify cache the placeholder. This was an ordering defect,
not a corrupt image encoder or a new ElevenLabs problem.

At 12:51 UTC the canonical feed already carried the correct 1400px image,
SHA-256 `2c5da73589af932ee23b28a89c400abc30a60530ed129d5509e802eb1f88fc1e`,
112931 bytes. The actual public Spotify episode embed, episode
`6MJx333ff4uj49RHE0l2IT`, then showed the correct Dar Salim/Chris Pratt image.
Its displayed 640px Spotify CDN derivative was downloaded, visually inspected
and compared with the feed image (mean RGB difference 0.628 at 300px).
This establishes the corrected public Spotify cover; a previously delivered
phone notification is a dated snapshot and was not resent.

Release `2372b071b502078b8f3da00a45582eae6dcb93ab`, deployment
`dpl_9oj43NrWuxTKANi3c4tX8TJPmaVq`, became READY on the production alias at
13:00:46 UTC. RSS now waits for an identity-bound, verified artwork record with
the approved app style, artifact hash and actual byte size before announcing a
new episode. A failed metadata read returns a retryable 503/no-store response,
rather than a successful degraded or apparently empty feed. An authoritative
live CMS read confirming no photo may still create the owner's branded missing-
photo artwork. Unknown identity, pending synchronization and failed photo fetches
cannot create that fallback. Existing last-good metadata remains preserved.

All 92 podcast tests, app TypeScript and build security configuration checks
passed. Tests cover the actual sequence of ready old episode, pending new
episode, verified new cover and subsequent release under the original GUID,
audio URL and publication date; they also cover metadata outage and retained
last-good artwork. Read-only checks against all 131 actual selected episodes
confirmed that every existing episode already meets the artwork gate.

Production readback at 13:01:28 UTC returned HTTP 200/synced and all 131 original
items with identical identity, title, copy, cover, enclosure, author, date and
duration fields. The target audio object's generation/size/MD5/CRC32C, original
raw manifest generation/hash and retained narration/metadata receipts are
unchanged. There were no new TTS calls, CMS writes, queue retries, credential
changes or notification sends. No error/fatal runtime logs were returned for
this exact deployment in the inspected ten-minute window.

Evidence: `output/podcast-artwork-terminal2-20261031/` with verification.json,
source-before.json, source-after.json, readiness-preflight.json, deployment.json,
rss-before.xml, rss-after.xml, spotify-visible-artwork.json,
spotify-artwork-verification.json, spotify-cover-current.jpg, podcast-tests.log
and typecheck.log. The original encoder, approved logo, audio worker and sources
were preserved. The existing metadata timer still determines when a new episode
becomes ready; this release adds no paid pipeline or public write route.
