# Trafik og nyhedsbrev, 30. oktober 2026

## Resultat og afgrænsning

Ejerens eksisterende trafikoverblik får et privat, søgbart modtageroverblik med tilmeldingsdato, aktuel medlemsstatus og kvitteringer pr. udsendelse. En særskilt ejerbeskyttet API henter personoplysninger først, når panelet åbnes. Medarbejdere får fortsat kun de tilladte samlede trafikdata. Alle svar er private/no-store; Firestore-klienter har ikke adgang til de nye private samlinger.

Ejeren har eksplicit godkendt åbninger og klik for fremtidige mails på `news.aproposmagazine.com`. Aktiveringen udføres efter produktionsdeployment og verificeres separat. Der sendes ingen mail som del af denne ændring. Nyhedsbrevets AI-intro, featurevalg, skabelon, tidsplan og SMTP/Resend-afsendelseslogik er bevaret. Manuelle testmails får blot en eksplicit testmærkning.

## Fund og rettelser

- `getNewsletterRecipients` slettede tidligere frameldingsposter, når samme adresse stadig fandtes i Webflow. Læsning er nu uden denne skrivebivirkning. Eksisterende frameldinger bevares. Uden verificerbar frameldingsdatabase godkendes ingen modtagere til afsendelse.
- Resend-domænet havde både åbnings- og klikmåling slået fra ved læsning 30. oktober kl. 14:06:53Z. Gamle mails har derfor ikke et dokumenteret nul eller en ulæst-status. Den eksisterende signerede webhook videresendte kun hændelser til GA4. Den gemmer nu også individuelle, deduplikerede kvitteringer privat med originale hændelsestider. Fejlet hændelseslagring returnerer 503 til webhookgenkørsel, aldrig til ny mailafsendelse.
- Google Search Console-rapporten begrænsede et dateret resultat til én række og præsenterede den som periodens total. Alle datoer summeres nu, CTR vægtes med samlede visninger. Separat organisk total erstatter summen af kun de ti største kilder.
- En 28-dages periode indeholder nu præcis 28 lokale kalenderdage inklusive i dag, også ved skift til vintertid. Alle periodeforespørgsler bruger samme kalenderdefinition.
- Trafikrapporter filtrerer på websidernes `page_view`. Mailkvitteringer fra Measurement Protocol indgår ikke som hjemmesidebesøg.
- Artikelvisninger samles på tværs af titelændringer og afsluttende skråstreger før rangering. Forfatteropgørelsen er ikke længere begrænset til de 200 største titelrækker.
- Antallet af publicerede artikler kommer fra Webflows faktiske live-inventar. Et eksisterende live-item kan have en ny kladde; kladdestatus er ikke dokumentation for, at artiklen ikke længere er online.
- En utilgængelig kilde erstattes ikke med et opfundet nul og fjerner ikke de øvrige kilder. Gamle periodeforespørgsler kan ikke overskrive en nyere valgt periode.

## Mål og kilder

Webflow har 18 bevarede, daterede tilmeldinger i de verificerede nyhedsbrevsformularer. Aktive modtagere filtreres med bevarede frameldinger. Tilmeldinger uden en kendt original dato er ukendte; CMS-importtid bruges ikke som tilmeldingsdato. Nye tilmeldinger er unikke daterede adresser i den bevarede liste, ikke et fuldstændigt historisk hændelsesregnskab over slettede formularsvar.

En komplet providerliste for det valgte vindue 3.-30. oktober gav 98 mailposter, hvoraf 68 havde eksplicit nyhedsbrevsmærkning; 30 andre mails blev udeladt. De 68 bevarede kvitteringer er læst fra Resend uden afsendelse. Listens ældste post er fra 2. oktober, så det aktuelle 28-dages vindue er dækket, men ikke hele den mulige årsperiode. Historikken viser en delvis dækning ved længere perioder. Ældre manuelle mails uden testmærkning har ukendt sendetype og må ikke antages at være udsendelser til alle abonnenter.

Frisk GA4-læsning 14:32:59Z: 2.062 aktive brugere, 3.099 sidevisninger, 2.301 sessioner, 667 organiske sessioner, 501 Google-klik og 21.321 Google-visninger i det aktuelle vindue. Dette er et dateret kildecheck, ikke faste UI-tal. Google kan være forsinket; dagens tal er foreløbige.

Åbninger er registrerede pixelsignaler, ikke dokumentation for menneskelig læsning. Apple Mail kan hente eksternt indhold automatisk. Klik tælles særskilt og opfinder ikke en åbning eller levering. API-last-event-snapshots beviser kun den navngivne hændelse og har ikke en kendt hændelsestid. Egentlige signerede webhooktider bevares. Ingen mailtekster, IP-adresser, user agents eller private klik-URL'er gemmes i den nye statistik. Frameldingslinks og personlige queryparametre sendes ikke til GA4.

## Verifikation før release

- 55 tests i 13 målrettede filer: autorisation, ejer/medarbejder-isolation, private/no-store, signaturkontrol, hændelsesdeduplikering og rækkefølge, ukendte historiske åbninger, testmærkning, persondatafiltrering, frameldingssikkerhed, tilmeldingsdatoer, live CMS-tal, periode/DST, Google- og artikelaggregering samt regression af AI-intro, feature og ugentlig afsendelse. Isoleret `RAGE_STORAGE_DIR=./tmp/vitest-rage`; ingen eksterne afsendelsestests.
- `scripts/verify-dashboard-ui.mjs`: faktiske React-komponenter med isolerede servicefixtures på 320/390/768/1440 px. Søgning, udsendelsesvalg, ikke-målt-historik, private lazy reads, medarbejderisolation, delvise kilder, afvisning af forældede perioderespons, ingen vandret overflow og mindst 44 px kontrolhøjde. Ingen rigtig brugerbrowser eller servicewrites. Skærmbilleder inspiceret.
- Scoped TypeScript og ESLint samt `git diff --check`. Ingen nye dependencies, globale CSS-ændringer eller Writer-ændringer.

Evidens ligger privat under `output/dashboard-20261030/`; rå adresser og tokens tilføjes ikke til Git.

## Kildereferencer

- [Webflow live-inventar](https://developers.webflow.com/data/reference/cms/collection-items/live-items/list-items-live)
- [Resend domæneopdatering](https://resend.com/docs/api-reference/domains/update-domain)
- [Resend åbninger](https://resend.com/docs/webhooks/emails/opened) og [klik](https://resend.com/docs/webhooks/emails/clicked)
- [Apple Mail Privacy Protection](https://www.apple.com/legal/privacy/data/en/mail-privacy-protection/)

## Produktionskvittering

Afventer den præcise deployment og efterfølgende domæne-readback. Ingen aktivering påstås alene ud fra implementering eller tests.
