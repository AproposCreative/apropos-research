# Prospective V.2 narration update

Owner request: activate the reviewed V.2 direction for future audio articles,
include the longer outro, remove inserted music breaks and reduce voice drift.
This directory is an adapter for the existing Firebase narration worker. It is
not a replacement queue, publishing flow or app backend.

## Exact behavior

- Six-second intro uses the original continuous 41.39–47.39-second transition.
- The beat follows the existing demo's +3 dB setting and 80 ms loop joins.
- No synthetic three-second silence between speech chunks. Natural spoken
  sentence pauses and normal playback speed are retained.
- Same Ellen resolution and `eleven_v3`; Danish, fixed robust stability and a
  common episode seed on all requests. Closing stars and thanks share a request
  with substantial preceding article text. No unsupported V3 request stitching.
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
NARRATION_CANDIDATE_DIR=output/narration-v2-release-20261031/candidate-release-fixture node --test integrations/narration-v2/recipe.test.cjs
```

They execute real existing FFmpeg renders, plus the patched worker with fake
provider responses and storage. They do not initialize Firebase or call TTS.
Local tests cannot prove a real Ellen performance or production deployment.

## Authorized rollout, still gated by actual service access

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

The local status/selection operator is in
`output/narration-v2-release-20261031/select-jingle.mjs`. It requires current
owner account status and a fresh independently written production source
verification receipt before a setting write. `status` is read-only and explicitly
does not claim that the current worker supports the candidate recipe.

## Current production gate

31 October: local browser access reports “Local browser use is disabled in Work
settings”. Existing rotated service access was refreshed normally, then a scoped
Cloud Functions metadata GET returned HTTP 403. No IAM change, browser-settings
bypass, secret extraction, synthesis or deployment followed. The owner has been
asked once to enable browser access. Production activation and the real new
outro recording remain unverified until the existing owner session is usable.

Primary provider constraints: [ElevenLabs request stitching](https://elevenlabs.io/docs/eleven-api/guides/how-to/text-to-speech/request-stitching)
excludes V3; [Create speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)
documents per-request voice settings and best-effort seed, not a deterministic
voice guarantee. Google documents [source upload](https://docs.cloud.google.com/functions/docs/reference/rest/v2/projects.locations.functions/generateUploadUrl)
and [field-masked function update](https://docs.cloud.google.com/functions/docs/reference/rest/v2/projects.locations.functions/patch).
