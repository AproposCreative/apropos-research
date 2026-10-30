# Kompakt SoMe-editor, 30. oktober 2026

Ejeren bad om færre forklaringer, mindre padding og én samlet værktøjslinje,
med de vedlagte Apple-indstillingsskærme som konkret visuel reference.

## Resultat

- SoMe har sin egen lokale værktøjslinje med artikler, 1:1/9:16, lyst/mørkt,
  udgivelse, download og luk/tilbage. Alle handlinger er på én række, også ved
  320 px. Den er 53 px høj inklusive skillelinjen. Handlingerne beholder
  tilgængelige navne; små skærme viser SoMe eller en skærmlæsertitel afhængigt
  af den faktisk tilgængelige bredde. Container queries tager højde for en
  åben desktopsidebjælke, frem for kun vinduets samlede bredde.
- Systemskrift, sort baggrund, grå grupper, diskrete skillelinjer og blå
  handlinger følger referencebillederne. Den fælles header til andre
  Apropos-værktøjer er ikke ændret.
- Overskrift og Undertekst er to 46 px høje rækker i samme gruppe. Redigering
  foldes ud ved valg. Forslag og den korte forklaring af AI/10 DKK-loftet er
  tilgængelige ved behov frem for gentagne brødtekstafsnit.
- Tekstfelter tilpasser højden til indholdet og bredden. 16 px redigeringstekst,
  mindst én række, højst 180 px med intern rulning for lange tekster. Elementer
  i foldede rækker måles igen ved åbning; ResizeObserver reagerer på bredde,
  så højdeopdateringen ikke skaber en observer-løkke.
- Mobilens arbejdsområde har 8 px margen og ingen ekstra ydre panelpadding.
  Preview beregner den faktiske indre bredde, inklusive fradrag for padding.
  Mobil bruger bredden frem for at formindske stories til hele skærmhøjden.
  Kategorier og opslagstekst er kompakte, uden de tidligere dobbelte rammer.

AI-/budgetlogik, teksters versionsnøgler, manuel tekst på tværs af formater,
artikeldata og den eksisterende personlige udgivelsesbekræftelse bevares.
UI-skriften ændrer ikke det fælles 1080 px billedrender-/eksportformat eller
Amiri i selve opslaget. Instagram er ikke aktiveret eller udgivet af arbejdet.

## Verifikation

scripts/verify-social-compact-ui.mjs tester den faktiske editor, hooks, CSS,
canvas og PNG-eksport med isolerede Firebase-/CMS-/AI-fixtures. 320, 390, 430,
768 og 1440 px testes både embedded og standalone. Kontrollerne ligger på én
række uden afklipning og med mindst 44 px højde/40 px bredde. Testen omfatter
forslagsvalg, nye AI-varianter, original/gendan, automatisk tilpasning, manuel
overskrift og undertekst på tværs af 1:1/9:16, temaswitch og 20 PNG-downloads.
Alle filer er byte-læst og dimensionerne verificeret som 1080×1080/1080×1920.
En ekstra fixture kontrollerer, at Udgiv stadig kræver bekræftelse og kan
annulleres, og at Luk virker. Ingen rigtig social afsendelse er udført.

De elleve scenarier i den eksisterende stale-quota-recoveryfixture består
også med den nye UI. TypeScript og fokuseret ESLint består. Der er ingen nye
pakker, providerkald, budgetændringer, CMS-skrivninger eller mailafsendelser.
Skærmbillederne er lokale fixtures, med testbillede og Georgia som erstatning
for produktionsbundlet Amiri. De er layoutbevis, ikke en ændret liveartikel.

Evidens: output/social-compact-20261030/report.json, de åbne/lukkede
skærmbilleder og PNG-eksporter; output/some-recovery-20261030/browser-report.json.
Release og produktionsreadback tilføjes efter deployment.
