# AI Writer: genbrug, fejl og lokal verifikation

Dato: 9. september 2026. Udgangspunkt: `c9fc7c39d452970cc3e3faf63c5177731c7e9826`, branch `codex/liv-media-proof`.

## Konklusion

Writer og Liv deler allerede vigtige byggesten, men er ikke én sammenhængende generator. Der er derfor ikke belæg for en procentangivelse eller for at kalde hele Writeren 100 % verificeret. Denne ændring retter de konkrete kilde-, længde-, faktatjek- og gemmefejl og bevarer de eksisterende integrationer.

Ingen push, deploy, nye credentials, produktionsdatabaseændringer, Webflow-publicering eller Instagram-post i denne gennemgang. Kun dette checkout og allerede SSD-godkendte dependencies er anvendt; lifecycle-scripts er deaktiverede. De to allerede eksisterende, untrackede dokumenter CONTENT-PROFILE.md og IMAGE-RELEASE.md er ikke ændret.

## Hvad kan genbruges?

| Område | Allerede eksisterende | Rettelse eller resterende forskel |
| --- | --- | --- |
| Livs stemme | `lib/liv/voice.ts` indlæses af Writerens promptbygger og Liv-generatoren | Genbrugt. Ingen ny konkurrerende Liv-persona. |
| Research | `lib/research/service.ts`, editorial dossier og kildearkiv | Writerens returnerede researchSources blev tabt i klienten. De bevares nu i artikeldata og kladden. |
| Artikeltyper | Seks fælles skabeloner i `lib/editorial/signal-store.ts` | Writerens kategoribaserede minimum er erstattet med skabelonens min/max. |
| Medier | Feed/sitemap-discovery, parser og Firestore `trendingArticles` | Manuel refresh bruger nu den eksisterende Firestore-runner og afventer resultatet. |
| Faktatjek | Eksisterende `/api/factcheck` med hentede kilder | Writer sender nu articleText og sourceUrls og kræver complete + retrieved-sources + verified. |
| Billeder | Writerens eksisterende søgning/generering og upload, Livs billedvalg, Webflow-optimering | Bevaret. Writer og Liv har stadig forskellige billedflows og godkendelsesbeviser. |
| CMS | `lib/articles/article-payload.ts`, `publish.ts` og eksisterende Webflow-mapping | Writer genbruger nu også slugnormalisering og gemmer Webflow-ID til efterfølgende opdatering. |
| Kladder | Firestore drafts og lokal autosave | Synkront reserveret kladde-ID mindsker dubletter ved overlappende saves. |

## Rettelser

### Research og kildevalg

- Brugerspecifikke medie-ID'er oversættes til det fælles arkivs kendte publisher-ID'er. Eksakte værtsnavne kan matche ældre poster; lookalike-domæner accepteres ikke som samme medie.
- `view=writer` returnerer det valgte medies katalog uden auto-redaktionens musikcentrerede relevansfiltrering. Auto-redaktionens øvrige ranking er ikke ændret.
- Åbning af wizard er read-only. Den eksplicitte opdateringsknap afventer ingestion; to-minutters-opdatering læser kun arkivet.
- Kildeskift annullerer gamle forespørgsler. Fravalg/genvalg af samme kilde kan indlæse igen. En artikel skal vælges, før man fortsætter.
- Analyse følger den aktive researchartikel, annulleres ved skift og genstarter ikke ved almindelige state-opdateringer. Fejl vises med retry i stedet for opdigtet 'Stabil' analyse.
- `/api/refresh` kræver login, skriver via Firestore og returnerer fejl ved tom/fejlet ingestion. Bodyless kald og ældre sinceMinutes-kald er bevaret. Maksimum er 20 artikler per manuel refresh. Ikke-understøttede brugerdefinerede kilder får 422, ikke falsk succes.
- BT og Berlingskes standardadresser var døde. De er opdateret til `/news-sitemap.xml` i defaults, nye mediepresets og UI. Eksisterende Firestore-konfigurationer er ikke migreret; den nuværende discovery bruger de rettede standardadresser.
- RSS med ét item og indlejrede sitemaps med ét element håndteres. Feed-URL'er trimmes. Fejlsider arkiveres ikke som artikler. Faktisk feed-dato bevares, når parseren ikke finder en dato; manglende dato erstattes ikke med dags dato.
- Serverless-fetch læser/skriver ikke diskens HTTP-index. HTTP- og robots-kald har timeout. Dette er ikke en fuldstændig omskrivning af crawlerens robots-, SSRF- eller retry-politik.

### Længde og artikelindhold

Skabelonernes intervaller for brødteksten, eksklusive titel, undertitel og intro:

| Type | Ord |
| --- | --- |
| Kort nyhed | 450–650 |
| Anmeldelse | 800–1100 |
| Feature | 1100–1400 |
| Analyse | 900–1200 |
| Kommentar/essay | 1000–1300 |
| Longread | 1400–1800 |

Prompt og serverkontrol bruger samme politik. Der er ét afgrænset rettelsesforsøg ved både for kort og for lang tekst. En mislykket rettelse bevarer udkastet og viser længdeadvarsel; afbrudt modeloutput erstatter ikke artiklen. Længdekontrol er ikke en faktagodkendelse og må ikke fyldes op med opdigtet research.

Lange chatsvar genkendes ikke længere automatisk som artikler alene på antal tegn eller blanklinjer. Preview/CMS bruger kun artikelindhold, ikke sidste chatbesked som fallback. Writerens hurtige redaktionelle kontrol læser hele kroppen og varsler ved fejl; den erstatter ikke et kildebaseret faktatjek.

