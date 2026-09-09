# Liv: kildebaseret kontrol før publicering

## Omfang og adgang

Lokal implementering oven på `f703c31`. Brugeren har bekræftet credential-rotation
og godkendt genbrug af den roterede OpenAI-nøgle hos Vercel. Nøglen er ikke hentet
ned, og der er ikke oprettet eller ændret credentials. Ingen produktionskald,
CMS-skrivninger, push eller deployment er udført i dette trin.

Kun dette checkout er anvendt. Ingen nye dependencies eller installationsscripts.
SEO-opgavens billedoptimering og worktree er ikke ændret eller indlemmet.

## Implementeret

- Det eksisterende `/api/factcheck` får kildebaseret kontrol, når `sourceUrls`
  er medsendt. Writerens eksisterende kald uden kilde-URL’er forbliver rådgivende
  modelkontrol og kan ikke godkende Livs auto-publicering.
- Liv sender titel, undertitel, intro, hele brødteksten, uddrag og SEO-tekster.
  Den tidligere afkortning til de første 6000 tegn er fjernet. Over 40000 tegn
  afvises eksplicit frem for at kontrollere en skjult delmængde.
- Kilder hentes server-side fra højst otte unikke URL’er. HTTPS uden credentials,
  offentlig IPv4 med DNS-pinning, ingen redirects, cookies eller interne headers.
  Maksimum 12 sekunder og 1 MB pr. kilde. Ingen PDF, komprimeret eller loginbeskyttet
  fallback. Udtræk begrænses til 16000 tegn fra `article` eller `main`.
- Kildedato læses fra publiceringsmetadata, ikke et vilkårligt arrangementsdato-felt.
  Manglende, ugyldig eller fremtidig kildedato kan ikke understøtte en godkendelse.
  Ældre kilder kan bruges som baggrund; det daglige emnevalg har fortsat sit
  særskilte syvdagesfilter.
- Modellen modtager faktisk hentet tekst. Hvert artikelafsnit skal være med i
  kontrollen, og faktuelle påstande skal have ordrette belæg fra en hentet kilde.
  Ukendte kilde-ID’er, opdigtede belæg, dublerede/manglende afsnit, konflikt og
  afbrudt modelsvar giver ikke godkendelse.
- Godkendelsen kræver belæg fra mindst to forskellige kildeværter, samme SHA-256
  artikelversion og et højst 15 minutter gammelt resultat. Kildetekstens hash,
  URL, dato og citerede belæg følger det godkendte gate-resultat til den eksisterende
  Firestore-historik. Hele de hentede websider gemmes ikke.
- API-fejl returnerer kontrolleret JSON. Fejlresponsers rå indhold logges ikke
  længere af Livs faktatjek-kald.
- Preview har samme 300-sekunders maksimum som det eksisterende daglige job,
  så artikelgenerering og det nye faktatjek ikke skal dele den gamle 120-sekunders
  grænse. Faktatjekket har egne tidsgrænser; live-latenstid skal stadig måles.
- Cron har en eksplicit CMS-publiceringsport, og preview kan ikke vise
  `canAutoPublish=true`, mens billedrettigheder og faktiske CMS-referencefelter
  mangler kontrol. Den eksisterende strukturkontrol er ikke ophøjet til en
  rettigheds- eller live-CMS-godkendelse.

## Hvad dette ikke beviser

Automatisk ekstraktion og vurdering af påstande er stadig modelbaseret. En korrekt
JSON-struktur og et matchende citat beviser ikke i sig selv korrekt semantisk
fortolkning eller udtømmende identifikation af alle faktuelle påstande. Det skal
afprøves på rigtige kulturartikler, modstridende kilder og redaktionelt bedømte
testeksempler, før en live publiceringsport må åbnes.

To forskellige værter er heller ikke bevis for to uafhængige redaktioner. Der
mangler klassifikation af primærkilder, ejerskab og syndikeret indhold. URL-listen
kommer fra eksisterende research; dette trin bygger ikke en ny søgemotor.
Den eksisterende Responses-provider bruger kildehenvisninger, men sådanne lister
er ikke en erstatning for hentet kildetekst. Se [OpenAI: web search sources](https://developers.openai.com/api/docs/guides/tools-web-search#sources).

## Næste releasekrav

1. Kontroller faktatjekket i en godkendt deployment med den eksisterende Vercel-nøgle.
   Brug positiv kontrol, falsk dato, udateret kilde, opdigtet citat og påstand til
   sidst i en lang artikel. Ingen af disse tests må publicere.
2. Fuldfør billedvalg/generering, permanent lagring, faktisk billedstørrelse,
   alt-tekst og dokumenteret brugsret. Kildens offentlige billed-URL er ikke en licens.
3. Kontroller Webflow-forfatter, kategori og øvrige referencefelter mod CMS-schema;
   opret én godkendt kladde og læs alle gemte felter tilbage.
4. Bind samlet godkendelse til artikel- og billedversion, og kontroller dublet-
   og retry-adfærd ved Webflow-timeout. Hold Instagram særskilt blokeret indtil test.
5. Få særskilt godkendelse af det præcise releasecommit, før push/deployment.

## Lokal verifikation

- 537 tests i 48 filer består, inklusive nye tests af evidens, API-fejl,
  kildehentning, datokontrol og cron-stop før CMS-publicering.
- Global TypeScript-kontrol og målrettet ESLint består.
- Testlageret er `./tmp/vitest-rage`; ingen tracked research-data er ændret.
- Produktionsbuild består med `--no-experimental-require-module`. De tre eksisterende
  tracing-advarsler i podcast/SEO er uændrede.
- Fem kompilerede routes kan importeres og returnerer 401/JSON uden autentificering:
  editorial/desk, liv/status, liv/plan, liv/preview og factcheck.
- 207 deployment-manifester kontrolleret uden tmp, Git eller root-env-filer.

Anvendte skills: OpenAI credential gate og Next.js route handlers.
