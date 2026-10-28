# Kontrol af de ti nyeste publicerede artikler

Kontrolleret 28. oktober 2026 kl. 17.28 Copenhagen. Kun læsende kontrol. Ingen CMS-, artikel-, publicerings- eller produktionsændringer og ingen betalt AI.

Udvalg: de ti nyest oprettede danske CMS-artikler, der aktuelt er publiceret, i samme rækkefølge som artikeloversigten. Ikke sorteret efter lastPublished, som ændres ved billedopdateringer. Historisk førsteudgivelse er ikke verificeret for alle ti; Girls er særskilt kontrolleret mod publiceringskvitteringen.

## Resultat

- 10/10 HTTP 200, ét H1, dansk sprog, unik titel og metabeskrivelse, selvrefererende canonical og tilstedeværelse i sitemap. Ingen noindex i meta/header eller blokering af disse sider i robots.txt. Dette beviser ikke faktisk Google-indeksering.
- 10/10 har parsebar Article JSON-LD med matchende overskrift/URL og forfatter. Datoernes semantik er ikke dermed godkendt: Girls har en bekræftet datofejl. Ingen komplet Google Rich Results-test udført.
- Alle ti tekster er læst for sammenhæng med titel, meta, stjerner og billedtekster. SEO- og OG-titel/beskrivelse stemmer med CMS på alle ti.
- 49 billedroller målt på faktiske offentlige bytes og dimensioner; 44 roller består. Tre fejlroller på Barsel (to unikke PNG-filer), to på Girls. 8/10 artikler overholder dermed hele billedreglen. Alle ti har mindst to forskellige body-URL’er, captions og indlæste billeder.
- Mobil 390×844/DPR3 og desktop 1440×1000/DPR1 kontrolleret i Chromium: ingen vandret overflow eller uindlæste synlige artikelbilleder. Ikke test på fysisk iPhone.

## Prioriterede rettelser

1. **Barsel: komprimér de to gamle PNG-filer**, og lav separat mobilcover gennem eksisterende originalbevarende flow. Det er den største konkrete filstørrelsesfejl.
2. **Fælles mobilskabelon: undgå at hente begge covervarianter.** En ekstra kold mobilkontrol registrerede både desktop- og mobilcover som HTTP-responses på alle ni sider med separate URL’er, allerede uden scrolling. Barsel har samme URL til begge og henter derfor én fælles stor fil. Brug korrekt responsive udvælgelse, eksempelvis picture/srcset, frem for kun CSS-skjulning. Dette er adskilt fra komprimering. De tidligere oplyste summer for Terminal List var synlige artikelbilleder, ikke samlet mobiltrafik.
3. **Girls: ret publiceringsdato fra en faktisk kvittering.** Offentlig JSON-LD angiver 2026-10-16T08:08:57.082Z, som er CMS createdOn. Frisk MCP-readback bevarer publikationskvitteringen fra 2026-10-23T13:08:49.244Z, verificeret 13:08:51.276Z. Alle ti datePublished-værdier matcher createdOn, så den fælles datokilde bør undersøges. lastPublished må heller ikke ukritisk bruges som førsteudgivelse.
4. **Deep Purple og Street Fighter: udfyld beskrivende alt-tekster** til cover, mobil og tre bodybilleder. Street Fighters coverkredit skal verificeres. Ingen opfundne billedbeskrivelser eller fotografnavne.
5. **Krediteringer og korrektur:** se artikeloversigten. Bevar kilder og eksisterende godkendelser. Street Fighters lange tankestreger er et konkret historisk fund; ingen masseomskrivning foretaget.

## Artikel for artikel

