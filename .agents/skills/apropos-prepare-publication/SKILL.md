---
name: apropos-prepare-publication
description: Klargør en valgt Apropos-artikel til versionsbundet godkendelse og udgivelse gennem eksisterende Liv-kontroller via Apropos MCP.
---

# Klargør udgivelse

## Artikel fra chatten

For egne klargøringsforløb bruges get_workflow med workflow=submit.
Vis hele teksten og billederne via preview_submission. Brugeren accepterer
først klargøringsvalget og senere den præcise færdige publiceringsversion
med hver sin knap i previewet. Cover er obligatorisk. Når brugeren vælger
brødtekstbilleder senere, gem choices.bodyImages=deferred. Når brugeren vælger
egen slutkontrol, gem choices.aiFinalChecks=human. Previewets personlige knap
bekræfter fravalget af AI-kontrol, også under provider-hold. Deterministiske
fil-, metadata-, schema- og CMS-kontroller består stadig. Modellen må aldrig
fremstille godkendelse eller et bekræftelsestoken. Klienter uden interaktivt
preview bruger det personlige previewUrl som fallback.
Research, skrivning, SEO-forslag og illustrationer laves i chatten. Billedprompt
og stilreference hentes med get_image_brief; valgte filer gemmes med
import_submission_image. Ingen automatisk betalt generationsfallback.
Kollegers egne forløb bruger personlig adgang, ikke ejerens nøgle.

Er artiklen allerede publiceret udenom submissionen, brug
link_published_submission med det eksisterende CMS-item. Opret ikke en kopi.
Importér valgte cover/body-filer; preview og godkend den præcise opdatering.
Tekst, SEO, rating, slug og andre CMS-felter bevares ved billedopdateringen.
Valgte filer må ikke regenereres, beskæres eller erstattes med et fallback.

## Eksisterende Liv-udgivelse (ejer)

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

Efter timeout læs `get_publication_status` med samme previewId, også efter midnat
eller hvis udgivelse er sat på pause. Det er læsning, ikke et nyt publish-forsøg.
Skeln recordedPublication (historisk kvittering) fra frisk publicationVerified.
Er deliveryFinalized false, kan artiklen være verificeret live, mens serverens
leveringsafslutning stadig mangler; publicér ikke igen for at ordne historikken.
Kald kun artiklen publiceret når publicationVerified, itemId, publicUrl og
checkedAt matcher. En operatørudgivelse er ikke automatisk Liv-drift.
Ingen site-publicering, Instagram eller budgetændring indgår.
