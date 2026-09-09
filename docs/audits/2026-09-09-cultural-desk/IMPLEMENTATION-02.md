# Liv: læserinteresse, variation og kladdekontrol

Dato: 9. september 2026. Lokal fortsættelse af IMPLEMENTATION-01. Ingen livekald, credentials, installation, push eller deployment.

## Leveret i dette trin

### Analytics som redaktionelt input

- Genbruger GA4-klienten. Gårsdagens artikelvisninger sammenlignes med dagsgennemsnittet for de syv foregående dage, i propertyens kalenderdage.
- `/articles/`-stier normaliseres, titelvarianter samles. Minimum 20 visninger, mindst 1,5 gange normalniveauet og mindst 10 ekstra visninger.
- Små/ugyldige tal og forsiden er ikke trends. Manglende adgang eller et trunkeret rapportresultat bliver til utilgængelig status, ikke nul trafik.
- Snapshot gemmes på brugerens editorialDesk ved discovery og vises i Overblik/Kilder. Dette er perioderapporter, ikke realtime eller en løbende monitor.
- En enkel titeloverlap-heuristik giver højst seks ekstra prioritetspoint. Analytics er aldrig faktabelæg.

### Variation og dubletter

- Discovery omfatter ti kulturfelter og foreslår én kandidat pr. felt før yderligere kandidater. Provider-fan-out begrænses til to felter ad gangen.
- Nyere idéer i samme felt trækker op til 24 point fra. Dette er idéhistorik, ikke en færdig publicerings-/geografimodel.
- Nye idéer får createdAt. Ældre rækker bruger updatedAt som fallback.
- Firestore `editorialDesks/{uid}/storyKeys/{hash}` registrerer normaliserede titler og kilde-URL'er transaktionelt. Tracking-parametre fjernes, betydende URL-parametre bevares. Ældre historik kontrolleres blandt op til 1000 seneste rækker uden destruktiv migration.
- Discovery har tidsbegrænset, brugerafgrænset lås og 60 sekunders cooldown. Det er ikke et samlet tokenbudget eller en holdbar workerkø.
- Nyhedssignaler bliver ikke automatisk til anmeldelser uden observationsgrundlag.

### Artikel og CMS

- Liv-generatoren får briefets ordmål, kategori og to reproducerbart udvalgte stilreferencer fra det eksisterende Apropos-korpus. Korpus er ikke dermed redaktionelt kurateret eller dokumenteret som kvalitetsbenchmark.
- Nyt preflight-action kontrollerer det gemte udkasts titel, slug, intro, SEO, kategori, længde, em dash og registrerede kilde-URL'er. UI viser mangler. Strukturklar betyder udtrykkeligt ikke publiceringsklar.
- CMS-emner får ikke længere ubetingede Musik/Festival/Natteliv-fallbacks.
- En billed-URL bliver ikke længere til en opdigtet pressefotocredit.
- `publishArticleDraftToWebflow` gennemtvinger draft-status, også hvis input fejlagtigt bærer published-status.

### Sikkerhedsporte

- Manglende embeddings gør lighedstjekket ufuldstændigt, frem for at ligne en lav lighedsscore.
- Tomme claims, modelbaseret faktatjek uden kildehentning, unverifiable claims og tom TOV-respons kan ikke passere komplet verifikation.
- Factcheck-kaldet bruger nu interne auth-headers.
- Den eksisterende factcheck-route producerer IKKE retrieved-sources-verifikation. Auto-mode er derfor bevidst blokeret af denne gate med den nuværende backend. Det kræver en reel kildebaseret checker, ikke blot tilføjelse af et flag.

## Kontroller

`node --test test/editorial-policy-recovery.mjs`: 9 tests bestået med syntetiske data. Dækker trafikberegning, støjfiltrering, URL-normalisering, CMS-struktur, fejlagtige emner/credits, manglende sikkerhedskontroller og ti-felts-discovery. Ingen netværkskald eller dataset-skrivninger.

`node test/local-editorial-smoke.mjs`: 29 ændrede TS-filer syntaksparset, 147 lokale importreferencer fundet, fire isolerede headerkontroller og Funding/Liv-cron-kontrol bestået. Dette er ikke TSX-parsing eller TypeScript-typechecking.

`git diff --check`: bestået.

Next.js-skillen bruges til server-/klientgrænser og API-struktur. OpenAI-skillens credentialflow er fraveget efter brugerens strengere recovery-regler: ingen nøgle læst eller oprettet.

## Resterende leverancer før hele planen er færdig

- Godkendt ren dependency-installation via SSD-gaten, fuld typecheck/build og browser-/Firestore-emulatortests. Ingen gate-instruktion blev fundet blandt checkoutets tracked filer.
- Kildebaseret claim-verifikation med datoer, evidens, modstrid og artikelversionsbinding.
- Kurateret Apropos-benchmark og målt redaktør-/omskrivningsflow.
- Fælles organisationsafgrænset dedupe på tværs af Writer, cron og brugere, samt semantisk historieklyngning.
- Faktisk publicerings-/geografisk dækningshistorik.
- Billedrettigheder/alt-tekst og livevalidering af CMS-referencer på en kladde.
- Holdbar, idempotent Webflow-/Instagram-kø, menneskelig godkendelse bundet til version og pilotdrift.
- Realtime-Analytics er en separat udvidelse. Der er hverken oprettet app-automation eller ekstern monitor.

Disse punkter er ikke færdige eller godkendt af de lokale tests. Den eksisterende billedsøgning og AI-generering fra første trin er bevaret.
