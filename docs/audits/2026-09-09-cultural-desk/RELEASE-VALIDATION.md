# Liv: lokal releasevalidering, 9. september 2026

Denne rapport supplerer IMPLEMENTATION-01/02; deres testbegrænsninger er historiske.

## Git og eksisterende produktion

- Releasebranch: `codex/liv-editorial-release`.
- `bb6d026`: redaktionelt skrivebord, Writer-integration, GA4-perioderapporter, kladdekontrol og Funding Desk-fjernelse.
- `893cb00`: merge med `origin/main`, herunder den nyere Liv-indbakke og phishing-/svarbeskyttelse. Liv-skrivebordet og Liv-indbakken er bevaret som forskellige funktioner.
- `2a9d956`: sikkerhedsopdaterede afhængigheder.
- Den kontrollerede Vercel-produktion var READY på `40909b5690b7e17a6764e4902246cf5bc7941fce`; den indeholder ikke den lokale release. Health svarede 200. Uautentificeret Liv-status svarede 401. Dette dokumenterer ikke et gennemført publiceringsflow.
- Ingen push, ny deployment, Webflow-publicering eller Instagram-publicering er udført i dette trin. Ingen produktionsnøgler er hentet til checkoutet.

## Dependency-recovery

Første SSD-gate afviste installationen. En supplerende read-only forespørgsel til npm-registrets advisory-endpoint fandt berørte versioner af otte pakkenavne. Gate-outputtets `node@0.16.7` var `@humanfs/node`, ikke Node-runtime.

Afgrænset opdatering: Nodemailer 9.1.1, sharp 0.35.4, @humanfs/node 0.16.8, browserslist 4.28.9, fflate 0.8.3, js-yaml 4.3.2, postcss-selector-parser 6.1.3 og qs 6.16.0. Overrides dækker også indlejrede Nodemailer-kopier fra IMAP/parser. Lockfilen indeholder nødvendige følgeopdateringer, bl.a. sharp-platformspakker. Kompatibilitet er lokalt testet, ikke bevist i produktion.

Lockfilen blev først opdateret med `--package-lock-only --ignore-scripts`; ingen pakker blev kørt. Efter lokalt commit bestod installationen den uændrede SSD-gate:

- Socket: ingen risici fundet.
- Semgrep: 9 regler, 761 targets, 0 fund. Store/ignorerede filer blev ikke scannet.
- 829 verificerede registry-signaturer og 135 attestations.
- Alle lifecycle-scripts forblev deaktiverede. Ingen risk override eller npm rebuild.
- npm advisory-opslag på den opdaterede lockfil returnerede `{}` på kontroltidspunktet. Dette er ikke en garanti mod ukendte sårbarheder.

Gate-rapport: `/Volumes/Samsung T5 HD/AZIDE-SAFE-NEW-MAC-TRANSFER/dependency-reports/20260909T115725Z-apropos-research.log`.

Gamle node_modules og tidligere .next er flyttet recoverbart til `tmp/dependency-recovery-20260909/`. De er ikke eksekveret. Friske tests bruger fortsat `./tmp/vitest-rage`; tracked researchdata er uændrede.

## Testresultater

Kørt med renset procesmiljø uden produktionssecrets:

- TypeScript: `tsc --noEmit --incremental false`, exit 0.
- Vitest: 41 testfiler, 442 tests bestået.
- Native redaktionelle regressionstests: 9 bestået.
- Recovery-smoke mod origin/main: 32 ændrede TS-filer parset, 156 lokale imports kontrolleret, fire auth-headerchecks og Funding/Liv-cronchecks bestået.
- Build-konfigurationsscanner: bestået.
- Next.js-produktionsbuild: kompilerede og genererede 174 statiske sider uden produktionsnøgler. Offentlige mediefeeds blev hentet under prerendering; buildet er derfor ikke offline/reproducerbart alene fra checkoutet.

Første build advarede om bred filtracing i podcast encode/probe og SEO archive-content-fixes. 14 manifester indeholdt hver 2302 referencer til recovery-mappen. Der er derfor tilføjet globale tracing-excludes for tmp, .git og root .env-filer samt `test/release-tracing-recovery.mjs`, som kontrollerer faktiske buildmanifester. Bred tracing skal stadig indsnævres ved kilden; excludes gør ikke advarslerne irrelevante.

Genbuild efter rettelsen: exit 0. Alle 207 deployment-manifester bestod kontrollen uden tmp-, Git- eller root .env-referencer. De tre tracing-advarsler består og er dokumenteret ovenfor. Konfigurationsscanner og `git diff --check` bestod også efter rettelsen.

Vercel deployment/API-skills blev brugt til statuskontrol. Next.js-skillen blev brugt til build- og bundlingkontrol. Browser-CLI var ikke tilgængelig; eksisterende browseradgang blev brugt som fallback til at inspicere Studio.

## Ikke publiceringsklart endnu

Auto-publicering kan stadig ikke passere det krævede kildebaserede faktatjek: `/api/factcheck` henter ikke kilder. Et modelgenereret verified-resultat er ikke tilstrækkeligt. Der må ikke tilføjes et falsk `retrieved-sources`-flag for at åbne gaten.

Næste funktionelle trin er kildehentning med datoer, citeret evidens og modstridskontrol bundet til artikelversionen. Derefter kræves billedrettigheder/alt-tekst, validerede Webflow-referencefelter og en verificeret kladde før livepilot. Organisationsfælles dedupe, holdbar publiceringskø og Instagram-idempotens er fortsat åbne opgaver. Lokale grønne tests dokumenterer ikke adgang eller succes hos disse tjenester.

Installationsscripts er også deaktiverede i Vercels installCommand. ffmpeg-static får derfor ikke automatisk sin binær downloadet. Podcast-transkodning skal have særskilt verificeret binærforsyning; den er ikke livegodkendt af disse tests.
