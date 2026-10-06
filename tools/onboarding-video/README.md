# Rebuild the MCP welcome video

Public, fictional examples only. The application serves the already-rendered
MP4; neither viewing it nor connecting a new colleague runs a model or renderer.

Production files: `public/onboarding/apropos-ai-2026-10-06.{mp4,jpg,vtt}`.
The 36-second H.264 / yuv420p / 30fps / 1080×1080 MP4 uses faststart and no audio.
Text is burned in; the page provides equivalent explanations and starter prompts.

1. Use a separate temporary Node 22+ workspace. Inspect and pin
   `hyperframes@0.8.137` and install with lifecycle scripts disabled.
2. `hyperframes init apropos-welcome --resolution square --non-interactive`
   with `HYPERFRAMES_SKIP_SKILLS=1` to avoid changing global agent skills.
3. Copy this `index.html` and `assets/` into that generated project.
4. `hyperframes check <project> --json --snapshots` and visually inspect the
   settled scenes. Seven reviewed advisory warnings concern flat scene
   containers and the repeated logo; layout/runtime/contrast had zero errors.
   Motion sampling was disabled, not evidence of a passing motion audit.
5. Preview locally. Render with `--fps 30 --quality delivery --workers 2 --strict`.
   FFmpeg and FFprobe must be on PATH. This task used the project's ffmpeg-static
   and isolated ffprobe-static 3.1.0. No cloud renderer, paid media, voice or music.
6. Extract the poster at 2s. The opening is static from 0–6s, so the initial
   video frame already matches the poster composition without a black intro.
   Remux with `ffmpeg -i intro.mp4 -c copy -movflags +faststart final.mp4`.
7. Inspect codec/duration/dimensions, playback and mobile layout before release.

Provenance: the requested [Brag](https://github.com/latent-spaces/brag) workflow,
commit `7079945d391573edebe48fdc0a23b39c4b4e8726`, guided inspection, nine-question
brief, storyboard, composition, checks and delivery. See `brag-plan.md` and
`composition-brief.md`. Hyperframes is a local build tool, not a new app dependency.

`assets/logo.png` is Apropos's existing `public/images/apropos-ai-icon.png`.
GSAP 3.14.2 is the unmodified distribution from
https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js; its original copyright
and license link are retained in the file header. No bundled third-party music
or private screenshots are redistributed. Updating the video does not resend
welcome mail to existing users; once-per-user delivery identity is permanent.
