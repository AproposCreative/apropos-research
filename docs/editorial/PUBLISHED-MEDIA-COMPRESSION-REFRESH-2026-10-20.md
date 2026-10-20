# Published image updates after compression

The barsel submission `546794452af45693e3495ae29d4fe5d8912c33844aaa62db10b2ad8a94e36171`
is bound to existing DK item `6ad7aa27843abbb71024e79f`.
Its first publication used original PNGs; a completed server compression receipt
subsequently changed desktop/mobile/body delivery files. Ordinary three-way
refresh mistook rehosting plus compression for conflicting editorial changes.

## Repair

- Only an unchanged published submission can adopt this special reconciliation.
- Require the exact completed compression receipt, before/after CMS hashes,
  locale/item, original publication byte evidence and unchanged editorial content.
- Read the current derivative bytes using the existing restricted image readers.
- Retain original files, original hashes, personal selections and old approvals.
  Record the distinct delivery hashes and receipt on the published target.
- Refresh changes the private version only. It does not give publication consent.
- A body-only patch preserves the existing desktop and distinct mobile image.
- Consent, selection and post-publication checks include the actual derivatives.
- No paid model calls, new generation, manual CMS bypass or weakened URL checks.

## Verification before release

236 tests in 25 relevant suites passed, including 43 stored-image-reader cases.
TypeScript and targeted ESLint passed. A read-only production-data test matched
receipt `78c3512ab588f6a124bd7842dabcca70d277b1fbdd6d4a5eb9dcc7d74e9a95f0`
and all five actual delivery files (desktop/mobile plus three body images).
The original submission remained revision 7 and unchanged during that check.
Existing PassThrough listener warnings occurred during storage reads; they did
not prevent byte verification and are not treated as evidence of publication.

Cake candidate `c445c2caa34786db24460492d01fcd8d93410e12fbc05bdd9b36ebde070f249c`
was imported with request `barsel-cake-water-body-20261020-v1`, original hash
`2f1112d80fd9cb8b7a4351c779b9d83c2cebda2dfaf8671b7936aa4411952ec0`,
at the existing coffee/prices section
`409aeb30ba2cf3ba9912f664f178deafe2a2b2b44c1310935dc22e75810be08f`.
It still requires the user's personal image selection and version-bound
publication approval. Import success and tests are not a live article update.

## Live reconciliation and preview follow-up

Release `89e39e5b1ebb104b2aeb085efcb01c8dcf784659` was deployed as
`dpl_8qcs4hJ43Cb1TtZ5jPxnoYXV6ng3`, READY and explicitly aliased to
`ai.aproposmagazine.com`. The CLI deployment had no Git metadata; all eight
changed runtime source files were verified against the deployed source-file
SHA1s instead. The protected health endpoint returned `ok: true`.

Native MCP inspection then returned no conflicts and verified the exact receipt.
Refresh `barsel-cake-compressed-refresh-20261020-v1` advanced only the private
submission from revision 7 to 8 at approximately 18:47 UTC. Content hash:
`20ebf67a237f45d3de6203e00772e759535b74137c6c465586652816c59d5282`.
The four earlier image selections remain valid. No CMS write, paid AI call or
personal publication approval occurred.

The subsequent real preview exposed a separate thumbnail-reader mismatch for
the three Firebase-hosted compressed body images. Preview now uses the same
restricted immutable stored-image reader, while non-storage hosts still use
the DNS-pinned public reader. It does not reimport assets or relax URL checks.
57 tests across the preview and stored-image reader suites, TypeScript and
targeted ESLint pass. Live verification of this follow-up is still required.

The release build reported 10 existing dependency vulnerabilities (3 moderate,
7 high). No dependencies or lockfile were changed in this scoped repair.

### Follow-up verified live

Commit `d25cd39cc558e461a548fe8c112cf11cf1e20bd4` is deployed as
`dpl_Ft9oH19DjfTH451oq31WR8tT4VDH`, READY. The actual production alias was
verified after assignment; deployment metadata identifies short SHA `d25cd39c`.
The deployed preview source SHA1 `d3d4e63a73266a7e524be8e401663453b9306d8d`
matches the committed file. Protected `/api/health` returned `ok: true`.

Native `preview_submission` at 18:54:18.905 UTC returned revision 8,
`previewProblems: []`, `dependencyError: null`, and `missing: []`.
The one cake candidate is current and not yet personally selected. No public
update has occurred. The personal preview was queued in the calling Codex panel;
queued is not evidence that the user has opened or approved it.
Evidence: `output/barsel-photo-style-tests-2026-10-20/cake-preview-verified-2026-10-20.json`.
