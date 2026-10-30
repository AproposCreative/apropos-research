# Spotify distribution, 30 October 2026

## Scope and current outcome

Use the existing article-audio production and Firebase hosting. The canonical feed is `https://ai.aproposmagazine.com/api/podcast/rss`; `/api/podcast/feed.xml` is its alias. No new generation, codec migration, jingle change, audio upload, credential change or manifest write was performed for this work.

The RSS repair is implemented, tested and verified in production. Spotify account claiming, show ID and episode visibility remain unverified. Browser bootstrap returned `Local browser use is disabled in Work settings`; no alternate browser control, account submission or verification-code request was attempted. An owner must enable browser use or complete the one-time Spotify claim in their existing account.

## Archive and delivery evidence

Read-only service audit at 2026-10-30T13:12Z found:

- 154 entries in `podcasts/manifest.json`, with 154 distinct audio objects across `podcasts/narration/` (143) and `podcasts/articles/` (11).
- Complete object listings, no unindexed audio, no missing manifest audio and no duplicate object references.
- 120 Danish feed entries before the repair; 34 English translations remain excluded by the existing language rule.
- Every one of the 120 public audio URLs returned HTTP 206, the requested 1,024 bytes and an MP4/M4A container header. All declared enclosure sizes matched Content-Range totals; no inaccessible URL or zero enclosure length.
- Show cover HTTP 200, JPEG, 3,000 by 3,000 pixels, 107,921 bytes.
- 69 entries have no optional duration. This is not evidence of invalid audio and no duration was invented.

Manifest generation: `1793201330830175`. SHA-256: `6c7e95c09d881e271bff2b4d22924f8e855deab3e361d19999d8cb378fa1a250`. The audit retained the original manifest and metadata; no storage write was required.

Raw local evidence is under `output/spotify-distribution-20261030/`: `manifest-before.json`, `storage-summary.json`, `storage-listings.json`, `asset-probe.json`, `asset-validation.json`, `feed.xml` and `feed-summary.json`. Raw public download tokens and account credentials are not included in this tracked report.

## Cause and repair

Two Placebo recordings from 26 and 27 October share the GUID `ai-placebo-sluk-telefonen-og-bliv-haengende-lidt-endnu`. One article slug has three consecutive hyphens and the other has one; normalizing punctuation yields the same article identity. Emitting both entries gives podcast clients two items with one identity.

The shared RSS builder now selects one recording per GUID and normalized article identity: a manual recording takes precedence; otherwise the latest stored recording is used. This selects the 27 October Placebo recording and retains its original GUID, audio URL and publication timestamp. Both originals and all 154 manifest entries remain untouched. A GUID collision between different normalized articles throws an explicit error instead of silently hiding an article. No new GUID is invented for an older revision.

The canonical RSS and subsequent normal writes of the optional RSS mirror use the same builder. The existing mirror was not rewritten as part of this audit; submit the canonical dynamic URL to Spotify.

## Verification

The actual archived manifest produces valid XML with 119 unique Danish episodes. Every pre-existing distinct Danish GUID is retained; zero invalid enclosures and zero dropped manifest entries. Candidate summary and XML: `candidate-summary.json` and `feed-candidate.xml` in the local evidence directory.

24 tests passed across `test/podcast-rss.spec.ts`, `test/podcast-public-failure.spec.ts` and `test/podcast-player.spec.ts`. Coverage includes the exact punctuation-collision pattern in either order, manual recording priority, unrelated collision rejection, feeds beyond player pagination, preserved language filtering, stable GUIDs, XML escaping, MIME/size/date metadata and absent optional duration. The isolated application typecheck passed with `tmp/newsletter-feature-typecheck.json`, which excludes unrelated generated output. No dependency change or paid provider call was needed.

## Production release

Code commit `d2044299f784546017d83e1f58332ac5d8ac61f4`, deployment `dpl_2jHd1Nr5SCyG7sHUWzo1NjvrnNUw`, was READY on the production alias `ai.aproposmagazine.com`. Direct authenticated alias lookup and public checks at **2026-10-30T13:20:28.428Z** matched that exact commit.

Both `/api/podcast/rss` and `/api/podcast/feed.xml` returned HTTP 200 with 119 unique GUIDs, every expected episode identity, the selected 27 October Placebo revision and valid enclosure metadata. The newest episode, The Terminal List, returned a public HTTP 206 audio range with the expected 10,935,515-byte total. The two RSS responses had identical XML SHA-256 `5cee2b437fd4a5886d19ac981b5b0cbd9bd67b1141184cc0296d8016fe219cb6`. Evidence: local `production-after.json`, `feed-after.xml` and `feed-alias-after.xml`.

A fresh authorized manifest read at **2026-10-30T13:20:11.129Z** confirmed the same storage generation, SHA-256 and all 154 original entries. Evidence: local `manifest-after-verification.json`. The release changed only RSS episode selection, its tests and distribution documentation. It did not change article narration, audio binaries, the manifest, website playback code, AI Writer or jingle selection.

## Spotify account step

Keep hosting at Apropos. In [Spotify for Creators](https://creators.spotify.com/), use **Find an existing show**, then **Somewhere else**, and enter the canonical RSS URL or an existing Spotify show URL. The feed owner is `liv@aproposmagazine.com`; Spotify sends its eight-digit verification code there. Enter the code only on Spotify. If another admin has already claimed the show, request membership instead of creating a duplicate.

After claiming, save the actual Spotify show URL/ID and verify existing episodes plus a later naturally produced episode. Spotify polls RSS several times an hour; allow at least an hour for an update. A successful RSS check or deployment alone does not establish Spotify publication.

Official references: [claiming an existing show](https://support.spotify.com/us/creators/article/claiming-your-podcast-on-spotify-for-creators/), [show distribution](https://support.spotify.com/us/creators/article/getting-your-show-on-spotify/) and [delivery specification](https://providersupport.spotify.com/article/podcast-delivery-specification-1-9).
