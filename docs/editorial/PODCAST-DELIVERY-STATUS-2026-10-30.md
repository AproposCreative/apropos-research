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

## Production verification

Code release `7234e56f6769987287c647b7af87c3478839eea9` is READY on
`ai.aproposmagazine.com`, deployment `dpl_EkfFSCJ3Bm592trwgfgJQjU6kDiB`.
Actual readback completed **2026-10-30T17:03:24.851Z**:

- Four bounded owner refreshes returned HTTP 200. Artwork/metadata updates:
  13, 0, 0, 0. Duration updates: 20, 20, 20, 16. Zero failures or unmatched
  sources. The 13 metadata updates are 11 recovered Danish entries plus the two
  legacy producer-identity repairs.
- **130 episodes / 130 distinct GUIDs** in canonical RSS and the matching Firebase
  mirror. All previous 119 remain with their relative order, enclosure URL/bytes,
  author and original publication date. Previously present durations are unchanged.
  Recovered entries retain their original dates; no synthetic new publication.
- Recovered examples include Barsel, SAVEUS, Silo, Syd for Solen, the O Days guide
  and Nak & Æd. Their old source recordings already existed; nothing was narrated.
- **76 missing durations measured**, all 130 RSS entries now have a duration.
  Original raw manifest generation `1793201330830175`, SHA-256
  `6c7e95c09d881e271bff2b4d22924f8e855deab3e361d19999d8cb378fa1a250`
  remains unchanged. Every one of the **154 source audio objects** retains its
  generation, byte size, MD5 and CRC32C from the pre-release inventory.
- All **130 cover URLs** were fetched publicly and decoded: JPEG, 1400 x 1400,
  within 450 KiB, real white bottom band and visible original black wordmark.
  All **113 distinct article links** returned HTTP 200. There are 130 retained
  audio versions for 113 distinct published articles, not 130 distinct articles.
- Both legacy Asta records now retain the exact original queue ID, explicit
  `identitySource: narration_queue` and current published CMS ID/title/URL/cover.
  The original three Asta audio revisions remain separate in RSS and grouped in
  the article status view. No missing article source remains in the selected feed.
- Owner status GET returned 200/private-no-store. Anonymous status GET and repair
  POST returned 401. Non-owner rejection is additionally covered by route tests.
- The actual Spotify public show embed independently verified Terminal List,
  episode `0UxG5lNMhor1j0ElNdjrER`. The owner action with that actual episode URL
  also returned 200/verified. This establishes one independently checked Spotify
  link, not Spotify readback of all 130 entries or cached artwork refresh.
- A repeated production refresh returned HTTP 200 with zero metadata/duration
  updates, zero failures and zero new incidents. No automatic resend/regeneration.
- Actual owner report: 243 published CMS articles; 113 with selected existing
  audio; 130 RSS versions; zero missing durations; zero historical source gaps;
  one independently verified Spotify link; zero new incidents. It also exposes
  **21 older failed audio jobs and one stalled job**, dated July/August. These
  are a separate narration backlog, quietly recorded as the initial baseline,
  not failures caused or repaired by this metadata release. No paid retry was run.
- The actual production report was rendered through the real component in
  isolated Chromium at 390px/1280px: no overflow or JavaScript errors, correct
  live counts, real verified episode link, 22 historical problems and no repeat
  alert. This is local UI verification against actual production data, not use of
  the owner's personal browser or a claimed iPhone acceptance test.
- Vercel configuration readback at 17:04:23Z confirms crons enabled and
  `/api/cron/podcast-metadata` scheduled `*/15 * * * *` on this exact deployment.
  This is configuration proof, not a claim of a new natural timer execution.

Zero paid AI/TTS calls, audio regeneration, CMS publication, outgoing mail,
budget/provider policy changes or account-role changes. Safe repair only changes
podcast metadata/facts/status and the RSS mirror. Existing narration failures
remain separately visible and require an explicit, reviewed production decision.

Primary receipts: `verification.json`, `sync-receipts.json`, `repeat-sync.json`,
`spotify-link-verification.json`, `cron-config.json`, `artwork-checks.json`,
`audio-objects-before.json`, `operations-live.json` and
`ui-live-data-verification.json` in the evidence directory above.
