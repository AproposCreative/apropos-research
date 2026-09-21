# Drift, forbrug og ugens briefs

## Leverance

1. Udbyg eksisterende ejerbeskyttede driftspanel med dagens verificerede live-link, tidspunkt for beviset, næste historie og konkret, sikker årsagskode.
2. Vis omkostninger pr. registreret handling ved eksplicit åbning. Hold estimeret forbrug, reservationer og uafklarede kald adskilt; beløbene er ikke providerfaktura.
3. Saml fælles budgetprojektion og providerfejlklassifikation. Genbrug statusforklaringer mellem kø og drift. Bevar billedvalidering, separate budgetter og idempotens.
4. Klargør fem briefs via Livs serverflow. Uændret automatisk standard: én kommende historie; større batch kræver eksplicit redaktionelt valg.
5. Test uden betalte AI-kald, deploy præcis commit, verificér API og kø.

## Redaktionel bestilling

Brugerens brief er en bestilling og et researchspor, ikke verificeret faktagrundlag.

- Slow Horses sæson 6: kritisk researchanmeldelse om stabil kvalitet kontra forudsigelighed. Karakterpejlemærke 5/6 skal begrundes. Bekræft sæson, premiere, Gaby Chiappe, forlæg og tilgængelige afsnit; bedøm ikke en uset hel sæson. Titel begynder med “Anmeldelse: Slow Horses sæson 6”.
- Toy Story 5: researchanmeldelse om legetøj, Lilypad og forældres skærmskyld; pejlemærke 4/6. Bekræft dansk Disney+-dato 23/9 før den anvendes. Ingen udokumenterede aggregatorprocenter. Titel begynder med “Anmeldelse: Toy Story 5”.
- Tokyo Game Show: gaming-feature om nostalgi som teknologisk og økonomisk model. Bekræft jubilæum, datoer, påstået tyfonaflysning og spilnyheder. Ingen udokumenterede trailere eller udgivelsesdatoer.
- Christopher: musikfeature om store danske headlinershows og koncertøkonomi. Bekræft Øresundsparken, 4/9/2027, 50.000/60.000 og arrangørens rekordpåstand. Ingen opdigtede interviews eller billetøkonomi. Christopher skal nævnes i titlen.
- Amalie Smith: kunsthistorie om “Levende”, kunstigt liv og vores kategorier. Bekræft Charlottenborgs datoer, installationer, Radio Levende og Simon Brinck. Intet påstået besøg/interview uden belæg; et eventuelt interview afventer faktisk svar.

Alle tekster: Livs kanoniske tone, tydelige emnetitler, passende eksisterende længde, emner/primary topic, rigtige kreditter, hero og to forskellige brødtekstbilleder. Ukendte rettigheder forbliver ukendte.

## Første produktionsaflæsning

21/9 kl. ca. 09.25 dansk tid: kø/preparation aktiv, tre eksisterende klargjorte artikler 21–23/9 (Ed Sheeran, Monster, Suno/Spotify), ingen blokeringer på disse. Eksisterende arbejde skal bevares. Toy Story til 23/9 kolliderer med Suno; prioritering er spurgt separat.

Vercel CLI-session blev fornyet med eksisterende login. Fire indledende researchopslag via `/api/research-engine` fik 503; ledger viste provider HTTP 429. Ingen af dem gav verificerbart kildemateriale. Gamle receipts registrerer ikke providerens præcise fejlkode. Ingen nye researchkald før årsagen er afklaret; reservationer må ikke nulstilles eller kaldes faktureret forbrug.

## Afslutningsbevis

### Implementeret og verificeret

- Produktionskode: `d9cfe49ad357bc2ac509b8ddd451fa9410e74968` (inklusive `83bd068107297c83b745ef34001fbb5121eecc9b`).
- Vercel deployment `dpl_86hqTjYw9aF7XLiHY2UukXyBMWvN` er READY, med den præcise SHA og aliaset `ai.aproposmagazine.com` verificeret.
- 285 testsuiter / 3.957 tests bestået i isoleret testlager. TypeScript og scoped lint bestået. Ingen betalte AI-kald i regressionstestene.
- Otte isolerede browser-scenarier ved 390 og 1280 pixels bestået uden JavaScript-fejl eller vandret overflow. Forbrugslisten hentes først efter brugerens klik.
- Produktion: `/api/editorial/operations`, `/api/ai-cost/actions` og `/api/liv/delivery/feed` returnerer 200 med privat, ikke-cachebar respons. Forbrugsvisningen læste 507 grupper af eksisterende registreringer.
- Dagens live-status kræver gemt publiceringsbevis med gyldigt link og tidspunkt. En READY deployment eller et CMS-item tæller ikke som publiceringsbevis.
- Delte budgetprojektioner, sikre providerfejl og statusforklaringer er samlet. Providerafvisning stopper skift til flere emner; den skjules ikke længere som manglende research.

### Ikke færdigt: ugens fem artikler

Fem briefs er bevaret i `WEEK-BRIEFS-2026-09-21.json`. Filen er alene en lokal bestilling med foreløbige datoer, ikke et API-kvitteret køresultat. Ingen af de fem artikler er skrevet, billedbehandlet, oprettet i CMS eller lagt i udgivelseskøen i denne leverance.

Et enkelt researchforsøg efter deployment returnerede HTTP 503 med sikker kode `rate_limited`; den underliggende providerstatus er 429. Et efterfølgende read-only GET på OpenAI `/v1/models` returnerede 200. Det bekræfter nøglens adgang til modellisten, men ikke adgang til betalt generation eller sund kvote. Der er ikke belæg for at konkludere, at credits er opbrugt. Ingen nøgle er roteret, intet budget hævet, og intet køb foretaget.

Appens fælles månedsbudget var ikke opbrugt ved aflæsningen: ca. 100,03 kr. estimeret og 9,82 kr. reserveret af 300 kr. Det er ikke en providerfaktura; uafklarede reservationer er bevaret.

Eksisterende klargjorte historier til 21–23/9 er uændrede. Senere datoer indeholder gamle planposter og afsluttede fejlforløb, som ikke er overskrevet eller slettet. En ny bestilling skal placeres eller erstatte planer gennem en auditeret serveroperation uden at nulstille betalt arbejde. Toy Story-prioriteringen til 23/9 er fortsat uafklaret, og datoen i brugerbriefet er endnu ikke kildebekræftet.

Næste nødvendige trin: afklar den vedvarende provider-429, gennemfør ét vellykket researchkald gennem appens API, og placer derefter briefs via den auditerede plan-/genoptagelsesfunktion. Først derefter artikelproduktion, billedvalidering og verificeret køaflevering. Dagens udgivelse er ikke verificeret live i denne aflæsning.
