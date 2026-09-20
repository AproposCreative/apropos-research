# Liv: Frederik-kalibrering og tre kommende udgivelser

## Omfang og release

Bestilling: læs Frederik Kraghs ti seneste artikler og fyld køen med artikler
og anmeldelser. Tre kommende udgivelser i alt, ikke en permanent større
researchkø. Den allerede forberedte Ed Sheeran-artikel bevares uændret.

- `47342b8b7d74bb059d4eca0ee2581436d3d77b07`: kanonisk Liv v5,
  versionsbevaring for betalt v4-arbejde, autentificeret og idempotent
  batchplanlægning med fælles forberedelseslås.
- `e17de93574f358420ae849014247b85740c28e64`: Netflix' faktisk anvendte
  `FOTOGRAF/NETFLIX`-kreditering og billedfund fra allerede gemte kilder.
- `88b8793fca5abcc81260fddb03c9c7b36c2fccaa`: én afgrænset gentagelse af
  fejlet offentlig kildehentning; ingen betalt kontrol på et ufuldstændigt
  kildesæt. Bevar gamle rapporter/korrekturer, og lad normal fuld kontrol
  genoptages, når en tidligere manglende kilde er tilgængelig igen.
- Produktion: `dpl_BWTCVHY5h88jeFbw98jxj4XTVZoq`, READY, præcis SHA ovenfor,
  alias `ai.aproposmagazine.com` verificeret via Vercel API.
- 3.854 tests i 274 filer bestået; TypeScript, scoped ESLint, diffcheck og
  produktionsbuild bestået. Testdata isoleret fra redaktionelle data.

Se `FREDERIK-LATEST-10-2026-09-20.md` for individuel nærlæsning og
udvælgelsesmetode. Dette er faste skriveinstruktioner, ikke model-finetuning.

## API-forløb

`POST /api/liv/operations/queue-plan`, request
`frederik-queue-20260920-v1`, gav `scheduled` for 22. og 23. september.
Identisk replay gav `already_scheduled`, uden nye modelkald.
Gamle ustartede `skipped_no_topic`-runs og planmarkører blev bevaret i audit.
Betalt tekst, medier og CMS-identiteter blev ikke nulstillet.

Anmeldelsens første medieblokering var manglende parserstøtte for den rigtige
Netflix-kredit. Teksten blev genoptaget via operations/retry efter rettelsen.
Et senere faktatjek manglede én af tre gemte kilder og forsøgte derfor en
for omfattende rettelse. Rapport og betalt korrektur er bevaret. Efter
komplet kildehentning bestod den uændrede artikel normal kontrol: 21
verificerede påstande, ingen disputed. Ingen gate blev omgået.

Alle genereringer, billedtrin, rettelser, CMS-gemninger og køoptagelser
kørte gennem appens autentificerede API/serverflow. Ingen manuelle CMS-skrivninger.
Instagram er ikke aktiveret. Fremtidige historier er kladder, ikke udgivet i dag.

## Slutkontrol

Ejerautentificeret `GET /api/liv/delivery/feed` returnerede tre historier,
`queueEnabled:true`, `preparationEnabled:true`, ingen publikationsblokeringer,
og `preparation.status:idle` / `no_preparation_needed`.

| Dato | Historie | CMS-item | Brødtekst | Kilder / verificerede påstande |
| --- | --- | --- | --- | --- |
| 21/9 | Ed Sheeran om Israel og Palæstina efter Macklemores fjernelse fra turnéen | `6ab0275fb063e14a30dc2ae1` | 544 ord | 5 / 23 |
| 22/9 | Anmeldelse: Monster sæson 4: The Lizzie Borden Story | `6ab032d32664b24bb5486830` | 506 ord | 3 / 21 |
| 23/9 | Suno v6 og Spotify AI Persona: Hvem står bag musikken? | `6ab0332b02373e747b956f72` | 600 ord | 3 / 22 |

- Alle tre er `ready`, med ét cover og to forskellige bodybilleder, alt-tekst
  og kreditering; source-similarity, moderation, komplet factcheck, TOV og
  CMS-readback bestået. Topics/primary topic indgår i CMS-referencekontrollen.
- Monster er researchanmeldelse med begrundede 3/6 stjerner. Alle tre billeder
  har den faktiske kredit `SUZANNE TENNER/NETFLIX`; rettigheder fortsat ukendt,
  ikke ommærket som licensgodkendt. De øvrige historier bruger tydeligt
  krediterede Apropos/AI-illustrationer.
- Ed Sheeran beholder sin allerede godkendte v4-tekst. Begge nye tekster
  bruger `liv-v5`. Ingen betalt ny læsning af Frederik-referencer pr. artikel.
- Featuren fik to afgrænsede faktuelle præciseringer via det normale
  korrekturforløb; ingen ekstra billedgenerering til rettelserne.
- Søgebeskrivelserne blev manuelt formuleret klart og afleveret gennem
  `/api/liv/revisions/presentation`. Begge kvitteringer var
  `presentation_staged`, `publicationReady:true`, ingen blokeringer.
  Aflevering og readback sluttede 19:26:30 UTC. Ingen live-publicering.
- Det offentlige `ai-generated`-felt er false i alle tre payloads;
  model-/kilde-/billedproveniens er bevaret internt og illustrationer krediteres.

Endelige payload-hashes:

- Ed Sheeran: `4fef0b1a246966008787341436cccf7c25971413d0e9b1b48aac474a4501f10d`
- Monster: `cdca3816f34cc39856b188b56263b458c166d55382c8e704996f194d807d7ad3`
- Suno/Spotify: `a421184f41926e69a02536014881977a611d8adf8e872954c26767b90362c67c`

## Forbrug og afgrænsning

Appens registrerede øvre forbrugsestimat steg fra 70,349968 til 88,822488 kr.,
altså 18,472520 kr. under batcharbejdet inkl. de fejlede kontrolforsøg.
Dette er delt sporing, ikke en providerfaktura eller sikker attribution af
samtlige kald til netop denne session. 0 kr. reserveret, 0 ukendte kald,
211,177512 kr. tilbage af appens 300 kr.-ramme ved slutkontrollen.

Planlagt udgivelse er kl. 10 dansk tid på hver dato via det eksisterende
daglige serverflow. `ready` er ikke bevis for fremtidig publicering;
publicering skal fortsat kontrolleres på den faktiske udgivelsesdag.
