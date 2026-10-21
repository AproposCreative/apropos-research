# Stabil udgivelsesdato: diagnose og sikker reparationsgrænse

Undersøgt 2026-10-21. Dette notat dokumenterer læste kilder og afgrænser reparationen. Der er ikke ændret CMS-datoer, dato-bindinger eller sortering under undersøgelsen. Forward-capture-kode er overdraget til den samtidige kodeopgave; en plan eller en ny feltdefinition er ikke dokumentation for en færdig produktionsreparation.

## Konklusion

Den offentlige Article-JSON-LD bruger **CMS Created On** som `datePublished`. Topics-forsidernes synlige dato og Featured-listens rækkefølge bruger derimod **Published On**. De to værdier har forskellig betydning, og ingen af dem er automatisk dokumentation for artiklens oprindelige udgivelse:

- Created On er oprettelsen af CMS-elementet, eventuelt mens det var en kladde.
- Published On/`lastPublished` ændres ved senere publicering, herunder staging-publicering observeret i release-sammenligningen.
- En gemt `receipt.checkedAt` dokumenterer, at den bestemte artikel blev verificeret offentlig senest på tidspunktet. Den er ikke uden videre tidspunktet for første publicering.

Opret ikke en historisk originaldato ved at kopiere disse værdier ukritisk. Den holdbare løsning er en separat valgfri, kildeunderbygget originaldato, som ikke flyttes ved SEO-, billed-, lyd- eller oversættelsesopdateringer. Ukendt historik skal forblive ukendt.

