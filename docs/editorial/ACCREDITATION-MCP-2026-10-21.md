# Koncertakkreditering via ejerens MCP

## Formål og afgrænsning

Ejerbestilling 21. oktober: koncertansøgninger fra eksisterende ⭐-redaktionstråd,
med hele den eksisterende kontakt-/relations- og sagskontekst. Ingen ny tråd,
parallel sagsdatabase, backend-AI eller automatisk afsendelse. Ingen konkret
koncertansøgning er bestilt eller sendt under implementeringen.

## Genbrugt system og MCP-dækning

| Eksisterende del | MCP-forløb |
| --- | --- |
| Contacts etc. | Søg alle udfyldte rækker i A:AZ, behold danske originalfelter, mails, kontaktfravalg og kildekolonner |
| Mailbox contact archive | Søg eksisterende arkiv, ikke en ny fuld mail-scanning |
| Vigtige billetkontakter og Dansk kontaktbank | Prioritet, organisation, billetrolle, relation, officiel kilde, sikkerhedsregel og noter; read-only |
| Milo, Muligheder | Historiske muligheder fra begge parallelle lister; alle originale felter, ikke aktuelle eventløfter eller kontaktbevis |
| Kontaktmemory og IMAP-kontaktoversigt | Relation, fravalg, reviewstatus, senest observeret kontakt; ingen opdigtet aktuel eventansvarlig |
| Accreditation workflow | Historiske koncert-/kontaktforbindelser; eksplicit sync af én valgt sag, aldrig skrivning til kontaktfaner |
| accreditationRequests og LIV-ID-tæller | Samme sag, dato, spillested, antal, navne, adgangstype, kildebelæg, delivery recipient |
| accreditationEmailThreads / approvals / audit | Samme mailtråd og kø; nye private kladderevisioner bevarer tidligere ordlyd |
| Owner-only Frederik/Liv indbakke | Læs med eksisterende mailværktøjer; link en fuldstændig tidligere læst mail med matchende kontakt og sagsmarkør/referencer |
| Livs SMTP og Sendt-mappe | Eksisterende afsender/transport, kun personlig versionsbundet send; ingen ny provider |
| Svar, opfølgning, udfald | Personlige udkast; opfølgning tidligst ved eksisterende frist og højst to; dokumenteret tilsagn/afslag separat |
| Billetter/adgangspakker | Eksisterende sikre filer, links og gæstelisteinstruktioner; alle valgte filbytes revalideres før personligt send |

De 12 nye værktøjer: get_accreditation_context, search_accreditation_contacts,
list_accreditation_requests, get_accreditation_request, save_accreditation_request,
save_accreditation_draft, get_accreditation_draft, link_accreditation_mail,
set_accreditation_outcome, sync_accreditation_sheet, preview_accreditation_draft
og **app-only/private** confirm_accreditation_draft. get_workflow(accreditation)
og ejerknappen Koncertakkreditering i redaktionskortet guider samme chat.

## Brugerforløb

1. Brugeren vælger koncert, dato, spillested, ansøgere, antal og ønsket adgang.
2. Chatten finder eksisterende sag og relevante kontakter, undersøger aktuelle
   eventoplysninger med egne researchværktøjer og angiver usikkerhed/kilder.
3. Et privat ansøgningsudkast gemmes på samme sag. Ingen mail sendes her.
4. Hele teksten, Liv som afsender, den præcise modtager, event og bilag vises i
   chatten. Kun Frederik kan trykke Godkend og send. Rettelser giver nyt preview.
5. Svaret kan knyttes til samme sag; opfølgning, svar og videresendelse har hver
   sit konkrete personlige preview. Ingen automatisk udfaldsafgørelse fra mailtekst.

### Rettelse efter ejerens Kneecap-gennemgang, 22. oktober

Før sagslagring og første udkast skal chatten afklare antal billetter og formålet med hver billet;
den må ikke vælge én pressebillet som standard. I den aktuelle sag er ønsket to
billetter: én til redaktøren, der vil anmelde, og én til en ledsager uden endnu
oplyst navn. Ekstern omtale skal være »vores redaktør«, ikke ejerens fulde navn,
medmindre han særskilt vælger navnebrug eller arrangøren kræver et navn til
udstedelse. Spørg før sådan navnebrug.

