# Apropos project working instructions

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
