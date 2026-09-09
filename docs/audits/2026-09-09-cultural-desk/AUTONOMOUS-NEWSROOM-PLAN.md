# Apropos Studio: plan for Livs automatiske kulturredaktion

Dato: 9. september 2026. Status: forslag baseret på kodeinspektion og read-only GitHub-kontrol. Ingen nye runtime-ændringer i denne gennemgang.

## Målet

Liv finder dagligt kulturhistorier via konkurrenter og primærkilder, vælger en selvstændig Apropos-vinkel, researcher, skriver og redigerer en artikel, fremstiller et passende billede, publicerer på Webflow og distribuerer på Instagram. Rutinen skal fungere uden daglig betjening. Manglende dokumentation skal føre til en anden kandidat eller en eksplicit pause, aldrig til opdigtede fakta eller en sænket kvalitetsgrænse.

Første driftsmål: én stærk artikel og ét Instagram-feedopslag pr. dag, når en kandidat opfylder kravene. Udvid til to artikler, når pilotmålingerne viser, at kvalitet og drift holder. Ingen garanti om 100 procent tilgængelighed eller et bestemt antal artikler uanset kildegrundlag.

## Evidens og begrænsninger

- Lokalt HEAD: `5ee2cb7`, branch `codex/remove-postcss-malware`, plus ucommittede ændringer fra den tidligere gennemgang.
- GitHub `main`: `40909b5690b7e17a6764e4902246cf5bc7941fce`, bekræftet med ls-remote. Main indeholder nyere Liv Inbox-kode; den lokale branch har recovery-/dependencyændringer, som ikke blot må erstattes med main.
- Den lokale branch har 176 tracked API-route-filer. Tidligere gennemgang inventerede dem; denne gennemgang fokuserer på de forløb, der afgør autonom redaktion og distribution. Det er ikke en linje-for-linje sikkerhedsrevision af alle sidefunktioner.
- GitHub API viser et offentligt repository, default branch main og pull/push/admin-rettigheder for den aktuelle konto. Tidligere udsagn om read-only GitHub-rettigheder var forkerte. Den lokale push-blokering og kravet om credential rotation gælder stadig.
- Main rapporteres ubeskyttet. Repository-rulesets-kaldet returnerede ingen entries. Eventuelle andre organisatoriske restriktioner er ikke verificeret.
- Én åben PR blev fundet: #17, Cloud Agent development environment config. Den seneste commits viste check er `train-upload`, success. De fem seneste viste Actions-runs var embeddings-upload; det beviser ikke, at redaktion eller deployment fungerer.
- Tidligere lokal baseline: 39 testfiler/355 tests og build passerede. Disse tests blev ikke genkørt i denne planrunde, og resultaterne er ikke dokumentation for live-integrationerne eller den hentede main.
- Firestore-data, Meta-kontorettigheder, Webflow CMS og Vercels faktiske deployment er ikke tilgået med produktionscredentials. Deres driftstilstand er derfor ikke verificeret.

## Hvad der kan genbruges