En tidligere kontakt må kun beskrives med den korrekte begivenhed og dato.
Michelle hos DTD svarede om The Brian Jonestown Massacre i 2025 og inviterede
til kontakt om kommende shows; det var ikke en dialog om Kneecap, et tilsagn
eller bevis for hendes nuværende rolle. Ejeren har valgt »Hej Michelle« til
DTD's officielt angivne fælles presseadresse, mens usikkerheden bevares i sagen.
En test til ejerens Gmail er en særskilt mail, ikke første afsendelse i den
rigtige koncertsag. Den kræver fortsat personligt Godkend og send.

Efter hvert nyt eller rettet akkrediterings-/testudkast skal assistenten gengive
den **aktuelle fulde mail i sit eget chatsvar**: faktisk Fra, Til, valgt CC/BCC,
emne, brødtekst og signatur. Skeln mellem testens Gmail-modtager og arrangøren.
MCP-preview og reviewlink er kun ekstra visning og personlig sendegodkendelse;
de erstatter aldrig teksten i chatten. Vis aldrig en forældet revision eller
antyd afsendelse uden en faktisk kvittering.

## Sikkerhed og bevaring

- Verificeret owner-identitet, ikke blot adminrolle, gælder alle nye MCP-tools.
  Den gamle akkrediterings-UI og /api/accreditation er også owner-only, så mail-
  og kontaktdata ikke lækkes gennem en alternativ kollegaadgang. Eksisterende
  signerede services/webhooks beholder deres adskilte serverautorisation.
- Førstegangsovertagelse af en legacy-sag gør kun denne sag personlig. Centrale
  transport- og automationsguards forhindrer legacy/manual/API/cron i at sende den.
- Bekræftelsen er kortlivet, UI-only og bundet til uid, OAuth-grant, sagsversion,
  tekst, modtager, afsender, tråd, adgangspakke og kladderevision.
- Et permanent afsendelsesforsøg gemmes før SMTP. Dobbeltklik, timeouts og ukendt
  resultat må aldrig give et nyt forsøg, heller ikke via ny operation/kladde.
  SMTP-accept er ikke dokumenteret levering i modtagerens indbakke.
- Legacy-testredirect, allowlist og agentens dry-run forbliver uændrede. Ejeren
  har særskilt godkendt en ny personlig kanal, bundet til hans verificerede uid
  i `accreditationMcpPolicy/personal`. Kun et konsumeret, præcist UI-samtykke kan
  vælge den kanal; et flag fra en caller er ikke nok. Den sender til modtageren
  i previewet uden testredirect. Ingen MCP-/REST-operation kan aktivere kanalen.
- Kontaktfravalg, manglende credentials, transportændring, deaktiveret personlig
  policy og eksplicit globalt env-sendstop stopper fortsat personlig afsendelse.
- HTML indeholder præcis den viste tekst, ikke en skjult standardsignatur,
  gamle rækkeviddetal eller automatisk løfte om Instagram-dækning.
- Billetfiler skal have kendt sikkerhed, type, størrelse og identiske SHA256-bytes.
  Højst 12 MiB samlet. Usikre filer sendes aldrig. Links åbnes ikke automatisk.
  Et tilsagn, modtaget adgangspakke og serveraccepteret videresendelse er separate
  statusser; receipt lover ikke recipient delivery.
- Sheet-sync er eksplicit, serialiseret og permanent claimet før ekstern skrivning.
  Timeout kræver readback, ikke blind retry. MCP-felter skrives RAW, aldrig som
  eksekverbare spreadsheet-formler. Kildearkene for kontakter er read-only.
- Sheets læses med åbne kolonneintervaller, ikke det tidligere 500-rækkers vindue.
  MCP-resultater pagineres. Delvise kildefejl markeres, ikke omskrives til nul fund.
