# Article audio: player review, artwork and GA4 readiness

## Scope and status

Requested: review both website listen buttons, improve listening, match the app's
article artwork with its white logo band, and measure listens per article in GA4.
No audio/AI generation, CMS edits, provider/budget changes or Webflow site publish.
The owner's instruction to defer a full Webflow publish remains in force.

Player code and isolated tests are implemented, deployed and verified on the live
website as recorded below. **New analytics events are disabled by default.**
GA4 access and a verified consent integration are still needed before activation;
local event tests are not proof of events received by Google.

## Baseline, 9 October 2026

- Both the byline and floating buttons successfully play existing audio. The
  floating button forwards to the byline control: instrumenting both independently
  would count the same click twice.
- Tested `boganmeldelse-soed-toes` (577.7 seconds, 14,770,362 bytes) and
  `boganmeldelse-i-mellemtiden-er-vi-ingen` (314.38 seconds, 8,042,984 bytes).
  Public episode API returned 200; audio Range requests returned 206 and the
  requested bytes. Warm observations of 136/64 ms are not a latency benchmark.
- Both manifests supplied the generic black `podcast/show-cover.jpg`. The player
  preferred that to the article hero. Actual Webflow hero selectors are
  `.paralax-image-mobile` / `.paralax-image-2`.
- During soft navigation, audio continued but the floating button was discarded
  and head image/canonical metadata remained from the previous article.
- Mobile viewport 390 × 844: player fits; skip/speed/volume controls are hidden by
  existing Webflow CSS, progress target is only 3 px and close target 36 px.
  These touch/control design improvements remain recommendations, not shipped
  redesigns. No real iPhone lock-screen/background test was performed.
- Live site has GA4 `G-YZG9HDJ8S2` and GTM `GTM-5QN5VS8S`. GTM is installed both
  inline and via registered Google Site Tools CDN script. The public container
  configuration contains a Google tag but no article-audio events. Duplicate
  installation is verified; doubled Analytics counts are **not** established.
- No verified site-specific analytics consent integration was found in the
  inspected site code/container. Existing Google tags were not modified.
- Neither of the two available logged-in Google accounts exposed Apropos.
  Owner has been asked once which account has access (or to log into it).

## Implemented player changes

- Prefer the current article's actual hero; retain it with the playing episode
  across navigation/resume. Never substitute the next article's image.
- Compose a 600 × 600 display artwork using the existing photo and existing black
  Apropos logo, with the app's white bottom 19% band. Original files/CMS unchanged;
  local browser canvas only, no image-generation API. Cache is bounded to 12.
  Use it in the player and Media Session. CORS/image failures fall back to the
  same unbranded source without blocking audio. Real-device Media Session display
  is not verified merely by assigning metadata.
- Preserve the floating button during soft navigation and notify controls after
  the new article's audio lookup completes. Update image/canonical/lang metadata
  without replaying scripts. Retain the embed's configured API origin.
- Add loading/play-required/error messages. Prevent duplicate player installation.
- Existing progress/rate/volume and single-audio playback behavior remain.

## Measurement contract (implemented, not enabled)

| Event | Meaning |
| --- | --- |
| `audio_click` | One byline or floating CTA click, with `entry_point` |
| `audio_start` | First actual `playing` event for this listening session |
| `audio_listen` | At least 30 seconds of advancing, unmuted playback time |
| `audio_progress` | Unique audio coverage reaches 25/50/75/90%; once each |
| `audio_complete` | Natural end AND at least 90% of the audio actually covered |
| `audio_error` | Browser media error code, no media URL |

Common fields: `article_slug`, `article_title` (max 100 characters), `audio_id`,
`entry_point`, `listened_seconds`; progress adds `percent`. No signed media URLs,
email, user ID or arbitrary page query is sent. Cannot know whether the listener
is physically paying attention or their device output is audible.

`audio_listen` event count = qualified listening sessions, not unique people.
GA4 users filtered to that event = measured users, subject to consent/device/
identity limitations. Use `article_slug`, not current page path: audio can keep
playing while the reader browses another article. Pause/resume and soft navigation
do not duplicate the session event; close/reopen, a different episode or a full
document reload begins a new listening session. No cross-tab deduplication.
Repeated segments do not inflate unique percentage coverage. Seeking to the end
does not create a completed listen. At 2× speed, 30 real seconds are still needed
for `audio_listen`. Stalls, pauses and browser mute are excluded from qualified time.

The player does not load GA or grant global Google consent. Its public bridge is:

```js
window.AproposPodcast.configureAnalytics({
  measurementId: 'G-YZG9HDJ8S2',
  consent: /* verified current CMP analytics choice, never a hardcoded true */
});
```

Connect this after player load and on every consent change, including revocation.
Missing/invalid configuration means no new audio events. Granting later does not
backfill pre-consent listening. Revoking stops events immediately. Analytics
exceptions never prevent playback. Never paste a hardcoded consent grant into
production simply to finish the setup.

