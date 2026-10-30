# Apropos project working instructions

## Desktop entry point (owner correction 2026-10-30)

Desktop `/ai` opens AI Writer over the existing large robot background. The full
tool catalogue belongs in the existing desktop menu, including accessible paused
tools with their actual status. Never replace the desktop workspace with the
mobile launcher. Preserve explicit tool deep links, the mobile launcher, stored
Writer work and personal settings. Test `/ai` without `?view=ai`, not only the
direct Writer link. Showing a tool does not authorize paid work or change access.
Keep the original desktop menu presentation: separate rounded outlined cards,
40px icon tiles, compact Poppins labels and desktop ordering. The mobile tool
list remains a separate presentation.

## Owner Google login (owner choice 2026-10-30)

The owner explicitly approved `frederik.emil.kragh@gmail.com` and
`frederik@aproposcreative.com` as owner logins alongside
`frederik@aproposmagazine.com`. This supersedes the three-address restriction
only for those two exact identities. Require server-verified Firebase identity,
verified email, and current suspension/revocation checks. Suspension of the
canonical owner or the alias blocks the alias. Keep existing UIDs, workspaces,
editorial approvals, mail sender addresses and stored work. No account merge,
domain-wide owner access or simulated personal consent.

## Liv editorial direction (owner choice 2026-10-27)

Liv's new work is reviews and concrete culture guides: concerts, TV series, film,
books, museums/exhibitions and cultural experiences. No news, recruitment, industry
news, celebrity news or announcement-driven features. Do not optimise for being first.
Research-based reviews explicitly may synthesise 5–6 actually read original reviews
without Liv attending/viewing the work. Write original analysis, retain attribution
and sources, do not invent personal experience. Public AI marking is required for
these research reviews, superseding the older label-off instruction below for new
work. Preserve older approved versions and receipts; rework off-remit drafts rather
than silently relabelling them or adding stars. Do not change spend policy, cadence
or personal publication consent. Canonical contract: lib/liv/editorial-remit.ts.


## Liv cadence change (2026-10-01)

The owner replaced daily publication with **every other calendar day at 10:00
Europe/Copenhagen**, anchored on **2026-10-02**. This supersedes older daily
targets prospectively; historical missed days and receipts remain unchanged.
Preparation, delivery, status, weekly overview and alerts share this cadence.
Keep one ready next-publication article and one durable reserve, not daily
inventory or a speculative paid week. Require three consecutive scheduled
publications without operator-assisted preparation before claiming unattended
operation. Off days are not failed or missing publications. Do not raise budgets,
clear provider holds or retry paid failures just because the cadence changed.
See `docs/editorial/LIV-PUBLICATION-CADENCE-2026-10-01.md` for this release.

## Current release authorization (2026-09-10, after consolidation)

The user explicitly lifted the previous per-commit approval block and authorized
completion, push, deployment and publication of the latest Liv article without
another approval request. This supersedes the release-approval and production-
access prohibitions below. It does not override connector/workspace administrator
restrictions, authorize exposing secrets, or establish successful publication.
Keep work scoped to this checkout, preserve unrelated changes, keep Instagram
off and retain editorial/security checks. No new dependencies or lifecycle
scripts are needed for the current release.

## Local recovery safety override (2026-09-10)

The latest user-supplied recovery instructions take precedence over the historical
standing mandate below. Work only from this local checkout; do not import or
execute Dropbox copies, old dependencies, caches, build output, editor rules or
quarantine content. Keep npm lifecycle scripts disabled and require the SSD
dependency gate for any new or changed dependency. Do not add secrets,
credentials, tokens, signing material or production service access. Push and
deploy remain blocked until credential rotation and an exact clean commit are
separately approved. Preserve the isolated Vitest storage path.

Recovery checkpoint (2026-09-10): the user explicitly confirmed that the affected
production credentials have been rotated. This is user attestation, not an
independent credential audit. Exact release-commit approval is still required;
the generic deployment permission does not approve an unidentified commit.

## Standing delivery mandate

The user updated the recovery instructions on 2026-09-09: necessary implementation,
tests, commits, push, production deployment and article publication for the Liv /
Apropos project are authorized without another per-commit approval question.
Necessary existing production credentials and installation lifecycle scripts may
be used for this work. This supersedes the older exact-commit approval requirement
in historical audit documents; those documents describe their original scope.

This is scoped authorization, not permission to bypass quality or security checks.
Do not print credentials, commit secrets, weaken authentication, or install/run
unreviewed packages. Prefer existing dependencies and keep lifecycle scripts
disabled unless a reviewed, necessary installation step requires them. Preserve
the SSD dependency gate for new or changed dependencies.

