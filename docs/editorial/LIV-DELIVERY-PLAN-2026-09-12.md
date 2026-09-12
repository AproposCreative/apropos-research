# Liv: én artikel hver dag

Dette er den samlede leveranceplan fra 12. september 2026. Ældre todo- og
releasefiler er historik, ikke konkurrerende planer.

## Produktløftet

Liv forbereder, researcher, skriver, illustrerer, kontrollerer og udgiver én
selvstændig dansk Apropos-artikel hver kalenderdag via serverens API-flow.
Normal udgivelse er kl. 10 i Europe/Copenhagen. En åben browser, denne samtale
eller en ulåst computer må ikke være en forudsætning. Instagram er slukket.

Frederik ser én kommende artikel i Kommende, normalt morgendagens. Mangler
dagens artikel, får den førsteprioritet. Kortet viser billede, titel, eksplicit
artikeltype, kategori og resumé med Godkend/Afvis og detaljevisning. En anmeldelse
viser de gemte stjerner på en 1–6-skala og Livs konkrete begrundelse. En feature
får aldrig stjerner alene, fordi den handler om en film.
Godkendte historier prioriteres, ellers vælger Liv. Afviste historier vælges
aldrig. En redaktionel beslutning er ikke en øjeblikkelig publicering.

## Acceptkrav

- Én verificeret publicering pr. dansk kalenderdag. Idempotens forhindrer to
  artikler ved gentagne cron-kald. En tvetydig CMS-skrivning afklares først.
- Én kommende artikel. Ingen automatisk produktion af fem forslag, en uge af
  færdige artikler eller tre reserver. Allerede gemt arbejde bevares.
- En afvisning giver højst ét nyt alternativ med egen identitet. Afvises også
  alternativet, vises problemet; der bruges ikke penge på en endeløs række.
- Daglige artikler har 450–650 ord i brødteksten, mål 550. Overskrifter og
  billedtekster tæller ikke med. CMS-kontrollen håndhæver grænserne; én samlet
  rettelse kan håndtere både længde og fakta. Writerens manuelle længdevalg
  ændres ikke. Anmeldelser kræver begrundet rating.
- Kanonisk Liv-stemme, egen tese og kulturfaglig fortolkning, konkrete eksempler
  og modargument. Ingen opdigtede visninger, interviews, kilder eller citater.
- Dokumenteret research, dato- og dubletkontrol, originalitet og korrekt CMS.
  CMS-feltet AI-generated bevares, men markeringen er slået fra for nye Liv-artikler
  efter Frederiks ønske 12. september. Intern model- og kildehistorik bevares.
  Hero plus to forskellige brødtekstbilleder, alt-tekster og
  faktiske credits. Korrekte billedproportioner. Ingen AI-filmscener.
- Betalt tekst og billeder gemmes og genoptages; tidligere fejl slettes ikke.
- Manglende dagens artikel giver synlig fejlstatus, ikke et grønt succesflag.

Eksterne tjenester kan fejle. Driftsmålet er daglig levering med gemt arbejde,
kontrollerede retries og tydelig fejlmelding, ikke et udokumenterbart løfte om
100 % oppetid.

## Verificeret udgangspunkt 12. september

OpenAI-test returnerede HTTP 200. Forberedelse og auto-publicering er aktiveret,
og cron-jobbene er registreret. Det er ikke tilstrækkeligt: køen har nul klar
og nul reserve. Seneste publiceringskvittering er Headline Flip 11. september.
Forberedelses-API svarede `no_unstarted_work`; dagens udgivelse er ikke bevist.

## Eksekveringsrækkefølge

1. **Kø og genstart:** dæk i dag først og forbered derefter kun i morgen.
   Genoptag gemte trin, korrekt scope og oprindelig plan.
2. **Tidsbudget:** adskil tekst, billeder og slutkontrol i gemte, fortsættelige
   servertrin. Hvert trin får sit eget funktionsbudget.
