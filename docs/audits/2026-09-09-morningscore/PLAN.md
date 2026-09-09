# Apropos: komplet SEO-arbejdsplan og status, 9. september 2026

## Hvad projektet er

`apropos-research` er den interne redaktions- og AI-platform bag ai.aproposmagazine.com. SEO-programmet her analyserer og forbereder ændringer til Webflow. Morningscore måler det offentlige aproposmagazine.com. En kodeændring i AI-platformen retter derfor ikke automatisk eksisterende sider eller Webflow-skabeloner.

Arbejdet foregår i separat worktree `apropos-research-seo-audit`, branch `codex/seo-audit-20260909`, startet fra hentet main `feeb75a92bd2cc88e36183e74c98ec20ad50edb8`, med Livs aftalte runtime-rettelse `3985fb5`. Den tidligere programgennemgang og rettelser findes i [AUDIT](../2026-09-09-seo/AUDIT.md) og [IMPLEMENTATION](../2026-09-09-seo/IMPLEMENTATION.md).

## Dokumenteret udgangspunkt

Morningscore aflæst i brugerens eksisterende session. Seneste helbredsscanning 8. september kl. 16:05, 458 sider. SEO-helbred 72/100, GEO 43/100, Link Score 1.458. Score 810 DKK/md er værktøjets estimat, ikke omsætning. 127 fundne søgeord. Basal 73%, teknisk 88%, indhold 55%.

| Morningscore-fund | Registrerede tilfælde | Handling / prioritet |
|---|---:|---|
| Manglende billedmål | 10.564, fordelt på 458 sider | P1: fælles skabeloner og nye billedoutputs |
| Manglende alt | 9.914, fordelt på 458 sider | P1: skeln dekorative og informative billeder; ret bindingsfejl |
| Store billeder | 1.825, fordelt på 458 sider | P1: responsive kilder, reelle størrelser, hero/kort først |
| Langsomme sider | 47 | P1: mål repræsentative skabeloner og ret største årsag |
| Dublerede metabeskrivelser | 69 sider | P1: lokaliserede skabeloner og efterfølgende individuelle sider |
| Dublerede titler | 53 sider | P1: skabelon/locale og ægte artikelduplikater |
| Manglende metabeskrivelse | 4 sider | P1: udfyld efter gennemlæsning |
| Flere H1 / manglende H1 | 9 / 8 sider | P1: skabelonhierarki og tomme bindingsfelter |
| Lange overskrifter | 406 tilfælde; UI angiver 402 sider | P2: redaktionel vurdering; modstridende tal bevares |
| Lavt ordantal | 61 sider | P2: relevans og indholdstype, ikke automatisk fyldtekst |
| Lange URL'er | 78 sider | P3: ingen rutinemæssig ændring af eksisterende slugs |
| Stor HTML | 4 sider | P2: skabelonens gentagne kort, skjult markup og embeds |
| Lang/kort meta | 24 / 2 | P2: læsbarhed og sidens faktiske indhold |
| Lang/kort title | 3 / 3 | P2: klarhed og særpræg, ingen blind tegnbeskæring |
| H1 ikke første heading | 38 | P2: undersøg navigation og skjulte elementer først |
| H1 lig title | 12 | Review; ikke i sig selv en fejl |
| Ingen interne / eksterne links | 2 / 2 sider | P2: relevante interne stier/kilder; ingen tvungne links |
| Lav PageScore | 4 sider | P2: diagnosticér de underliggende fund |

Morningscore angiver 0 ødelagte billeder, interne/eksterne links, manglende titles og redirectende interne links; ingen fund ved SSL/HTTPS, sitemap eller favicon. Dette gælder rapportens dækning og tidspunkt.

### Selvstændig offentlig kontrol

`public-health.json` og `url-actions.csv` indeholder 465 normaliserede sitemap-URL'er (DA og EN), alle hentet med succes 9. september. Kun offentlige GET-kald; ingen CMS-adgang, cookies eller credentials. Server-HTML, ikke browser-rendering eller Core Web Vitals.

- 463 sider har mindst ét billede uden positive heltalsmål for både bredde og højde.
- 463 sider har tomme alt-tekster til vurdering. Ingen mangler selve alt-attributten i denne kontrol. Tom alt kan være korrekt for dekoration.
- 4 sider mangler H1: `/`, `/en`, `/podcast`, `/en/podcast`.
- 38 sider har flere H1; festivalernes skabelon har bl.a. en tom H1 og en beskrivende tekst som anden H1.
- 2 sider mangler metabeskrivelse: podcast DA/EN.
- 28 grupper med ens title og 3 grupper med ens metabeskrivelse. En stor gruppe bruger samme generiske danske beskrivelse på bl.a. forfattere, festivaler, services og topics, også på engelske sider.
- 437 sider har en anden heading før H1 i rå HTML. Navigation/skjult indhold skal vurderes før ændring.

