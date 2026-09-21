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

Afventer tests, deployment, præcis providerdiagnose og artikelproduktion. Dette dokument er ikke bevis for, at fem færdige artikler er oprettet.
