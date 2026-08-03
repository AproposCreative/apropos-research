# Baseline før ændringer

Målt 2026-08-03. Alle tal er fra read-only Webflow API, live HTML eller repositoryet.

## Live teknisk status

- `robots.txt` tillader crawl og henviser til `https://www.aproposmagazine.com/sitemap.xml`.
- Sitemap indeholder `da`, `en` og `x-default` hreflang-par for statiske sider og lokaliserede CMS-items.
- Apex `.com`, `www.aproposmagazine.dk` og apex `.dk` giver 301 til `https://www.aproposmagazine.com/`.
- Forside og artikler har selvrefererende canonical og korrekte HTML-lang-attributter.
- Artikeltemplate bruger CMS-felterne `seo-title` og `meta-description`.
- Artikeltemplate har server-renderet `Article` JSON-LD i rå HTML.
- Review-schema findes fortsat som client-side Webflow-injektion og er derfor ikke garanteret i rå HTML.
- Author-, Topics-, Services- og Festivals-templates har ingen page-level JSON-LD i Webflow.
- Forsidens Organization-schema bruger relativ `url: "/"`, dansk tekst også på EN og en upræcis `sameAs` (`https://www.instagram.com/`).

## CMS-struktur

- Articles collection: `67dbf17ba540975b5b21c2a6`
- Authors collection: `67dbf17ba540975b5b21c294`
- Sections collection: `67dbf17ba540975b5b21c2ae`
- Topics collection: `67dbf17ba540975b5b21c2af`
- Services collection: `67dc7af16ccc7f0c53fc3efb`
- Festivals collection: `6804c5e38d47b543c1a57d2f`

Articles har allerede felter til SEO, intro, content, author, section, primary topic, topics, streaming service, rating, billeder, festival, dato og location. Felterne er næsten alle valgfrie. To eksisterende labels/slugs har stavefejl: `Steaming Service`/`simple-rerfence` og `Steaming Service + all`/`muiltiref`.

## Artikelbestand

| Kontrol | DK | EN |
|---|---:|---:|
| Items | 187 | 160 |
| Publicerede | 182 | 156 |
| Drafts | 5 | 4 |
| SEO-title over 60 tegn | 40 | 0 |
| Meta description over 155 tegn | 30 | 0 |
| SEO-title under 30 tegn | 7 | 10 |
| Meta description under 80 tegn | 3 | 3 |
| Brødtekst med headings | 79 | 77 |
| Items med `__wf_reserved_inherit` i billed-alt | 133 | 113 |
| Manglende alt på thumb/mobile-image | 368 felter | 314 felter |
| Brødtekst under 300 ord | 10 | 8 |
| Brødtekst over 1200 ord | 11 | 8 |

Differencen på 27 items betyder, at eksisterende danske items ikke har en engelsk locale-variant. Webflow Data API kan ikke tilføje den sekundære variant til et eksisterende item; det kræver Designer/Localization.

## Metadata og schemas

- 40 danske SEO-titler overskrider styleguidens maksimum på 60 tegn.
- 30 danske metabeskrivelser overskrider 155 tegn.
- Der er mindst én dobbelt dansk SEO-title og metabeskrivelse i to samtidige Tripolism-drafts.
- Article JSON-LD mangler `mainEntityOfPage`, stabil publisher `@id`, fulde author-URL'er og type-specifik `Review` i rå HTML.
- Author-template mangler `Person`/`ProfilePage` schema og felter til `sameAs`/ekspertområder.
- Topic/Section/Service/Festival templates bruger overvejende generisk metadata og mangler entitetsbeskrivelser/schema.
- Home Organization-schema skal have absolut URL, præcis social profil, korrekt EN-lokalisering og stabil `@id`.

## Interne links, billeder og forfattere

- 181 af 182 publicerede danske artikler har ingen interne links i CMS-brødteksten.
- Der er samlet ét internt link i de 182 publicerede danske artikler, svarende til 0,01 link pr. artikel.
- Der er ingen eksterne links i CMS-brødteksten.
- Brødteksterne indeholder 283 inline-billeder; 271 bruger Webflows `__wf_reserved_inherit` som alt-værdi.
- De 182 danske brødtekster indeholder samlet 260 headings: 23 `h2`, 74 `h3`, 150 `h4`, 11 `h5` og 2 `h6`. Ingen bruger `h1` i brødteksten.
- Authors indeholder 9 DK-items og 9 EN-items. Biografi, position og foto er udfyldt på alle, men alle 18 lokale forfatterfotos mangler en konkret alt-tekst.
- Taxonomien består af 7 topics og 3 sections; alle topics har headline og body.

## Eksisterende SEO Engine

Repositoryet indeholder allerede:

- arkiv-audit og jobkø for SEO-meta, canonical, image alt, headings og interne links
- før-snapshots i Firestore (`seoEngineArchiveApplyBackups`) samt midlertidig backup på Vercel
- GSC/GA4 opportunity engine med stale-write guard, cooldown og rollback-versioner
- servergenerering af Article/WebPage/Review JSON-LD
- cronjobs til recovery, daglig opportunity collect og ugentlig optimize

Vercel har de nødvendige variabelnavne til GSC, GA4, Webflow, Firebase, OpenAI, interne secrets og SEO Engine allowlists. Ingen secret-værdier er hentet eller gemt.

## Baseline-risici

1. Kodebasen kan generere bedre Review JSON-LD, men Webflow publicerer stadig en separat client-side variant.
2. Webflow har ingen tilgængelig backup- eller branch-API på kontoen; rollback for CMS kræver egne snapshots.
3. Automatisk opportunity-optimering er default ON, når settings kan læses; ændringer skal koordineres med eksisterende jobs.
4. Bred billed-alt-gæld påvirker tilgængelighed, billedsøgning og entitetsforståelse.
5. Gamle artikler følger ikke konsekvent den nuværende redaktionelle slutlinje eller længdekrav.
6. Produktionsafhængighederne har 32 kendte advisories i den installerede baseline (6 low, 15 moderate, 8 high og 3 critical). De er ikke ændret automatisk, fordi en bred dependency-opdatering skal testes og håndteres som et separat sikkerhedsspor.

## Verifikation af kodebasen

- `npm run type-check:seo-engine`: bestået.
- SEO Engine-testudvalg: 22 testfiler og 262 tests bestået.
- `npm audit --omit=dev`: fandt de 32 advisories ovenfor; ingen automatisk fix er kørt.
