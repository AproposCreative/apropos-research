# Apropos AI · fælles UI-regler

Dette er den faste reference for nye værktøjer i Apropos AI. Et nyt værktøj
skal ligne AI Writer og må ikke opfinde et separat layoutsystem.

## Grundstruktur

- Åbn værktøjer i den eksisterende Writer-shell med samme panelbredde,
  baggrund, kant, radius og luk-knap.
- Værktøjets hovedflow skal være synligt med det samme. Tekniske valg,
  avancerede indstillinger, fejlgendannelse og diagnostik ligger bag en
  tydelig indstillings- eller detaljekontrol.
- Ét primært mål pr. skærm og højst én fremtrædende primær handling.
- Brug samme korte, konkrete danske labels som de øvrige værktøjer.

## Layout og spacing

- Brug Writerens mørke overflade, subtile `border-white`-kanter og rolige
  hover/focus-states. Undgå nye farvesystemer uden en dokumenteret grund.
- Brug eksisterende panel-shell, header, knapstørrelser og spacing tokens før
  nye CSS-regler.
- Hold indholdet på én kolonne på mobil. Ingen horisontal scrolling i et
  arbejdsflow.
- Brug sticky eller fast topnavigation kun når det hjælper navigationen;
  indholdet skal kunne scrolles separat og ikke gemme handlinger.

## Interaktion og tilstand

- Loading, tom tilstand, fejl og succes skal være korte og handlingsanvisende.
- En fejl må ikke vise interne fejlkoder eller gentage samme besked flere
  gange. Recovery skal være eksplicit og må ikke købe eller starte noget igen
  automatisk.
- Bevar brugerens arbejde ved genindlæsning, men vis kun teknisk status når
  den er relevant for næste handling.
- Alle knapper skal have synlig focus, passende touch-target og tekst/aria-label.

## Adgang og release

- Nye features er private under pilot og vises kun for owner, indtil Frederik
  eksplicit beslutter team-release.
- UI-skjulning er ikke adgangskontrol. Alle tilhørende API-ruter skal håndhæve
  samme capability server-side.
- Nye værktøjer skal kunne åbnes via Writerens eksisterende menu og må ikke
  kræve en separat browser- eller CMS-session.
