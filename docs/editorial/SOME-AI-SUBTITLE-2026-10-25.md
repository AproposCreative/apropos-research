# Automatisk AI-forkortelse til SoMe-kort, 25. oktober 2026

Ejeren præciserede, at SoMe-editoren skal bruge AI til automatisk at forkorte
underteksten. Den regelbaserede rettelse fra 25. oktober var ikke den ønskede
løsning. Ejeren tillod genbrug af den eksisterende OpenAI-nøgle og et fast
**engangsloft på 10 DKK** for netop denne funktion. Det ændrer ikke det
separate Writer-loft eller Livs forbud mod betalt automatisk artikelproduktion.

## Flow

- Når den originale undertekst og en eventuel versionsbundet ChatGPT-variant
  ikke kan være på kortet, beder editoren automatisk om to korte AI-varianter.
  Der kræves et verificeret redaktionelt login. Intet socialt opslag udgives.
- Modellen ser kun titel og undertekst som kildedata. Den skal bevare den
  centrale pointe og levere afsluttede sætninger uden nye fakta eller `…`.
  Serveren validerer længde og afslutning; klienten vælger den første variant,
  der kan måles læsbart med det faktiske kortformat og den faktiske skrifttype.
- Et manuelt redigeret kort forbliver uændret, selv hvis AI-svaret kommer senere.
  Artiklen og CMS-felterne ændres aldrig af denne funktion.
- En Firestore-transaktion reserverer en konservativ øvre omkostningsgrænse
  **før** hvert providerkald. Samme artikel-id, titel, undertekst og format
  genbruger et gemt resultat. Samtidige kald får `pending`; timeout eller
  ukendt resultat medfører ingen automatisk ny betaling.
- SoMe-budgettet ligger i sit eget faste dokument
  `aiExecutionPolicies/social-subtitle-10dkk-2026-10-25-v1`. Det kan ikke
  nulstilles af dato eller request. `usedUpperDkkMicros` er en reserveret øvre
  grænse, **ikke** en faktura eller målt faktisk forbrug. Fejlede/ukendte kald
  beholder reservationen. Det eksisterende provider-hold respekteres.
- Model `gpt-6-luna` med højst 512 outputtokens, Standard, ingen tools, ingen
  SDK-retries. Pristaksten blev kontrolleret på
  <https://developers.openai.com/api/docs/models/gpt-6-luna> den 25. oktober
  2026: $0,10/$0,50 per million input/outputtokens. Reservationen bruger
  dobbelt den pris og et valutaloft på 12 DKK/USD. Hvis priserne ændres
  væsentligt, skal dette loft og modellen gennemgås før yderligere kald.
- Hvis AI ikke kan levere, vises fejlen tydeligt, og editoren bruger kun et
  mærket ordret uddrag. Den påstår ikke, at et uddrag er AI-omskrivning.

## Verifikation før produktion

- TypeScript og Next.js-produktionsbuild bestod.
- 23 målrettede API-, budget- og tekstevalueringstests bestod.
- Isoleret browserfixture i 320, 390 og 1440 px bestod med simuleret AI-svar,
  fontmåling, formatændring, manuel redigering og PNG-eksport. Ingen rigtig
  model, CMS-ændring eller social udgivelse blev brugt i den fixture.

Produktionsdeploy, rigtigt AI-svar og faktisk browser-readback dokumenteres
først efter separat verificering; en grøn build alene beviser dem ikke.