- Mail/links/kontaktnoter er ubetroede data. Ingen CAPTCHA/login/formularbetaling,
  kontraktaccept, automatisk afsendelse eller provider/budgetændring.

## Bevidste grænser

Der tilføjes ikke en automatisk bred mailbox-scan, masseredigering/import af
kontakter eller en knap til at ændre eksisterende teststop. Gemte arkiver og
relationsmemory kan være daterede. Kontaktsammenfald beviser ikke eventansvar.
Manuelt linket ejer-mail henter ikke nye vedhæftninger: eksisterende sikker
indgående ingestion skal have gemt filerne, før en billetpakke kan sendes.
Gamle markedsføringstal i legacy-templates er ikke aktuelle verificerede tal.

## Verifikation

Isolerede regressions-/protokoltests dækker owner/uid/grant/scope, alle otte kilder,
dubletter, exact preview, gamle versioner, timeout, ændret sag/mail, fravalg,
opfølgning, pause/resume, adgangspakker og Sheet-sync. Browserfixture dækker
mobil/desktop, CSP, ubetroet HTML, dobbeltklik, tabt kvittering, afvist/udløbet
eller manglende token. Det er simuleret afsendelse, ikke kontakt til arrangører.

Live release- og læsende kildeverifikation tilføjes efter deployment. Et READY
deployment er ikke en sendt ansøgning eller bevis på den første native Work-knap.

Lokalt: 393 testfiler / 5602 tests bestået, type-check og security:config bestået;
ændrede produktionsfiler har ingen lintfejl. Widget-fixturen bestod normal send,
tabt kvittering, ukendt resultat, afvisning og udløbet/manglende bekræftelse.
Desktop/mobil er visuelt gennemgået. Ingen rigtig mailtransport blev kaldt.

Releasekontrollen fandt også den eksisterende transitive follow-redirects 1.16.0.
Kun denne lockfile-afhængighed opdateres til 1.16.1 for GHSA-q3jh-wrc6-jgq8 og
GHSA-8r9p-f939-6h3c; ingen nye direkte pakker. npm audit --omit=dev rapporterer
herefter 0 kendte sårbarheder. Dette er ikke en påstand om nul dev-afhængigheds-
advarsler eller en garanti mod ukendte sikkerhedsfejl.

### Livefund og kildekorrektion

Første læsende livekontrol på 695261e7 fandt 3 eksisterende sager og 247 samlede
kontaktposter gennem de først tilsluttede kilder. Metadata-/headerkontrol fandt
tre yderligere relevante faner og en eksisterende parserfejl: arket bruger
`Artist / event`, koden forventede `Artist/event`. Læsningen normaliserer nu kun
headerformatering og afviser tvetydige headers; arket ændres ikke.
Danske `Kontaktperson`, `Kontaktinformation`, `Rolle` og `Må kontaktes` fortolkes
nu eksplicit; fravalg bliver en sendblokering. Telefon/formular-URL bliver aldrig
opfundet til email. Dublerede/blanke headers og kolonne AA bevares. En foregående
festivaloverskrift bevares som ubekræftet rækkekontekst, ikke verificeret relation.
Lokal læsning mod de faktiske ark verificerede 2 workflow-rækker, 44 oprindelige
kontaktposter (20 med email), 38 billetkontaktposter, 46 danske kontaktbankposter
og 53 historiske mulighedsrækker. Tal er kildeposter, ikke unikke personer.
Ingen kildedata blev skrevet. Sync nægter at skrive ved ændret kolonnerækkefølge
eller dubleret sags-ID, og antal følger ticketQuantity frem for antal ansøgernavne.
Efter disse rettelser: 394 testfiler / 5607 tests, type-check og ændret-fil-lint
bestået. Den samlede testkørsel brugte isoleret RAGE_STORAGE_DIR.

Ved første livekontrol var det eksisterende agentstop stadig
automationEnabled=false/paused=true/dryRun=true og testredirect ejerens
Gmail-testadresse. Ingen rigtige ansøgninger blev sendt eller tilladelser simuleret.

### Ejerens særskilte personlige kanal

