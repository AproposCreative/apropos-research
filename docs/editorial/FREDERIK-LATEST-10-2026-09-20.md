# Frederik: ti nærlæste stilreferencer, 20. september 2026

Brugerbestilling: fyld Livs kø med artikler/anmeldelser og kalibrér skriveformen
med Frederik Kraghs seneste ti artikler. Første batch: tre kommende udgivelser
i alt; den allerede færdige Ed Sheeran-artikel bevares, to nye tilføjes.

## Udvælgelse og afgrænsning

Webflows live-API for dansk locale `67dbf17ba540975b5b21c225`, artikelcollection
`67dbf17ba540975b5b21c2a6`, author `684976c2eeebbaef2a59eb68`.
215 live-artikler blev listet, heraf 37 med Frederik som author. De ti nedenfor
er sorteret efter `createdOn` faldende. CMS har ikke et særskilt felt for første
publicering; `lastPublished` er påvirket af senere genpubliceringer og bruges
derfor ikke som oprindelig udgivelsesdato. Dette er de senest oprettede artikler
blandt hans aktuelt publicerede, ikke en påstand om dokumenteret førstegangsudgivelse.
Intro og hele brødteksten blev læst for hver af de ti via live-item-API.
Stilreferencer er ikke automatisk godkendte faktakilder om fremtidige emner.

## Individuel læselog

1. **SAVEUS på Wonderfestiwall 2026: Regnen fik ikke en chance**
   (`6a836a04516914f8e58d3b52`, oprettet 17. august).
   Konkrete musikalske og kropslige detaljer underbygger begejstringen. Satiren
   om overdrevet intensitet bliver til et præcist forbehold om dynamik og nærhed.
   Karakteren begrundes i både håndværk og den manglende variation.
2. **Benjamin Hav & Familien på Wonderfestiwall 2026**
   (`6a8361eb69d7aa7f48093083`, 17. august).
   Tydelig modvilje, men publikum og musikernes kunnen anerkendes. Hovedargumentet
   skelner mellem minutiøs showkontrol og oplevet frihed. Subjektiv kritik
   foregiver ikke at være et objektivt mål for alle publikummers glæde.
3. **Guide til Wonderfestiwall 2026**
   (`6a7778bb9e6781a8862331b8`, 8. august).
   Praktiske oplysninger blandes med smag, direkte læserhenvendelse og social
   observation. Begejstring udelukker ikke specifik kritik. Den lange guide
   med dagsprogrammer må ikke blive standardlængde for den daglige artikel.
4. **Nia Archives på O Days 2026**
   (`6a76169206ee581b17ce52ff`, 7. august).
   En scenegenstand bliver indgang til musikalsk fortolkning. Der forklares,
   hvordan livevokal ændrer DJ-formatet; et afgrænset forbehold præciserer dommen.
   Ingen af disse koncertobservationer må genbruges som Livs egne.
5. **Disclosure på O Days 2026**
   (`6a7611fda80a460d11c4f43e`, 7. august).
   En indledende skepsis bliver revideret af konkrete beskrivelser af arrangement
   og samspil. Den tekniske forklaring er forståelig og tjener et argument om
   levende bearbejdning frem for nostalgi. Det er en metode, ikke en ny koncertkilde.
6. **Derfor siger jeg altid, at jeg er hollænder på ferie**
   (`6a58ae98c6e7b94dca58b167`, 16. juli).
   Komisk eskalation, korte rytmiske afsnit og en fortæller, der også rammes af
   satiren. Den større tese handler om retten til at fylde. Arv ikke anekdoter,
   turiststereotyper eller statistik; Liv får ikke Frederiks biografi.
7. **Kunst på Roskilde Festival 2026**
   (`6a4fa08e9dba739c8227989a`, 9. juli).
   Konkrete værker leder til en tese om festivalens fælles visuelle hukommelse.
   Institutionssprog oversættes til hverdagsnær betydning. Undgå tekstens
   afsluttende skabelonlabel og gentagende opsummering i nye artikler.
8. **Clipse på Roskilde Festival 2026**
   (`6a4f9eaa45a20978ba273c84`, 9. juli).
   Kulturel status holdes op mod konkret livevirkning. Håndværket anerkendes,
   mens manglende variation forklarer skuffelsen. Sammenligninger udvikler
   argumentet; lånte jokes og samme metaforrække ville være en dårlig efterligning.
9. **Turboweekend (Tinderbox 2026)**
   (`6a452071eff72f75782a22ec`, 1. juli).
   Rammer og præstation vurderes hver for sig. God lyd og vilje er ikke automatisk
   en stor koncert; den mellemstore karakter forklares uden at gøre alt dårligt.
   Forkort de gentagne versioner af samme dom i Livs korte format.
10. **John Martin (Festegnen 2026)**
    (`6a43dac2d58842c195707030`, 30. juni).
    En genkendelig kulturel spænding (stemme kontra stjernenavn) åbner teksten.
    Begejstring får et klart musikalsk argument, og et reelt forbehold begrunder
    den tilbageholdte sidste stjerne. Liv må ikke arve koncertens sansedetaljer
    eller fortællerens minder om ungdom og festivaler.

## Implementeret skrivekalibrering

Kanonisk `data/author-prompts/liv-brandt.txt` v5: konkret åbning, tidlig dom,
mundret rytme, forklarende humor, fair modargument og skelnen mellem kunnen,
smag og virkning. Nye formuleringer; ingen kopierede jokes, oplevelser eller byline.
Eksisterende længde-, titel-, kilderegler og seksstjerneskala bevares.
Det er promptkalibrering, ikke en gennemført model-finetuning.
Der køres ikke en ny betalt stilresearch for hver artikel.