## Activation checklist / smallest next step

1. Owner makes the correct Apropos GA4/GTM account available. Verify property and
   web stream against the existing measurement ID; do not create a duplicate.
2. Verify existing CMP (or agree a consent solution if absent), wire the bridge
   above to its actual current state, and verify denied/granted/revoked behavior.
3. Register event-scoped dimensions `article_slug`, `article_title`, `audio_id`,
   `entry_point`, `percent`; add only metrics needed for the report.
4. Create an article-listening exploration: rows article slug/title; event count
   and users filtered to `audio_listen`; compare `audio_start`, progress and
   `audio_complete` separately. Do not sum cumulative `listened_seconds` across
   all events as total listening time. Initial release does not report an exact
   aggregate total of all listening seconds.
5. Use controlled DebugView/Realtime checks for both CTAs, 30 seconds, seek,
   pause/resume and article navigation, with test traffic identified/excluded.
   Confirm one event per expected action in Google, not just a local mock.
6. Deduplicate GTM only after verifying tag ownership and during the next
   coordinated Webflow site publish; do not silently publish unrelated changes.

References: [GA4 events](https://developers.google.com/analytics/devguides/collection/ga4/events),
[gtag event routing](https://developers.google.com/tag-platform/gtagjs/reference),
[event-scoped dimensions](https://support.google.com/analytics/answer/14240153?hl=en).

## Verification

- Unit tests execute the actual shipped JavaScript in an isolated VM. Cover
  default-denied, pause/resume, seek-to-end, unique coverage, completion,
  playback rate, stalls/mute, consent changes, invalid destination, GA errors,
  article image identity and retaining API configuration after navigation.
- Local browser mirror uses real article DOM/CSS, both existing audio files and
  the existing FAB script. Analytics scripts stripped, gtag replaced with a
  visible local event log, no writes/AI calls. This is not a production GA test.
- Observed one `audio_click` + `audio_start` from byline, one `audio_listen` at
  30 seconds across pause/resume, and one click/start attributed to `floating`
  after navigating while audio continued. Correct article slug and image.
- Real browser canvas produced readable 600 × 600 artwork with photo/white logo
  band. Logo endpoint returned 200 and `Access-Control-Allow-Origin: *`.
- TypeScript and safe build configuration passed. Public JS is intentionally
  ignored by repository ESLint; it is syntax-checked with `node --check` and
  executed in the VM/browser tests. Test-file lint passed.
- Final isolated suite: **361 files / 5,041 tests passed**, 9 October 10:46
  Copenhagen, `RAGE_STORAGE_DIR=./tmp/vitest-rage`. No paid provider calls.

## Release evidence

### Deploy result

- URL: https://ai.aproposmagazine.com/podcast-player.js
- Target: production, project `prj_sUVIsBr9l8DbjEFDrz6WUAQZcxGE`,
  team `team_Tvz3Od7ikoA3oBfwtC87wQ7U`.
- Commit: `26a01addbc55a329ed4efbe5e25f46db15f4cb40`.
- Deployment: `dpl_AXak6N7cbsur15NpjSSNhybPtWBq`, READY, verified actual
  `ai.aproposmagazine.com` alias. Next.js 16.3.8 application, remote build 59s.
- Version `2026-10-09-v1`. Public HTTP 200 at 08:49:11.636Z; bytes exactly match
  the committed local JS. SHA256
  `4cc8e5edf613862eb7156d1d4ed9c30bd52bf2669b1e3e560571ba06db5b86e7`.
- Previous production `e083fb33dbd0b416a6a6af7637656d00cacf68a9` /
  `dpl_GSpqzYsKvij5Xnb4NQFy1LPXG1Zy`. This release changes the player only;
  no Webflow site publish, CMS write or audio regeneration.

### Production browser readback

- Both articles played real existing audio with a readable 600px branded cover.
  Desktop and mobile viewport (390 × 844) inspected. Sød Tøs proof saved at
  `output/article-audio-player-2026-10-09.jpg` (local artifact, not committed).
- While Sød Tøs kept playing, navigation to I mellemtiden preserved its playing
  title/artwork and audio. The floating button survived. After closing the player,
  scrolling and using that button, the book audio and its correct branded cover
  opened. Exactly one audio element and one player. No browser error logs in this
  focused production test. Test playback stopped afterward.
- Narrow error/fatal runtime scan for this deployment from
  08:48:38Z–08:49:22.670Z returned no matches. This is not a long-term monitoring
  guarantee or proof of client-side GA delivery. Drains/monitoring configuration
  was not changed or audited in this scoped player task.
- GA activation/Google-side reporting is **not completed**. No verified account
  access or consent bridge yet. No production test consent was fabricated.
