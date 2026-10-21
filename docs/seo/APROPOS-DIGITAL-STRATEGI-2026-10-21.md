# Apropos: synlighed, troværdighed og kvalificerede læsere

Beslutnings- og leveranceplan, 21. oktober 2026. Grundlag: frisk offentlig kontrol af alle 524 sitemap-URL'er, faktisk SEO-kørsel, eksisterende GA4-måling og primære søgemaskinevejledninger. Planen omfatter SEO, AEO, AI-søgning, strukturerede data og Wikipedia. Den ændrer ikke Livs udgivelsesplan.

## Anbefalingen

Apropos skal være let at finde, forstå og citere som et selvstændigt dansk kulturmedie med holdning, gratis adgang og uden reklamer. Ambitionen om at blive et af Danmarks førende uafhængige kulturmedier skal vises gennem stærke artikler, kilder, kontinuitet og uafhængig omtale. Den skal ikke indsættes som en udokumenteret førerposition i metadata eller schema.

Den bedste investering nu er at gøre det eksisterende setup pålideligt og entydigt: samme værk, sprog, forfatterrolle og udgivelsesdato i artikel, oversigt, metadata og markup. Derefter styrkes de redaktionelle emneområder og deres distribution. Flere skematyper eller automatiske omskrivninger er ikke i sig selv et fremskridt.