**Vigtig API-fælde:** `lastPublished:null` sammen med `isDraft:true` er heller ikke bevis for en aldrig publiceret artikel. Webflows gældende model bruger samme tilstand for tidligere afpublicerede artikler; det dedikerede unpublish-endpoint nulstiller netop `lastPublished`. `isDraft:true` alene kan samtidig betyde kladdeændringer oven på stadig live indhold. En sikker forward-capture skal derfor have dokumenteret serveroprettelse og en ubrudt første-publiceringskæde, ikke blot en null-test. Kilde: [Webflows publiceringsændringer fra 2025](https://developers.webflow.com/home/changelog/2025/6/23), verificeret 2026-10-21.

## Hårde kildereferencer

Site: `67dbf17ba540975b5b21c180`. Articles collection: `67dbf17ba540975b5b21c2a6`. Articles template: `67dbf17ba540975b5b21c208`.

Native schema blev læst både i Designer og med `query_pages_schema_markup`. Begge locales har denne eksplicitte binding:

```json
"datePublished": "{{wf {&quot;path&quot;:&quot;created-on&quot;,&quot;type&quot;:&quot;Date&quot;} }}",
"dateModified": "{{wf {&quot;path&quot;:&quot;updated-on&quot;,&quot;type&quot;:&quot;Date&quot;} }}"
```

| Edition | Page locale ID (schema) | CMS locale ID (items) |
| --- | --- | --- |
| DA | `67dbf17ba540975b5b21c224` | `67dbf17ba540975b5b21c225` |
| EN | `690ca0f6b0d13d8788354153` | `690ca0f6b0d13d8788354156` |

Disse to slags locale-ID må ikke sammenblandes. Slugs er ikke tilstrækkelig identitet til skrivninger. Brug collection + item + CMS-locale, og kontrollér site/kanonisk URL særskilt.

Street Fighter, item `6acf781e73fc5cad8e209321`, havde i frisk offentlig HTML på både `/articles/street-fighter-2026` og `/en/articles/street-fighter-2026` `datePublished=2026-10-14T12:39:58.572Z`. Samtidig CMS-read viste `lastPublished=2026-10-20T14:04:09.087Z`. Native binding forklarer forskellen; det er ikke to uafhængige kilder til første publicering. Den eksisterende Review-footer kopierer Article-datoerne. Artikel-head-koden indeholder kun den scoped billedlayoutregel og er ikke datokilde.

Tidligere uafhængigt eksempel findes i `docs/editorial/WOLVERINE-CMS-SEO-AUDIT-2026-10-09.md`: schema-datoen stemte med CMS-oprettelsen, ikke seneste publicering.

## Synlig dato og sortering

Designer-kontrollen er også gemt i `measurements/2026-10-21-technical.json` under `designerBindingVerification`.

| Flade | Element | Bekræftet binding |
| --- | --- | --- |
| Topics template `67dbf17ba540975b5b21c213` | Hero-datotekst `21da636a-b814-9994-4fb8-84b2a66475c7` | Text → Published On |
| Topics hero | Wrapper `21da636a-b814-9994-4fb8-84b2a66475bd` | Published On, descending, limit 1, offset 0 |
| Topics sekundære hero | Wrapper `21da636a-b814-9994-4fb8-84b2a6647627` | Published On, descending, limit 1, offset 1 |
| Featured page `67dbf17ba540975b5b21c218` | Wrapper `99538792-0e39-544f-40b4-d2f89d97d094`, DOM ID `articles-list` | Published On, descending, pagination 25 |

Sorteringens læste indstilling er `[{"fieldSlug":"published-on","direction":"descending"}]`. De konkrete tidligere dato-/rækkefølgeændringer er dokumenteret i `PRESS-PRODUCTION-DEPENDENCY-2026-10-20.md` og `measurements/2026-10-20-profile-release-comparison.json`.

## Hvorfor eksisterende `publish-date` ikke bør aktiveres

`lib/liv/publish-verified.ts` undersøger allerede et valgfrit DateTime-felt med slug `publish-date`. Hvis feltet findes, kan det blive skrevet før publicering ud fra callerens `publicationDate`; det er ikke en write-once originaldato.

- `lib/liv/deliver-ready.ts` sender `slot.explicitPublication?.requestedAt ?? publicationTime(day)`. Sidstnævnte er planlagt kl. 10 København.
- `lib/editorial/submission-publication.ts` sender `publication.publishAt` for nye targets. Den kan være ønsket eller planlagt tid.
- `lib/liv/run-daily.ts` har et kald uden `publicationDate`.
- Oversættelser, cover-oprydning og lydmarkering har også publiceringsveje (`lib/webflow/article-translation.ts`, `lib/liv/published-cover-cleanup.ts`, `lib/podcast/mark-webflow-audio-version.ts`).

Derfor skal en ny originaldato have en separat kontrakt, eksempelvis `original-publication-at`. Det nuværende `publish-date` skal ikke oprettes som genvej. Der blev ikke fundet et eksisterende stabilt artikel-publiceringsfelt; Start dato/Slut dato er eventdatoer.

SEO-backenden har en separat upræcis datakilde: `lib/seo-engine/auto-seo-worker.ts` sender `item.lastPublished` som `publishDate`; `cms-contract.ts`, `jsonld.ts` og `review-schema.ts` fører den videre. Det er ikke den native JSON-LD, der aktuelt står i Webflows offentlige HTML. Begge flader skal få den samme præcise semantik.

## Historiske kvitteringer: hvad der faktisk er verificeret

Den eksisterende Apropos MCP-forbindelse viste 13 brugerafgrænsede submissions, `boundedTo:100`, `complete:true`. Fire aktuelle artiklers **gemte nuværende** publiceringskvitteringer blev læst. Ingen privat artikeltekst, brugerkonti, medieobjekter eller rå kvitteringer er gemt her.

| Offentlig artikel / CMS item | Gemt verifikationsinstant (UTC) | Hvad det beviser |
| --- | --- | --- |
| Barsel, `6ad7aa27843abbb71024e79f` | `2026-10-21T07:36:00.371Z` | Den gemte aktuelle revision blev verificeret offentlig. |
| Cæcilie Norby, `6ad60a14073bc1351836e889` | `2026-10-19T12:16:34.542Z` | Den gemte aktuelle revision blev verificeret offentlig. |
| The Whisper Man, `6ace000e6400e97c7469979a` | `2026-10-13T11:21:50.840Z` | Den gemte aktuelle revision blev verificeret offentlig. |
| Kontrapunkt, `6accb9d4a4cfa06c22daba31` | `2026-10-12T10:45:02.282Z` | Den gemte aktuelle revision blev verificeret offentlig. |

Alle fire kvitteringer havde `publicationVerified:true` og et bestemt item-ID. `getSubmissionStatus()` i `lib/editorial/submissions.ts` returnerer den gemte hovedrecord; det foretager ikke en ny publicering eller opfinder en frisk `checkedAt`. Men hovedrecordens `publication` kan blive erstattet ved senere publicering. `prepared.proof.draftConfirmed` er heller ikke i sig selv bevis for, at artiklen aldrig før har været offentlig. Der er derfor endnu ikke et sikkert grundlag for at kopiere disse timestamps som **første** publicering.

Barsel er ikke i de læste 20. oktober site-/release-snapshots, men fravær fra et sitemap-snapshot beviser ikke, at URL'en ikke kunne være publiceret. Den findes i 21. oktober-auditen. Street Fighter var ikke blandt de brugerafgrænsede submissions; det beviser ikke, at der ingen historisk serverkvittering findes andetsteds.

De målrettede næste historiske læsninger er eksisterende private serverregistre:

1. `editorialSubmissions/{id}/versions/{revision}` for den første offentliggjorte revision og identiteten før publish. De aktuelle hovedrecord-kvitteringer er kun kandidater til opslag.
2. `editorialSubmissions/{id}/publicationApprovals/{preparedHash}` til korrelation af indhold/intent. `publishAt` her er ikke faktisk publicering.
3. Livs `livDelivery/manifest`, arkiverede `receipt-{day}` og `livDailyArticles/daily-{day}`. Skeln `checkedAt`/færdiggørelse fra planlagt dag.

Den nuværende MCP-statusflade eksponerer ikke versions-/approvalhistorikken. Den kræver i stedet målrettet server-side admin-læsning gennem den eksisterende autoriserede forbindelse. Ingen credentials skal kopieres, logges eller skrives til repoet. Gamle publiceringsdage må ikke fyldes fra eventdato, slug, oprettelsesdato eller seneste genpublicering.

Efterfølgende parallel server-side diagnose fandt syv publicerede submissions og 16 Liv-deliverykvitteringer. Der blev rapporteret `checkedAt`, men ingen gemt faktisk `lastPublished` fra første publicering. Barsels hovedkvittering er en genpublicering 21. oktober. Dette styrker grænsen ovenfor: tabellens aktuelle kvitteringer må ikke backfilles som originaldato. Kodeopgaven dokumenterer sit eget præcise server-readback separat.

## Minimal forward-fix og acceptkriterier

Kodeopgaven skal registrere første dokumenterede publicering uden at svække eksisterende editorial checks, lease, felt-hash, exact locale, content readback eller timeout-recovery:

1. Benyt et separat valgfrit `original-publication-at` og en privat write-once kvittering pr. site/collection/item/locale med kilde og bevis. Læs feltdefinitionen før aktivering; ingen massebackfill.
2. Fang kvalificerende nye artikler gennem den serverejede publiceringssti. Et almindeligt published-webhook eller en først-observeret gammel artikel er ikke nok: staging kan også ændre `lastPublished`. Ukendt historik skal eksplicit springes over.
3. Gem faktisk bevis fra den første verificerede publicering. `checkedAt` er en verifikationsgrænse, og scheduled/requestedAt er en intention. Hvis præcis provider-tid bruges, skal den være korreleret med det kendte første publish og korrekt locale, og ikke en samtidig senere publicering.
4. Bevar allerede kendt originaldato ved gentagelser, metadataændringer, oversættelser og medierettelser. En publiceret artikels dato må ikke blive 'i dag', blot fordi feltet er tomt.
5. Hold `verifyLiveLivArticle()` til read-only recovery efter et mistet svar. Tilføj ikke et nyt skjult republish eller en datoændring, som bryder den oprindelige content-hash og får et allerede gennemført publish til at fremstå fejlet.
6. Test ny første publicering, gentaget webhook, ukendt gammel artikel, staging-event, oversættelse, provider-timeout/readback, hashændring og eksisterende originaldato. Testdata skal være isoleret i `RAGE_STORAGE_DIR=./tmp/vitest-rage`.

Forward-capture kan leveres, mens historik er uafklaret. Den må ikke beskrives som fuld reparation af alle historiske Topics-kort og Featured-sortering.

## Senere bindingsskift: præcis supported surface

Når et verificeret datagrundlag er til stede, er det minimale Designer-skift:

- Topics-template → det identificerede dato-Text Block → Settings → Text (nu Published On) → det verificerede nye DateTime-felt. Bevar eksisterende datoformat og al styling.
- For hver identificeret Collection List ændres kun `sort`. Den dokumenterede Designer API er `collectionList.setSettings({sort:[{fieldSlug:'original-publication-at',direction:'descending'}]})`, efter `searchAvailableFields()` har bekræftet feltets `canSort`.
- Sæt ikke `source` eller `queryMode` under sorteringsændringen; det kan nulstille filtre/pagination. Legacy-Text Block-bindingen eksponeredes ikke som en sikkert skrivbar CMS-property i den læste raw MCP-flade; UI er den verificerede præcise vej.
- Begge native locale-schemata skal ændres koordinert. Undgå tom `datePublished` fra manglende felt. En fallback til Created On er stadig semantisk forkert. En native conditional/udeladelsesregel skal verificeres før bred aktivering.

Historiske ukendte datoer må ikke flytte alle gamle artikler nederst eller skjules for blot at få et release-check grønt. Før skift kræves eksplicit strategi for ukendte værdier, dækningsrapport og sammenligning af den tilsigtede rækkefølge. Kontrollér DA/EN, Topics, Featured og schema efter to separate staging-publiceringer; dato og rækkefølge skal være stabile. Endelig production-release ejes af hovedopgaven.

## Koordinering

Shared surfaces er `lib/liv/publish-verified.ts`, submission-publication, webhook/locale-publicering, CMS-feltdefinition og Articles/Topics/Featured-templates. Root har sendt koordinering til Liv-opgaven. Denne diagnose har ikke ændret Livs cadence, indhold, kø, Instagram, auth, dependencies eller deploymentfiler.

Officielle kontrakter: [Webflow Collection List settings](https://developers.webflow.com/designer/reference/element-settings/collection-list-settings), [Webflow staged items](https://developers.webflow.com/data/reference/cms/collection-items/staged-items/list-items), [Google Article-datoer](https://developers.google.com/search/docs/appearance/structured-data/article).