3. **Fejlhåndtering:** autentificeret, idempotent genstart af præcist identificeret
   fejlet arbejde med auditkopi. Ingen sletning, tilfældige nye run-id'er eller
   omgåelse af kvalitetskontroller.
4. **Research og medier:** reparer dokumenterede fejl, genbrug gemte aktiver,
   behold alle redaktionelle og tekniske kontroller.
5. **Release:** isolerede tests, typecheck, sikker build, push og eksakt deployment.
6. **Produktionsbevis:** kør dagens normale API-flow og kontroller Webflow samt
   offentlig artikel. Forbered derefter én artikel til i morgen.
7. **Driftsbevis:** næste planlagte serverkørsel skal kunne gennemføre uden manuel
   hjælp. Kontroller mobilfeedets data, valg, afvisning og dubletbeskyttelse.

## Konkret restarbejde til ubemandet drift

Gennemgangen fandt, at et aktiveret cron-job ikke alene kan fylde en kø, hvis
alle dens faste kandidat-id'er allerede er udtømte. Efter dagens publiceringsbevis
er rækkefølgen derfor:

1. Vellykkede fortsættelser tæller nu ikke som fejlforsøg (`e40fab4`). Gem også betalt writer-arkiv-id
   direkte på jobbet, så manglende artikelcheckpoint aldrig betyder gratis/genstartbar.
2. Indfør afgrænset, trinbestemt recovery med vedvarende backoff i den eksisterende
   worker. Tvetydige betalte kald og CMS-skrivninger skal afklares, ikke gentages.
3. Lad en leveringsdag få en ny, faktisk anden kandidat, når den gamle ikke kan
   bruges. Bevar den afviste kandidats egen identitet, tekst, aktiver, audit og
   dubletspor. Ingen nye kunstige fremtidsdatoer eller sletning af terminale jobs.
4. Vis én brugbar kommende artikel med format, kategori og eventuelle begrundede
   stjerner. Færdige historiske poster tæller ikke som næste artikel.
5. Verificer faktisk feed-API, Godkend/Afvis, et enkelt alternativ, offentlig
   readback og næste planlagte serverkørsel.

Arkiveret Storch-tekst kan genbruges, men kræver en auditeret binding til den
rigtige leveringsdag og dubletkontrol på tværs af jobs. Medina/Tivoli er en
aktuel kandidat til 17. september. Sombr-vinklen er en feature om internetpop,
ikke en falsk nyhed om en koncert næste uge. Disse er undersøgte kandidater,
ikke publiceringsklare historier.

Der skal ikke bygges en ny scheduler eller et separat manuelt publiceringsflow.

## Senere optimering, ikke ekstra launch-krav

Nyhedsbrevets tidligere manglende udsendelse undersøges separat. Bredere
AI-Writer-oprydning og flere illustrationstemplates må ikke forsinke den
daglige leverance. Finjustering af prompts er ikke det samme som modeltræning.

## Godkendt forenkling 12. september

Forenklingen erstatter de tidligere fem-forslag/tre-reserve-krav. Den er under
implementering, ikke endnu dokumenteret som deployet.

- Én afgrænset researchrunde med få relevante kilder; genbrug af gemte resultater.
- Én tekst og højst én målrettet korrektur. Ingen endeløse omskrivningsforsøg.
- Én samlet redaktionel kontrol; billige strukturelle kontroller forbliver kode.
- Pressebilleder før nye illustrationer, når relevante officielle aktiver findes.
- Månedligt budgetmål/loft 300 kr. med synlige registreringer, inklusive retries
  og billeder. Historisk faktisk API-forbrug er endnu ikke målt; beløbet er ikke
  en dokumenteret prisprognose. Ufuldstændige forbrugsdata må ikke vises som nul.
- Redaktionel feedback gemmes og bruges til følgende tekster. Prompttilpasning
  og præferencehukommelse må ikke kaldes model-finetuning.

