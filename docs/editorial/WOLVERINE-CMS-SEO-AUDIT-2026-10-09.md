# Wolverine: CMS- og SEO-gennemgang

Kontrolleret 9. oktober 2026 ca. 09:45–09:49 Europe/Copenhagen.

- Artikel: https://www.aproposmagazine.com/articles/marvels-wolverine-anmeldelse
- CMS-item: `6ac7a31e994128467aa26e6a`, dansk locale.
- Scope: read-only CMS-felter/schema, referencer, offentligt HTML, færdigindlæst browser-DOM, billedbytes, robots og sitemap.
- Ingen faktakontrol af spillet, ingen ændring af Peter Milos tekst eller karakter, ingen CMS-write/publicering, ingen AI-provider-kald.
- Apropos' artikelgennemgang skelner mellem udfyldte felter, faktisk live-visning og ukontrollerede forhold. Ingen kvalitets- eller SEO-score er opfundet.

## Konklusion

Grundopsætningen og metadata er på plads, men artiklen er ikke helt teknisk/
redaktionelt færdig. De vigtigste rettelser vedrører sprogversion, sitemap,
billedkreditering/alttekst og brødtekstbilledets størrelse. Det er ikke en
afvisning af anmeldelsens indhold eller dokumentation for dårlig placering i Google.

## Verificeret i orden

| Kontrol | Faktisk resultat |
| --- | --- |
| Udgivet og tilgængelig | HTTP 200, ikke kladde/arkiveret. Staged og live har ens fieldData. |
| Forfatter | Peter Milo, aktiv CMS-reference og fungerende offentlig forfatterside. |
| Kategori og emner | Kultur; primært Gaming; emner Gaming og Anmeldelser. Alle referencer findes. |
| Karakter | CMS 4; browseren viser Fire stjerner; Review-schema bruger 4/6 med interval 1–6. |
| Menneskeskrevet-markering | `ai-generated=false`, i overensstemmelse med ejerens oplysning. |
| Titel, underrubrik, intro, brødtekst | Udfyldt og publiceret. Ét H1. |
| SEO-titel | Udfyldt, 47 tegn, samme værdi i live title/OG/Twitter. |
| Metabeskrivelse | Udfyldt, 138 tegn, samme værdi live og til social deling. Ingen garanti for Googles faktiske snippet. |
| Canonical og sprog på dansk side | Én korrekt selvrefererende canonical; `lang=da`. |
| Billeder | Hero/mobile og brødtekstbillede returnerer læsbare billedbytes med HTTP 200. |
| Crawl-blokering | Ingen noindex fundet i meta/header; robots.txt har ingen Disallow. Google-indeksering er ikke dermed bevist. |
| Strukturerede data | Article findes i serversvar. Review/VideoGame tilføjes i browseren med Peter Milo og 4/6. Må ikke fejlagtigt rapporteres som manglende ud fra HTML alene. |
| Andre obligatoriske CMS-felter | Schemaets krævede Name og Slug er udfyldt. Det er ikke i sig selv en fuld redaktionel godkendelse. |

## Bør rettes

1. **Engelsk sprogversion er stadig dansk.** `/en/articles/marvels-wolverine-anmeldelse`
   svarer 200 med `lang=en`, engelsk selvcanonical, men dansk titel, meta og
   brødtekst. Den danske side annoncerer den som `hreflang=en`. Publicér en
   reel oversættelse eller justér den annoncerede/tilgængelige sprogversion
   gennem den relevante locale-politik. Ingen automatisk oversættelse er startet.

2. **Artiklen mangler i det aktuelle sitemap.** `sitemap.xml` svarer 200 med
   510 `<loc>`-poster; ingen Wolverine-URL findes. Bogartiklen findes.
   Undersøg sitemap-inklusion/generering; årsagen er endnu ikke fastslået.
   Det beviser ikke, at Google ikke kan finde eller allerede har indekseret siden.
   Ingen fuld sitepublicering er udført som genvej.

