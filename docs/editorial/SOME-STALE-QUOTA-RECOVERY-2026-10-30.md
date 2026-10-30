# SoMe: gammel kvotefejl efter genoptagelse

Ejeren viste et TONY-kort med en gemt kvoteafvisning 30. oktober kl. 12:08.
Den verificerede produktionsversion var e8dac3ab5de939c6650aebcf5e743469f8150954
på dpl_CXiQFsDf4qdUT4yYtTrEWwnPvaV5.

## Faktisk diagnose

Durable readback kl. 12:13 og 12:15 Copenhagen viste SoMe-budgetgeneration 2,
blocked=false, 13 historiske kald og 237.720 DKK-mikro i konservative
reservationer af det uændrede samlede engangsloft på 10.000.000 DKK-mikro.
Dette er ikke en faktura eller en providersaldo. Fem rigtige Luna-svar til
bogkortet var gemt mellem kl. 12:09 og 12:11, alle ready. Den seneste gemte
kvoteafvisning var dateret 27. oktober. Der var ingen gemt AI-kørsel til det
konkrete TONY-id 6ae474fd88698245425a7ddc. Ingen ny kvotafejl er dokumenteret
af skærmbilledet alene.

Klienten gemte fejl pr. kort, format og variant, men genlæste aldrig fejlens
generation efter en genoptagelse på et andet kort eller i en anden fane.
Genoptagelsesknappen ryddede kun det aktuelle kort. Derfor kunne en gammel
global afvisning blive stående på TONY, selv når andre kort igen fik svar.
Den præcise fejl er reproduceret i den oprindelige hook fra ovenstående SHA.

## Rettelse

- Et redaktørbeskyttet, no-store GET /api/design-editor/subtitle-status læser
  kun SoMe-generationen og blokering. Det respekterer også det eksisterende
  credential-bundne providerhold og det faste loft. Det er ikke et opslag af
  providersaldo og kan hverken genoptage, reservere eller bestille AI.
- Et kort med kvoteafvisning kontrollerer status ved åbning/artikelskift,
  format-/variantændring, fokus, synlighed og et gennemført genoptagelses-event.
  Kun en højere, allerede godkendt servergeneration uden blokering rydder den
  gamle kvotefejl. Samme generation, aktiv blokering, netværksfejl og ukendt
  tidligere udfald giver ingen automatisk ny bestilling.
- Den eksisterende servertransaktion og cache styrer fortsat ét kald pr.
  artikelversion/format/variant/generation. En gammel fejlet nøgle afspilles
  ikke igen. En manuel korttekst bliver ikke slettet eller erstattet ved
  statusopdatering eller formatskift.
- Cachede kvoteafvisninger beskrives som tidligere afvisninger. Knappen siger
  Genoptag AI, uden at hævde en frisk måling af saldo eller kræve ny betaling.
  Selve genoptagelseshandlingen er fortsat ejerbeskyttet og versionsbundet.
- Nye reservationsrecords gemmer generation. Et sent terminalt fejlsvar fra
  en ældre generation kan ikke lukke en nyere, udtrykkeligt genåbnet generation.
  Det gamle udfald og dets reservation bevares. Nye reservationer bevarer også
  genoptagelsens eksisterende auditfelter.

Modellen, prisreglen, 10 DKK-engangsloftet, tidligere fejl/reservationer og
personlige godkendelser er bevaret. Ingen ny nøgle, betaling, budgetforøgelse,
providerhold-ændring, CMS-opdatering eller social udgivelse er udført.

## Kontrol

38 målrettede API-, budget- og recoverytests samt TypeScript og fokuseret ESLint
bestod. scripts/verify-social-ai-recovery-ui.mjs bruger de rigtige React-hooks
og kontroller med lokal Firebase-/API-fixture og fastlåst baseline-SHA. Den
reproducerer den gamle fejl og består elleve scenarier, herunder 320/390/1440 px,
to gamle fejlbehæftede kort, fokus/genoptagelse, fortsat blokering, utilgængelig
status, genoptagelseskonflikt og bevaret manuel tekst på tværs af 1:1 og 9:16. Ingen rigtig AI eller
CMS/social afsendelse indgår i browsertesten.

Evidens: output/some-recovery-20261030/readback-tony.json,
browser-report.json og de tre recovered-skærmbilleder. Deployment/readback
tilføjes efter release; lokale fixtures er ikke bevis for ny TONY-generering.

## Produktion, 30. oktober kl. 12:28 Copenhagen

Commit 27acac5f81b7cca0472e792be5554afde9369a95 er bygget og deployet som
dpl_B1Lqvk8CDEiWKZWDUBWYP6GoDAgu. Vercel READY og direkte opslag af
ai.aproposmagazine.com matchede samme SHA og deployment. Den nye private
statusroute returnerede HTTP 401/no-store uden redaktørlogin. Læsefunktionen
blev desuden verificeret mod de aktuelle durable records med eksisterende
serviceadgang og korrekt credential-bundet providerhold: generation=2,
blocked=false. Dette er ikke en ny kvota-/saldopåstand.

Kl. 2026-10-30T11:28:00.985Z var SoMe stadig 13 kald / 237.720 DKK-mikro
reserveret af det uændrede 10 DKK-loft. De syv observerede policy-/ledger-/
nyhedsbrevsrecords havde identiske før/efter-hashes. Verifikationen foretog
ingen AI-kald eller produktionsdataændringer. TONY havde fortsat ingen gemt
generering; et nyt faktisk forslag må ikke påstås modtaget før en ny
godkendt-generation-request fra editoren. De allerede gemte rigtige bogsvar
og den isolerede browsertest er forskellige beviser.

Receipt: output/some-recovery-20261030/production-receipt.json. En allerede
åben browser skal indlæse den nye klientversion én gang. Derefter bliver
fremtidige genoptagelser synkroniseret uden gentagne login-/betalingskrav.