Aktuelle lokale beviser: 69 policy/checkpoint/recovery-tests og 48 medietests
bestået. En kommende historie og format/rating-visning er implementeret lokalt.
Den fulde release og produktionsprøve resterer. API-nøglen er til stede i Vercel;
den eksisterende, brugerautoriserede nøgle genbruges uden at blive udskrevet.

## Historisk status før forenklingen

### Releasekontrol 12. september kl. 12.40

Produktionsrelease `0d28de7f5252287c7fcd9c67891eac1751cfcc83` er READY på
`dpl_hQSdLXq3VhNhpQEuF888QV955VmL` og aliasset til ai.aproposmagazine.com.
Autentificeret feed-API returnerede HTTP 200, `queueEnabled=true`,
`preparationEnabled=true` og præcis status for det blokerede gemte Oasis-job.
Begge cron-dryruns bestod. Dagens eksisterende publicering blev ikke gentaget.

Genoptagelse af Oasis fandt en konkret providerfejl: Luna-kaldet med høj
reasoning og 5.000 completion-tokens brugte alle 5.000 på reasoning og
returnerede `finish_reason=length` samt tom tekst. Den betalte respons er
gemt; fem registrerede kald kostede estimeret 2,421088 DKK med nul uafklarede
reservationer. Dette er ikke en faktura eller en pris for en ny hel artikel.
Den målrettede rettelse sænker reasoning og giver kun den dokumenterede
reasoning-only respons én auditeret ny prøve under samme revisionsidentitet.
Netværksfejl, refusals og delvist skrevet output udløser ikke denne prøve.
Morgendagens preview er endnu ikke klar på dette tidspunkt.

Målet er fortsat automatisk skrivning **og publicering hver dag**, også uden
et Godkend-valg. Instagram er fortsat slukket. Webflow-service, normalisering
og boolean-mapping er nu regressionstestet for `ai-generated=false` på nye
Liv-artikler; eksplicitte valg og intern model-/kildehistorik bevares.

1.883 tests i 129 filer består efter sidste integrationsændring. Budgetpolicyen er oprettet i produktion med
300 DKK som loft for nyligt registrerede daglige Liv-kald. Omregning bruger et
eksplicit konservativt skøn på 8 DKK/USD inklusive margin, ikke en aktuel
valutakurs. Historisk forbrug, manuel Writer, særskilte previews, manuelle
coverrettelser og det øvrige redaktionsværktøj er ikke medregnet. Der hævdes
derfor ikke et samlet loft på hele OpenAI-kontoen.

Kendte afvisninger før afsendelse må ikke registreres som tvetydigt betalt
arbejde. QA, embeddings, faktarettelser og medietrin bevarer dokumentation
for ikke-startede kald og genoptager kun det konkrete ubetalte trin.
Tvetydige netværkskald og CMS-skrivninger bliver ikke kaldt gratis.

Den autentificerede feed-respons viser nu også, om næste gemte arbejde er
i gang, afventer eller er stoppet. En tom liste er ikke bevis på aktiv
forberedelse. Dagens udgivelse og eksisterende CMS-identitet bevares.

### Lokal integrationskontrol kl. 12.24, 12. september

Den aktuelle forenkling er endnu ikke deployet. Hele testsuiten: 1.805 tests
i 127 filer består; TypeScript, scoped ESLint og produktionsbuild består.
Offline mobiltest består ved 320/390/768/1280 px, inklusive format, begrundede
stjerner, én historie, Godkend/Afvis, privat feedback og budgetstatus uden falsk
nulforbrug. Ingen produktionsudgivelse eller betalt AI-kørsel er foretaget som
del af disse tests. `AI-generated=false` for nye Liv-artikler er dækket af
payload-, preview- og CMS-readback-kontroller. Interne model/kildebeviser bevares.

