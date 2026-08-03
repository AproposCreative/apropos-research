# SEO, AEO og GEO-audit

Dato: 2026-08-03  
Scope: Webflow, live HTML, CMS, GitHub-repository, Vercel-konfiguration og redaktionel artikelbestand.

## Executive summary

Apropos Magazine har et stærkt teknisk fundament: rene URL'er, HTTPS, selvrefererende canonical, dansk/engelsk hreflang, sitemap, forfattersider og server-renderet Article JSON-LD. Den største vækstblokering er ikke crawlability, men informationsarkitekturen i selve arkivet: 181 af 182 publicerede danske artikler har ingen interne links i brødteksten. Derefter følger 40 for lange danske SEO-titler, 30 for lange metabeskrivelser, omfattende billed-alt-gæld og 27 danske artikler uden en engelsk locale-variant.

AEO/GEO kræver ikke et separat "AI-schema". Google beskriver de samme grundprincipper for AI Overviews og AI Mode: siden skal kunne indekseres, vigtigt indhold skal være tekstligt tilgængeligt, interne links skal gøre indholdet findbart, og structured data skal stemme med det synlige indhold. Derfor prioriterer auditten entitetskonsistens, forfatteridentitet, interne relationer og præcist Article/Review-schema frem for kunstige FAQ-blokke eller `llms.txt`.

## Samlet vurdering

| Område | Status | Vurdering |
|---|---|---|
| Crawl og indexering | God | Robots, sitemap, HTTPS, redirects og canonical fungerer. Search-utility bør vurderes til `noindex`. |
| International SEO | God med hul | DK/EN hreflang og `x-default` findes, men 27 DK-items mangler EN-variant. |
| Metadata | Kræver arbejde | 40 DK-titler over 60 tegn og 30 DK-metaer over 155. Template-prefix gjorde alle artikeltitler længere end CMS-feltet. |
| Structured data | God base | Article findes, men author/publisher-identiteter og page graph var svage; Author/Topic/Service/Festival manglede schema. |
| Intern linking | Kritisk vækstproblem | Kun ét internt brødtekstlink på 182 publicerede danske artikler. |
| Billeder | Høj gæld | 271 af 283 inline-billeder bruger reserved alt-værdi; hero-/mobilbilleder mangler bredt konkrete alts. |
| Redaktionel konsistens | Blandet | Mange gamle artikler afviger fra nuværende længde-, heading- og afslutningsregler. |
| Måling | Delvist klar | Vercel har GSC/GA4-variabler, men data blev ikke hentet uden en afgrænset dataforbindelse. |

## Teknisk checklist

| Kontrol | Status | Detalje |
|---|---|---|
| HTTPS og domænekanonisering | Pass | `.dk`, apex `.com` og `www`-varianter ender på `https://www.aproposmagazine.com/`. |
| robots.txt | Pass | Crawl er tilladt, og sitemap er angivet. |
| XML-sitemap | Warning | DK/EN-alternativer findes; `/search` forekommer som indexerbar utility-side. |
| Canonical | Pass | Forside og stikprøvede artikler har selvrefererende canonical. |
| Hreflang | Pass/Warning | `da`, `en` og `x-default` er konsistente for eksisterende par; 27 DK-items mangler EN. |
| Title/meta bindings | Warning | Felter er bundet korrekt, men faste brand-prefix og DK-længder skabte truncation-risiko. |
| Article JSON-LD | Pass/Warning | Findes i rå HTML; author-URL og entitetsreferencer skal forbedres. |
| Review JSON-LD | Warning | Motoren kan generere Review sikkert, men live Webflow bruger fortsat en separat client-side løsning. |
| Organization/WebSite | Fixed staged | Forsiden har nu staged graph med absolutte URL'er, stabile `@id` og korrekte profiler. |
| Author/ProfilePage | Fail | Author-template har ingen page-level Person/ProfilePage-schema. |
| Topic/Service/Festival | Warning | Generisk metadata og intet selvstændigt entitetsschema. |
| CMS canonical-felt | N/A/fixed in code | Collectionen har intet canonical-felt; livesiden håndterer det i templaten. Motoren skriver nu fail-closed. |
| Core Web Vitals | Ikke målt | PageSpeed API-kvoten var utilgængelig; mål via Search Console eller afgrænset Lighthouse-kørsel. |

## On-page og redaktionelle fund