| Område | Eksisterende grundlag | Anvendelse |
| --- | --- | --- |
| Konkurrentindsamling | src/discovery, src/fetch, src/parse, lib/trending/ingest-runner.ts, trendingArticles | Genbrug feed/sitemap-parser og Firestore-upsert |
| Research | lib/research/service.ts, providers, lib/editorial/search.ts | Saml i én dokumenterende research-service |
| Redaktion | lib/editorial/engine.ts, cockpit og brief | Behold UI; flyt autoritativ state til server |
| Liv | lib/liv/generate-article.ts og data/author-prompts/liv-brandt.txt | Behold stemme og faktaudtræk; erstat svage gates |
| Jobmønstre | livDailyArticles, accreditation leases, SEO-jobfunktioner | Genbrug transaktions-/leaseprincipper efter review |
| Publicering | lib/articles/publish.ts og lib/webflow-service.ts | Behold CMS-mapping bag én publiceringspolicy |
| Billeder | lib/images/optimize-and-upload.ts og design editor | Genbrug optimering og layout til vedvarende assets |
| Instagram | app/api/instagram/publish/route.ts | Genbrug Meta-adapterens container/publish-mekanik |
| Indbakke | origin/main:lib/liv-inbox/* | Tilføj indgående tips som signaler senere; er ikke artikelmotoren |

## Konkrete blokeringer

1. **Faktatjek er ikke kildeverifikation.** app/api/factcheck/route.ts beder modellen bruge sin viden og har ingen dokumenterende søgning. Tomme resultater og unverifiable kan slippe gennem run-safety-gates. research-qa.ts tæller HTTP-URL'er som verificerede kilder og udleder antallet af tjekkede claims fra en tekststreng. Antallet bliver ikke et bindende krav til canAutoPublish.
2. **Den tidligere sikkerhedsændring er ufuldstændig.** Skipped flags kan nu blokere auto-mode, men source-similarity.ts skjuler embeddingfejl bag lexical fallback. Manglende TOV-svar er ikke markeret skipped. human_approval er foreløbig kun et navn for et Webflow draft, uden versionbundet godkendelse. Auto-mode må derfor ikke betragtes som produktionsklar.
3. **Interne HTTP-kald mangler auth.** pick-topic kalder trending uden auth; generate-article kalder web-search uden auth; factcheck-kaldet mangler også auth. Production proxy kan afvise disse. internalApiHeaders bruger desuden CRON_SECRET som x-internal-api-secret-fallback, mens auth-gaten accepterer CRON_SECRET som Bearer. Foretræk direkte server-servicekald.
4. **Daglig friskt input er ikke sikret.** Firestore-ingest findes, men /api/cron/daily-ingest er ikke planlagt i den inspicerede vercel.json, heller ikke main. GitHub-workflowen bruger et andet filbaseret ingest-flow og git push. Vælg én autoritativ, planlagt ingestion og vis lastSuccessfulIngestAt.
5. **Dedupe og balance er fragmenteret.** Editorial coverage ligger i localStorage; Liv-history læser kun published og ignorerer drafts. Dage bruges som antal records snarere end et egentligt tidsfilter. Fire beats og musikvægtede prompts giver ikke ti kulturfelter eller geografisk variation.
6. **Kvalitetsscorer kan ligne evidens uden at være det.** Editorial source-score belønner URL/domæne/tekstlængde. ready kan være true ved 4 af 5 checks, selv når en vigtig check fejler. Alle hårde krav skal bestås uanset samlet score.
7. **Anmeldelser vælges for let.** inferArticleType kan udlede review alene af ord som film, serie eller premiere. Konkurrenters anmeldelser er ikke Livs egen oplevelse. Der mangler værk-/episode-ID, adgangsgrundlag og observationsnoter.
8. **Billedkontrol mangler.** og:image fra en researchside er kun en kandidat, ikke dokumentation for brugsret eller relevans. Generering leverer 1792x1024; process-image kan nedskalere til 1200 og returnerer et indpakket data-svar, som generate-image læser som top-level fields. Dermed kan resultatet blive den oprindelige midlertidige URL. 1920x1080 og en vedvarende artikelrelation er ikke garanteret.
9. **Instagram er et manuelt separat forløb.** Den fundne klient er DesignEditorView. Liv-cron kobler ikke automatisk et social-job på publicering. Container-ID og publiceringsforsøg gemmes ikke i en holdbar social-kø. Timeout kan føre til et publiceringsforsøg alligevel. Genstart efter et uklart API-svar kan give dubletter.
10. **Facebook er en implicit sideeffekt.** Instagram-ruten poster også på Facebook, hvis page-ID findes. Kanalvalg skal være eksplicit pr. job; Instagram betyder ikke automatisk Facebook.
11. **Auth og recovery kræver mere arbejde.** Den globale gate accepterer bredt Firebase-brugere; publiceringsruter skal have rolle-/servicekontrol. daily-ingest har en lokal cron-check, der kan omgås med VERCEL-flag/header, selv om global proxy stadig gælder. URL-fetches skal beskytte mod private netværk, redirects, store svar og prompt injection fra konkurrenttekster.
12. **Drift afhænger af filer og lange requests.** Webflow-config kan gemme apiToken på disk og har filprioritet over env. Konfiguration og credentials skal adskilles. Liv-run på op til 300 sekunder har ikke checkpoint mellem research, skrivning, billede og publish. En daglig claim forhindrer ikke alene dobbelt CMS-oprettelse ved crash efter ekstern succes.

## Den ønskede journalistiske proces

Konkurrenter er radar. Et emne bliver først en Apropos-artikel, når Liv har et dokumenteret grundlag og en idé om, hvad læseren skal forstå ud over nyheden.

1. Indsaml metadata, URL, dato og tilladte korte uddrag fra konfigurerede kilder. Respektér kildeadgang, robots og rate limits; ingen paywall-omgåelse. Registrer oprindelig udgiver, så fem gengivelser af samme pressemeddelelse ikke tælles som fem uafhængige kilder.
2. Gruppér signaler efter begivenhed, værk/person, tidspunkt og vinkel. Se mod både egne publicerede artikler, drafts, planlagte og afviste idéer. En reel ny udvikling kan oprette en opfølger med link til den gamle historie.
3. Foreslå tre vinkler. Vælg efter dansk relevans, aktualitet, originalt bidrag, kildegrundlag og underdækkede felter. Ingen fast længde skal tvinge en tynd historie til at blive et essay.
4. Find primærkilder og uafhængig bekræftelse. Gem claim, understøttende passage, URL, original dato, hændelsesdato, fetchedAt, kildeafhængighed og status. Ukendt dato er ukendt, ikke dagens dato.
5. Skriv brief: tese, hvorfor nu, hvem det angår, 3-6 centrale fakta, modargument, åbne spørgsmål og hvad Liv tilfører. Eksempel: en ændret festivalpris bliver en undersøgelse af adgang til kultur, ikke bare en ny formulering af konkurrentens prisnyhed. Eksemplet er hypotetisk.
6. Liv skriver fra brief og evidens med varme, præcision og holdning. Ingen em dash, AI-standardåbning, opdigtet samtale eller opdigtet scene. Kildehenvisning ved eksklusive oplysninger og citater. Vurderinger må ikke bruges til at skjule ubekræftede faktapåstande.
7. En separat redigering vurderer idé, åbning, fremdrift, konkrete eksempler og sproglig variation. Faktatjek sammenholder artikel og kildemateriale. Maksimalt to reparationsforsøg, derefter blocked eller alternativ kandidat.
8. Tjek billedasset, metadata, originalitet og publiceringspolicy på den endelige artikelversion. Enhver indholdsændring efter tjekket gør godkendelsen ugyldig.

## Anmeldelser og Livs troværdighed

| Tilgængeligt materiale | Format |
| --- | --- |
| Metadata, trailer, pressemeddelelse og konkurrentanmeldelser | Nyhed, kontekst, forventningsartikel eller attribueret kritikeroversigt |
| Redaktionens konkrete observationsnoter fra værket | Liv-udkast med menneskelig redaktionel godkendelse i første fase |
| Dokumenteret, lovligt tilgængeligt værk og valideret analyseforløb | Senere mulighed for automatisk kritik efter særskilt evaluering |
| Intet observationsgrundlag | Ingen selvstændig anmeldelse, stjerner eller påstand om at have set/hørt værket |

Et manuskript/transkript dokumenterer dialog og handling, men ikke nødvendigvis skuespil, lyd, klipning eller kameraarbejde. Registrer værk-ID, sæson/episode, sete dele, spoilergrænse og observationsgrundlag. Liv må aldrig skrive, at hun var i salen eller så hele sæsonen uden belæg. Fast forfatterbeskrivelse skal forklare Livs AI-rolle og Apropos' redaktionelle ansvar.

## Teknisk målbillede

Firestore er kilden til driftsstatus; GitHub er kilden til kode og konfiguration uden secrets.

```text
Kilder → signaler → historiegruppe → research → brief → artikelversion
                                                   ↓
                          kvalitetskontrol + billedasset + policy
                                                   ↓
                                  Webflow-job → verificeret liveartikel
                                                   ↓
                                  Instagram-job → verificeret opslag
```

Foreslåede collections: editorialStories (signalgruppe/idé/status), researchDossiers (kilder/claims), articleVersions (tekst/SEO/model/promptversion/hash), imageAssets (oprindelse/rettigheder/varianter), editorialJobs (trin/lease/retries), publicationAttempts (kanal/externe ID'er/resultat), coverageLedger (beat/geografi/format), editorialSettings (mode/budget/tidsplan), editorialApprovals (bruger/version/beslutning).

Genbrug trendingArticles som indbakke for konkurrentmateriale. Eksisterende livDailyArticles kan blive bagudkompatibel run-summary. Udfør migration med tællinger, dry-run og rollback; slet ikke historik. Krydsreferencer bruger stabile storyId og articleVersionId.

Job skal have status, nextAttemptAt, leaseOwner, leaseExpiresAt, attemptCount, inputHash, outputRef og sidste fejl. Atomisk claim og fencing forhindrer en gammel worker i at afslutte en overtaget opgave. Gem ekstern item/container-ID så tidligt som muligt. Ved timeout med ukendt ekstern succes undersøges eksisterende resultat før nyt publish. En database-transaktion alene garanterer ikke exactly-once i Webflow/Meta.

Cron starter korte workers. Workers fortsætter fra sidste checkpoint. Firestore-nedbrud stopper nye publiceringer. Instagram-fejl skal kunne repareres uden at genudgive artiklen. Offentlig artikel-URL kontrolleres før social distribution.

Publication modes:

- draft: gem artikel og evt. Webflow draft; ingen social distribution.
- human_approval: vis frosset artikel/billede/caption og begrundelser; gem godkendelse til versionshash. Publicér kun godkendt version.
- auto_publish: alle bindende checks skal bestås. Fejl, skipped, ukendt evidens eller ukendte billedrettigheder stopper publicering.

Aktivering sker pr. format og kanal. Anmeldelser med manglende observationsgrundlag, alvorlige beskyldninger, dødsfald og modstridende centrale kilder eskaleres. Autonomien kan vælge en veldokumenteret alternativ historie den dag.

## Billeder og Instagram

Artikelbilledet skal ende som præcis 1920x1080: håndtegnet, lidt ujævnt, dæmpede farver, papir/korn, uden tekst. Briefet beskriver den konkrete idé og stemning, ikke bare kategorien. AI-illustrationer må ikke fremstilles som dokumentariske fotos.

Gem original og varianter i Storage samt artikelrelation, dimensioner, mime, checksum, alt-tekst, model, promptversion, credit og rettighedsgrundlag i Firestore. Et fundet billede er ikke automatisk godkendt. Verificér decode/dimensioner, permanent URL og motivets relevans før brug.

Foreslået social start: ét feedopslag med særskilt 1080x1350 JPEG-komposition og en kort caption med konkret hook, pointe og vej til artiklen. Senere Stories i 1080x1920 og carousels. Størrelserne er designvalg, ikke en påstand om alle API-grænser. Bevar billedet uden tekst som standard; eventuelle typografiske socialkort skal være en særskilt skabelonbeslutning.

Meta-adapteren skal validere aktuel konto/format, kontrollere publishing limit, gemme container-ID, afvente klar-status og verificere publiceret media-ID. Hver kanal har eget job, retry og kill-switch. Facebook er default fravalgt. Tokenfejl stopper kanalen med en handlingsklar alarm; tokens må ikke logges eller gemmes i Git.

Reference: Metas officielle Postman-dokumentation beskriver bl.a. JPEG-krav for billedpublicering, containerstatus og content_publishing_limit: https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api. De konkrete kontorettigheder og live API-forhold skal verificeres før pilot.

## Dækningspolitik

De ti felter er kulturpolitik, teater/scenekunst, film/serier, litteratur, billedkunst/museer, arkitektur/design, gaming, musik, kulturarv samt kulturfællesskaber/vaner. Registrer geografisk fokus separat fra omtalen af en by.

Foreslået start: mindst seks felter i et rullende vindue på 14 udgivelser, musik højst fire af de 14. Dansk lokalt stof skal aktivt søges uden for København; nationale/internationale historier tælles separat. Vægtene må ikke tvinge udokumenterede artikler gennem. Dashboard skal forklare fravalg, underdækning og manglende kandidatgrundlag.

## Leverancer i rækkefølge

| Trin | Leverance | Acceptkriterium |
| --- | --- | --- |
| 0 | Fælles sikker baseline, gennemgå main/Liv Inbox mod lokale fixes, PR-checks, lifecycle-scripts off, dependency gate | Ingen tab af recoveryændringer; dokumenteret commit; ingen produktionsadgang nødvendig for lokale tests |
| 1 | Kilderegister, planlagt Firestore-ingest, historiegrupper, dedupe, coverage | Genkørsel og parallelle runs laver ikke dubletter; friskhed synlig; draft/afvist tæller med |
| 2 | Claim-baseret research, brief og Liv-redigering | Centrale claims har evidens; usikre/udaterede kilder og tomt faktatjek blokerer |
| 3 | Versionbundet policy og holdbar Webflow-kø | Draft/approval/auto kan testes; crash efter ekstern succes skaber ikke ny artikel |
| 4 | 1920x1080 assets og Instagram-kø | Korrekt billedformat; artikel live først; container genbruges efter retry; ingen implicit Facebook-post |
| 5 | Shadow-pilot, begrænset livepilot, overvågning | Kvalitet dokumenteret over tid; fejl kan repareres uden manuelt at starte hele flowet |

Undlad nye podcast-, funding-, SEO-backfill- og mailfunktioner på den kritiske vej. Eksisterende SEO-metadata og indbakkeintegration genbruges, når kernekæden fungerer.

## Pilot og definition af færdig

1. Byg et fast evalueringssæt med 30 emner på tværs af de ti felter. Medtag falske datoer, afhængige kilder, prompt injection, gentagne historier, tomt faktatjek og værker uden observationsgrundlag.
2. Kør syv dage i shadow-mode. Redaktionen vurderer idé, fakta, sprog og selvstændighed 1-5. Startkriterium foreslås til mindst 4 i hver dimension for udgivelige tekster og ingen udokumenterede centrale claims. Et lille pilotsæt beviser ikke nul fremtidige fejl.
3. Kør 14 dage med højst én liveartikel pr. dag i de validerede formater. Instagram følger kun en bekræftet liveartikel. Enhver alvorlig faktuel fejl pauser auto-mode til årsag og regressionstest er på plads.
4. Målsætning: mindst 95 procent af godkendte jobs gennemføres inden for det aftalte tidsvindue; nul dobbeltpubliceringer i retry-/crash-tests og pilot. Dage uden forsvarlige historier registreres separat, ikke som succesfuld publicering.
5. Mål pris pr. godkendt artikel, afvisningsårsag, researchalder, beat/geografisk fordeling, teknisk gennemløbstid og social completion. Efter udgivelse måles læsning, engagement og trafik med eksisterende analytics, hvor tilgængeligt. Clicks må ikke tilsidesætte fakta eller dækningsvariation.

Budget indstilles pr. dag, artikel og trin. Maksimalt tre kandidater researcher dybt, to revisioner pr. artikel og to billedforsøg som startforslag. Mål faktisk forbrug i piloten før valg af højere volumen eller dyrere modeller; intet ubekræftet månedsprisestimat.

Færdig betyder også et dashboard med hver artikels trin, næste forsøg, kildegrundlag, omkostning og Webflow/Instagram-ID, alarm ved meningsfulde fejl, kill-switch, rettelsesprocedure, rollback og backup. Driftens rutine kan blive fuldautomatisk; ansvar, kontofornyelse og undtagelser forsvinder ikke.

## Næste konkrete opgave

Første implementeringspakke bør samle baseline og etablere én holdbar vertikal kæde: konkurrent → verificeret research → selvstændigt Liv-udkast i Firestore. Luk auth- og evidenshullerne og tilføj de ovenstående negative tests, før billed- og socialpublicering kobles på. Lever pakken som reviewbar lokal diff; push/deploy forbliver afhængig af separat credential rotation og godkendelse af den præcise commit efter recovery-reglen.