Tallene er ikke direkte sammenlignelige med Morningscores 458 sider: tidspunkt, locale-dækning, rendering og definitioner varierer. URL-listen er en arbejdsbeholdning, ikke en liste over godkendte CMS-ændringer. JSON indeholder metadata og billedattributter, ikke artikelbrødtekst.

## Gennemførelse i rækkefølge

### 0. Sikker drift — lokalt udført

Tidligere programrettelser beskytter mod overlappende writes, forkert rollback, mistet locale ved recovery og utilsigtet publicering. Stop respekteres før write; metadata verificeres ved readback; manuel scanning indsamler som standard. Liv-redaktionen og publiceringskontroller bevares.

Ny billedrettelse: `lib/images/output-image-html.ts` bruges i begge content-image-optimeringsforløb. Reelle outputmål skrives på det relevante img; eksisterende alt, credits, links og omgivende tekst bevares. HTML-entities i input-URL'er parses korrekt. Gamle img-srcset-kandidater erstattes af det optimerede output, så browseren ikke fortsætter med at hente dem. Art-direction i separate picture/source-elementer er ikke ombygget; disse skal kontrolleres særskilt. Ingen historisk artikel er behandlet.

Filen er koordineret med Liv-opgaven: ingen aktuelle overlap i `lib/webflow/content-image-optimizer.ts` eller `lib/images`. Ingen auth-, dependency- eller deploymentfiler ændres. Installationens tidligere SSD-gate gælder samme uændrede dependencies; lifecycle-scripts er fortsat deaktiveret.

### 1. Webflow-skabeloner — næste konkrete ændringspakke

Lav først en staging-ændring for fælles navigation, artikelkort, hero, festival og forfatter. Gem før-værdier pr. element/skabelon. Tilføj ingen generisk JavaScript-injektion over hele sitet.

1. **Billedmål:** gennemgå `brand-mobile`, `brand-desktop`, `search-image`, `mobile_thumb`, `desktop_thumb`, `desktop_thumbnails`, `paralax-image-4` og knapikoner. Brug assetens faktiske dimensioner/aspektforhold, ikke samme størrelse til alle billeder. Bevar responsiv CSS og kontrollér desktop/mobil.
2. **Alt:** logo-link får et passende tilgængeligt navn. Dekorative ikoner bevarer tom alt, når knappen/linket allerede har et navn. Informative hero-/artikelbilleder bindes til redaktionelt godkendte alt-felter. Fotografcredit holdes som credit. Ingen automatisk erstatning af alt med SEO-title.
3. **H1:** giv forsiden én meningsfuld synlig hovedoverskrift. Podcast får en faktisk hovedoverskrift. I festival-template bindes primær H1 til festivalnavn; flyt den lange festivalbeskrivelse til p, og fjern den tomme H1. Bevar udseendet via klasser og kontrollér begge locales.
4. **Metadata:** bind forfatter/festival/topic/service til sidespecifik lokaliseret title og beskrivelse. EN må ikke falde tilbage til dansk standardsætning. Bevar canonical/hreflang og redaktionelle faktuelle oplysninger. Ret ingen forfatterbiografi uden at have faktagrundlag.
5. **Performance:** mål forside, artikel, festival, liste og forfatter på mobil/desktop før/efter. Kontrollér faktisk overført billedstørrelse og srcset, hero-prioritet og lazyload under folden. Brug LCP, CLS og INP hvor feltdata findes; hentetid alene er ikke CWV.

Accept: ingen tom H1 på pilotens sider; informativ billed-alt er korrekt; dekorative kontroller har tilgængelige navne; mål matcher billedforhold; ingen visuel regression, redaktionel tekstændring eller locale-fejl. Gem før/efter-skærmbilleder og HTML. Først derefter overvejes bredere udrulning.

### 2. Sider med eksisterende søgetrafik — lille pilot

Morningscores landingssideoversigt viste følgende egnede pilotkandidater (estimater, ikke Analytics):

| URL | Besøg/md | Formål |
|---|---:|---|
| `/articles/untamed-netflix` | 24 | Artikeltemplate og serieanmeldelse; 6 søgeord |
| `/articles/anmeldelse-den-gode-stemning` | 58 | Beskyt eksisterende synlighed; 22 søgeord |
| `/articles/onerepublic-royal-arena` | 57 | Koncerttemplate og billeder |
| `/articles/o-days-2026-guide` | 49 | Guide og relevante interne links |
| `/articles/wonderfestiwall` | 6 | Festivalindgang; 11 søgeord |

Pilotens CMS-diff udarbejdes fra frisk staged + live readback, når credential-adgang er særskilt afklaret. Vis eksakte før/efter-felter, locale og rollback for hver artikel. Ændr kun felter med dokumenteret behov; høje PageScores er ikke grund til omskrivning. Ingen masseoptimering af brødtekst, kritik, vurderinger eller ratings.

