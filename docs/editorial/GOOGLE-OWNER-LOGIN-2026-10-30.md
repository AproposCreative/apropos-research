# Ejerens Google-login, 30. oktober 2026

## Dokumenteret fejl

Ejeren kunne godkende Google-login med sin Gmail og sin Aproposcreative-konto, men blev efterfølgende sendt tilbage til start uden fejl. Firebase viste begge eksisterende konti som verificerede, aktive Google-identiteter med vellykket Google-login 30. oktober. Den efterfølgende web-adgangspolitik tillod kun Milo, Casper og Frederik på de tre præcise `@aproposmagazine.com`-adresser. Aproposcreative-kontoens eksisterende aktive databasepost kunne ikke tilsidesætte den regel.

Der var desuden en uafhængig UI-fejl: AuthProvider fjernede loginformularen under token-/adgangskontrol. Derved mistede formularen indtastning og lokal fejltilstand. `/login` viste ikke den bevarede kontekstfejl. Den isolerede browsertest reproducerede den tavse afvisning og tabte indtastning før rettelsen.

## Ejerens eksplicitte valg

Ejeren godkendte begge konkrete identiteter til samme ejeradgang som `frederik@aproposmagazine.com`:

- `frederik.emil.kragh@gmail.com`
- `frederik@aproposcreative.com`

Kun disse præcise adresser tilføjes. Der gives ikke adgang til andre Gmail-/Aproposcreative-adresser, plus-aliaser, underdomæner eller klientleverede roller. Firebase-verificeret identitet, bekræftet mail og aktiv konto kræves fortsat. En suspension på aliaset eller på den kanoniske ejeradresse blokerer aliaset. Tokens og MCP-revocation genkontrolleres som før.

## Implementering

- Samlet ejeridentitet i `lib/editorial-capabilities.ts`. Adgangsopslag arver den eksisterende kanoniske ejerrolle, men respekterer begge adressernes suspensionsposter. Oprindeligt Firebase-UID bevares.
- Samme ejeridentiteter anvendes i web/API, MCP og den eksisterende operatørkontrol for billedforsøg. Personlig godkendelse, billedvalg, revisioner, request-ID'er, grants og kvitteringer er fortsat bundet som før. Ingen forsøg/grant er oprettet eller taget i brug ved loginrettelsen.
- Firestore og Storage opdateres med de samme to præcise identiteter og kanonisk suspensionskontrol. Private data er fortsat bundet til det oprindelige UID. Eksisterende konti, kladder, profiler, medier, mailafsenderadresser og godkendelseshistorik flettes eller flyttes ikke.
- Loginformularen bliver stående under kontrollen, viser en tilgængelig fejl og navigerer først, når AuthProvider faktisk har accepteret adgangen. Google viser kontovælgeren. Man kan vælge en anden konto efter en afvisning uden at genindlæse.
- Ingen ændringer i Writer-design, budget, Liv-produktion, udsendelser eller udgivelse. Gamle kontiers rettigheder udvides ikke på baggrund af custom claims eller en gammel adminpost.

## Verifikation

- 247 tests i 14 relevante filer: adgangs- og ejerpolitik, begge aliases, verificering/disabled/suspension, både kanonisk og individuel tilbagekaldelse, MCP OAuth/PKCE/replay, loginfejl, auth-mail, ejerbeskyttede endpoints og billedforsøgenes eksisterende personlige kontroller. Isoleret `RAGE_STORAGE_DIR=./tmp/vitest-rage`.
- Den faktiske login-side, AuthProvider og route guard testes i headless Chrome med isolerede Firebase-/HTTP-transportfixtures: tilladt, afvist, midlertidig serverfejl, blokeret popup og lukket popup. Formular/indtastning bevares, fejl er synlig, ingen for tidlig redirect, og anden konto kan vælges efter afvisning. Ingen rigtig Google-konto eller browserprofil bruges i fixturetesten.
- Otte startup-scenarier på mobil/desktop, inklusive langsom/fejlet/timet-out værktøjsliste, fokusgenkontrol, logout/afvisning og kontoskift. Fixtureens gamle luk-knapvælger er rettet til den eksisterende kompakte menus `Luk værktøjer`; ingen ændring af selve Writer eller menuen.
- Scoped TypeScript, ESLint og diff-kontrol bestået. De ni beskyttede Writer/globale filer matcher før-hashes.
- Google Rules API kompilerede og bestod 15 adgangscases pr. regelsæt uden aktivering. Før ændringen matcher begge faktisk deployede regelsæts kildeindhold de hidtil committede filer. Ingen ukendte produktionsregler overskrives.

Live-verifikation bruger projektets eksisterende, afgrænsede Rules-releaseworkflow med rollback ved fejl. Dets klientprobe bruger RAM-baserede Firebase-custom-token-sessioner for de tre eksisterende ejeridentiteter, ikke en Google-browserlogin eller en personlig redaktionel godkendelse. Kun tilfældige, særskilt navngivne testkladder og en enkelt pixel-upload oprettes og slettes pr. konto. Ingen konto, mail, udgivelse eller OAuth-forbindelse oprettes.

## Produktionskvittering

Afventer præcis code SHA, aktivering af begge regelsæt, klient-readback og matchende Vercel-deployment. En bestået fixturetest alene påstås ikke at være et fuldført Google-login på ejerens telefon.

Privat evidence ligger under `output/google-login-20261030/`: konto-metadata uden rå UID'er, `ui-before.json`, `ui-after.json`, `rules-before.json` og senere produktionskvitteringer. Ingen adgangstokens eller private keys gemmes i evidence eller logs.
