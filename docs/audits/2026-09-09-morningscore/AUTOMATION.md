# Automatisk billedoptimering — lokal implementering

9. september 2026. Branch `codex/seo-audit-20260909`, separat lokal worktree. Ikke pushed, deployed eller aktiveret i produktion.

## Fund før ændringer

Desktop-optimeringen bevarede originalmål, accepterede output over sit 600 KB-mål ved minimumskvalitet og brugte et URL-mønster som bevis for optimering. Mobilkontrollen stolede også på URL-navnet. Den offentliggjorte Kurt Vile-fil hed 2400w, men var 2990 pixels bred. Se IMAGES.md og image-sizes.json for offentlig måling og den samlede prioritering i PLAN.md.

## Implementeret adfærd

- Nye artikler gennem appens eksisterende `autoOptimizeArticleFieldData` får målt de faktiske billedbytes, format og dimensioner før CMS-oprettelse/publicering. Eksisterende enable/disable-indstillinger respekteres; ingen produktionsindstilling er ændret eller verificeret her.
- Desktop: WebP, højst 450 KiB (460.800 bytes) og 2400 pixels på længste led. Mobil: højst 260 KiB (266.240 bytes) og 1200 pixels. Strammere eksisterende konfiguration respekteres; højere gamle værdier kan ikke hæve disse grænser.
- Encoder reducerer kvalitet og derefter dimensioner inden for kvalitetsgulvet. Den returnerer fejl, hvis budgettet ikke kan nås. Automatisk desktop bruger altid skalering. Generiske, eksplicitte fixed-canvas-kald bevarer deres dimensioner og fejler ved umuligt budget.
- Ingen opskalering eller ændret billedforhold i standardflowet. EXIF-orientering anvendes. Animationer afvises frem for at blive til et enkelt stillbillede. Download er tidsbegrænset og højst 24 MiB, decoding højst 80 millioner pixels.
- Et eksisterende mobilbillede optimeres fra sin egen kilde, så redaktionens særskilte motiv bevares. Thumb bruges kun som kilde, hvis mobilbilledet mangler. Eksisterende alt-tekst, inklusive bevidst tom alt, bevares.
- Nye storage-objekter får faktisk bredde, indholdshash og unik identifikation. Tvungen gentagelse overskriver ikke tidligere filer eller downloadtokens. Ingen upload udført i denne opgave.
- Fejl i den automatiske desktop-/mobilbehandling kastes videre til caller, så den eksisterende prepublish-kæde stopper. Brødtekstbilledernes særskilte fejlpolitik er ikke ændret. Liv-opgaven er orienteret om kontrakten.
- Manuelle kontroller undersøger højst 10 billeder ad gangen med tre samtidige downloads, stabil resultatorden og næste-gruppe-knap. Ukendt filstørrelse/HTTP-fejl vises som kontrolfejl og tæller ikke som verificeret. API-statusfejl vises som ukendt frem for falsk aktiv-status.
- Manuelle CMS-rettelser sender kun det relevante billedfelt. Før PATCH genlæses kilde-URL; ved ændring stoppes rettelsen. Dette er en bedste-indsats konfliktkontrol, ikke en atomisk Webflow-transaktion. Gamle artikler er ikke massebehandlet.

## Faktiske lokale målinger

Encoder blev kørt i hukommelsen på tre offentlige kildebilleder. Ingen afledte billeder, CMS-opdateringer eller uploads blev skrevet.

| Billede | Original bytes | Desktop bytes | Mobil bytes |
|---|---:|---:|---:|
| Turboweekend | 2.943.352 | 303.874 | 75.444 |
| Ericka Jane | 1.631.816 | 460.266 | 98.640 |
| Kurt Vile | 533.872 | 314.388 | 124.086 |

Desktopbesparelse 41–90 %, mobil 77–97 %. Det er filbesparelse i prøverne, ikke dokumenteret trafik-/Morningscoreforbedring. Se encoder-verification.json og scripts/verify-image-budget.ts for kilde, mål, kvalitet og reproduktion. Subjektiv skarphed ved stor hero-visning kræver visuel releasekontrol.

## Webflow Designer og resterende responsivt arbejde

Hjemmesidens første musik-kort, page `67dbf17ba540975b5b21c201`, element `9a22f100-e416-7ad9-3e58-cbcfd1bc92da`, blev undersøgt i Designer. Før: billede bundet til Thumb; lazy loading, responsiveness ikke deaktiveret, alt fra asset, width/height Auto. Et forsøg med conditional binding blev opgivet og Thumb-bindingen genoprettet. Efterkontrol i native Settings viste Thumb, lazy loading, asset-alt og Auto-mål. Ingen publicering.

En generel udskiftning af alle desktopkilder med mobilkilden er ikke gennemført: samme felter bruges i større visninger, og nogle ældre artikler mangler mobilbillede. Det vil kræve en afgrænset picture/srcset-løsning med fallback, som verificeres på både små og store skærme. Denne del er fortsat åben; komprimeringsrettelsen alene løser ikke alle dobbeltdownloads i eksisterende templates.

Webflow oplyser, at responsive varianter ikke genereres automatisk ved API-/CSV-import: https://help.webflow.com/hc/en-us/articles/33961378697107-Responsive-images . Derfor må hverken publicerede templates eller programmets output betegnes som fuldt responsivt verificeret alene på baggrund af WebP-format.

## Verifikation og release

- 510 tests i 51 filer bestået, inklusive eksakte bytegrænser, EXIF, umuligt budget, falsk optimeret filnavn, fejlede downloads, uploadunikhed, mobilmotiv/alt og redaktionel kildekonflikt.
- Global TypeScript-kontrol og lokal Next-produktionsbuild bestået. Sikker build-konfiguration bestået. Lint på ændrede runtime-/UI-/testfiler: ingen fejl. Målescript ligger under projektets eksisterende lint-ignore.
- Vitest bruger udelukkende `RAGE_STORAGE_DIR=./tmp/vitest-rage`. Ingen tracked research-data ændret, nye dependencies installeret, lifecycle-scripts aktiveret eller credentials tilføjet.
- Fælles Webflow-service, auth-, dependency- og deploymentfiler er ikke ændret. Liv koordineres særskilt; deres releasegodkendelser gælder ikke denne branch.

Næste releasepakke skal integreres med seneste godkendte Liv/main, valideres igen ved konflikter, og fremlægges som en eksakt clean commit. Push/deploy kræver separat credential-rotation- og commitgodkendelse. Derefter: afgrænset artikelpilot, visuel kontrol af hero/kort/mobil og reelt currentSrc/overførte bytes. Godkend en særskilt batch for eksisterende artikler før arkivbehandling. Produktionsaktivering, Webflow-publicering og CMS-backfill er ikke udført.
