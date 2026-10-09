# Wolverine: text-free cover selection

## Scope

Frederik requested a better text-free Wolverine cover and a permanent cover
selection rule. This is human-written article maintenance, not an unattended Liv
publication. No paid AI call, retouch, new article, full-site publication, schema
release or change to the audio player's separate display artwork is authorized
by this selection work.

Existing item: `6ac7a31e994128467aa26e6a`.
Slug: `marvels-wolverine-anmeldelse`.
Fresh MCP read at `2026-10-09T08:52:42.756Z` returned Danish CMS field hash
`3a6af2462306a167326bb406387d90a9d0daf7a31d5c4a6671277a702aa1b8ab`.
This is observation evidence, not a write precondition that remains fresh forever.

## Proposed original

- Source page: <https://www.playstation.com/en-us/games/marvels-wolverine/>
- Image: <https://gmedia.playstation.com/is/image/SIEPDC/marvels-wolverine-deathstrikefight-screenshot-02-en-15sept26?$1600px$>
- 1600 × 900, Wolverine and Lady Deathstrike fighting. The actual downloaded
  pixels were visually inspected: no visible lettering, promotional title,
  logo or watermark. This is not an automated AI-validation receipt.
- SHA-256: `2eec92b5b32790078b9fe264c7008b8a7303a3af67c660eb854a653caf9c8fe0`.
- Retained locally: `tmp/wolverine-cover-candidate-fight.jpg`.
- Credit: PlayStation / Sony Interactive Entertainment / Insomniac Games / MARVEL.
  Preserve the article's existing actual source attribution. Source availability
  does not establish a reuse licence.
- The 2025 close-up candidate was rejected because its pixels contain a game
  title and copyright marks. The clean protosentinel candidate is already used
  in the article body and was not selected as a duplicate hero.

The chosen candidate was shown in chat. A single optional question asks whether
to replace both Danish and English desktop/mobile covers. No answer or CMS write
at this checkpoint. On confirmation, re-read **both live and staged locale
versions**, preserve any concurrent changes, and only replace hero/mobile/alt
and applicable credit with deterministic compressed derivatives. Keep Peter Milo,
4/6, body text, body images, SEO, disclosure and slug unchanged. Use individual
item publication/readback only; never the deferred full-site release.

## Rule implementation

The existing image policy already prohibited visible lettering. The missing
piece was explicit selection guidance in MCP's free editorial/media workflows.
`apropos-cover-selection-2026-10-09-v1` now adds the same versioned guidance to:

- `get_editorial_context`: structure/all, without changing writer voice;
- submission media context and fresh/cached press searches;
- submit and publish workflow instructions.

Cached source results retain their real inspection date and original bytes;
adding current guidance does not refetch or imply a fresh visual inspection.
Guidance hashes are not pixel checks or approval. Existing image validations,
byte-bound personal book-cover choices and the audio display logo band remain
unchanged. Direct Webflow writes outside the app are not newly guarded by MCP.

## Verification and release

- Targeted regression: 6 files / 81 tests passed.
- Complete isolated suite: 362 files / 5,052 tests passed.
- TypeScript, changed-file ESLint, safe build configuration and diff whitespace
  validation passed.
- No added dependencies or paid calls.
- Production code: `b40c5d21733f1f3076d52578d184494ba896a1bf`.
- Deployment `dpl_3TpREx4gKGAyn2a4HmBZpmbvAr1k`, READY at
  `2026-10-09T09:04:02.727Z` with actual `ai.aproposmagazine.com` alias;
  Next.js remote build took approximately 89 seconds.
- Authenticated connected MCP `get_editorial_context(section=structure)` and
  `get_workflow(workflow=submit)` both returned the new rule after deployment.
  Both reported policy hash
  `67e5af2aa48e24a0f08cb4841c34fef6222bae6aaacb952ee72db77242bc3bc7`.
  Submit workflow hash:
  `59b1110a8161ce5299b00282531adc59dcd50c0ff6799732e653fb1d4a32bccb`.
  `publicationApproval=false`, `visualInspectionPerformed=false`, and the
  workflow reports `paidAiCalls=0`, correctly distinguishing guidance from checks.
- No CMS write or article publication occurred; the proposed cover is still
  awaiting the user's choice. No separate Webflow site publication occurred.

### Deploy result

- URL: <https://ai.aproposmagazine.com>
- Target: production; status: READY; commit: `b40c5d21`.
- Framework: Next.js; remote build duration: approximately 89 seconds.
- Post-deploy observability: deployment-scoped error/fatal scan
  `09:04:02–09:04:20Z` returned no matching logs. This short window is not a
  longer-term health guarantee. Existing drains/monitoring were not changed or
  independently audited in this cover-selection task.
