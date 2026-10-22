# Mål: koncertlink til personligt akkrediteringspreview

Ejerbestilling 22. oktober: færdiggør eksisterende system, ikke en ny mailklient.
Det eksisterende trådmål er »stop først når alt er testet og deployed«. Mål-API'et
afviste et nyt mål, fordi dette stadig er uafsluttet; det lukkes ikke kunstigt.
Denne konkrete acceptliste styrer det genoptagne akkrediteringsarbejde.

## Acceptliste

- [x] MCP læser et offentligt koncertlink sikkert, med kilder og usikkerhed (simuleret kilde + eksisterende sikker HTTPS-læser).
- [x] Samme deterministiske kontaktvurdering som eksisterende system, koblet til alle otte datakilder.
- [x] Relationer/fravalg/historik bevares; ingen opfundet kontakt eller dækning i test.
- [ ] Genbrug eksisterende sag; gem udkast versionsbundet og uden afsendelse.
- [x] Hele mailen og personlig engangsgodkendelse i MCP-preview er dækket af simuleret widgettest; native klientvisning udestår.
- [x] Regression, owner-isolering, no-paid-AI og no-autosend verificeret lokalt (17 filer/157 tests).
- [x] Eksakt release deployet og læst tilbage gennem produktions-API.
- [ ] Native chatværktøj og synligt preview verificeret i den eksisterende tråd.

Ingen koncert er valgt endnu. Sluttest med en rigtig koncert kræver et valgt link;
automatiserede tests bruger syntetiske koncerter og ingen rigtig SMTP-afsendelse.
Serverrelease, værktøjskatalog og faktisk klientvisning rapporteres adskilt.

## Udgangspunkt

V48/source0391dc32 har 12 akkrediteringsværktøjer og owner-only personlig send.
Denne chats tilgængelige værktøjskatalog mangler dem stadig. Legacy-research bruger
en betalt researchfunktion, mens MCP alene gav substring-kontaktmatch. Den rene
kontaktvurdering genbruges uden at åbne betalt research eller automatiske mails.

## V49 implementering og lokal verifikation

`research_accreditation_event` er det trettende akkrediteringsværktøj og er
owner-only/læsende. Det genbruger den eksisterende DNS-pinnede HTTPS-læser med
redirect-, byte- og tidsgrænser. Op til fire udtrykkeligt angivne sider kan
give konkrete, men ubetroede eventpåstande, dato, sted, arrangør, publicerede
pressemails og kildehashes. Primærlinket skal lykkes før eventoplysninger
udledes. Aflyste arrangementer, modstridende oplysninger, delvis kontaktkilde-
fejl og over 40 mulige eksisterende sager bliver manuel kontrol, aldrig
automatisk valg. Ingen sag, kladde eller mail oprettes af researchværktøjet.

Den rene kontaktvurdering er udskilt fra den gamle betalte researchfunktion,
som ellers er uændret. Privat mail-preview håndterer både den kanoniske
MCP-resultatindpakning og ældre host. Tests bruger kun syntetiske sider,
kontakter og SMTP-/UI-stubs. Type-check, scoped ESLint og security:config
bestået. Ingen rigtig arrangørmail sendt eller personlig approval simuleret.
Tidligere release og datakilder: ACCREDITATION-MCP-2026-10-21.md.

## Live releasekontrol, 22. oktober kl.15:12 Copenhagen

Commit `447613f2a161fcf2aa5581e663a4c5fdc92ae6af` er skubbet til
`codex/image-preflight-v30`; Vercel `dpl_H5EAfJWrgNPgweRpLER1vmbMege8`
er READY og promoveret til den faktiske `ai.aproposmagazine.com`-alias.
Cloudbuild/TypeScript og direkte health200 bestod. Produktions-API med
eksisterende ejer-serviceauth gav200/private-no-store for context, list og
den nye læsende research-action. Alle otte kontaktkilder blev rapporteret;
tre eksisterende sager, ikke nye. En bevidst ikke-eventside (example.com)
blev hentet som syntetisk smokecheck: én side, nul eventpåstande og korrekt
`confirm_event_details`, uden mailafsendelse eller betalt AI. Uautoriseret
førsteparts-POST gav401. `npm audit --omit=dev` rapporterede nul kendte
produktionsafhængigheds-advarsler; Vercels `npm ci` viste 14 advarsler når
dev-afhængigheder medregnes, som ikke er løst i denne release.

Serveren er live, men denne ChatGPT-forbindelses klientkatalog har endnu ikke
det nye akkrediteringsværktøj; native ⭐-chatpreview og faktisk link→kladde
kan ikke erklæres verificeret. Ingen koncert blev valgt af ejeren i denne
tur, så ingen sag/kladde/opfølgning blev oprettet. Én refresh af Apropos AI-
forbindelsens værktøjskatalog og ét konkret koncertlink er tilbage for en
virkelig, personligt godkendt ende-til-ende-gennemgang. Ingen arrangørmail
sendes uden ejerens eget knaptryk.