| Problem | Omfang | Alvor | Anbefaling |
|---|---:|---|---|
| Ingen interne brødtekstlinks | 181/182 DK-artikler | Høj | Tilføj 1-3 redaktionelt relevante links i små, manuelt godkendte batches. |
| SEO-title over 60 tegn | 40 DK-items | Høj | Forkort med bevaret værknavn, platform og vinkel. Template-prefix er allerede fjernet staged. |
| Meta over 155 tegn | 30 DK-items | Høj | Forkort konkret og klikværdigt; bevar anmeldelsens reelle dom. |
| Reserved inline image alt | 271/283 billeder | Høj | Erstat med konkret motiv/værk/person; marker rent dekorative billeder tomt. |
| Manglende hero/mobile alt | 368 DK + 314 EN feltforekomster | Høj | Brug særskilt alt pr. motiv; undgå blot at kopiere titel ukritisk. |
| Manglende EN-variant | 27 DK-items | Høj | Opret manuelt via Webflow Designer Localization; API kan ikke tilføje locale til eksisterende item. |
| Headings i gammel brødtekst | 79 DK + 77 EN | Medium | Normalisér hierarki uden at omskrive stemme; ingen ekstra H1 i content. |
| Tynd tekst | 10 DK + 8 EN under 300 ord | Medium | Vurder om artiklen skal udbygges, samles, redirectes eller bevares som kort guide. |
| Meget lang tekst | 11 DK + 8 EN over 1200 ord | Lav/Medium | Bevar når journalistisk begrundet; stram kun ved reel gentagelse. |
| Generisk template-metadata | Author/Topic/Service/Festival | Medium | Bind navn, rolle/headline og lokal beskrivelse til unikke titles/meta. |
| Forfatterfoto uden alt | Alle 9 DK + 9 EN items | Medium | Sæt personnavn som billed-alt, medmindre billedet er rent dekorativt. |

## AEO og GEO

De vigtigste maskinlæsbare relationer er:

`Organization → WebSite → WebPage → Article/Review → Person → CreativeWork/Event → Topic/Service/Festival`

Status efter første batch:

- Organization, WebSite og WebPage deler stabile IDs på staged forside.
- SEO Engine deler nu publisher/page IDs på Article og Review.
- Review udsendes kun ved reel anmeldelsestype, gyldig 1-6-rating og identificeret værk.
- Event-typer udsendes kun med verificeret dato og sted.
- Næste schema-batch bør være Author `ProfilePage`/`Person`, derefter Topic/Service/Festival.
- FAQ bør kun bruges, hvor artiklen faktisk indeholder spørgsmål og svar; der skal ikke genereres kunstige FAQ-sektioner for schemaets skyld.

## Prioriteret plan

### Hurtige gevinster

1. Publicér staged forside-schema og Article-template-title efter kontrol af Webflows øvrige pending changes.
2. Kør et metadata-pilotbatch på højst 5 DK-artikler med før-snapshot, preview og readback.
3. Kør et internt-link-pilotbatch på højst 3 DK-artikler; godkend hvert anker og mål-URL manuelt.
4. Ret forfatterfoto-alt og tilføj Author ProfilePage/Person-schema.
5. Sæt Search utility til `noindex,follow`, hvis Webflow-siden ikke allerede gør det, og fjern den fra sitemap hvor platformen tillader det.

### Strategiske investeringer

1. Opret de 27 manglende EN-varianter i Designer og oversæt redaktionelt, ikke ordret.
2. Udvid Authors med kontrollerede `sameAs`- og ekspertisefelter; eksponér aldrig unødvendig privat e-mail i schema.
3. Gør Topic/Service/Festival-metadata unikke og byg synlige hub-sider med relaterede artikler.
4. Kobl GSC og GA4 gennem en afgrænset read-only forbindelse og prioriter efter impressions, position, CTR og engagement.
5. Kør Core Web Vitals/Lighthouse på forside, artikel, forfatter og topic-template, når måleadgang er klar.
6. Håndtér de 32 dependency-advisories i et separat sikkerhedsspor med målrettede opgraderinger og fuld regressionstest.

## Referencegrundlag

- Google: [AI features and your website](https://developers.google.com/search/docs/appearance/ai-features)
- Google: [Article structured data](https://developers.google.com/search/docs/appearance/structured-data/article)
- Google: [Organization structured data](https://developers.google.com/search/docs/appearance/structured-data/organization)
- Google: [Localized versions and hreflang](https://developers.google.com/search/docs/specialty/international/localized-versions)
- Google: [Link best practices](https://developers.google.com/search/docs/crawling-indexing/links-crawlable)
- Google: [Influencing title links](https://developers.google.com/search/docs/appearance/title-link)
