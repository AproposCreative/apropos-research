# V.2 narration recipe with Ellen v4

Owner request: activate the reviewed V.2 direction for future audio articles,
include the longer outro, remove inserted music breaks and reduce voice drift.
This directory is an adapter for the existing Firebase narration worker. It is
not a replacement queue, publishing flow or app backend.

## Exact behavior

- Six-second intro uses the original continuous 41.39–47.39-second transition.
- The beat follows the existing demo's +3 dB setting and 80 ms loop joins.
- No synthetic three-second silence between speech chunks. Natural spoken
  sentence pauses and normal playback speed are retained.
- Same Ellen resolution and owner-approved `eleven_v4`; Danish, fixed robust stability and a
  common episode seed on all requests. Closing stars and thanks share a request
  with substantial preceding article text. Request fields match the approved
  real v4 listening demo; no new stitching, style or speed settings are added.
  `MODEL_ID` is shared by provider requests and saved episode metadata.
- Exact ending, shared by V.1/V.2: “Tak fordi du lyttede med på Apropos Magazine.
  Lyt til alle vores artikler gratis, uden reklamer og forstyrrelser.”
- Music continues for 6.5 seconds after all speech, with the existing fade out.
- Final AAC/M4A remains 44.1 kHz stereo, 192 kbit/s and faststart. A unity-gain
  limiter below its ceiling protects the mix from clipping.
- Retained V.1 is selectable. An Admin SDK-only, revision-bound setting in
  `podcastFeedOperations/narration-jingle` is read once at the start of each new
  episode. Switching does not change or regenerate existing episodes. Settings
  changes have a separate audit record; no client/public API or rules are added.

## Preparation and tests

`build-assets.py` requires the exact retained owner master and validates approved
cuts, levels and frame counts before creating three small WAV derivatives.
Original V.1 bytes are not altered. Assets are hash-checked before paid synthesis.

`patch-generator.py` takes a **freshly downloaded actual deployed source**, an
asset directory and a new empty output directory. It refuses an unknown
`narration.js` hash. Only that existing file changes; its own package lock,
entrypoint, notification policy, original jingle and other files are preserved.
The normal path also requires the retained deployed Danish classifier fix.
Historical fixtures require the explicit test-only `--historical-fixture` option.
No package is installed by preparation. The historical source fixture is test
material, never proof of the currently active source or a standalone release.

Run the hermetic tests with the current candidate directory:

```sh
NARRATION_CANDIDATE_DIR=output/narration-v2-release-20261031/active-source-candidate node --test integrations/narration-v2/recipe.test.cjs
```

They execute real existing FFmpeg renders, plus the patched worker with fake
provider responses and storage. They do not initialize Firebase or call TTS.
Local tests cannot prove a real Ellen performance or production deployment.

## Rollout procedure for the existing worker

1. In the owner's existing Google Cloud session read the actual
   `generateNarrationOnQueue` function in `apropos-magazine-6004a/us-central1`.
   Capture active source generation, revision, entrypoint, runtime, Eventarc
   trigger/retry policy, memory, timeout, instance limits and secret references.
   Keep credentials and signed URLs out of evidence.
2. Retain that exact active source and configuration as rollback evidence. Apply
   the adapter only to a fresh copy of its own source. Require current fixed
   notification policy, never substitute the historical fixture's policy.
3. Generate a bounded real Ellen listening sample of the body-to-closing join,
   including the new ending, using the current authorized secret in memory.
   Keep existing quota guard; no provider change, quota reset, unknown-outcome
   retry or old queue-job replay. Retain request receipts and the local demo.
4. Deploy **only this function** using a source-only update mask. Keep its
   runtime, entrypoint, secrets, Eventarc and service settings. Never deploy the
   large dirty iOS backend or the fixture archive.
5. Read back the actual active source, exact file hashes, service revision and
   unchanged settings. If a write times out, inspect its operation/function
   before any retry. Keep the original active source available for rollback.
6. Select V.2 through the revision-bound setting after active source verification.
   Confirm the first legitimately published new article through queue receipt,
   audio metadata (recipe/jingle/selection revision), final audio, manifest,
   website, RSS and Spotify. Do not synthesize a fake published article to prove
   the trigger or claim Spotify has ingested an episode before readback.

The maintained status/selection operator is in
`integrations/narration-v2/select-jingle.mjs`. It requires current
owner account status and a fresh independently written production source
verification receipt before a setting write. `status` is read-only and explicitly
does not claim that the current worker supports the candidate recipe.
The current v4 verifier writes to `output/narration-v4-release-20261031/`;
the selector also requires the proof's model to match `recipe.MODEL_ID`.

## Current model activation, 31 October 2026

The owner selected Ellen v4 for the next new audio article. The existing worker
is now `generatenarrationonqueue-00011-nog`, healthy with 100% traffic. Google
completed the source-only patch at 11:32:18 UTC. At 11:33:24 UTC the actual active
source matched all 13 tested file hashes, archive SHA-256
`00e2482e98f71d2d18e66ff32fbc3cede2d268ccd7725008ac221b385ea90f72`.
Only `narration.js` and `narrationAudioRecipe.cjs` changed; every asset, package,
entrypoint, notification policy and service setting is preserved. Runtime/trigger
configuration still hashes to
`0b102584f558a9131054fbce018ac02cc3a2d5eaacf168181be08fba9e7639ae`.

