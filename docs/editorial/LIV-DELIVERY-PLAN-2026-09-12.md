# Liv: én artikel hver dag

Dette er den samlede leveranceplan fra 12. september 2026. Ældre todo- og
releasefiler er historik, ikke konkurrerende planer.

## Produktløftet

Liv forbereder, researcher, skriver, illustrerer, kontrollerer og udgiver én
selvstændig dansk Apropos-artikel hver kalenderdag via serverens API-flow.
Normal udgivelse er kl. 10 i Europe/Copenhagen. En åben browser, denne samtale
eller en ulåst computer må ikke være en forudsætning. Instagram er slukket.

Frederik kan vælge mellem fem faktiske, færdige forslag i Kommende. Hvert kort
viser billede, titel, kategori og resumé med Godkend/Afvis og detaljevisning.
Godkendte historier prioriteres, ellers vælger Liv. Afviste historier vælges
aldrig. En redaktionel beslutning er ikke en øjeblikkelig publicering.

## Acceptkrav

- Én verificeret publicering pr. dansk kalenderdag. Idempotens forhindrer to
  artikler ved gentagne cron-kald. En tvetydig CMS-skrivning afklares først.
- Fem færdige forslag og tre kvalitetssikrede, tidsrobuste reserveartikler.
- Daglig feature som udgangspunkt 650 ord; de faktiske længdegrænser i
  CMS-kontrollen håndhæves. Anmeldelser følger valgt format og begrundet rating.
- Kanonisk Liv-stemme, egen tese og kulturfaglig fortolkning, konkrete eksempler
  og modargument. Ingen opdigtede visninger, interviews, kilder eller citater.
- Dokumenteret research, dato- og dubletkontrol, originalitet og korrekt CMS.
  AI-feltet bevares. Hero plus to forskellige brødtekstbilleder, alt-tekster og
  faktiske credits. Korrekte billedproportioner. Ingen AI-filmscener.
- Betalt tekst og billeder gemmes og genoptages; tidligere fejl slettes ikke.
- Manglende dagens artikel giver synlig fejlstatus, ikke et grønt succesflag.

Eksterne tjenester kan fejle. Driftsmålet er daglig levering med reserver,
kontrollerede retries og tydelig fejlmelding, ikke et udokumenterbart løfte om
100 % oppetid.

## Verificeret udgangspunkt 12. september

OpenAI-test returnerede HTTP 200. Forberedelse og auto-publicering er aktiveret,
og cron-jobbene er registreret. Det er ikke tilstrækkeligt: køen har nul klar
og nul reserve. Seneste publiceringskvittering er Headline Flip 11. september.
Forberedelses-API svarede `no_unstarted_work`; dagens udgivelse er ikke bevist.

## Eksekveringsrækkefølge

1. **Kø og genstart:** dæk i dag først; behold én uges horisont frem for kunstige
   fremtidsdatoer. Genoptag gemte trin, korrekt scope og oprindelig plan.
2. **Tidsbudget:** adskil tekst, billeder og slutkontrol i gemte, fortsættelige
   servertrin. Hvert trin får sit eget funktionsbudget.
3. **Fejlhåndtering:** autentificeret, idempotent genstart af præcist identificeret
   fejlet arbejde med auditkopi. Ingen sletning, tilfældige nye run-id'er eller
   omgåelse af kvalitetskontroller.
4. **Research og medier:** reparer dokumenterede fejl, genbrug gemte aktiver,
   behold alle redaktionelle og tekniske kontroller.
5. **Release:** isolerede tests, typecheck, sikker build, push og eksakt deployment.
6. **Produktionsbevis:** kør dagens normale API-flow og kontroller Webflow samt
   offentlig artikel. Fyld derefter fem forslag og tre reserver.
7. **Driftsbevis:** næste planlagte serverkørsel skal kunne gennemføre uden manuel
   hjælp. Kontroller mobilfeedets data, valg, afvisning og dubletbeskyttelse.

## Senere optimering, ikke ekstra launch-krav

Nyhedsbrevets tidligere manglende udsendelse undersøges separat. Bredere
AI-Writer-oprydning og flere illustrationstemplates må ikke forsinke den
daglige leverance. Finjustering af prompts er ikke det samme som modeltræning.

## Status

Under implementering. Ingen ny artikel eller færdig daglig drift er erklæret
verificeret endnu. Test-, release- og publiceringskvitteringer tilføjes her.
