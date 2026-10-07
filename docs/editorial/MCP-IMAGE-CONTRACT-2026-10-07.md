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

Pending at this checkpoint. Do not read passing tests as a deployed release or a
completed native-file regression. Use the existing book submission
`396904fb485abe48df3663e0b3d8c955a83ecc3670c323aa1c1c2838040785a2`
and CMS item `6ac561f59604a82185235285`; never create a test duplicate or change its
cover, text, rating, SEO or slug. A new body image requires separate publication
approval after preview.
