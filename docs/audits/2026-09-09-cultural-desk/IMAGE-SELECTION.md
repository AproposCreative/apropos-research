# Liv: gemt billedvalg og CMS-billedkontrol

Dato: 2026-09-09. Lokal branch: `codex/liv-media-proof`, udgangspunkt `54b681b`.
Ingen produktionskald, CMS-skrivninger, nye nøgler eller dependencies i dette trin.

## Det konkrete hul

Generatoren indsamlede og:image/JSON-LD-URL'er, Writer valgte automatisk første
forslag, og CMS-skriveren kunne erstatte et eksplicit billede med første billede
fra en kildeside. URL og automatisk udledt fotokredit blev ikke ledsaget af
lagringsbevis, faktisk billedstørrelse eller dokumenteret brugsret.

## Implementeret

- Under **Liv → Historier → gemt udkast** findes et eksplicit billedvalg med
  kildebillede/kildeside, alt-tekst og fotokredit. Ingen automatisk billedhentning
  ved åbning af formularen. Forberedelse sker ved knappen **Gem billedvalg til kladden**.
- Der bruges den eksisterende autentificerede editorial desk-route og den gemte
  artikel i brugerens Firestore-desk. Klienten kan ikke vælge en anden bruger,
  en vilkårlig URL uden for forslagene eller erklære rettigheder godkendt.
- Kildehenteren har HTTPS, offentlig IPv4, DNS-pinning, ingen redirects, ingen
  credentials/cookies, tidsgrænse og hårde svargrænser. Den deles af billedimport
  og eksisterende billedforslag fra HTML. Usikre billed-URL'er filtreres fra.
  Den eksisterende kildeverifiers URL-/IP-politik genbruges uden at ændre faktatjekket.
- Kun PNG/JPEG/WebP med mindst 1920 × 1080 pixels og én frame kan forberedes.
  Filtypen aflæses også fra selve bytes. Animerede billeder, SVG og mindre filer
  afvises. Kilden beskæres til 16:9; det kræver stadig visuel vurdering af motivet.
- Den eksisterende fælles encoder bruges uændret til præcis 1920 × 1080 WebP,
  maksimum 450 KiB og kvalitetsgulv 55. Et umuligt budget fejler i stedet for at
  overskride budgettet eller gøre billedet mindre.
- Firebase Storage gemmer en ny immutable fil med create-only-betingelse og
  CRC-kontrol. Metadata og de gemte bytes læses tilbage. SHA-256 skal matche.
  URL'en er et publicerbart asset-link, ikke en midlertidig provider-URL.
- `editorialDesks/{uid}/stories/{storyId}/mediaAssets/{selectionHash}` gemmer
  processing/stored/failed, artikelhash, filsti og lease. Et stored-resultat
  indeholder kilde-URL, kildeside, original-/outputhash, dimensioner, bytes,
  alt-tekst og kredit. Artikelens `selectedImage` peger på det valgte resultat.
- Hashen af titel, slug, intro og brødtekst binder valget til artikelversionen.
  Genforsøg genbruger en allerede gemt fil. En ældre igangværende handling kan
  ikke overskrive et nyere valg. Der tillades højst seks nye forberedelsesforsøg
  pr. historie pr. time. Genbrug af et gemt valg tæller ikke som et nyt forsøg.
- Writer og CMS-formularen får det valgte billede, alt-tekst, fotokredit og bytehash.
  Skiftes billedet i Writer, fjernes den gamle alt/kredit/hash, medmindre den nye
  opdatering selv indeholder erstatninger. Der vælges ikke automatisk første
  researchbillede for Liv. Eksisterende billedsøgning og AI-generering i Writer
  er ikke fjernet eller aktiveret på ny.
- CMS-skriveren bevarer eksplicitte billeder, også for andre forfattere. Andre
  forfatteres eksisterende billeddiscovery ved manglende billede er bevaret.
  Alt-tekst sendes i det eksisterende Webflow thumb-objekt. Ingen CMS-schemaændring.
- CMS-readback sammenligner nu hele synlige body-/intro-teksten, ikke bare at
  felterne findes. For en forberedt billedfil sammenlignes actual CMS-image bytes,
  WebP-format, 1920 × 1080, budget og SHA-256 samt alt/kredit. URL-ændring alene
  giver hverken godkendelse eller afvisning: det er de hentede bytes, der afgør match.

## Afgrænsning og resterende releasekrav

- `rightsStatus=unverified`, `visualReview=pending` og `publicationReady=false`
  er bevidst bevaret. Fotokredit er ikke dokumentation for brugsret.
- Knappen gemmer og behandler et billede til en allerede gemt desk-kladde, ikke
  en ny The Invite-artikel. Der er ingen automatisk billedforberedelse i cron,
  ingen aktivering af paid image generation og ingen Instagram-publicering.
- Den eksisterende AI-generator skal stadig kobles til samme provenance-/assetflow
  og afprøves med artiklens konkrete visuelle idé. Denne ændring opgraderer ikke
  billedmodellen eller ændrer billedprompten.
- Trailer-match, samlet rettigheds-/kvalitetsgodkendelse, topic-referencekontrol,
  indholdslinks/embeds og genoptagelse af afbrudt live-publicering er stadig åbne.
  Synlig tekstlig lighed er ikke lig med validering af alle HTML-attributter.
- CMS kan genkomprimere et billede; ændrede bytes giver en ikke-godkendt kontrol,
  også hvis billedet ser ens ud. Private/signerede URL'er og redirect-kilder
  afvises uden fallback. Det skal testes på den faktiske Webflow-CDN.
- En afbrudt upload eller efterfølgende databasefejl kan efterlade en ubenyttet
  fil. Filstien gemmes i processing/failed-recorden; ingen automatisk sletning
  udføres. Cross-service exactly-once levering er ikke påstået.
- Storage kræver et af de eksisterende bucket-navne i serverens miljø.
  Ingen miljøværdi er læst ud eller ændret. Produktions-Firestore/Storage-regler
  er ikke verificeret og findes ikke som Firestore-regelfil i checkoutet. De skal
  blokere klientændringer af assetbeviser, før disse kan bruges til autopublicering.
- Reelle UI-interaktioner, Storage-adgang og en Webflow-kladde med readback skal
  testes i en særskilt godkendt release. Ingen site-wide Webflow Publish må bruges:
  SEO-opgaven har oplyst, at der ligger andre upublicerede templateændringer.

## Lokal verifikation

- 682 tests i 65 filer består, inklusive 33 nye tests for netværk, lagring,
  brugeradskillelse, konkurrerende valg, genforsøg, CMS-bytes og metadata.
- TypeScript og målrettet ESLint består. Tests bruger `./tmp/vitest-rage`;
  ingen tracked research-data er ændret.
- Produktionsbuild består med de tre kendte podcast/SEO tracing-advarsler.
  Seks kompilerede Liv-ruter består opstart-/JSON-test uden nøgler. Liv v3-profilen
  er pakket med, og 207 deployment-manifester består uden tmp, Git eller root-env.
- Fælles `lib/images`-moduler, SEO-image optimizers, packages, lockfile og
  deploymentkonfiguration er uændrede.

Skills: Next.js/CMS til server- og feltkobling, OpenAI-nøglesikkerhed til at
bevare det tidligere godkendte nøglevalg uden nye credentials, React-review til
formular, server/client-adskillelse og eksplicit handling frem for sideeffekter.
