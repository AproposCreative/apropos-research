# Canonical native-image handoff — 7 October 2026

## Scope and acceptance

Keep native ChatGPT generation and the existing reader/editorial/CMS architecture.
No new provider, paid probe, automatic publication, image regeneration on timeout,
or changes to unattended Liv, budgets and provider holds.

- The retained brief delivers the shared canonical prompt, actual style-reference
  bytes, SHA-256 prompt/reference identity and explicit verbatim handoff guidance.
- `generationReport` is optional and backwards-compatible. It reports exact input
  and references; the server calculates hashes, not the client. Exact comparison
  permits negative constraints and quoted source text; it is not a keyword blacklist.
- A missing/mismatched report on an identified generated illustration preserves
  the original and requires personal image selection in preview. An ordinary
  upload or legacy asset is not retroactively blocked. Unknown origin is not
  relabelled as verified generation.
- Selection is tied to user, article revision, content hash and selected asset
  identities/evidence. It does not authorize paid checks or publication. The
  preparation and publication services recheck the choice, including workers.
- The private preview action and authenticated first-party fallback show the
  warning and allow selection. No model-facing human-approval field is added.
- Import replay reports saved evidence and explicitly advises against regeneration.
  Stale brief/anchor errors explain the retained-file recovery instead of blind retry.

`client_reported_match` is not proof of actual native generator execution.
`exactPromptExecutionVerified` remains false, including after personal selection.
The MCP cannot attest hidden ChatGPT tool inputs or force host discovery refresh.

## Regression evidence

358 isolated test files / 5,010 tests passed with
`RAGE_STORAGE_DIR=./tmp/vitest-rage`; type check and focused lint passed.
Coverage includes canonical negative constraints, seven conflicting prompt additions,
missing/wrong references, technical wrappers, upload compatibility, byte preservation,
replays, delayed attachment acknowledgement, ownership/revision/asset conflicts,
personal UI confirmation and preparation/publication worker gates.

## Deployment and real-file verification

Production release `9f8c69d98c5011805db31bbb2242c0a5696c22cc`, deployment
`dpl_86h2yFT7XGPoSJwd4XDLxzHJMjxa`, was verified READY with the
`ai.aproposmagazine.com` alias. The authenticated production MCP returned
`2026-10-07-v16`, 48 tools and the native file contract. The remote build succeeded;
no local production build was claimed.

The existing book submission is
`396904fb485abe48df3663e0b3d8c955a83ecc3670c323aa1c1c2838040785a2`
and CMS item `6ac561f59604a82185235285`. Production readback retained revision 7
and the existing hero import/publication receipts; no duplicate, CMS write or
personal approval was performed. Provider holds, tracked AI cost ledgers and
the existing welcome record were unchanged across the service verification.
The temporary verification grant was revoked; user connections were untouched.

Actual connected MCP `get_image_brief` returned the real reference-image content
block and the new contract for the René passage:

- Section: `5e57827b593349fbc3cd594cab9c06ad898c03ddf73b080cf101ea9b80465517`
- Brief: `7491f5e2250862996535e168a579e37ba3e2dce9d62c8d77d2dd6191fac35351`
- Canonical prompt SHA-256: `9676df281bd76ac3530e3a2e9aa52e27210b918da943247ca2f1c16ed0e22e11`
- Reference SHA-256: `0ef077580da7c9ed5b4c64a6973acc3dde536af0bb7a40776f45bf59c5bcff01`
- Style: `apropos-2026-09-14-v1`; paid AI calls: 0.

`scripts/verify-image-handoff-widget.ts` passed at 390px and 1200px with no
page errors or mobile horizontal overflow. It checked visible warnings,
personal image selection, no scheduling controls for this action and a
status-only refresh after choice. This is an isolated simulated host, **not**
a real human approval or proof of ChatGPT mobile rendering. Screenshots are
`tmp/image-handoff-mobile.png` and `tmp/image-handoff-desktop.png`.

### Remaining external boundary / exact resume

Read-only introspection of the actual production `WEBFLOW_API_TOKEN` at
2026-10-07T11:28:05.711Z returned HTTP 200 but no `assets:read` or `assets:write`.
No new allocation, native generation or paid fallback was attempted after this
confirmed blocker. Updating the separate ChatGPT Webflow connection does not
change this server credential. The full real-file → CMS regression is therefore
**not complete**, and no measured visual quality gain is claimed.

Fresh CMS inspection also found concurrent changes to `content` and `fotoCredit`,
CMS hash `c4c2db1798462e5f7bc83a1e2fda36f7391786346f52cef930beca5ad272afd8`.
The submission's saved publication receipt is historical, not a fresh claim that
all live fields still match. We did not reconcile or overwrite these newer edits.

Resume after the owner updates the existing production Webflow credential with
the two asset scopes: introspect it, inspect/reconcile the existing target against
its latest CMS hash, read current submission/section/retained assets first, and
only then use the exact current brief plus actual reference in native generation
if that illustration has not already been made. Import that same file with the
original request identity, show preview, and await personal image choice if the
report is missing or differs. Publication remains a separate version-bound click.
Do not regenerate the cover, create a duplicate article or buy an API generation.
