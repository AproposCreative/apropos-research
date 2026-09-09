# Liv runtime-hotfix, 9. september 2026

## Bekræftet årsag

Produktionslogs for feeb75a viste HTTP 500 på Liv preview, plan og status:
`firebase-admin/auth -> jwks-rsa -> require(jose)` fejlede med `ERR_REQUIRE_ESM`.
Den indloggede browser viste derfor `Unexpected end of JSON input`.
Health-endpointets 200-status dækkede ikke denne importkæde. Det tidligere
grønne build og unit-tests var utilstrækkelig runtime-verifikation.

Fejlen blev reproduceret lokalt med `node --no-experimental-require-module`
og import af firebase-admin/auth, uden produktionsnøgler.

## Rettelser

- Next.js bundler/transpilerer firebase-admin, jwks-rsa og jose sammen, så
  serveren ikke er afhængig af Node-runtime-understøttelse for require(ESM).
- Ingen dependency-versioner ændret eller pakker installeret.
- Livs klienter bruger fælles JSON-responsekontrol, som rapporterer HTTP-status
  og request-reference ved tomme/ugyldige svar. Ingen rå HTML-fejlsider vises.
- Historieantal er ukendt, når indlæsning fejler; det vises ikke længere som nul.
- Manglende preview er ikke længere en påstand om manglende trending-emner.
- En succesfuld refresh fjerner tidligere indlæsningsfejl. En handlingsfejl
  bevares, også hvis en efterfølgende refresh lykkes.
- Publiceringsporte, cron-plan og miljøindstillinger er ikke svækket.

## Verifikation før push

- 452 Vitest-tests bestået, heraf 10 nye tests af API-responshåndtering.
- Typecheck bestået.
- Produktionsbuild bestået med require(ESM) deaktiveret.
- Alle fire kompilerede Liv-route-moduler kan importeres med denne begrænsning;
  direkte uautentificerede handler-kald returnerer 401 med gyldig JSON.
- 207 deployment-manifester uden recovery/tmp/Git/root-env-filer.
- Eksisterende tre brede tracing-advarsler i podcast/SEO er ikke løst her.

Next.js- og React-skills anvendt til bundling og klientfejltilstande. Vercel-skills
anvendt til logs og deployment. Browser-CLI mangler; CUA bruges som fallback
til kontrol i brugerens eksisterende indloggede Studio-fane.

Dette hotfix er ikke en implementering af det manglende kildebaserede faktatjek
eller dokumentation for en automatisk publiceret artikel.

## Livekontrol efter 3985fb5

Vercel READY og korrekt build-id verificeret i den eksisterende indloggede
Studio-fane. Overblik, Historier, Kilder, Udgivelser og Indstillinger indlæser
uden JSON-fejlen. Driftsstatus viser Aktiv/Auto-live, og historikken henter 38
eksisterende publicerede CMS-artikler. En manuel discovery oprettede 10 idéer
og indlæste GA4-perioderapporten. Det er idéer, ikke publiceringsgodkendte artikler.

Livekontrollen afslørede desuden et gammelt GAFFA-emne (12.05.2026), der blev
vist som 5. december 2026. Livs daglige emnevalg har derfor fået en særskilt
dansk/ISO-datoparser og accepterer kun daterede kilder fra de seneste syv dage,
med højst fem minutters fremtidstolerance. Der ændres ikke i historiske
Firestore-dokumenter eller SEO-worktreet. Ti datotests dækker dansk dato,
ISO, ugyldige/udaterede/fremtidige og for gamle kilder. Dette filtrerer det
daglige trending-emnevalg, ikke alle discovery-idéer; kildeverifikation mangler stadig.
