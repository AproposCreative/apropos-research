# Apropos project working instructions

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
- Keep the CMS AI-generated field. Do not fabricate first-hand film attendance,
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