### Gemning og CMS

- Advarsler, herunder fejl i længde/faktatjek, vises i stedet for at blive skjult.
- Webflow-panelet sender en kladde og hedder nu 'Gem kladde i Webflow'. En kladde er ikke en godkendt liveartikel. Fejl skal kunne gemmes til videre redigering uden at få live-godkendelse.
- CMS-responsens data.articleId læses korrekt og gemmes tilbage i artikeldata. Et fejlet eller ubekræftet kald kaster fejl; det behandles ikke bagefter som vellykket trænings-/publiceringsresultat.
- Kladder registreres ikke som publicerede redaktionelle signaler. Træningspayloadens published-flag afspejler draft/published i stedet for altid true.
- Modaltekst fra artikel/API indsættes som tekst, ikke rå HTML.
- Slugs genbruger den kanoniske normalisering af danske bogstaver. En streamingplatforms navn/ID kopieres ikke længere til watchUrl.
- CMS-skema indlæses én gang pr. panel, ikke for hvert indholdsskift. Preflight-callback får den aktuelle kontrols resultater frem for forrige React-state.
- Autosave og manuel gemning reserverer samme ID før async arbejde. Et indlæst Liv-udkast kan autosaves uden først at sende en chatbesked. Fejl ved gemning før 'ny artikel' bevarer den aktuelle artikel.

## Direkte offentlige kildeprøver

Kontrolleret fra lokale moduler uden produktionsnøgler eller Firestore-skrivning:

| Medie | Discovery | Artikelprøve |
| --- | --- | --- |
| Soundvenue | 10 feedposter med dato | HTTP 200, titel, dato, 4.622 teksttegn |
| GAFFA | 500 feedposter med dato | HTTP 200, titel, dato, 2.001 teksttegn |
| BT | 390 URL'er fra nyt sitemap | HTTP 200, titel, dato, 2.220 teksttegn |
| Berlingske | 299 URL'er fra nyt sitemap i parserprøven | HTTP 200, titel, dato, 2.608 teksttegn |

BT/Berlingskes gamle adresser gav begge 404. De nye adresser gav XML/200 og er angivet i mediernes egne robots.txt-filer. Kataloger ændrer sig under testen, så antallet er et øjebliksbillede. En læsbar artikel beviser ikke adgang til alle artikler eller indhold bag betalingsmur. Der er ikke omgået betalingsmure.

## Verifikation

Endelig kontrol: 739 tests bestod i 75 filer, heraf 39 nye Writer-tests. TypeScript --noEmit bestod. Frisk Next.js-produktionsbuild bestod og genererede 174 statiske sider. Konfigurationsscanner og git diff --check bestod. Alle 207 friske deployment-manifester bestod kontrollen uden tmp-, Git- eller root .env-referencer. De tre eksisterende brede tracing-advarsler fra podcast/SEO er ikke løst her. Buildet henter offentlige feeds under prerendering og er derfor ikke fuldt offline.

Testmiljø: ren env, npm_config_ignore_scripts=true, RAGE_STORAGE_DIR=./tmp/vitest-rage. Ingen dependencies ændret/installeret, og ingen tracked researchdata blev ændret.

Browseren viste en allerede åben ældre Studio-build. Den lokale ændring er ikke deployet og er derfor ikke browser-testet i det autentificerede produktionsflow. De nye tests bruger kontrollerede fixtures/mocks for AI og databaser. Publicerede kilder er desuden prøvet read-only som angivet ovenfor.

## Resterende arbejde før samlet accept

1. Særskilt releasegodkendelse efter recovery-reglerne: credential-rotation og den præcise rene commit. Derefter fuld test af kildeskift, analyse/retry, alle seks længder, reload/autosave og gentagen CMS-kladdegemning i den deployede Writer.
2. Saml Writer og Liv om de samme servervaliderede beviser for kildeindhold, lighed, faktatjek og billede. Writerens nuværende preflight er ikke lig med Livs fulde publiceringskontrol. En modelbaseret vurdering kan ikke garantere fravær af plagiat.
3. Afklar fast/editorial-mode-kontrakten: UI beskriver forskellig researchdybde, men serveren håndhæver ikke en tilsvarende fuld adskillelse endnu.
4. Konsolidér billedkontrollerne. Film/TV bruger eksisterende TMDB-søgning; AI-generering bruger upload/optimering, hvis funktionen er aktiveret. Billedrettigheder, korrekt værk, trailer, alt/credit og CMS-readback skal prøves samlet. Google-billedresultater er ikke i sig selv dokumentation for brugsret.
5. Understøt brugerdefinerede publisher-adaptere, samlet crawl-deadline og bedre dato-normalisering. Eksisterende danske DD-MM-datoer kan fortsat være tvetydige i ældre arkiv/UI-parser. Forkerte historiske metadata kræver særskilt, kontrolleret migration.
6. Udvid idempotens til usikre CMS-timeouts og samtidige browserfaner. Kladde-ID-fixet alene løser ikke rækkefølgen af alle overlappende saves; createdAt kan stadig blive overskrevet i eksisterende saveDraft-flow. Der bør også ryddes op i duplikerede preflight-funktioner og gøres træningsopt-in tydeligt.

Next.js-skillen blev brugt til framework/build-kontrol. React-reviewet førte konkret til afbrydelse af forældede requests, færre gentagne skemakald og brug af friske preflight-resultater. Browser-CLI var ikke tilgængelig; eksisterende browseradgang blev brugt read-only som fallback. Ingen ekstra pakker blev installeret til browserkontrol.