Før release færdiggøres budgetgrænsen, så den hverken tæller teoretisk
fuld kontekst som faktisk forbrug eller udløber og stopper daglig levering
uden varsel. Tekniske fejl må heller ikke tolkes som redaktørens Afvis.
Derefter genoptages det gemte Oasis-udkast til 13. september med én samlet
fakta-/længderettelse og genbrug af dets tre eksisterende billeder.

Opdateret 12. september kl. 11.28 dansk tid. Arbejdet er genstartet med en
hovedagent på produktionsflowet og to agenter på medier/genoptagelse og research.

| Del | Verificeret status |
| --- | --- |
| Nøgler/credits | OpenAI HTTP 200 og to vellykkede researchkørsler i produktion. |
| Kø | Dagens manglende artikel prioriteres. Kunstige fremtidsdatoer er fjernet. |
| Servertrin | Tekst, medier og slutkontrol har hver sit gemte fortsættelsespunkt. |
| Genstart | Idempotent autentificeret retry med fuld historik; egne fejl er ikke egne dubletter. |
| Betalt tekst | Arkiveret råtekst kan genoptages; en omskrivning gemmes separat med parent-run-id. |
| Tests | 989 Liv-tests i 50 filer består. Typecheck, scoped lint og produktionsbuild består. |
| Dagens artikel | Alle Guds farver, kulturfeature uden stjerner. 621 ord efter faktarettelse, originalitetskontrol bestået, gemt via API. |
| Billeder | Officielt pressebillede som hero og mobilcover. To oprindelige illustrationer bevaret i brødteksten. Faktisk visuel kontrol og CMS-byteverifikation bestået. |
| Slutkontrol/CMS | 12 påstande verificeret; struktur-, tekst- og billedkontroller bestået. Samme danske CMS-ID `6aa51107feea4b5112862f09` publiceret gennem normal API; offentlig readback bekræftet 11.28.25. |
| Fem forslag og tre reserver | Ikke fyldt. |
| Daglig ubemandet udgivelse | Dagens publicering lykkedes efter API-genstart og schemafix. Aktiverede flags/cron er bekræftet; selvkørende lageropbygning og komplet driftsbevis mangler stadig. |

Releases i denne gennemgang:

- `dd04d00`: køprioritet, gemte servertrin, mediegenoptagelse, operator-retry og
  forberedelse hvert femte minut.
- `cea190d`: analysebriefens budget 30 → 90 sekunder.
- `e33202a`: et eksplicit genforsøg udelukkes ikke som dublet af sig selv.
- `55cacc4`: genbrug af arkiveret, betalt råtekst; kanonisk kilde-deduplikering.
  Vercel `dpl_ALTn3mMrCp1NjEiuWgx6KBgdA1ky` er READY med eksakt SHA og alias
  `ai.aproposmagazine.com`.
- `457e216`: præcis feedback om den blokerende ordsekvens til den afgrænsede
  omskrivning. Verificeret live på eksakt SHA.
- `56c4ba5`: supplerende research uden at ændre tekst/billeder. Dateret belæg
  kontrolleres før nye billedudgifter. Verificeret live på eksakt SHA.
- `7b21c42`: læs datePublished fra identificeret Article/NewsArticle JSON-LD,
  afvis uvedkommende/modstridende/fremtidige datoer. Lokal dato uden timezone
  bevares med kalenderdagspræcision. Genhent gemte kilders metadata.
  Vercel `dpl_68fThX21PZ92ieaVrS6Agcm5EhUT` READY med eksakt SHA og produktionsalias.
- `0ef8dce`: fulde fejlrapporter gemmes særskilt fra godkendt evidens; faktatjekket
  vælger dateret belæg uden at ignorere konflikter. Én afgrænset faktarettelse kan
  genoptage gemt tekst. Gamle versioner og modelresultater bevares, eksisterende
  billedbytes genbruges først efter ny visuel kontrol, og alle slutkontroller
  køres igen. Reserve-worker springer allerede optagne CMS-identiteter over.
  Vercel `dpl_5tYEqpuhfEvE5MayNweSa41r8ztW` READY, eksakt SHA og produktionsalias
  verificeret. Retry `liv-restart-20260912-fact-revision-08` kører.
