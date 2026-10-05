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

- Commit `2b90e9d62491aca58aa5debb0822f7958837e5de` er pushed og deployet som
  `dpl_9hsBi9jiQzmvydQs4byfDjsmKogF`. Vercel bekræftede READY og præcis SHA
  med produktionsalias `ai.aproposmagazine.com` 17:15Z. Ingen dirty-worktree-upload.
- Den eksisterende private ChatGPT-apps værktøjer blev opdateret. Dialogen viste
  23 læseværktøjer og 14 skriveværktøjer, herunder `list_drafts` og de nye
  beskrivelser. Ingen nye scopes eller kontotilladelser.
- Refresh regenererede apppakken til version 1.0.0. Den eksisterende godkendte
  1.0.2-pakke blev derfor genindlæst uændret; UI bekræftede “New version uploaded”.
  ZIP SHA-256: `1e6698ff15912a3df48290f6c7548adb0f81e70d824f284e4ad3ec7e41d3e62f`.
  Dette er bevarelse af metadata, ikke påstand om løsning af den tidligere
  særskilte logo-visningsfejl.
- Runtime-scan 17:12:33–17:17:33Z viste en stream-listener-advarsel i
  `/api/podcast/public/episode` med HTTP 200, ikke et MCP-kald. Den snævre
  `/mcp`-logforespørgsel timed out; den beviser hverken tilstedeværelse eller
  fravær af fejl. Drains-opslag gav 404. Serveraudit bruges til selve MCP-testen.

### Faktiske ChatGPT-kontroller

Begge kontroller brugte samme almindelige bestilling uden at foreskrive et
værktøjsnavn: “Vis mine seneste kladder, og fortæl kort, hvad hver artikel mangler
før udgivelse. Ret eller publicér ikke noget endnu.”

- Den eksisterende testchat, startet 17:22:29.119Z, valgte stadig den gamle vej:
  to `list_articles` og fem `get_article`. Alle syv kald var vellykkede, version
  v6 og uden betalt AI. Det er ikke bevis for ét-kaldsforbedringen, og årsagen til
  værktøjsvalget er ikke isoleret til eksempelvis cache.
- En frisk chat med Apropos AI valgt brugte derimod selv `list_drafts` som eneste
  MCP-kald. [ChatGPT-kontrollen](https://chatgpt.com/c/6ac3dd4a-5128-83ed-bee0-ac8e78d32aeb)
  viste fem reelle kladder med mangler og status; ingen artikler blev ændret.
- Serveraudit `9f2069f5-ddac-4820-ba7d-d442c690be81`: `list_drafts`, status `ok`,
  start `2026-10-05T17:25:11.966Z`, `durationMs=1077`, version
  `2026-10-05-v6`, `paidAiAllowed=false`. Den snævre auditlæsning efter
  17:25:02Z viste kun dette ene kald.
- Send-klikket blev registreret 17:25:02.934Z; samtalens afsluttede svar er
  registreret 17:25:15.025Z: cirka 12,1 sekunder samlet i denne test.
  Selve samtaleturnen varede 11,3 sekunder. UI viste “Worked for 10s”.
  De 1.077 ms er værktøjets handler-tid og inkluderer ikke hele autentifikations-,
  netværks- eller ChatGPT-forløbet.
- Kladdelisten omfattede Fire & Ice, Tokyo Game Show, Susanne Bier, Oasis og
  Gamereactor. Den viste bl.a. manglende billedfelter og den gemte
  `liv_media_failed`-blokering uden at påstå, at øvrige kontroller var godkendt.
- Skærmbillede af det færdige svar er gemt som
  `/tmp/apropos-mcp-draft-overview-verified-2026-10-05.png`.

Det konkrete overblik krævede altså ét MCP-kald mod de 24 i den tidligere
observerede forespørgsel. Samtalerne er forskellige, så dette er ikke et
kontrolleret benchmark eller dokumentation for en generel procentvis besparelse.
En ny chat med Apropos AI anbefales til den opdaterede arbejdsgang; testen viser
ikke, at alle eksisterende samtaler automatisk skifter værktøjsvalg.

Intet må erklæres hurtigere end den faktisk målte vej. Livs bredere leveringsmål
er fortsat separat og kan ikke afsluttes på baggrund af denne release.
