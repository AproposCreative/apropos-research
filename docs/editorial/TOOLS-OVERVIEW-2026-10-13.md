# Værktøjsoversigt og SoMe-status, 13. oktober 2026

## Afgrænsning og design

Ejerbestilt audit, oprydning i oversigten og sort/hvid liste efter referencefoto.
Genbrug eksisterende routes, data, godkendelser og manuelle værktøjer. Skjul
bekræftet pausede/blokerede indgange; slet ikke tjenester eller historik.

Én fælles liste til startskærm og værktøjspanel på mobil/desktop: sorte flader,
hvide venstrestillede titler, grå beskrivelser og tynde vandrette skillelinjer.
Ingen ikoner, kort, badges eller nye farver. Eksisterende Poppins, 21/23 px titel,
13 px beskrivelse, 22 px rækkeafstand og synlig tastaturfokus. Desktop maks. 760 px
læsebredde, mobil 24 px sideafstand. Redaktion/ChatGPT → godkendelse → SoMe står
først. Ejerens private redaktionstråd vises kun for ejeren og åbnes i ny fane.

Visuel fixturekontrol ved 390 og 1440 px: klare linjer, ingen vandret overflow,
ingen ikoner i listen og forklaringer direkte under titler. Pausede indgange er
foldet sammen under “Skjulte værktøjer”, hvor gemte data stadig kan åbnes.

## Frisk audit før ændringen

Autentificerede read-only app-kald 2026-10-13 09:17:55–09:18:06Z:

| Værktøj | Verificeret status | Oversigt |
| --- | --- | --- |
| Redaktion/godkendelse | Operations-API 200, Liv tilgængelig; eksisterende ChatGPT-first-flow bevares | Synlig, direkte adgang til primærtråd og preview |
| AI Writer / Image-gen | Provider-hold aktivt, revision 5. De separate API-forløb er blokerede | Foldet sammen, henvisning til ChatGPT |
| Akkreditering | paused=true, automationEnabled=false, dryRun=true; historisk incident-lock | Foldet sammen, ingen genstart |
| Liv Indbakke | autoRespond=false, manuel afsendelsesopsætning findes | Foldet sammen; teksten skelner autosvar fra manuel indbakke |
| SoMe | Instagram configured=true; Facebook configured=true/reachable=true, error=null | Synlig; dette beviser ikke et nyt opslag |
| Nyhedsbrev | enabled=true, fredag 13:45 Copenhagen. Ingen registreret udsendelse i indeværende uge tirsdag | Synlig; ingen testmail |
| SEO & Google | enabled=true, automatisk opportunity-flag aktivt | Synlig; ikke bevis på alle fremtidige kørsler |
| Push | Historik-API 200, to hentede poster, seneste 10. juni | Synlig; gammel brug er ikke en pause |
| Podcast | Manifest 200 med fem episoder | Synlig; ingen upload eller lydtest foretaget |
| Dashboard / Mine artikler | Eksisterende visninger og personlige arbejdsrum bevares | Synlige; ingen nye effektpåstande |

`GET /api/editorial/tools` læser kun tre gemte flag, parallelt. Ingen AI, mailbox-
sync, udsendelse, prøvepublicering eller credential-probe. Verificeret konto og
ejerfiltrering, private/no-store. Ukendt status er ikke pauset eller sund. Klientens
fælles query deduplikeres og er nøglebundet til bruger/ejerstatus. Ved læsefejl
vises ærlig ukendt status og manuel genhentning, ikke opdigtet driftstilstand.

## SoMe: konkret kodefejl og afgrænsning

Det præcise ejerobserverede røde banner blev ikke reproduceret i den aktuelle
session. Afgrænset runtime-query viste kun GET 200 på publish-endpointet, ingen
relevant POST-fejl. Facebooks aktuelle read-only kontrol var sund.

Kodegennemgangen fandt to reelle fejl: et tabt feed-publiceringssvar gav rød
“Kunne ikke nå Instagram-tjenesten … prøv igen”, selv om serveren kunne have
publiceret; et tabt story-svar blev omvendt vist som succes. Desuden blev en
mislykket konfigurationslæsning konverteret til “ikke konfigureret”, og enhver
HTTP 200, også ugyldig HTML/JSON, blev behandlet som publiceringssucces.

Nu kræves success=true og et faktisk mediaId for succes. Tabt svar, timeout,
serverfejl eller ugyldig kvittering efter afsendelse viser neutral/usikker
kvittering med besked om kontrol før nyt forsøg. Ingen automatisk gensendelse.
Bekræftet Instagram-succes med Facebook-fejl er delvis succes, ikke rød samlet
fejl; faktiske afvisninger forbliver synlige fejl. Konfigurationslæsefejl er
ukendt, ikke bevis for manglende opsætning. Ingen skjult API-model eller ændring
af den eksisterende automatiske lokale underteksttilpasning.

Dette løser den dokumenterede fejlklassifikation, men beviser ikke rodårsagen
til ejerens tidligere hændelse. Manglende kvittering kan stadig kræve manuel
kontrol; der er ikke tilføjet en ny durable publiceringskø eller Meta-reconcile.

## Test før release

- 377 isolerede testfiler / 5.213 tests bestået; heraf 22 nye målrettede tests.
- Typecheck bestået. Lint: 0 fejl, 9 eksisterende advarsler; genererede `.next-*`,
  `output` og `tmp` udeladt. Safe-build-config bestået.
- `verify-tool-list-ui.mjs`: 8 faktiske komponent/hook-forløb, mobil/desktop,
  ejer/kollega, panel, utilgængelig status, klik, skjulte værktøjer, nul writes.
- `verify-social-feedback-ui.mjs`: 14 forløb i den faktiske SoMe-visning, feed/
  story, succes, delvis succes, tabt svar, ugyldigt 200-svar, timeout, afvisning og
  ukendt opsætning. Præcis ét simuleret POST pr. test, nul eksterne writes.
- Eksisterende `verify-social-subtitle-ui.mjs`: automatisk lokal tilpasning,
  gemte varianter, manuel redigering, gendan, formatskift og PNG-eksport bestået
  på mobil/desktop. Fixturefont er Georgia, ikke produktions-Amiri.
- Skærmbilleder gemt i `output/tool-list/` og `output/social-feedback/`.

Ingen AI-kald, testopslag, testmail, CMS-ændring, godkendelse, hold-/budgetændring
eller genaktivering af automatik. Production-release/readback tilføjes nedenfor.