3. **Billedoplysninger er ufuldstændige.** Hero og mobile har `alt=null` i CMS
   og tom alttekst live. `foto-credit` er tomt. Brødtekstbilledet har beskrivende,
   men engelsk alttekst og ingen billedtekst/kreditering. Tilføj konkret dansk
   alttekst og den rigtige leverandør-/fotokredit fra det oprindelige materiale;
   et filnavn er ikke rettighedsdokumentation. Ingen kredit er gættet.

4. **Kun ét brødtekstbillede.** Jeres normale artikelstandard er to forskellige
   brødtekstbilleder ud over hero. Dette er en Apropos-standard, ikke et generelt
   Google-krav. Denne kontrol fastslår ikke en særskilt redaktionel dispensation.

5. **Unødigt tungt brødtekstbillede.** PNG: 3.625.066 bytes, 3840×2160.
   Det indlæses lazy, men uden `srcset`/`sizes`, så originalen bruges også på
   små skærme. En passende komprimeret/responsiv version af samme motiv er
   oplagt. Ingen ny generation eller ændring af motiv er nødvendig.
   Heroens WebP er til sammenligning 217.132 bytes, 1920×1080, med responsive
   varianter i sidens markup. Ingen Core Web Vitals-score er målt.

## Mindre forbedringer og felter, der kræver redaktionel kontekst

- Brødteksten har 600 ord fordelt på 33 afsnit, men ingen mellemrubrikker og
  ingen links. Et par beskrivende H2'er og relevante interne links vil forbedre
  navigationen; relaterede artikler i skabelonen er allerede til stede.
- Intro og første brødtekstafsnit gentager lancering/PS5-indgangen. Dette er en
  strukturobservation, ikke et faktatjek eller en anmodning om fuld omskrivning.
- Læsetid er sat til 5 minutter. Med ca. 600 brødtekstord plus intro er 3–4
  minutter et rimeligt redaktionelt alternativ, afhængigt af jeres beregningsregel.
- Review-schemaets `itemReviewed.name` inkluderer ordet Anmeldelse; feltet bør
  beskrive selve spillets titel. Review-navnet gentager også anmeldelse.
- `og:type=website` er generisk; `article` vil være en mere præcis type for siden.
- `datePublished` i schema kommer fra CMS-oprettelse 14:05:18Z, mens seneste
  publicering er 14:14:06Z. Det er ikke bevis på det eksakte første publiceringstidspunkt.
- Presseakkreditering er slået til og udløser den synlige disclaimer om modtaget
  anmeldereksemplar/adgang. Det er kun korrekt, hvis redaktionen faktisk har
  modtaget det. Dette er ikke verificeret i gennemgangen.
- Tomme bogfelter, festival/dato/sted/billetfelter, streamingfelter og trailer er
  ikke mangler for denne spilanmeldelse. Featured og lydversion er false; det er
  redaktionelle valg, ikke fejl.
- Browseren havde ingen observeret horisontal overflow på den anvendte desktop-
  viewport. Ingen særskilt mobil-/ydelsestest. En duplicate Meta Pixel-advarsel
  er observeret som separat site-trackingforhold, ikke en bevist artikel-SEO-fejl.

## Afgrænsning og dokumentation

CMS-læsning afsluttet `2026-10-09T07:45:03.229Z`; offentligt HTML
`07:45:04.601Z`; browser-DOM kontrolleret efter scripts var indlæst.
Schema blev inspiceret, men Googles Rich Results Test og Search Console URL
Inspection er ikke kørt. Ingen garanterede søgeresultatstjerner, indeksering,
placering eller rettigheder hævdes.

Reproducerbar read-only diagnose: `tmp/audit-wolverine-readonly-20261009.ts`.
Den bruger eksisterende serviceadgang uden at udskrive credentials. Ingen
artikelfelter eller produktionsindstillinger blev ændret under kontrollen.

Officiel reference for vurdering af metadata og søgevisning:

- [Google: titellinks](https://developers.google.com/search/docs/appearance/title-link)
- [Google: metabeskrivelser](https://developers.google.com/search/docs/appearance/snippet)
- [Google: sprogversioner](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [Google: sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview)
- [Google: Review-data](https://developers.google.com/search/docs/appearance/structured-data/review-snippet)