## Workspace and verification

- Work from this local Git checkout. Do not import or execute Dropbox copies,
  quarantine content, old node_modules, caches, build output or editor rules.
- Preserve unrelated changes and coordinate with concurrent work. Never force
  push or overwrite another contributor's commits to make a release succeed.
- Keep tests isolated in `RAGE_STORAGE_DIR=./tmp/vitest-rage`. Never modify tracked
  research datasets through tests.
- Verify the exact release, deployment SHA and affected production flow. A ready
  deployment is not evidence that an article is published.

## Editorial publication

- Instagram remains off for this rollout. Do not enable or publish to it.
- The requested daily auto-publication activation follows a completed, verified
  The Invite pilot and a working daily publication path, not just an env toggle.
- Preserve source/date checks, duplicate protection, article-quality checks,
  image rights/asset validation and CMS readback before publication.
- Use the canonical Liv voice in `data/author-prompts/liv-brandt.txt` in both
  Writer and daily generation. Danish by default, independent prose, concrete
  cultural relevance, no em dash, no sponsored editorial content.
- Keep the CMS AI-generated field available, but set its public label toggle to
  false for new Liv articles per the user's 2026-09-12 instruction. Preserve
  internal model/source provenance. Do not fabricate first-hand film attendance,
  quotations or sources. Attribute other critics' judgments and do not copy their
  wording or structure. Ratings must be reasoned, not random.
- Report completed releases and publications with evidence and identify remaining
  blockers plainly. Do not claim perfect quality or a live article without proof.

## Standing online-image instruction (2026-09-10)

- Articles must include at least two distinct, relevant images within the body,
  in addition to the hero image. Hero/mobile fields and trailer thumbnails do not
  count toward this minimum. Place body images at natural section breaks with
  descriptive alt text, a short caption and the actual source credit. Never
  duplicate an image or invent a URL merely to meet the minimum; report missing
  assets when the requirement cannot yet be met.
- Liv may independently find and select images online for articles without asking
  for permission again. Film and TV reviews prioritize real official stills from
  the producer, distributor or press material, not AI substitutes for film scenes.
- The user does not require separate documentation of editorial reuse rights as
  an editorial selection prerequisite. This supersedes that earlier requirement,
  but is not a claim that attribution grants a license or that rights are verified.
- Preserve the source page, original image URL and actual supplied credit. Credit
  the photographer/rightsholder and producer/distributor as indicated by the source;
  do not invent credits. Keep unknown rights status unknown in verification data.
- For other article types, retain both image search and AI illustration options.
  The Invite must use real film images, without an AI illustration fallback.
- Do not bypass authentication, paywalls or technical asset/security validation.
  This instruction does not change the recovery override or authorize deployment.

## Review typography (2026-10-28)

The owner prohibits both Unicode en dash (U+2013) and em dash (U+2014) in all
reviews, regardless of author or workflow: titles, subtitles, introduction, body,
captions, SEO metadata and social copy. Use sentence punctuation instead; ASCII
hyphens in compound words remain allowed. Preserve the owner’s requested title.
Do not rewrite historical reviews in bulk.

## Mandatory website image delivery (owner choice 2026-10-28)

Every article publication and live image update, from MCP, Apropos AI or Webflow,
must trigger the shared image delivery optimizer. Keep approved original files,
identity locks, credits and personal approval receipts. Create proportional WebP
delivery derivatives without cropping, AI editing or changing the selected image.
Desktop cover: at most 450 KiB/2400px long edge; mobile cover: 260 KiB/1200px;
every body image: 200 KiB/1200px. Verify actual bytes and CMS readback. A locked
original or a small file/optimized filename is not an exemption. Failed or skipped
processing must never be reported as compliant. Do not publish pending editorial
changes while optimizing an already live article.


## Podcast episode artwork (owner choice 2026-10-30)

Spotify/RSS episodes use the existing native app cover design: square centered
aspect-fill image, white bottom strip at 19% of the square, original black
Apropos logo centered in the strip (max 50% of strip height / 70% of square
width). Prefer the published mobile image, then thumb, as the app does. Use the
actual retained app logo in `public/podcast/apropos-logo-black.svg`; never invent
or replace it. This display template applies only to podcast derivatives and
does not change approved website originals. Missing-photo episode artwork uses
the app's dark background with the same white strip/logo. Keep the separate
show cover and all episode GUIDs, audio, publication dates and original manifest.
Version artwork changes so existing episodes reconcile automatically.
