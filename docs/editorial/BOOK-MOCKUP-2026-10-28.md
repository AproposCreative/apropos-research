# Original book-cover mockups through MCP

The existing generated-image contract only accepted text-free illustrations. A
requested book product mockup consequently could not preserve the publisher's
printed title and author without failing that contract. Do not relabel a native
generation as a user photo or use the historical Barsel exception.

MCP v60 adds an explicit `outputKind: book-mockup` to `get_image_brief`. It is
cover-only and requires literature metadata, one retained `book-cover-artwork`
reference, optionally followed by a `book-mockup-layout` reference. Both use
`store_submission_image_reference`. The publisher source URL and supplied cover
designer credit are retained; attribution is not a rights attestation. Original
bytes, ordered reference hashes, the canonical prompt, current revision/content,
native preflight and output inspection remain mandatory. The first style
reference supplies only the restrained cream background in this mode.

The product contract permits original printed artwork and publisher marks on the
book, and realistic product rendering. It requires an explicit client inspection
of preserved printed artwork, one book and no text outside the book. It does not
permit lettering, mockups or photographic rendering in ordinary illustrations.
These semantic checks remain client reports, not independent visual proof.

Generated results remain private until a genuine personal preview choice.
Selection then reuses the exact retained bytes, preserves text and metadata, and
attaches through the existing CMS/preview workflow. No approval, retry grant or
publication receipt is created by this feature. Original cover designer credit
and AI-mockup provenance are kept separately from body illustration credits.

Validation: 215 targeted tests passed across chat briefs, image preflight,
generation evidence and import; TypeScript and build configuration security
checks passed. Tests cover retained publisher bytes, missing/wrong references,
cover-only scope, changed book identity, output lettering boundaries, private
staging and no CMS upload before personal selection. Existing illustration,
retry, content-preservation and personal-selection regressions also passed.

Interactive article: `55efc6d9ae9afc20d1554fbaf09be6833057a60604e7a7d089bb191d4f5428eb`.
Three separately commissioned body illustrations are preserved as private
candidates, anchored to connections, caravan life and moving/lack of roots.
Their original files and provenance are retained under the local output folder
and in the authenticated submission. This document does not attest publication.
