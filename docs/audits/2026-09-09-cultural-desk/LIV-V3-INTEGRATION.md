# Liv v3: seneste redaktionelle beslutninger og lokal integration

Dato: 2026-09-09. Udgangspunkt: f0772e9. Ingen produktionskald eller nye nøgler.

## Beslutninger fra dialogen

- Liv skal have en varm, præcis, humoristisk og selvstændig stemme med tydelig dom.
- Researchanmeldelser kan vælges eksplicit og få 1-6 hele stjerner med begrundelse.
  Vurderingen er modelbaseret, ikke en faktisk filmvisning eller et kritikergennemsnit.
  Oplevelser, scener, citater og interviews må ikke opfindes som fakta.
- Brugeren ønsker kun det eksisterende AI-toggle i CMS. Der tilføjes ikke et badge,
  en ekstra byline eller en forklaringsblok i artiklen. Koden ændrer ingen Webflow-template.
- Andre mediers kritik er research. Tilskriv deres vurderinger, når de bruges;
  kopier ikke formuleringer, åbninger eller argumentationsrækkefølge.
- The Invite er testemnet. Der foreligger stadig ingen visningsnoter.

## Implementeret lokalt

1. `liv-brandt.txt` v3 er fælles profil for generator, briefing, Writer og TOV-kritiker.
   Writer placerer den i det låste kernesegment, så deaktivering af en gammel
   forfatter-TOV ikke fjerner den. Manglende/ukendt profil stopper frem for generisk fallback.
   Generatoren returnerer profilversion og SHA-256 samt modellens faktiske respons-ID.
2. Liv bruger den fælles `getResearch`-service med OpenAI Responses-websøgning,
   eksisterende kvalitetskontrol og fallback. Direkte briefkilder prioriteres.
   Genfundne kilder hentes igen med den eksisterende SSRF-sikre kildehenter.
3. Modelvalg er samlet og serverstyret: `LIV_GENERATION_MODEL`, `LIV_RESEARCH_MODEL`,
   `LIV_UTILITY_MODEL`. Standarder er gpt-5.6-sol til artikel/research og gpt-5.6-luna
   til hjælpeopgaver. Writer bruger disse valg, når Liv er valgt. Andre forfattere
   beholder deres eksisterende modelvalg. Ingen Vercel-env er ændret.
   Ukorrekte Claude-ID'er afvises eksplicit på OpenAI-vejen. CMS bruger faktisk
   artikelmodel frem for den tidligere opdigtede Claude-standard.
4. `livSourceArchives/{sha256(scope)}` indeholder undercollections `sources`, `media`
   og `topics`. Kilder identificeres ved hash af kanonisk URL. Metadata gemmes i
   transaktioner: URL, titel, kort uddrag (maks 300 tegn), dato, hentetid, teksthash
   og første/seneste registrering. Ingen fulde eksterne artikler gemmes.
   `retrieved_not_verified` er ikke en faktatjek-godkendelse. Mediehosts gemmes som
   `discovered`; de tilføjes ikke automatisk som betroede, aktive crawlere.
   Brugerens UID adskiller desk/preview; cron har server-scope `liv-daily`.
   Historik genbruges ved samme normaliserede emne, ikke ved semantisk emnesøgning.
   Intet nyt klient-endpoint til arkivet; server-Admin-SDK bruges. Produktionsregler
   for collectionen skal kontrolleres før release, ikke antages fra lokale mocks.
5. Artikelformat sendes fra Liv-panelet gennem preview og gemt daglig plan til cron.
   Ugyldige formater/stjerner, manglende begrundelse og afbrudt modeloutput afvises.
   Stjerner sendes til eksisterende `rating` -> `stjerne`; AI-markering er fortsat
   `aiGenerated` -> `ai-generated`. Readback kontrollerer den faktiske stjerneværdi.
6. Direkte tekstoverlap mod kilder og Apropos-stileksempler stopper generation.
   Eksisterende lighedskontrol skal også gennemføres. Ingen garanti mod al plagiat.
   Preview rapporterer ikke længere samlet gate-pass, hvis kontroller blev sprunget over.

## Verifikation og releasegrænser

Nye tests dækker kanonisk TOV i Writer, stjernevalidering, modelproveniens,
CMS-toggle uden tekstindsættelse, kildearkivets dedupe/isolation og hele
generator-til-CMS-koblingen med simulerede modeller og hentede kilder.
De simulerede artikler er tekniske fixtures, ikke The Invite-anmeldelser.

Der er ikke genereret en ny rigtig The Invite-artikel i denne ændring. Adgang til
de valgte modeller, reel tekstkvalitet, runtime-latenstid, live Firestore-regler,
UI-interaktion og Webflow-readback skal stadig testes i en godkendt deployment.
Billedsøgningen er bevaret; billedernes rettigheder, upload, trailer-handoff og
fuld autopublicering er ikke løst ved denne release. CMS-publiceringsporten forbliver lukket.
Ingen Instagram-post eller CMS-artikel er oprettet.

Nøglerotation/genbrug er tidligere dokumenteret i SOURCE-VERIFICATION.md.
Push/deploy af denne nye samlede release afventer særskilt godkendelse af eksakt
clean commit. Den allerede godkendte SEO-release 617a251 integreres lokalt før sluttest.
Ingen dependencyændringer eller npm lifecycle scripts. Vitest bruger isoleret tmp/vitest-rage.

## Modelreferencer

Modelnavne/endpoints kontrolleret i officielle dokumenter 2026-09-09:
[GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol) og
[GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna).
Dette er ikke dokumentation for adgang på Apropos' konkrete API-konto.

Anvendte skills: Next.js (server-/routekobling), OpenAI credential gate
(bevar allerede valgt nøgle, ingen provisioning) og deployments-cicd (releasekontrol).
