# MCP: ét kladdeoverblik i ét kald — 5. oktober 2026

## Opgave og afgrænsning

Frederik bad om at implementere og deploye hastighedsforbedringen efter den
langsomme ChatGPT-forespørgsel om seneste kladder og mangler før udgivelse.
Målet er et kompakt, sandfærdigt overblik, ikke en ny artikelproduktion.
Ingen betalt AI, artikelændring, publicering, adgangsudvidelse eller billingændring.

## Faktisk observeret problem

Forespørgslen 5. oktober 16:45:43Z blev fulgt af 24 vellykkede MCP-kald mellem
16:46:44.767Z og 16:48:38.719Z: otte `get_liv_work`, otte `get_saved_writing`,
fire `list_editorial_work`, to `list_articles` og to `get_workflow`.
De registrerede handler-tider var tilsammen 4.704 ms, højst 764 ms pr. kald.
Dette omfatter ikke autentifikation, netværk, audit-skrivning eller ChatGPTs
modelarbejde og er derfor ikke et end-to-end-latenstal. Ingen betalte AI-kald
var tilladt i disse handlinger. Det store antal sekventielle kald er et konkret
optimeringspunkt; observationen isolerer ikke alle årsager til ventetiden.

## Implementering

- `list_drafts` henter et samlet overblik, standard fem og højst ti kladder.
  CMS, bevarede checkpoints og egne private indsendelser læses parallelt.
- CMS læses sorteret efter `lastUpdated`, højst 300 poster. Overblikket angiver
  vindue, delvise fejl og afskæring; det udgiver sig ikke for en totaloptælling.
- Kun tekster med faktisk indhold indgår som kladder. Planer og bevarede betalte
  skriveforsøg tælles separat. Versioner samles kun ved et kendt servergemt CMS-ID,
  aldrig efter ens titler eller brugerangivne links.
- Returnerer titel, status, version, kendte blokeringer, tilstedeværelsesmangler,
  historiske kontrolindikatorer og næste relevante åbne-handling. Ingen fuldtekst,
  rå modeloutput eller kildecitater. Tilstedeværelse er ikke kvalitetsgodkendelse.
- Eget Writer-rum og indsendelser er bundet til den autentificerede bruger.
  Eksisterende ejerscope, ratebegrænsning, audit og `withoutPaidAi` håndhæves.
- Værktøjsbeskrivelser, serverinstruktioner og `apropos-review-drafts`-skillen
  skelner nu et enkelt overblik fra en dyb redaktionel gennemgang. Et overblik
  udløser ikke længere som foreskrevet arbejdsgang fuldtekst pr. post.
- MCP-version `2026-10-05-v6`, 37 værktøjer, heraf det nye read-only overblik.

Webflows understøttede sortering er kontrolleret i den officielle
[List Items-dokumentation](https://developers.webflow.com/data/reference/cms/collection-items/staged-items/list-items).
Afgrænsningen følger OpenAIs råd om sammenhængende værktøjsmål og minimale,
strukturerede svar i [Design tools](https://developers.openai.com/plugins/plan/tools).

## Lokal verifikation

- 347 testfiler / 4.834 tests bestod med `RAGE_STORAGE_DIR=./tmp/vitest-rage`.
- TypeScript, fokuseret ESLint, sikker build-konfiguration og produktionsbuild
  bestod. Buildets midlertidige ændringer i TypeScript-konfiguration er fjernet.
- Nye tests dækker brugeradskillelse, strikt input, ingen betalt AI, delvise fejl,
  dataminimering, reelle CMS-identiteter, kendt publiceret materiale, afgrænset
  paginering, locale og sortering.
- Skillens Python-validator kunne ikke køre, fordi PyYAML mangler. Frontmatter
  blev i stedet valideret med projektets allerede installerede YAML-parser;
  ingen afhængighed blev installeret.
- 17:07:44.474Z: lokal funktion med autentificerede read-only produktionsdata
  returnerede fem kladder på 1.701 ms og 4.768 bytes. 100 CMS-rækker, 63 forløb,
  76 bevarede skriveforsøg og én egen indsendelse læst; ingen kilde utilgængelig.
  Det er en lokal integrationsmåling, ikke bevis for deploy eller ChatGPT-latenstid.

## Produktionsverifikation

Afventer eksakt deployment, opdatering af den eksisterende ChatGPT-apps
værktøjsliste og read-only kontrol gennem en virkelig ChatGPT-samtale.
Intet må erklæres hurtigere end den faktisk målte vej. Livs bredere leveringsmål
er fortsat separat og kan ikke afsluttes på baggrund af denne release.
