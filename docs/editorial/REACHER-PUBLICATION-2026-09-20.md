# Reacher season 4: explicit publication request

## Editorial scope

Frederik requested a short Danish five-of-six-star review of Reacher season 4,
with a direct, humorous action-appreciation angle, Lee Child/Gone Tomorrow
background, a short synopsis and a hypothetical John McClane closing joke.
The canonical Liv v5 voice remains active. No claimed personal viewing, invented
quotes, or close imitation of another critic. Other critics' assessments are
attributed. Title: **Anmeldelse: Reacher sæson 4 er et volds-mesterværk**.

Saved explicit run: `reserve-editorial-2026-09-20`.
Original request: `reacher-season4-frederik-20260920-v1`.
The three already-ready September 21–23 entries must remain untouched.

## Sources and media

- Amazon: https://www.aboutamazon.com/news/entertainment/prime-video-reacher-how-to-watch
- Amazon: https://www.aboutamazon.com/news/entertainment/prime-video-august-movies-shows-music-sports-2026
- TheWrap: https://www.thewrap.com/creative-content/reviews/reacher-season-4-review-alan-ritchson/
- The Playlist: https://theplaylist.net/reacher-season-4-review-alan-ritchson-prime-video-20260811/
- Official studio reference for Bruce Willis/John McClane:
  https://www.20thcenturystudios.com/movies/die-hard-2

Three distinct scene photographs, not generated pictures or marketing posters:
Reacher in the subway, hanging under a steel structure, and the cast around a
computer. Amazon source attribution does not identify a photographer; it says
so explicitly. TheWrap's exact figure credit is Prime Video. Reuse rights remain
unverified internally, in accordance with the standing editorial selection rule.

## Implementation and retained evidence

- `1ffa8bd`: exact authenticated publish-now operation through the existing
  publisher. Exact item/hash, one daily slot, same CMS and live readback checks.
  No broad publish, no bypass of gates, no Instagram.
- `0994e3`: narrow Amazon body-photo and credited TheWrap figure extraction;
  exclude header marketing key art.
- `54180d2`: fix the premature three-candidate cutoff. A monthly roundup's
  unrelated third image had hidden the relevant syndicated candidate from the
  model. The rejected `{images:[]}` paid result is retained. One changed-input
  selection is separately recorded; no repeated identical or ambiguous calls.
- `f93983c`: use the exact same credited photo's explicitly rendered srcset
  original when its default web thumbnail is too small for a cover. Actual
  original measured 1280×720; no upscaling. Original selection hash and actual
  source hash are both retained. Already-stored body images are reused.
- `53c4e5b`: keep the conservative 0.85 own-corpus similarity trigger, but
  require actual full-text lexical and qualitative evidence before treating a
  same-topic match as independent. The old season 3 article triggered 0.860.
  The cached semantic reviewer compares literal excerpt pairs and narrative
  structure. Copied wording, unavailable bodies and uncertainty still block;
  at most three high matches are reviewed. External source checks are unchanged.
- `f724b73`: final consolidated verification receives the exact stored photo
  pixels, not merely labels. The handoff validates job identity, completed visual
  receipt, role evidence, immutable media hashes, checkpoint, figure bindings and
  actual bytes. The final model must independently inspect pixels; names and
  non-visible events still need text evidence. Visual citations are limited to
  whole captions in their exact figure units and never count as dated sources.
  An authenticated append-only source operation preserves the previous run and
  fetches actual public text, without rewriting text, granting approval or making
  paid research calls. Added the official Die Hard source through this path.
- `5e792e7`: distinguish source retrieval failures from checkpoint/transaction
  conflicts without exposing credentials or raw provider errors. The Australian
  studio page was unavailable from production; the US studio page was retrieved
  successfully by the application API. Append receipt:
  `reacher-diehard-official-us-source-v1`, checkpoint
  `1587fb44919d848282417cc20e0756f5b98b21e93773b8a7fbdffe994720adec`.
- `e9bb629`: one deterministic, audited caption-only fallback when the exact
  full-coverage pixel-grounded report verifies the alt but rejects its caption.
  Reuse that exact alt as the caption; no provider call, new imagery, source edit,
  changed rating or rewritten prose. All other defects block the fallback. A
  changed caption must still pass the normal full verification. The original
  media job and rejected report remain immutable. For Reacher, "samles om en sag"
  became the verified "Reacher og tre andre personer undersøger en computerskærm."

Media job: `ae1686358971fd215a3470a2e9e1863939de78ceddb30223c32a5643b8ba061c`.
Failures (empty selection, undersized cover, own-corpus semantic alert) remain
in the audited retry history. None is treated as editorial approval. The media
job completed with independent visual review `pass: true`, all three images
distinct and captions relevant. Full article gates and CMS validation follow.

## Verified publication

Local regression: 278 files, 3,914 passing tests. TypeScript and scoped ESLint pass.
Production code deployment: `e9bb629037af5e98a8e8c18f9dd8d13bfd9020e8`,
`dpl_99nUXZn6uEaP9g7f5DiK6mhb73yR`, READY with the production alias verified.

Final independent assessment `93006c9206dda5930e031474ae7533730b6aac5c4012108864e36637aab16e86`
completed at `2026-09-20T20:38:53.999Z`: 15 factual claims verified, full coverage,
no disputed claims; voice/independent angle/attribution/no invented experience/
coherence all true. Moderation and source similarity passed. Body: 546 words.

CMS item `6ab04461516d8c4c0bc8482d`, Danish locale
`67dbf17ba540975b5b21c225`. Draft field/media/reference readback passed at
`2026-09-20T20:38:59.295Z`. Payload hash at queue admission:
`8bbe2503694bb005f244cfcee75612675c9b0b63a273ce428d657e8d957889e6`.

Authenticated exact publication request `reacher-publish-frederik-20260920-v1`
returned HTTP 200, `status:published`, `publicationVerified:true`, checked at
`2026-09-20T20:39:36.094Z` (22:39 Copenhagen).

Public URL:
https://www.aproposmagazine.com/articles/anmeldelse-reacher-saeson-4-er-brutal-lettelse

Independent public GET returned HTTP 200 and confirmed the exact H1, five-of-six
rating in metadata/prose, Lee Child/Gone Tomorrow, tandtråd phrase, John McClane
ending, two distinct inline photographs with alt/captions/credits, and real hero.
Public byline is Liv Brandt. The public meta description was observed as:
“Anmeldelse af Reacher sæson 4: Alan Ritchsons brutale action bærer serien, mens
manuskriptet og konspirationen ikke altid matcher voldens kraft. 5 af 6 stjerner.”
It differs from the initial admission metadata; no further metadata write made.

Owner-authenticated feed confirmed the three September 21–23 entries are still
ready with images and no publication blockers. Preparation and queue enabled,
preparation idle (`no_preparation_needed`). Instagram was not enabled or used.
Tracked September usage estimate: 99.93276 DKK of 300, no reservations or unknown
calls; not a provider invoice and historical untracked usage is excluded.