En konkret title-konflikt til redaktionel afklaring: EN-artiklerne `/en/articles/crosses-chaos-and-justice-at-o-days-festival` og `/en/articles/justice-o-days-festival-total-release-in-mud-and-bass-drops` har begge “Review: Justice at O Days Festival”. Afgør først om indholdet er forskellige anmeldelser eller samme historie, før title eller canonical ændres.

### 3. Resterende indhold, links og GEO

- Arbejd derefter gennem URL-listen efter skabelon og trafik. Unikke descriptions skal beskrive siden; tegnlængde er et hjælpesignal, ikke et mål i sig selv.
- Lav naturlige interne stier mellem relevante anmeldelser, festivaler, guides og forfattere. Verificér destination, locale og at linket hjælper læseren. Tilføj eksterne kilder når journalistikken kræver det.
- Lange slugs bevares normalt. En begrundet URL-flytning kræver eksakt redirect-kort, canonical/hreflang-opdatering, linkopdatering og separat kontrolleret udrulning.
- Korte sider vurderes efter formål: en forfatterprofil eller kategori kræver ikke en lang kunstig artikel. Løs manglende substantielt indhold redaktionelt.
- GEO 43/100 er verificeret, men den detaljerede GEO-rapport blev ved med at indlæse under denne session. Ingen specifik GEO-fejl opfindes. Næste gennemgang skal kontrollere synlige bylines, forfatterprofiler, datoer, kilder og schema mod det faktiske indhold. Ingen falske ratings eller AI-løfter.
- Søgeordsplan: gruppér brand, anmeldelsestitler, festivalguides, film/serier og koncertsteder. Start med nuværende søgeord og de fem pilotsider; vælg aktuelle kommende emner med Liv. Historiske festivalår erstattes ikke automatisk med indeværende år.
- Link Score alene dokumenterer ikke dårlige backlinks. Undersøg konkrete tabte/vundne links og deres destinationssider, før eventuel outreach. Ingen automatisk disavow eller beskeder til andre.

### 4. Måling og godkendt udrulning

Følg pr. pilot/skabelon: verificerede tekniske fund, indeksstatus, visninger/klik/CTR og position for relevante queries, mobil performance og redaktionel kvalitet. Morningscores helbred er sekundært til faktiske brugere og søgetrafik. Genkontrollér offentlig HTML efter en godkendt udgivelse; kør derefter Morningscore-scan efter aftale og sammenlign samme URL/locale-population. SEO-resultater kræver recrawl og tid; ingen garanteret score eller trafikstigning.

## Hvad der er færdigt, og hvad der afventer

Færdigt lokalt: programrettelser, billedrettelse, 465-URL-kontrol, reproducerbart GET-only-script, CSV-beholdning og denne plan. Produktionsproblemerne er stadig åbne, indtil ændringer er godkendt, udført og kontrolleret på det offentlige site.

Recovery-reglen fra projektets brugerleverede AGENTS.md: “Push and deploy remain blocked until credential rotation and an exact clean commit are separately approved.” Desuden kræver eksisterende CMS-masseændringer og produktionsdeployment særskilt godkendelse. Derfor er næste eksterne trin den afgrænsede Webflow-stagingpakke ovenfor efter afklaring af sikker adgang; en godkendelse af planen er ikke en godkendelse af push, deploy eller alle artikler. CMS-piloten kræver et aktuelt reviewbart diff først.

## Kilder og metode

- Morningscore-kontoens Helbred, Oversigt og Landingssider, aflæst 9. september 2026.
- Offentlig sitemap og HTML: `public-health.json`, `url-actions.csv`; script `scripts/seo-public-health-audit.mjs`. Dækker sitemap, ikke alle tænkelige URL'er eller renderede tilstande.
- [Google om titles](https://developers.google.com/search/docs/appearance/title-link): beskrivende og særprægede titles; undgå mekanisk tegnjagt.
- [Google om billeder](https://developers.google.com/search/docs/appearance/google-images): relevante billedtekster og tilgængelige billeder.
- [Google om AI-søgefunktioner](https://developers.google.com/search/docs/appearance/ai-features): almindelig teknisk SEO og nyttigt indhold er fortsat grundlaget.

### Lokal validering

494 tests i 48 filer bestod med isoleret `RAGE_STORAGE_DIR=./tmp/vitest-rage`. Efter en TypeScript-kompatibilitetsrettelse til Cheerio-kald blev de seks billedtests kørt igen og bestod. Global TypeScript og strict SEO-TypeScript bestod. ESLint bestod for de tre ændrede TypeScript-filer; audit-scriptet er undtaget af repoets ESLint-konfiguration og blev i stedet kørt mod de 465 offentlige sider. `git diff --check` bestod. Den tidligere programrettelse er build-verificeret; denne ekstra billedrettelse er ikke kørt gennem en ny produktionsbuild. Ingen afhængigheder er tilføjet eller ændret.
