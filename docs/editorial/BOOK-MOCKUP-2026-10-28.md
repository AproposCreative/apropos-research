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

## Production and actual book readback

Code commit `c4df793882f8c91c779283db181e129d51676009` was built successfully,
staged as production and promoted to `ai.aproposmagazine.com` on
`dpl_2qU6PBxCXNcocLyZQJ5q9bZfALfr`. Direct deployment metadata verifies that SHA;
`gitDirty=1` reflects unrelated journal edits excluded by `.vercelignore`.
The existing ChatGPT connector initially retained its old enum/schema; its normal
Refresh tools action resolved that validation error. No alternate client,
credential changes or false user-upload origin was used.

Live MCP retained the publisher's actual 1000px WebP derivative (original source
JPG also preserved locally) and the prior Apropos mockup solely as a layout
reference. Cover brief `f6e5845625a4dbefe5280903a70fb5dc4ab29d874679e10d80e3734220a64147`
passed native preflight at `2026-10-28T13:15:34.099Z`. One native generation
produced hash `f3466c82bff40b4ab285f51910d55d6f89d61badfa8bdf318a2abeb76b35df97`;
the cover title, author and front artwork were visually checked. The caption
discloses that the spine and physical arrangement are illustrated.

Import saved candidate `5c729353a456889a0a3b27f15f6b2e27e99a2a8881cebde8c28d501022ce91be`
as `awaiting_personal_selection`, with the original bytes preserved. Preview
readback at `2026-10-28T13:17:42.306Z` shows four current candidates (one cover,
three section-bound bodies), no metadata blockers and no preview errors.
Authenticated browser readback visibly confirms all four images and their
individual "Brug dette billede" buttons. No button was clicked by the agent.
The original revision-2 text/metadata hash remains unchanged throughout image
generation and staging. SEO title/description are 53/138 characters.

The article is NOT published or image-attached yet: real personal image selection
is outstanding. A local HTML reading proof shows the intended three placements;
it is explicitly labelled as a preview and does not create approval or CMS state.
Evidence and all four originals: `output/ringo-images-20261028/` (not committed).
