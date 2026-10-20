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
