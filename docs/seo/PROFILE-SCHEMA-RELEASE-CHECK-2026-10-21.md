# Releasekontrol: profil og schema

21. oktober 2026. Fuld sammenligning afsluttet kl. 16:12 UTC / 18:12 Europe/Copenhagen. Kontrollen er udelukkende offentlige GET-kald og lokale kvitteringer; den har ikke publiceret eller ændret Webflow.

**Resultat: ingen uventede forskelle fundet. Den undersøgte stagingversion bestod indholdskontrollen, og den efterfølgende produktionsversion er læst tilbage og verificeret.** Se produktionsafsnittet nedenfor. Kontrollen udtaler sig om de undersøgte versioner, ikke senere ændringer.

Stagingpublicering oplyst af koordinatoren: `4dfc69e5-5a9c-46c3-93a8-eaa25ac7c125`.

## Omfang og forventet ændring

- Produktion: `https://www.aproposmagazine.com`
- Staging: `https://apropos-magazine.webflow.io`
- Forventet schema: `docs/seo/PROFILE-SCHEMA-2026-10-21.json`
- Forventet engelsk Om-tekst: `docs/seo/ABOUT-EN-2026-10-21.json`
- Maskinlæsbar kvittering: `docs/seo/PROFILE-SCHEMA-RELEASE-CHECK-2026-10-21.json`

Tilladte forskelle er JSON-LD på `/om`, `/en/om`, `/presse` og `/en/presse` samt fire synlige tekstfelter og relevante metadata på `/en/om`.

## Resultater

| Kontrol | Resultat |
|---|---|
| Sitemap | Begge miljøer har præcis de samme 524 paths; ingen ekstra eller manglende paths |
| Fuld sammenligning | 524 paths, alle HTTP 200 i begge miljøer |
| Artikelpaths | 438; ingen indholdsforskelle fundet |
| GET-fejl / statusforskelle | 0 / 0 |
| Uventet ændrede sider | 0 |
| `/om`, `/presse`, `/en/presse` | Kun de forventede JSON-LD-forskelle |
| `/en/om` | Kun forventet tekst, metadata og JSON-LD |
| Artikelhenvisninger og rækkefølge | Identiske på alle sammenlignede sider |
| Billedkilder, srcset og alt-tekst | Identiske på alle sammenlignede sider |
| Inline-JavaScript | Identisk på alle sammenlignede sider efter normalisering af eget domæne |

Alle fire schemaobjekter er til stede på staging og matcher de tilsigtede objekter præcist efter normalisering af JSON-nøgler og eget domæne. Der er ét JSON-LD-script på hver af de fire sider.

Den engelske Om-side har 98 synlige tekstnoder i begge miljøer. Præcis fire tekstnoder er ændret. Deres DOM-position, overordnede HTML-element og CSS-klasse er bevaret. De fire nye tekster matcher inputfilen. Metadataændringerne er begrænset til sidetitel, metabeskrivelse, Open Graph-titel/-beskrivelse og Twitter-titel/-beskrivelse.

## Kontrol af tidligere risikoområder

Før hele sitemappet blev gennemgået, blev danske Film, Koncerter, Kultur & Mening og Anmeldelser samt Featured Articles på dansk og engelsk sammenlignet. Der var ingen ændringer i tekster, viste datoer eller rækkefølge.

De korrekte engelske emnepaths blev derefter kontrolleret: `/en/topics/movies`, `/en/topics/Concerts`, `/en/topics/culture-opinion` og `/en/topics/reviews`. Alle gav HTTP 200 og var identiske mellem miljøerne. De indledningsvis afprøvede danske emneslugs under `/en/topics/` gav HTTP 404 i begge miljøer; det var ikke en stagingregression og indgår ikke i de 524 sitemap-paths.

Ingen datoer eller CMS-felter er forsøgt repareret. Der er ikke fundet den tidligere observerede forskydning af hero-kortenes datoer eller Featured-rækkefølge i denne stagingversion.

## Metode og begrænsninger

Sammenligningen brugte højst otte samtidige GET-kald. For hver side blev HTML-tekst uden script/style/noscript/template sammenlignet sammen med SEO-metadata, canonical/hreflang, parset JSON-LD, artikellinks i dokumentrækkefølge, billeder og inline-JavaScript. Eget stagingdomæne blev normaliseret til produktionsdomænet. JSON-nøgler blev sorteret; lister og dokumentrækkefølge blev bevaret. Normalisering af mellemrum fjerner ubetydelige whitespace-forskelle.

Eksterne runtimebundlers filnavne og bundlehashes er ikke brugt som indholdsregression. Kontrollen er baseret på leveret HTML, ikke pixelbaseret browserrendering eller afspilning af animationer. Ens inline-JavaScript beviser derfor ikke alene enhver visuel runtimeeffekt. Sider uden for de to sitemap er kun dækket, hvor de indgår i de eksplicitte kontrolpaths.

Kvitteringen indeholder hashes, ændrede felter og konkrete før/efter-udsnit. Den fastslår, at netop den undersøgte stagingversion har den aftalte indholdsændring uden observerede sideændringer.

## Verificeret produktionsreadback

Efter koordinatorens publicering med opgave-id `a0b2c347-a5ae-4942-aec3-86243cfc3a8a` blev fire ændrede sider og tolv kontrolsider hentet igen fra `www.aproposmagazine.com`. Detaljer og præcist kontroltidspunkt er gemt i `docs/seo/PROFILE-SCHEMA-PRODUCTION-2026-10-21.json`.

- Alle 16 sider gav HTTP 200.
- Alle fire ændrede sider matcher den godkendte stagingversion i samtlige undersøgte felter.
- Alle fire JSON-LD-objekter matcher inputfilen præcist.
- Alle fire engelske tekstfelter er offentligt til stede; de engelske metadata matcher stagingkvitteringen.
- Forsiden, de fire kontrollerede emnesider og Featured Articles, hver på dansk og engelsk, matcher deres produktionsversion fra før publiceringen. Der er ingen ændrede tekster/datoer, artikellinks eller rækkefølge, billeder eller inline-JavaScript i disse tolv kontrolsider.

Den offentlige produktionsændring er dermed verificeret inden for den aftalte scope. De 524 paths er ikke genhentet efter publicering; den fulde før-publicering-kontrol er suppleret af den målrettede produktionsreadback. Dette afsnit dokumenterer ikke særskilt de øvrige domænealiaser, som indgik i koordinatorens publicering, eller browserens visuelle kontrol.
