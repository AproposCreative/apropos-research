# Latest five: editorial SEO correction receipt

Verified 2026-09-12T22:11:49.351Z. All five scoped metadata checks passed; this does **not** mean all drafts are publication-ready.

Production release: `cbbc7fa05e5926931c72415a2954bff2a1c0a20e` / `dpl_FF7W7LJgJDn3sKPCyaTRSwndLexP` (READY, production target verified).
174 relevant tests passed and TypeScript passed. The subsequent baseline-identity correction passed its 13 regression cases and TypeScript; the production build passed.

## Scope and results

User authorized SEO title/meta corrections on the newest five CMS items and visible headline corrections for Freud and Frankenstein. This set contains four drafts and one published article. Original slugs, body, media, dates and publication state were preserved against the actual pre-write CMS snapshot. Freud had concurrent CMS title/intro/HTML edits: its unstarted request was refreshed against that current snapshot, preserving those edits.

### Frankenstein: Hvorfor flygter Victor fra sin skabning?

- CMS ID: `6aa56bc84e30064cbbb7c4c5`
- SEO title: Frankenstein: Hvorfor flygter Victor fra sin skabning?
- Meta description: Mary Shelleys Frankenstein handler også om ansvar og udstødelse. En kulturhistorisk læsning af Victors svigt med Golden Days som afsæt.
- State: draft; not published by this operation
- Existing schedule: 2026-09-15 
- Publication blockers: `field:content`, `image:body-matches`, `image:body-assets`.

### Lucian Freud på Louisiana: Portrætter uden forskønnelse

- CMS ID: `6aa566cf1d63c39af0d73ad2`
- SEO title: Lucian Freud på Louisiana: Portrætter uden forskønnelse
- Meta description: Lucian Freud – Alt er portræt på Louisiana sætter krop, identitet og kunstnerens magt under lup. En feature om portrætter, der ikke prøver at behage.
- State: draft; not published by this operation
- Existing schedule: 2026-09-14 
- Publication blockers: `field:content`, `field:intro`, `image:body-assets`.

### Klovn sæson 11 kvæler sin egen pinlighed

- CMS ID: `6aa57fd8c3ad670e14b091db`
- SEO title: Klovn sæson 11 anmeldelse: Pinlighed uden bid
- Meta description: Anmeldelse af Klovn sæson 11 på TV 2 Play. Frank og Caspers velkendte pinlighed drukner i plot og gentagelser. To af seks stjerner.
- State: draft; not published by this operation
- Existing schedule: 2026-09-16 
- Publication blockers: none in current CMS inspection.

### The Gentlemen sæson 2 gør privilegium til et våben

- CMS ID: `6aa54ddfd3c29b324372d24b`
- SEO title: The Gentlemen sæson 2 anmeldelse: Klasse og kriminalitet
- Meta description: Anmeldelse af The Gentlemen sæson 2 på Netflix. Eddie og Susies partnerskab skærper seriens blik for klasse, men tempo og romantik halter.
- State: draft; not published by this operation
- Existing schedule: 2026-09-12 (reserve, not a newly assigned publication date)
- Publication blockers: none in current CMS inspection.

### Alle Guds farver: Dokumentar om tro, drag og fællesskab

- CMS ID: `6aa51107feea4b5112862f09`
- SEO title: Alle Guds farver: Dokumentar om tro, drag og fællesskab
- Meta description: Alle Guds farver følger Enghave Kirke og dragpersonaen Ramona Macho. Vi undersøger dokumentarens blik på tro, identitet og retten til at høre til.
- State: published; metadata verified in public HTML
- Publication blockers: none in current CMS inspection.

## Publication integrity

Frankenstein already had CMS caption/markup differences before this operation, including shortened AI-illustration captions. Freud already had CMS intro and rich-text markup differences. These were not overwritten or approved as passing checks. Original paid checkpoints, provider responses and quality history remain in immutable revision audits. Presentation fields were reconciled to active checkpoints/proofs; body expectations were not silently replaced.

Both entries expose `publicationBlockers` in the manifest and authenticated approval feed and are excluded from delivery selection. Their saved preparation day remains occupied to avoid regenerating paid work to bypass the mismatch. The global presentation hold has been released. Klovn and The Gentlemen passed the current full draft CMS inspection; no draft was published by this correction.

Application operations used: `/api/liv/operations/presentation` and `/api/seo-engine/operations/reviewed`, authenticated server workflow with idempotency, immutable before-images, CMS leases and exact readback. No browser sessions, manual CMS writes, body regeneration, Instagram activation or source/quality overrides.

## Release coordination

Branch `codex/seo-post-publish-quality` includes Liv base `17e0c6f`. Preserve this branch when consolidating into main; do not deploy an older main over the production release. This receipt is a documentation-only commit after the verified code release. Runtime evidence is in `livPresentationRevisions`, immutable `livPresentationAudits`, and `seoEditorialRevisions`. Local detailed readback is `tmp/seo-release/five-final-receipt.json`.