Google kræver ikke særlige AI-filer eller et særligt AI-schema. Crawlbarhed, nyttigt originalt indhold, interne links og markup, der svarer til den synlige side, gælder også for AI-søgning. [Google, AI features](https://developers.google.com/search/docs/appearance/ai-features).

## Verificeret udgangspunkt

| Område | Faktisk observation | Betydning |
|---|---|---|
| Offentlig teknik | 524/524 sitemap-URL'er svarer HTTP 200 og har titel, beskrivelse, én H1 og selvhenvisende canonical. Ingen fundet noindex/snippetblokering. | Grundlaget er godt; dette beviser hverken Google-indeksering, hurtig mobiloplevelse eller redaktionel kvalitet. |
| Article | Alle 438 artikel-URL'er har JSON-LD, som kan parses. Locale, URL, forfatter, udgiver og datoer er udfyldt. | Felternes tilstedeværelse er ikke bevis for, at alle værdier er korrekte. |
| SEO-drift | Den naturlige 21/10-kørsel bevarede Barselsnovellens metadata og verificerede den offentlige side, men stoppede på en forældet kandidat med mere arbejde i køen. | Den modstridende stopinstruks er rettet i den eksisterende tidsplan og læst tilbage. Næste naturlige kørsel mangler stadig. |
| Google-data | Dagens Barsel-opgave fik HTTP 200 fra GSC og GA4, begge uden rækker for artiklen. | Adgangen virkede i den konkrete kørsel; trafik og effekt er ukendt for den opgave. |
| AI-trafik | GA4: 27 genkendelige AI-sessioner, heraf 12 engagerede, i 20/9–17/10 mod 20 og 11 i 23/8–19/9. | Små tal og et minimum af målbar AI-trafik. Det er ikke dokumentation for effekt af en bestemt ændring. |
| AI-citater | Den faste protokol med ti spørgsmål er klar, men ikke kørt på uafhængige svarflader. | Resultatet er ukendt, ikke nul. |
| Webflow AEO | Bottrafik og promptoversigt svarer 403, fordi AEO analytics-adgangen mangler. | Ingen nye abonnementer er købt. Dataene kan ikke bruges som en verificeret baseline. |

Morningscore blev åbnet 21/10 kl. 16:10 UTC, men returnerede Cloudflare HTTP 522: forbindelsen til Morningscores server udløb. Det er en leverandørfejl ved dette forsøg, ikke en måling af Apropos. Derfor indgår Morningscores aktuelle score, Search Consoles indeksstatus for hele sitet og feltdata for Core Web Vitals ikke som verificerede resultater i denne audit.

## Første konkrete leverance

1. **SEO-tidsplanen er rettet live.** Den genbruger samme dags requestId, fortsætter efter sikre `article_changed`-skips inden for de eksisterende grænser og slår kun faktisk overtagne opgaver op. Dagligt kl. 09, højst tre claim-kald, højst to opgaver og alle eksisterende write-/budgetværn er bevaret. Gemning og genåbnet readback er dokumenteret. Konfiguration er ikke det samme som en verificeret fremtidig kørsel.
2. **Om- og presseændringerne er udgivet og verificeret live i begge sprog.** Fire engelske Om-tekstfelter følger nu den godkendte danske profil. De fire sider bruger samme organisation-ID og korrekte locale-URL'er. Presse-schema beskriver de synlige fakta, pressekontakten og det faktiske PDF-pressekit. Ingen grundlæggelsesdato, priser, ratings eller førerposition er opfundet. Fuld sammenligning af 524 staging-/produktionspaths viste kun de forventede ændringer. Efter publiceringen matchede alle fire ændrede sider den godkendte version, og tolv kontrolsider bevarede datoer, rækkefølge, billeder og scripts. Se releasekontrollen. Desktop og mobil blev visuelt kontrolleret; mobilen havde ingen vandret overflow. Fælles menuer og enkelte øvrige EN-labels har fortsat lokaliseringsrester, som hører til næste oprydning.
3. **Wikipedia-kildepakke og neutral lokal kladde er lavet.** Den er endnu ikke egnet til anbefalet artikeloprettelse; se særskilt afsnit nedenfor.

## Prioriteret arbejde

Tidsvinduerne er en anbefalet rækkefølge, ikke et løfte om baggrundsarbejde eller bestemte placeringer. Implementering sker i små udgivelser med offentlig readback. Samme fejl skal rettes i den fælles årsag, hvor det er muligt.

| Prioritet og vindue | Leverance | Ansvar og accept |
|---|---|---|
| P0 · første uge | Verificér den rettede SEO-kørsel. Vis køalder, antal kvalificerede opgaver, færdige/bevarede/ændrede opgaver og undtagelser særskilt. | Teknisk SEO. Tre på hinanden følgende naturlige kørsler skal afslutte deres afgrænsede arbejde uden operatørhjælp; ventende opgaver må ikke skjules bag en grøn status. |
| P0 · første uge | Ret anmeldelsestypen: Street Fighter er film på dansk, men bliver VideoGame på engelsk, fordi ordet gaming i meta påvirker klassifikationen. | Fælles Webflow-template med Liv-koordinering. Type vælges fra eksplicit, sproguafhængig taksonomi. Ændring af en metabeskrivelse må aldrig ændre værktypen. Test film, serie, spil, musik og tvetydige tilfælde i begge sprog. |
| P0 · første uge | Ret dato-/sorteringskilden på topic-kort og Featured. Designer-inspektion bekræfter systemfeltet Published On på kortene og Published On, nyeste først, i Featured. Det kan ændres ved genpublicering. | Webflow. Bevar eksisterende data, fastlæg en holdbar original udgivelsesdato med dokumenteret kilde, og ret de to bindinger. Ingen gættede datoer, eventdatoer eller oprettelsesdatoer som erstatning. To staging-publiceringer skal bevare datoer/rækkefølge. |
| P1 · uge 1–2 | Gennemgå de tre bekræftede danske tekster i engelsk artikeludgave: Danielle Dahlhus, Kvinde ukendt og Street Fighter. | Redaktion + teknisk SEO. Hele oversættelsen og dens fakta kontrolleres. Metadata-only-flowet må ikke oversætte brødtekst i smug. Publicér kun de konkrete godkendte locale-versioner. |
| P1 · uge 1–2 | Rens 11 schema-headlines med bogstavelige HTML-entiteter og kontrollér de 41 indholdsbilleder uden ikke-tom alt på 12 danske og én engelsk artikelside. | Template-/indholdsejer. Markup skal have korrekt læsbar tekst. Alt skal beskrive det konkrete billede; dekorative billeder kan have tom alt. Ingen automatisk nøgleordsfyld eller ukontrolleret masseændring. |
| P1 · uge 1–2 | Afklar forfattermodellen. 110 artikel-URL'er beskriver Liv Brandt som Person; otte forfattersider mangler profildata. | Redaktion + Liv-opgave. Mennesker, redaktionel organisation og AI-persona skal beskrives sandfærdigt. Ingen opdigtede biografier eller automatisk Person-schema til alle. Afstem også offentlige udsagn om menneskelig godkendelse med den faktiske proces. |
| P1 · uge 1–2 | Afklar sitemap-udeladelsen af Andreas Christensens to offentlige forfattersider samt rigtig indeksstatus og mobilhastighed. | Teknisk SEO. Kontrollér tilsigtet sitemap-valg, Search Console og feltdata; 200-status alene er ikke nok. |
| P1 · uge 1–2 | Ryd op i engelske navigationslinks og labels, blandt andet danske sektion-links og presse-labels, samt servicesidernes generiske H1. | Webflow-komponentejer. Følg sprogudgaven hele vejen, og genbrug fælles komponenter. Bevar layout og eksisterende URL'er. |
| P2 · uge 2–4 | Styrk de tre eksisterende sektioner Musik, Film/serier og Kultur med få kuraterede indgange, centrale værker og relevante interne links. | Redaktion. Hver indgang skal løse en konkret læseopgave og lede til eksisterende stærke artikler. Bevar magasinets visuelle udtryk; ingen tynde SEO-kategorier. |
| P2 · uge 2–4 | Udgiv en kort, præcis redaktionel metode: reklamefrihed, finansiering, anmeldereksemplarer, vurderingsskala, rettelser, interessekonflikter og ansvar ved AI. | Redaktion. Hvert udsagn skal være verificerbart i driften. Brug eksisterende sider eller en tydeligt linket metodeside; gentag ikke Om- og presseteksten. |
| P2 · uge 2–4 | Udvælg 10–15 artikler til et afgrænset forbedringsforløb ud fra faktiske forespørgsler, visninger og indholdsmangler. | SEO + redaktion. Bevar stærke tekster. Registrér præcis ændring, begrundelse og førmåling; de nuværende datatærskler og budgetter gælder. |
| P3 · dag 30–60 | Eftermål ændrede metadata efter 28 dage; opdel efter artikel, sprog og forespørgsel. | Analyse. Sammenlign GSC-visninger/klik/CTR/position og GA4-engagement med fulde perioder. Sæson, udgivelsesaktualitet og ændret søgeefterspørgsel skal fremgå. |
| P3 · dag 30–90 | Brug pressekit, stærke originalartikler og tydelige ekspertområder til relevante omtaler og citater. | Redaktion/presse via Liv. Ingen købte omtaler, partnerstempler, masseudsendinger eller fabrikerede links. Konkrete henvendelser udformes og sendes kun med relevant mandat. |

## Det automatiske setup

### Faktisk status efter P0-rettelserne 21. oktober

- Dagens afgrænsede SEO-batch er afsluttet med operatørhjælp: 11 kandidater
  kontrolleret, én eksisterende artikel bevaret og ingen ekstra CMS-skrivning.
  Den rettede tidsplan mangler stadig sin næste naturlige kørsel; tre vellykkede
  naturlige kørsler er fortsat acceptkravet.
- Den deterministiske anmeldelsestype er publiceret på Webflows fire
  produktionsdomæner, task `b72ce984-ccdd-4cbd-87e2-4bd5bbeabf72`.
  Den nye Collection List indeholder kun den aktuelle artikels Topics og er
  skjult. Browser-readback viser korrekt Movie, TVSeries, VideoGame og Book;
  ukendt medie får en konservativ type, og koncert-emnet opfinder ikke Event-data.
  De godkendte korte/lange kopiknaptekster på pressesiden er også live.
- App-release `290545ec5a7ce4967d670453a8353de4e0e55dea` er verificeret på
  `ai.aproposmagazine.com`. Den bevarer Webflows observerede publiceringstid i
  varige kvitteringer. Eksisterende autentificerede læseflows og gemte data er
  kontrolleret efter deploy. Den nye skrivesti afventer en faktisk autoriseret
  publicering; der er ikke lavet en kunstig artikel til dette formål.
- **Dato-/sorteringspunktet er ikke fuldt løst.** Historiske kvitteringer gemte
  ikke en sikker original udgivelsesdato, og Webflows Created On/Published On kan
  ikke bruges som erstatning. De offentlige datobindinger og artikelrækkefølgen er
  derfor bevaret. Kvitteringsrettelsen giver bedre fremtidigt bevis, men er ikke
  en originaldato eller en færdig ændring af Topics/Featured.

Detaljer og næste accepttrin står i `SEO-OPERATIONS-REPAIR-2026-10-21.md`,
`REVIEW-TYPE-RELEASE-CHECK-2026-10-21.md`,
`PUBLICATION-RECEIPT-EVIDENCE-2026-10-21.md` og
`PUBLICATION-DATE-REPAIR-2026-10-21.md`.

Det eksisterende forløb bevares:

**Publicering → webhook/discovery → versionsbundet SEO-kø → ChatGPT-vurdering → gemt forslag → kontrolleret anvendelse → offentlig verifikation → eftermåling.**

- Publiceringskontrol ser på både udfyldte og tomme SEO-felter. En god titel skal bevares; en ændring skal kunne begrundes i artikelindholdet.
- Google-forbedringsmuligheder går i samme kø. De er kandidater, ikke automatisk dokumenterede rettelser. Performancevurderinger kræver sammenlignelige komplette perioder, tilstrækkelige visninger, frisk evidens og cooldown.
- Der er én metadata-skriver og ingen ekstra betalt backend-AI. Schemakoden i SEO-motoren er ikke automatisk publiceret i Webflow; den aktive Webflow-markup skal verificeres særskilt.
- Den nuværende kørsel er kl. 09. En artikel publiceret kl. 10 kan derfor vente cirka 23 timer, længere ved kø. Et fremtidigt servicemål skal dimensioneres efter antal udgivelser og sprog, ikke loves ud fra et aktiveret flag.
- Tre claim-kald kan blive brugt på tolv sikre skips. Hvis det gentager sig, forbedres udvælgelse og synlig køstatus først. Der oprettes ikke nye requestId'er for at omgå grænserne.
- Ingen ændring af overskrift, brødtekst, karakter, slug, byline, billeder eller layout gennem metadata-flowet. Undtagelser får en konkret løsningsopgave, ikke en evig “kræver opfølgning”-etiket.

## Schema, AEO og indhold

Brug ét konsistent organisation-ID, korrekte sprogudgaver og sidernes egne canonical-URL'er. `Article` beskriver artiklen; `Review` beskriver en faktisk anmeldelse af et identificeret værk med den viste karakter. Datoer skal beskrive udgivelse og væsentlig opdatering, ikke den seneste tekniske genpublicering. `ProfilePage` og forfatterdata skal afspejle den reelle ansvarlige identitet. [Google Article](https://developers.google.com/search/docs/appearance/structured-data/article), [Organization](https://developers.google.com/search/docs/appearance/structured-data/organization), [ProfilePage](https://developers.google.com/search/docs/appearance/structured-data/profile-page).

Gør de vigtige svar lette at forstå i selve teksten: hvilket værk, hvem der har skabt det, hvad vurderingen bygger på, og hvorfor det er kulturelt interessant. Brug naturlige overskrifter, synlige kilder og relevante interne links. Tilføj ikke generiske FAQ-blokke til alle anmeldelser for en kunstig AEO-score.

Tillad søgecrawl, hvor det er ønsket, og kontrollér senere faktiske crawler-logs/CDN-adgang. OAI-SearchBot handler om søgning; GPTBot handler om træning og er et særskilt valg. Den aktuelle robots-kontrol beviser ikke adgang fra alle faktiske bot-IP'er. `llms.txt` er et supplement og ikke et krav eller et løfte om omtale. [OpenAI bots](https://developers.openai.com/api/docs/bots).

## Måling og brug i redaktionen

| Primært mål | Definition | Baseline og beslutning |
|---|---|---|
| Kvalificeret organisk tilgang | GSC-klik fra relevante søgninger, med brand og øvrige søgninger adskilt; understøttes af GA4-landingsengagement. | En samlet aktuel baseline skal hentes. Ingen opfundet vækstmålsætning før den foreligger. Prioritér konkrete søgeintentioner og indhold. |
| Engagerede AI-besøg | GA4-engagedSessions fra eksplicit genkendte AI-kilder i afsluttede 28-dages perioder. | 12 mod 11 i seneste gemte sammenligning. Ukendte referrers og Google AI-søgning kan ikke isoleres her. Vis også sessions som volumen. |
| Uafhængige AI-citater | Andel gennemførte svar med kildehenvisning til Apropos, særskilt pr. platform og fast spørgsmålssæt. | Endnu ikke målt. Brug friske søgeaktiverede samtaler uden at nævne Apropos; gem svar og kilder. Manglende svar/adgang er ikke nul. |

Driftsværn måles ved siden af: køalder, offentlig verifikationsgrad, uløste undtagelser, schemafejl, sprogfejl, mobilfeltdata og utilsigtede redaktionelle ændringer. Ingen kunstige artikelændringer for at få et højere aktivitetsmål. Et kontrolpanel skal vise både “implementeret”, “publiceret” og “verificeret”.

Anbefalet arbejdsvane: ugentlig kort prioritering af de få vigtigste fejl og artikler; månedlig effektgennemgang med hele dataperioder. Genbrug den eksisterende automation ved senere måleudvidelser. Der er ikke oprettet en ny overvågning eller lovet arbejde efter denne samtale.

## Wikipedia

En neutral kladde og kildematrix er gemt. Det undersøgte materiale giver endnu ikke tilstrækkeligt grundlag til at anbefale en selvstændig offentlig artikel om den aktuelle udgivelse.

Ejeren har nu afklaret, at det nuværende Apropos Magazine er et selvstændigt medie startet i 2025. Det er ikke en videreførelse af det Apropos, som Oliver Enné og Danni Riddertoft grundlagde i 2011. Omtalen af det tidligere medie må derfor ikke bruges som dokumentation for det nuværende. Startåret 2025, tilknytningen til Apropos Live og ejerskabet af EU-varemærket Apropos Live er her brugeroplyste fakta, som endnu kræver relevante offentlige kilder til en Wikipedia-artikel. Selskabets start i 2016 er ikke magasinets grundlæggelsesdato.

Næste trin er derfor konkret: find substantiel uafhængig omtale af det aktuelle medie fra 2025, udvid kun med kildebelagte fakta, og søg en uafhængig vurdering med åben oplysning om tilknytningen til Apropos. Apropos Live behandles som en særskilt identitet; et varemærke beviser ikke i sig selv magasinets notabilitet. Dansk Wikipedia fraråder at skrive om egen virksomhed og nævner Efterspurgte artikler som en mulig vej til uafhængige skribenter. Det er ikke en garanti for optagelse. En Wikipedia-side må ikke fungere som reklame eller bygges på konstrueret notabilitet. [Wikipedia: Selvbiografier](https://da.wikipedia.org/wiki/Wikipedia:Selvbiografier), [Verificerbarhed](https://da.wikipedia.org/wiki/Wikipedia:Verificerbarhed).

## Evidens og accept

- `TECHNICAL-AUDIT-2026-10-21.md` og `measurements/2026-10-21-technical.json`: offentlig kontrol med begrænsninger og konkrete URL'er.
- `AUTOMATION-AUDIT-2026-10-21.md`: program, webhook, faktisk cloud-kørsel, 56 beståede isolerede tests og resterende driftskrav.
- `SEO-SCHEDULE-RECEIPT-2026-10-21.json`: præcis gemt prompt før/efter; ingen gentagne godkendelser eller nye budgetter.
- `PROFILE-SCHEMA-RELEASE-CHECK-2026-10-21.md`: faktisk staging-/produktionsstatus. En gemt ændring er ikke automatisk live.
- `AI-VISIBILITY-MEASUREMENT.md` og `measurements/2026-10-20-status.md`: måledefinitioner og GA4-baseline.
- `WIKIPEDIA-RESEARCH-2026-10-21.md` og `output/wikipedia/apropos-magazine.da.wikitext`: kilder og afgrænset lokal kladde, ikke en publiceret Wikipedia-side.

Planen er færdig, når de konkrete leverancer er verificeret efter deres acceptkriterier. En høj værktøjsscore, valid JSON eller en vellykket deployment er ikke bevis for, at Apropos bliver anbefalet af en AI-søgemaskine.
