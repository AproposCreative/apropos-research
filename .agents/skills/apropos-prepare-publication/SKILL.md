---
name: apropos-prepare-publication
description: Klargør en valgt Apropos-artikel til versionsbundet godkendelse og udgivelse gennem eksisterende Liv-kontroller via Apropos MCP.
---

# Klargør udgivelse

Hent frisk `get_liv_status`, den valgte artikel og dens gemte kontroller.
Genbrug tekst, kilder, cover og brødtekstbilleder. Start ikke hele produktionen
igen for en lokal rettelse. Planer, tekster og Webflow-kladder er ikke ready.

Gem rettelser gennem copyedit-flowet. `review_draft` viser deterministiske fund
og manglende admission; det udfører ikke faktatjek eller giver tilladelse.
En ny version skal gennem eksisterende serverkontroller. Kræver det blokerede
betalte checks, oplys præcis hvilken version der er bevaret og afhængigheden.
MCP kan ikke købe checks eller ophæve et provider-hold.

Kald `preview_publication` på den valgte CMS-identitet. Ved blockers: forklar dem
og bevar identiteten; kald ikke publish. Ved ready: vis titel, version, billeder
og Frederiks personlige bekræftelseslink. Efter hans bekræftelse bruges samme
previewId i `publish_article`. Ændringer efter preview kræver nyt preview.

Efter timeout genbrug samme request-identitet og læs kvitteringen, aldrig en ny
identitet. Kald kun artiklen publiceret når publicationVerified, itemId,
publicUrl og checkedAt matcher. En operatørudgivelse er ikke automatisk Liv-drift.
Ingen site-publicering, Instagram, budgetændring eller teamudvidelse indgår.