| Artikel | SEO og konkrete fund |
|---|---|
| [Anmeldelse: The Terminal List, sæson 1 på Prime Video](https://www.aproposmagazine.com/articles/anmeldelse-the-terminal-list-saeson-1) | SEO og billedlevering er i orden i de kontrollerede felter. Trailer ligger i CMS-feltet, ingen iframe i brødteksten. Prime Video-linket gav HTTP 503 fra kontrolmiljøet; tilgængeligheden er ikke endeligt verificeret. |
| [Boganmeldelse: Nogen der kender nogen](https://www.aproposmagazine.com/articles/anmeldelse-nogen-der-kender-nogen-laura-ringo) | God, konkret SEO og korrekt ønsket H1. Cover på flyttekasse og tre brødtekstillustrationer. Alle filer overholder grænserne. Laura Ringo indgår i meta; navnet kan eventuelt også indgå i SEO-titlen uden at ændre H1. |
| [Anmeldelse: Placebo i K.B. Hallen - et langt farvel](https://www.aproposmagazine.com/articles/placebo-sluk-telefonen-og-bliv-haengende-lidt-endnu) | God SEO, stjerner matcher CMS, tre illustrationer og coverkredit Mads Perch. Alle filer overholder grænserne. |
| [Anmeldelse: Deep Purple - Royal Arena](https://www.aproposmagazine.com/articles/deep-purple---58-ar-senere-er-der-stadig-ild-i-orgelet) | Ønsket titel og SEO er korrekte, og billeder er små. Alle fem billedroller har tom offentlig alt-tekst. Brødtekst bruger Webflows interne __wf_reserved_inherit. Billedteksterne er kun fotografkredit. Redaktionel korrektur: “segway” bør være “overgang”; “et orgel- og guitarduello” bør rettes. |
| [Anmeldelse: Lanterns, sæson 1. Hvornår bliver det sejt?](https://www.aproposmagazine.com/articles/lanterns-saeson-1-anmeldelse-hbo-max) | God SEO og stjerneoverensstemmelse. To forskellige brødtekstbilleder og korrekt trailerfelt. Billedlevering overholder grænserne. |
| [Jeg gik på barsel og endte i en religiøs uldsekt](https://www.aproposmagazine.com/articles/jeg-gik-paa-barsel-og-endte-i-en-religioes-uldsekt) | SEO passer til den personlige klumme. Cover/mobile bruger samme PNG på 3.266.942 bytes, og kageillustrationen er PNG på 3.134.936 bytes. 6.824.280 bytes for ét synligt cover plus fire brødtekstbilleder, cirka 6,82 MB; ikke hele sidens trafik. Dette er ældre filer, som ikke er bragt gennem den nye regel. |
| [Cæcilie Norby på Gamle Scene: Jazz i rødt plys](https://www.aproposmagazine.com/articles/caecilie-norby-gamle-scene-anmeldelse-2026) | God SEO og billeder inden for grænserne. Begge billedtekster gentager “fotograf ikke oplyst”; fjern kun gentagelsen, ikke kildeoplysningen. |
| [Girls vender tilbage: At fylde 40 løser ingenting](https://www.aproposmagazine.com/articles/girls-vender-tilbage-hannah-40-voksenliv) | SEO beskriver en kulturkommentar korrekt, men publiceringsdatoen i JSON-LD er 16. oktober. Den dokumenterede publicering er 23. oktober. Begge bodybilleder er 1240px mod reglen 1200px, men kun 26/39 KB; lav prioritet for billedhastighed. Begge krediteringer gentager fotografnavnet. Historisk kommentar fra før remitændringen, ikke en ny anmeldelse. |
| [Street Fighter (2026)](https://www.aproposmagazine.com/articles/street-fighter-2026) | Metabeskrivelse og SEO beskriver anmeldelsen. Tom offentlig alt-tekst på fem billedroller, intet covercredit i CMS. Fire lange tankestreger i body og en i SEO-titlen strider mod den nye typografiregel, men er historisk tekst. Korrekturfund: “knuselske hænder”, “det er er”, “Den dag det lykkedes” og “en tur end af memory lane”. Forslag til H1 og SEO: “Anmeldelse: Street Fighter (2026)”. Alle billedfiler er små nok. |
| [The Whisper Man (Netflix)](https://www.aproposmagazine.com/articles/anmeldelse-the-whisper-man-netflix-2026) | God SEO, stjerner og billedlevering. Første billedtekst siger både “Foto: David Lee/Netflix” og “fotograf ikke oplyst”; kildebevis skal afgøre krediteringen, ikke et gæt. H1 kan eventuelt få “Anmeldelse:” for ensartethed, men det er ingen indeksfejl. |

## SEO-tekster kontrolleret mod indhold

### Anmeldelse: The Terminal List, sæson 1 på Prime Video

- SEO-titel: Anmeldelse: The Terminal List, sæson 1: 5 stjerner
- Metabeskrivelse: Chris Pratt genopliver videobutikkens actionhelt i The Terminal List på Prime Video. Frederik Kragh anmelder sæson 1 og giver fem stjerner.
- Canonical: https://www.aproposmagazine.com/articles/anmeldelse-the-terminal-list-saeson-1

### Boganmeldelse: Nogen der kender nogen

- SEO-titel: Boganmeldelse: Nogen der kender nogen | Apropos
- Metabeskrivelse: Anmeldelse af Laura Ringos Nogen der kender nogen: En morsom og skarp bog om boligjagt og klasse, der indimellem forklarer for meget. 4/6.
- Canonical: https://www.aproposmagazine.com/articles/anmeldelse-nogen-der-kender-nogen-laura-ringo

### Anmeldelse: Placebo i K.B. Hallen - et langt farvel

- SEO-titel: Placebo i K.B. Hallen: Anmeldelse af 30-års jubilæum
- Metabeskrivelse: Placebo fejrede 30 år i K.B. Hallen med nostalgi og telefonfri koncert. Men holdt nærværet hele vejen? Læs vores anmeldelse (3/6).
- Canonical: https://www.aproposmagazine.com/articles/placebo-sluk-telefonen-og-bliv-haengende-lidt-endnu

### Anmeldelse: Deep Purple - Royal Arena

- SEO-titel: Anmeldelse: Deep Purple - Royal Arena
- Metabeskrivelse: Deep Purple indtog Royal Arena med klassikere, rå energi og store orgelsoloer. Læs Apropos Magazines koncertanmeldelse og vurdering på 4 ud af 6 stjerner.
- Canonical: https://www.aproposmagazine.com/articles/deep-purple---58-ar-senere-er-der-stadig-ild-i-orgelet

### Anmeldelse: Lanterns, sæson 1. Hvornår bliver det sejt?

- SEO-titel: Lanterns sæson 1 anmeldelse: Hvornår bliver det sejt?
- Metabeskrivelse: Frederik Kragh anmelder Lanterns på HBO Max: To stjerner til en superheltekrimi med Aaron Pierre, Kyle Chandler, for lidt følelse og for meget forklaring.
- Canonical: https://www.aproposmagazine.com/articles/lanterns-saeson-1-anmeldelse-hbo-max

### Jeg gik på barsel og endte i en religiøs uldsekt

- SEO-titel: Jeg gik på barsel og endte i en religiøs uldsekt
- Metabeskrivelse: En pensioneret DJ besøger Bette Café med sin baby og opdager, at barsel, uld og middagslure er blevet en hel livsstil.
- Canonical: https://www.aproposmagazine.com/articles/jeg-gik-paa-barsel-og-endte-i-en-religioes-uldsekt

### Cæcilie Norby på Gamle Scene: Jazz i rødt plys

- SEO-titel: Cæcilie Norby på Gamle Scene: Koncertanmeldelse 6/6
- Metabeskrivelse: Cæcilie Norby fejrede Blue Note på Gamle Scene med et formidabelt band og en magisk finale. Vores anmeldelse giver 6/6 stjerner.
- Canonical: https://www.aproposmagazine.com/articles/caecilie-norby-gamle-scene-anmeldelse-2026

### Girls vender tilbage: At fylde 40 løser ingenting

- SEO-titel: Girls vender tilbage med fem afsnit: Kulturkommentar
- Metabeskrivelse: HBO genopliver Lena Dunhams Girls med fem afsnit. Liv Brandt undersøger, hvad serien kan fortælle om at blive voksen som 40-årig.
- Canonical: https://www.aproposmagazine.com/articles/girls-vender-tilbage-hannah-40-voksenliv

### Street Fighter (2026)

- SEO-titel: Street Fighter (2026) – anmeldelse
- Metabeskrivelse: Vi anmelder Street Fighter (2026): Solide kampscener, 90’er-nostalgi og humor holder filmen oppe, selv om historien halter.
- Canonical: https://www.aproposmagazine.com/articles/street-fighter-2026

### The Whisper Man (Netflix)

- SEO-titel: The Whisper Man på Netflix: Anmeldelse (4/6)
- Metabeskrivelse: Robert De Niro og Adam Scott løfter The Whisper Man. Frederik Kragh anmelder Netflix-thrilleren til 4/6 stjerner trods store plothuller.
- Canonical: https://www.aproposmagazine.com/articles/anmeldelse-the-whisper-man-netflix-2026

## Afgrænsning og næste arbejde

SEO-titlerne er generelt konkrete, og metabeskrivelserne afspejler artiklernes vurderinger. Der er ingen grund til at ændre alle ti titler. En titel og H1 behøver ikke være identiske; eksisterende godkendte URL’er bør ikke ændres alene for kosmetik. Der mangler kontekstuelle interne links i alle ti brødtekster; siderne har dog relaterede artikler. Tilføj kun relevante interne links, ikke en mekanisk kvote.

Ingen målt rangering, Search Console-indeksering, Core Web Vitals eller fuld faktakontrol mod originale film, koncerter og bøger. Ingen lydafspilningskontrol eller fuld videoafspilning. Den eksterne Prime Video-destination gav 503 i dette miljø; det er ikke tilstrækkeligt til at erklære linket permanent dødt. Fem andre brødtekstlinks gav HTTP 200.

Vurderingen af titler og snippets følger [Googles titelvejledning](https://developers.google.com/search/docs/appearance/title-link) og [metabeskrivelsesvejledning](https://developers.google.com/search/docs/appearance/snippet): relevante, beskrivende og unikke tekster, ingen fast magisk tegnlængde eller garanti for Googles valgte snippet. Publiceringsdatoer vurderes efter [Googles datovejledning](https://developers.google.com/search/docs/appearance/publication-dates).

## Evidens

- `output/latest10-audit-20261028/audit.json`: CMS/HTML, metadata, 49 billedroller, to viewports pr. artikel.
- `output/latest10-audit-20261028/supplement.json`: sitemap, robots, mobilnetværk og brødtekstlinks.
- `output/latest10-audit-20261028/girls-publication-receipt.json`: udvalgte kvitteringsfelter uden tokens.
- Samme mappe: originale offentlige HTML-snapshots, screenshots og læsende scripts.