V.2 remains selected at revision 1 (fresh read at 11:34 UTC), including the
approved transition, beat level and longer closing. All 25 hermetic checks pass;
provider requests and persisted episode metadata both use the shared v4 model
constant. The retained real v4 demo also mixes and decodes with V.2: 43.78s,
peak -5.2 dB, without a new paid request. All 130 existing RSS GUID/audio URL
pairs remain identical. No queue replay or old episode regeneration occurred.
The next legitimately published new article remains the first end-to-end v4
episode acceptance point. Rollback is the retained revision 10 source.

Evidence: `output/narration-v4-release-20261031/production-evidence.zip`,
production-verified.json, candidate-verification.json, tests.tap,
rebuilt-exact-verification.json, jingle-after.json, rss-preservation.json,
v4-jingle-mix-validation.json and cloud-run-v4-active.jpg.

## Historical V.2 activation, 31 October 2026

V.2 is active for newly generated episodes. Google completed the source-only
update at 10:18 UTC; the active revision is `generatenarrationonqueue-00010-vik`
with 100% traffic. Readback downloaded the actual active source and verified all
13 file hashes against the tested candidate ZIP (SHA-256
`4def328b2841cbf37f71a19c2e119f9bcd7431b79948314edae457e639bdf19e`).
Only existing `narration.js` changed; five helper/asset files were added.

Runtime, entrypoint, credentials, memory, timeout, scaling, Eventarc filters and
retry settings match the pre-release configuration. The stable configuration
hash is `0b102584f558a9131054fbce018ac02cc3a2d5eaacf168181be08fba9e7639ae`.
Only the two unordered eventFilters arrays are sorted before hashing; no filter
or other setting is omitted. This avoids false differences caused by Google's
response ordering while preserving the full configuration comparison.

Two real ElevenLabs requests generated a private Ellen sample, 496 + 529 text
characters. Its V.2 mix is 1:20.66, AAC 44.1 kHz stereo, fully decoded without
error and with measured peak -2.6 dB. The longer ending is actually spoken.
The retained key lacks user_read, while voices and TTS work. No key scope,
credential, budget or quota was changed. The active worker's existing nullable
usage-check behavior is preserved; no current provider balance is claimed.

Follow-up at 10:55 UTC: after the owner's specific approval, the existing
Herculean Mountain Lion key (…4cd1) received only User access (`user_read`).
Reopening the saved dialog and comparing snapshots confirms every other setting
is unchanged. A read-only call with the worker's same secret version/fingerprint
now returns subscription HTTP 200: 19,102 used / 137,442 limit, 118,340 remaining
(13.9%). These are shared ElevenLabs account quota units, not Apropos-only cost.
Voices also returns HTTP 200 and includes existing Ellen ID
`BIvP0GN1cAtSRTxNHnWS`. The 80% guard is unchanged. No new TTS, model switch,
credential rotation, budget change or deployment was performed for this fix.
Evidence: `elevenlabs-usage-after.json`, `elevenlabs-scope-{before,after}.txt`
and `elevenlabs-user-read-after.jpg` in the release evidence directory.

Owner-controlled V.2 selection is stored at revision 1, with transaction audit
and matching readback at 10:23 UTC. The maintained operator is
`integrations/narration-v2/select-jingle.mjs`: read status first, run the read-only `verify-production.py` with existing gcloud access to obtain
fresh active-source verification, then select the explicit v1/v2 choice with the
expected setting revision. This is for owner-requested changes through chat,
not public/client access. Both choices retain the new closing and continuous
speech; the original V.1 music file remains byte-identical.

RSS readback at 10:23 UTC still has the same 130 GUID/audio URL pairs as before
the release. No old episode was regenerated or relabelled. End-to-end evidence
from the next legitimately published new article remains a prospective check;
no test article or queue replay was used to manufacture it.

Evidence is under `output/narration-v2-release-20261031/`: production-verified.json,
production-evidence.zip, jingle-selection.json, activation-status.json,
ellen-private-sample.zip, ellen-mixed-sample.json, ellen-audio-validation.json,
rss-before.json, rss-after.json and cloud-run-v2-active.jpg. The real listening
sample is Apropos-V2-Ellen-og-ny-outro.mp3. The earlier access and preparation
blocks are resolved; original source and receipts are retained for rollback.

Primary provider constraints: [ElevenLabs request stitching](https://elevenlabs.io/docs/eleven-api/guides/how-to/text-to-speech/request-stitching)
excludes V3; [Create speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)
documents per-request voice settings and best-effort seed, not a deterministic
voice guarantee. Google documents [source upload](https://docs.cloud.google.com/functions/docs/reference/rest/v2/projects.locations.functions/generateUploadUrl)
and [field-masked function update](https://docs.cloud.google.com/functions/docs/reference/rest/v2/projects.locations.functions/patch).