Ejeren svarede: “Ja, kun med min personlige godkendelse” på det konkrete spørgsmål
om rigtige akkrediteringsmails efter personligt Godkend og send, med automatiske
ansøgninger og opfølgninger fortsat slået fra. v44 implementerer derfor en separat
owner-bundet policy. Aktivering kræver en auditeret serviceoperation; den må ikke
skrive legacy-control, sink, allowlist, credentials, kladder eller samtykker.
Globalt env-sendstop bevares. Den første rigtige mail kræver stadig personens
konkrete valg og tryk på den private MCP-knap, og er ikke testet med en arrangør.

v44: 394 testfiler / 5609 tests bestået. Type-check, security:config og lint på
ændrede produktionsfiler bestået. Lokal widget-fixture bestået igen for normal,
tabt kvittering, ukendt udfald, afvisning, udløbet og manglende token. En test
kører den faktiske SMTP-kode med en fake transport og verificerer både personligt
exact-recipient-send og uændret legacy-testredirect i samme test. Ingen SMTP-
forbindelse eller rigtig mail i disse tests. Policy mangler/forkert uid/revokeret
og eksplicit globalt sendstop er også dækket.

### Endelig release og livekontrol, 21. oktober kl.18:51 Copenhagen

- Produktionssource `0d117672f9a7b8c1c9089e8cbf825e66ff14a709`, deployment
  `dpl_5vk78uoakBgQ2T6tMaRPn7sQSD54`, MCP `2026-10-21-v44`.
  Staget build/TypeScript/security bestået; health200 og privat API401 uden
  brugeradgang. Tidligere produktionssource 695261e7 genbekræftet før promote,
  derefter direkte ai.aproposmagazine.com-lookup READY med den præcise nye source.
- Ejerens separate policy aktiveret16:50:57.598Z via idempotent transaction og
  audit `accreditationMcpPolicyAudit/owner-enable-2026-10-21-v1`. Ingen samtykke-
  token, kladde eller mail oprettet af aktiveringen. Hashes før/efter for legacy-
  kontrol, sager, approvals, tråde, pakker, inbox-settings, betaltpolicy, providerhold
  og ledgers er identiske. Credentials og miljøvariabler er ikke ændret.
- Ejerautoriserede læsninger16:51:22–26Z: context/contacts/list alle200 med
  `private, no-store`. Alle8kilder available=true; 344grupperede poster fordelt
  på291kontaktposter og53historiske muligheder, plus3eksisterende sager. Ikke en
  påstand om291unikke personer eller53aktuelle koncerter. Ingen mailbody læst.
- Live personalSend.enabled=true/globalSendStopped=false,
  requiresPersonalConfirmation=true/automaticSendAllowed=false. Eksisterende
  SMTP-konfiguration tilLiv er klar; dette er ikke en ny SMTP-login/sendtest.
  Legacy automationEnabled=false/paused=true/dryRun=true, testredirect/allowlist
  uændret. Livekontrollens før/efter-state er identisk; ingen send/approval/paidAI.
- Native get_workflow(editorial) lykkedes16:51:08.946Z; serveraudit v44,
  statusok/paidAiAllowedfalse. Klientens tilgængelige værktøjskatalog var stadig
  cachet uden de nye akkrediteringsværktøjer. Genindlæs Apropos-værktøjerne én gang
  i samme⭐-tråd. Det native første nye preview/knaptryk er derfor IKKE verificeret
  gennem en virkelig ansøgning; ingen opdigtet personlig godkendelse eller send.
- Afgrænset runtime error/fatal-query16:41:22–16:51:22Z gav ingen records. Det er
  ikke bevis for nul fejl uden for dette vindue/filter. npm audit --omit=dev=0;
  buildens11dev-auditadvarsler er ikke ændret eller skjult.

Evidens ligger i `output/accreditation-personal-activation-*.json` og den nyeste
`output/accreditation-live-*.json` (lokale0600-filer med hashes/status, ingen
credentialværdier). Vercel-/verification-kontrollen omfattede både widgetfixture,
serverguards, faktiske kilder og live-readback; ikke kun et READY-build.
