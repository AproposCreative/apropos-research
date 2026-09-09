# Første lokale integration: Liv Redaktion og Writer

Dato: 9. september 2026. Ikke committet, pushet eller deployet. Dette er første implementeringstrin, ikke en færdig autonom redaktion.

## Implementeret

- App-launcheren har nu Liv · Redaktion i stedet for Funding Desk. Visningen åbnes også med `/ai?view=liv`.
- Fem faner: Overblik, Historier, Kilder og dækning, Udgivelser, Indstillinger. De sidste to genbruger eksisterende Liv-status og historik. Indstillinger er endnu ikke en komplet konfigurationseditor.
- Ny autentificeret `/api/editorial/desk` genbruger discovery, dossier/brief og Liv-generator. Historier og udkast gemmes under `editorialDesks/{firebaseUid}/stories/{sha256(signal.id)}`. Transaktioner forhindrer gentagen oprettelse af samme signal og parallel behandling af samme historie. Et seksminutters udløb giver mulighed for retry af afbrudte requests.
- Udkast åbnes i eksisterende Writer med research og billedforslag. Brugeren advares før erstatning af en eksisterende artikel. Redaktionens komponent nulstilles ved brugerskift.
- Writer henter aktiverede medier med Firebase-token. Medie-API'et stoler ikke længere på bruger-ID fra query/header. Kildetrinnet viser navngivne medier og Alle medier. Trending har en begrænset fallback på medienavn, hvis brugerens kilde-ID ikke matcher ingestion-ID'et. Fejl og manuel retry er synlige; tomme resultater udløser ikke gentagne automatiske forespørgsler.
- Interne research-kald bruger eksisterende intern autentificering med korrekt Bearer-fallback for cron. Den nye desk sender ikke interne credentials til et request-styret Host.
- Billedsøgning til film/serier/spil er ikke længere afhængig af, at betalt AI-generering er aktiveret. AI-fallback respekterer fortsat featureflag og kræver klientkonfiguration.
- Genererede illustrationer går direkte gennem eksisterende optimering og Firebase Storage. Eksakt 1920 × 1080-canvas, WebP og titelforankret filnavn. Permanent upload skal lykkes; en midlertidig provider-URL returneres ikke som succes. Størrelsesmålet på 400 KB er blødt, hvis minimumskvaliteten nås. Andre billedkald beholder deres hidtidige dimensionsadfærd.
- Billedprompten præciserer løse streger, ujævn kontur, papir/korn og ingen poleret AI-overflade. Livs tekstprompt forbyder opdigtede oplevelser og kræver observationsgrundlag til anmeldelser. Promptregler er ikke et automatisk kvalitetstjek.
- Funding Desk-side, launcher-entry, egne API-ruter, cron og Funding-specifik mail-/researchkode er fjernet. Akkreditering og fælles JSON-lager er bevaret. Historiske Funding-typer og det deaktiverede promptsegment er bevaret af kompatibilitetshensyn. Ingen historiske data, GitHub-repositories eller Codex-projekter er slettet. Kodefilerne kan gendannes fra Git.

## Genbrug og review

Next.js-skillen blev brugt til klient/server-grænser og route-struktur. React-review-skillen blev brugt til komponenternes tilstande, brugerafgrænsning og overgangen til Writer. Der er ikke installeret nye afhængigheder eller brugt produktionscredentials.

## Verifikation

Kørt med lokal Node-toolchain, uden projektets node_modules eller .env:

`node test/local-editorial-smoke.mjs`

- 19 ændrede TypeScript-filer syntaksparset. Dette omfatter ikke TSX eller typechecking.
- 122 lokale importreferencer i ændrede TS/TSX-filer fandtes.
- Fire isolerede regressionskontroller for interne headers med syntetiske værdier bestod.
- Funding-ruter er væk, Funding-cron er fjernet, Liv-cron er bevaret.
- `git diff --check` bestod.

Build, Vitest, skærmtest og liveintegrationer er **ikke** verificeret for disse ændringer. Recovery-reglen forbyder kørsel af gamle afhængigheder. Før runtime-test kræves en dokumenteret ren installation via SSD dependency gate med lifecycle-scripts deaktiveret. Vitest skal fortsat bruge det isolerede `tmp/vitest-rage`-lager.

## Stadig nødvendigt før autonom drift

1. Global historiededuplikering på tværs af signaler, brugere og omskrevne overskrifter. Den nye nøgle stopper kun identiske signal-ID'er inden for samme bruger.
2. Kilde- og datoverifikation af konkrete claims, versionbundet menneskelig godkendelse og artikel-/billedgates. Et research-scoretal er ikke faktatjek.
3. Dækningsstyring over publicerede artikler for alle ti kulturfelter og geografi. Den genbrugte discovery-motor har fortsat fire brede beats; dashboardets optælling gælder højst de 100 senest hentede idéer.
4. Holdbar jobkø med rate-/budgetgrænser og planlagt kørsel. Den nye desk udfører brugerstyrede requests, ikke en selvkørende worker. Cron er endnu en separat pipeline.
5. Dokumenterede billedrettigheder og billedkontrol. Søgeresultater og officielle billedforslag er ikke automatisk godkendt til publicering. Valg mellem søgning/generering følger fortsat eksisterende artikeltype-detektion.
6. Idempotent Webflow-publicering og særskilt Instagram-kø. Intet af dette er aktiveret eller live-testet i denne integration.
7. Ren dependency-installation, fuld typecheck/build, emulator-/integrationstests og browserkontrol før separat godkendelse af push/deploy.
