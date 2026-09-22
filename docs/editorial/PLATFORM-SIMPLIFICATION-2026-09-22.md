# Apropos: ét redaktionelt arbejdsflow

## Produktmål

Én daglig udgivelse via Livs serverflow, personlige tekster med belæg og et
forståeligt forbrugsoverblik. Ingen nye parallelle køer, dashboards eller
automatiske AI-kald alene for at åbne en side.

## Leveret i denne ændring

- Writer: sammenklappelige redaktionsnoter med en tom kollegaskabelon.
  Genbruger `notes` i det eksisterende private workspace og eksisterende prompt.
  Indsættelse er idempotent, eksisterende noter bevares. Ingen AI ved noteredigering.
- Fælles redaktionel struktur: konkrete bekræftede oplevelser kan skrives på
  kollegaens vegne under dennes byline. Under Liv tilskrives kollegaen.
  Tom skabelon eller generel tilstedeværelse bekræfter ikke sansedetaljer.
- Eksisterende forbrugsvisning: gruppering efter drift, redaktionelle rettelser
  og udviklingstest, med Image-gen separat og ukendt formål eksplicit.
  Reservationer er ikke afholdt forbrug. Ingen nye ledger- eller modelkald.

## Afgrænsning

Notefeltet er skrivegrundlag, IKKE en digital signatur eller teknisk verifikation
af hvem der faktisk oplevede hvad. Det nye felt findes i Writer; Livs automatiske
pipeline får ikke automatisk adgang til private Writer-noter. Ingen ny erfaring
føres ind i Livs faktagrundlag, og eksisterende publiceringskontroller er uændrede.
Promptregler er ikke en garanti for genereret tekstkvalitet.

## Anbefalet næste rækkefølge

1. **Én redaktionel indbakke.** Vis dagens historie, næste historie og kun de
   handlinger der mangler. Genbrug Livs eksisterende kø/status; flyt tekniske
   detaljer bag tandhjulet. Succeskriterium: én forståelig næste handling pr. fejl.
2. **Kort oplevelsesbekræftelse.** Bind en kollegas egne noter til konkret
   historie, dato/omfang, tekstversion og autentificeret afsender. En ændret tekst
   må ikke arve en gammel godkendelse. Integrér som evidens i eksisterende
   faktakontrol, ikke som et bypass. Kræver API, rettigheds- og isolationstests.
3. **Kvalitet via rettelser.** Brug redaktionens konkrete før/efter-rettelser i
   et lille fast evalueringssæt. Mål emneklarhed, selvstændig holdning, længde og
   unødige kritikercitater før promptændringer. Ingen automatisk finetuning eller
   betalt kritikersløjfe på hver artikel.
4. **Forbrug som beslutning.** Tilføj læsbar historietitel til eksisterende
   omkostnings-ID'er og pris pr. faktisk udgivet artikel. Bevar kladde-, fejl- og
   udviklingsforbrug særskilt. Dokumentér dækningsgrad; undgå at kalde registrerede
   estimater en totalfaktura eller lovede besparelser.

Ingen ny chat, delt-historie-feature, parallel researchmotor eller bred
dashboard-ombygning anbefales nu. Først skal de eksisterende dele hænge sammen.

## Verifikation

62 målrettede tests, hele regressionssuiten med 4.046 tests, TypeScript og lint
af nye komponenter/hjælpere bestået.
Regression bruger mockede svar; ingen betalte research- eller genereringskald.
Mobilens faktiske visuelle opførsel og menneskeligt bekræftede noter gennem
automatisk Liv-publicering er ikke verificeret af disse tests.

## Produktionskvittering

- Release: `246b7362cff85305f5914844b8b8a6a0c3ad8b55`.
- Vercel: `dpl_Eh8vnjfX4X7EPhTYC7USP7BQvfaF`, READY, korrekt SHA og
  `ai.aproposmagazine.com` alias verificeret.
- Autentificeret prompt-preview for Liv og Frederik: HTTP 200, præcis fælles
  struktur og notetekst medtaget, ingen research bestilt.
- Forbrugs-API: HTTP 200. Registreret estimat ca. 123,89 kr.; reservationer
  ca. 14,54 kr. Historiske kald for ca. 113,07 kr. mangler formålsmærkning.
  Derfor kan drift kontra udvikling ikke rekonstrueres pålideligt for alt
  historisk forbrug. UI'et viser ukendt frem for at opfinde en fordeling.