- `a9be48d`: genoptag arkiveret faktarettelse før nye betalte gate-kald. En
  afgrænset rettelse af dokumenteret forkert alt/caption bevarer pixels, credits,
  URL'er og HTML uden for beskrivelsen. Ny visuel kontrol kræves; den gamle
  afvisning overskrives ikke. Vercel `dpl_9DsH3F64Q937mUptCD1qC2Yh1Cf6` READY
  med eksakt SHA og produktionsalias. Retry
  `liv-restart-20260912-description-repair-09` returnerede HTTP 200 facts_revised.
- `a6a253e`: forklar det samlede krav om faktisk citeret belæg fra to daterede
  værter til faktatjekkeren. Ingen ændring af validator, ingen opdigtede citater
  eller ekstra verifier-løkke. 51 berørte tests, typecheck og build består.
  Vercel `dpl_8nEVRe4o2fYXsF8qm2agMKmeuQ2E` READY med eksakt SHA og alias.
  Retry `liv-restart-20260912-corroboration-10` fandt den særskilte Bo-overdrivelse.
- `e40fab4`: vellykkede fortsættelser bevarer forsøgsbudgettet. Højst to
  faktarettelser, hvor anden rettelse skal vedrøre en ny, særskilt påstand og
  matche forælderversionen. Gamle fejl/patches kan ikke genbruges som ny anledning.
  Ny billedkontrol og alle normale gates kræves stadig.
- `8a8695b`: databasefelters rækkefølge er ikke en indholdsændring. Den første
  produktionstest blev afvist uden betalt rettelse, fordi JSON-feltrækkefølgen
  varierede. Sammenligningen er nu værdibaseret og regressionstestet. Præcis
  versionsbundet faktarapport kan genfindes i den bevarede retry-audit.
  Vercel `dpl_DG3ip8Yzv9qFR6W6UdwLKmBz8LDY` READY med eksakt SHA
  `8a8695b59275bfd514a359b9f63573679beb71b4` og produktionsalias verificeret.
  Retry `liv-restart-20260912-value-equality-12` returnerede `facts_revised`.
- `807ac2a`: ukendte datoer på ikke-citerede kontekstkilder er tilladt i rapporten;
  faktiske citater kræver fortsat daterede kilder. Genbrug af eksakt, frisk
  serverrapport undgår en ny betalt kontrol af samme tekst. 12 påstande bestod.
  Retry `liv-restart-20260912-uncited-context-13` gemte og læste den danske
  Webflow-kladde tilbage. To billedkontroller viste derefter optimizer-mismatch.
- `139fdb5`: CMS-billeder valideres som enten de oprindelige bytes eller den
  præcise derivative fra den eksisterende billedoptimering. Captions/alt og
  distinkte motiver kræves stadig. Snæver læsning af egne optimerede aktiver
  validerer bucket, token, generation og indholdsdigest. Ingen nye pixels gemt.
  Vercel `dpl_AjNb2ae9NVQWmUULAyc3RWyP5fLa` READY med eksakt SHA
  `139fdb55f2b7c2d2239179dfe22d7cc0d936c9c5` og produktionsalias.
  `/api/cron/liv-prepare` returnerede `recovered_ready_draft` kl. 10.54.
- `422b7ec`: schema-bevidst valgfrit udgivelsesdatofelt; sikre fejlspor i køen;
  autentificeret cover-only API med idempotens, mutation-hold, uændret body og
  bevaret tidligere payload/checkpoint/evidens. Separat mobilcover kan ændres
  ved eksplicit valg og byteverificeres også efter CMS-CDN-omskrivning.
  989 tests i 50 Liv-testfiler, typecheck, scoped lint og build består.
  Vercel `dpl_9ittJi6b5jJs9LadtQghjcKQMDkq` READY på eksakt SHA
  `422b7ec4578926880c71fd78099890fbae13eba3`, alias verificeret.
  Cover-request `liv-cover-alle-guds-farver-20260912-01` er sendt via
  `/api/liv/operations/cover-revision`. Det er ikke i sig selv et publiceringsbevis.

