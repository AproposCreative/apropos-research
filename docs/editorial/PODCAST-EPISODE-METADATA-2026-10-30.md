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
