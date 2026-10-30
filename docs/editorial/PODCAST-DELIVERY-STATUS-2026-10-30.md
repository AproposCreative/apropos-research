# Podcast delivery status and safe repairs, 30 October 2026

Owner approval: implement the Danish selection fix, article/audio/RSS/Spotify
status, quiet durable incidents, and repair the missing durations and legacy
article associations. Keep the existing audio production and approved artwork.

## Implementation

- The RSS language filter no longer treats the ordinary Danish words `en` and
  `for` inside slugs as English markers. Explicit language and translation markers
  still win. Selection happens before CMS presentation enrichment.
- Published article, existing audio, RSS inclusion and actual Spotify evidence
  remain separate. The owner-only status view has search, missing-audio/problem
  filters and a compact mobile layout. Retained revisions group under an actual
  CMS identity without removing their individual RSS GUIDs.
- A Spotify link requires descriptive public embed evidence: exact parent show,
  unique complete title, original release date within 120 seconds and measured
  duration within two seconds. No title-only guesses, guest tokens, cookies or
  playback credentials. Unverified means unknown, not failed distribution.
  The public show embed currently exposes its latest episode. Older episodes can
  be checked using their actual episode URL; the view does not claim all episodes
  have independently verified Spotify URLs.
- `podcastDeliveryFacts` stores duration and dated Spotify evidence separately,
  bound to GUID, original enclosure URL/size and publication date. Existing
  duration values win. M4A duration is measured from the generation-pinned MP4
  movie header using bounded ranges (at most 1 MiB plus 64 small headers), without
  downloading/decoding/re-encoding the audio or calling a paid provider.
- Two legacy translated Asta slugs have original completed `narration_queue`
  receipts pointing to current CMS item `6ab225a3a347a5d0ff388f06`, now titled
  “Hvornår blev skuespillere også influencere?”. An exact queue slug, completed
  status and existing published CMS ID are required. This supersedes the earlier
  title-search-only source-gap conclusion, without changing historical receipts.
- Existing authenticated fifteen-minute cron and owner refresh share a durable
  lease. Each batch updates at most 20 artwork records and 20 duration facts.
  Last-good metadata survives failures; unattempted incidents are not resolved by
  another episode's bounded repair. Known failures do not starve new work.
- `podcastDeliveryIssues` keeps one incident per episode/stage. Initial historical
  problems are quiet; unchanged repeats neither become new badges nor rewrite
  incident records. A changed/recurrent incident is new. Acknowledgement must
  match its exact fingerprint. This is an in-app status badge, not an outgoing
  mail/push notification or editorial approval.
- Owner-only `/api/podcast/operations` provides GET status and POST refresh,
  metadata-only repair, duration-only repair, Spotify verification and incident
  acknowledgement. Per-episode repairs require the current immutable audio key.
  No operation here starts narration, SMTP, paid AI, CMS publication or an encoder.
  Connection failure requires status readback before retry; no automatic repost.

The raw audio manifest, audio objects, original dates/GUIDs, source artwork,
show cover, app logo, narration, jingles, ElevenLabs settings and Writer remain
unchanged. Only podcast presentation derivatives, RSS mirror and private status
records may be reconciled.

## Local verification

90 focused podcast tests passed in the isolated Vitest storage directory. These
include Danish/English selection, legacy producer identity and negative proofs,
generation-pinned duration ranges, malformed MP4, source identity changes,
actual Spotify matching, owner/cron access, leases, partial failures, incident
deduplication/recurrence and fingerprint acknowledgement. Existing player/RSS,
public-failure and actual native artwork encoding regressions also pass.

App TypeScript and build security configuration checks passed. All nine protected
Writer hashes are unchanged. Isolated headless Chromium tested the actual client
component at mobile 390px and desktop 1280px: no overflow or console errors,
search/filter/load-more, verified-link-only rendering, acknowledgement, exact-key
duration repair, one request on double click, and network failure without an
automatic retry. No personal browser profile or account session was used.

Production verification is recorded below after deployment and actual readback.
Evidence: `output/podcast-operations-20261030/` (no authentication material).