Det oprindelige udkast `4f5f2284-420d-4622-ac68-b42c0bc18ffd` og omskrivningen
`79b9c20d-4794-4618-9d8e-ecb0999ff53c` er bevaret. Ingen kopi-/kvalitetskontrol
er slået fra. Omskrivningen er afsluttet; mediejobbet
`908acde44f747dd28aad3f5134dbe4fa8a16af3cbb0ef410c49654888ce35535` har tre
gemte aktiver og gennemført visuel kontrol. Artikel og kladde er bevaret, og
normal CMS-optimering viser de to brødtekstbilleder i 1200 × 800 med height:auto.
Den planlagte serverkørsel kl. 11 forsøgte at levere, men fejlede før
publicering. Produktionsschemaet har intet `publish-date`-felt; publisheren
forsøgte alligevel at patche det. Udgivelse er derfor endnu ikke bekræftet.
Rettelsen skal bruge feltet alene, hvis det faktisk findes som DateTime,
ellers bevare planlagt dato internt og verificere Webflows `lastPublished`.
Eventfelterne `start-dato` og `slut-dato` må ikke bruges som erstatning.

Frederik har derefter valgt det officielle cover `Alle Guds Farver_01.jpg`
fra https://distribution.paradisbio.dk/film.asp?id=374 og udtrykkeligt beholdt
de to allerede producerede illustrationer i brødteksten. Kildebilledet er
3840 × 1920 JPEG og er hentet gennem den eksisterende sikre medielæser.
Pressepakken indeholder syv originale stills. Ingen fotografcredit er fundet
på siden; distributørkilden skal krediteres uden at opfinde fotograf eller
påstå verificeret licens. Et auditeret cover-only API-skift er under arbejde.
Samme CMS-ID, tekst, body-images og tidligere evidens er bevaret.

Coverrevision `26ce557526bafb90f7b612c8e968a1948a92d3e71d5d3d1390c9c9286669e44b`
returnerede HTTP 200 `cover_staged`. Faktisk billedkontrol med `gpt-5.6-luna`
bestod, alle 22 CMS-kontroller bestod, og mobilcoverets faktiske bytes blev
verificeret. Hero er 1920 × 1080 WebP, 296.770 bytes. Audit-readback bekræftede
uændret tekst og byte-for-byte identisk evidens for begge brødtekstbilleder.
Gentaget identisk cover-request returnerede samme kvittering uden ny skrivning.

Den normale `/api/cron/liv-daily-article` returnerede HTTP 200 `published`,
`publicationVerified: true` kl. `2026-09-12T09:28:25.715Z`, DK-locale
`67dbf17ba540975b5b21c225`. Dette var et autentificeret API-genforsøg efter
rettelsen, ikke en påstand om, at kl. 11-cron var lykkedes uden indgriben.
Offentlig artikel:
https://www.aproposmagazine.com/articles/alle-guds-farver-et-faellesskab-er-foerst-rummeligt-nar-det-forandrer-sig

Årsagen til illustrationsvalget var `article`/`Kultur`-klassifikationen, som
valgte illustration uden at søge pressebilleder. Dagsplanen foreskrev direkte
en kulturfeature og ingen stjerner. Artiklen er derfor ikke en anmeldelse;
andres anmeldelser er ikke blevet konverteret til en påstået egen filmvisning.

Medina-planen for 17. september er sat i gang med request-id
`liv-medina-20260917-plan-binding-01`. Det tidligere Remain-forsøg havde intet
artikelcheckpoint; tidligere arbejde bevares i audit. Det er endnu ikke en
færdig historie og tæller ikke med i beholdningen på fem.
