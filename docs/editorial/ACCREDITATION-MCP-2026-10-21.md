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
- Rerouting, allowlist, dry-run, kontaktfravalg, manglende credentials eller
  transportændring stopper afsendelsen. Ingen af disse indstillinger ændres.
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
kontakter eller en knap til at omgå eksisterende teststop. Gemte arkiver og
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

Det eksisterende agentstop er stadig automationEnabled=false/paused=true/dryRun=true
og testredirect er stadig ejerens Gmail-testadresse. Ingen rigtige ansøgninger er
sendt, ingen tilladelser er simuleret, og ingen settings/credentials er ændret.
Åbning for personligt godkendt live-send er et særskilt ejervalg; det gamle stop
efter historisk IMAP-replay må ikke fjernes som en bivirkning.
