# Mest læste: opfølgning på ejerens screenshot

Ejerens screenshot viser Deep Purple to gange med 119 og 59 visninger og ikke-sammenhængende placeringer ved skift til 12 måneder. Det er den tidligere titelbaserede rækkeopdeling og dublerede React-listenøgler. Den allerede deployede rettelse `e6855233c98a57c052c9966195a29624a1e370e9` samler pr. artikelsti før sortering og topgrænse. Den afviser også forældede periodeforespørgsler. Ingen ny produktionskode var nødvendig for denne opfølgning.

## Frisk kildeafstemning

30. oktober 2026 kl. 14:49:23.358Z matcher produktionsaliaset READY `dpl_2cNuzMQS8YVUp6CD8h8tRGG5nYyZ` og ovenstående code SHA. Læsende audit sammenlignede den aktuelle `fetchTopArticles` med to uafhængige GA4-forespørgsler: artikelsti alene og artikelsti plus titel. Alle bruger samme datoer og `page_view`-filter. Ingen persondata, CMS-skrivninger, betalte AI-kald eller ny deployment.

| Periode | Stier | Titelrækker | Stier med flere titelrækker | Unikke/sorterede top-15, afstemt mod stipræcise totaler |
| --- | ---: | ---: | ---: | --- |
| 7 dage | 86 | 91 | 3 | Ja |
| 28 dage | 198 | 206 | 6 | Ja |
| 90 dage | 244 | 351 | 90 | Ja |
| 365 dage | 264 | 582 | 213 | Ja |

Deep Purples tre titelrækker er 121 + 59 + 15 = **195 sidevisninger** ved denne kontrol. Samme artikel vises én gang: nr. 1 i syv dage, nr. 2 i 28/90 dage og nr. 9 i 365 dage. Det er et dateret snapshot; nye besøg og GA4-efterbehandling kan ændre tallene. Det er sidevisninger, ikke dokumenterede gennemlæsninger eller unikke personer.

Toppen af 365-dages-listen er Another Brick in the Wall 941, Monarch 427, Ghost of Yōtei 350, Den Gode Stemning 320 og Cæcilie Norby 306. Det enkelte screenshots ældre tal er ikke låst som facit.

## Regression

Testen for samling før sortering/topgrænse dækker nu alle fire perioder. Den isolerede headless mobil-/desktoptest skifter mellem 7/90/365 dage med ændret artikelliste og kontrollerer unikke links, sammenhængende placeringer, faldende totaler og at gamle rækker fjernes. Den bruger faktiske React-komponenter og fixtures, ikke ejerens browserlogin eller en kunstig GA4-hændelse. En allerede åben fane skal genindlæses for at hente den deployede klientrettelse.

Kildeevidens: `output/dashboard-toparticles-20261030/source-verification.json` og den tilhørende læsende `audit.mjs`; ingen credentials er gemt i kvitteringen. UI-evidens: `output/dashboard-20261030/ui/verification.json` og `year-ranking-{320,390,768,1440}.png`.
