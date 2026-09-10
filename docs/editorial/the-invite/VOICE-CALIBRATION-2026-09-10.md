# Liv: personlig stemme uden lånte oplevelser

Kvalitativ nærlæsning 10. september 2026. Seks offentlige Apropos-tekster, fire
stofområder. Ikke model-finetuning, ikke en repræsentativ arkivanalyse eller
faktakontrol af værkerne. Viste bylines beviser ikke menneskelig oprindelse.
Liv-tekster er sammenligninger, ikke automatisk kvalitetsfacit. Kun analysenoter
gemmes her, ikke fulde kildetekster.

## Korpus og genbrugelige greb

- [Ferieessay, Frederik Kragh](https://www.aproposmagazine.com/articles/derfor-siger-jeg-altid-at-jeg-er-hollaender-pa-ferie): social irritation eskaleres komisk; fortællerens eget selvbillede kommer i klemme. Lær bevægelsen, ikke nationalitetsjokes eller personlige minder.
- [Dragbingo, Liv Brandt](https://www.aproposmagazine.com/articles/p3-dragbingo-syd-for-solen-2026): konkrete handlinger bærer pointen om deltagelse. Vurderingen argumenterer mod forventningen om, at størst produktion er bedst. Lån ikke scenedetaljer til andre begivenheder.
- [Kurt Vile, Peter Milo](https://www.aproposmagazine.com/articles/kurt-vile-the-violators-i-vega-slackerens-storhedstid): ændringer i bestemte sange bruges som belæg for smag. Undgå at kopiere tekstens hyppige kontrastkonstruktioner.
- [Saros, Peter Milo](https://www.aproposmagazine.com/articles/saros): teknisk respekt og manglende begejstring kan eksistere samtidigt. Kritikken af gentagelse forklarer dommen. Spilleroplevelsen må ikke overføres til Liv.
- [Silo sæson 3, Casper Fiil](https://www.aproposmagazine.com/articles/silo-season-3-apple-tv-nar-dybet-begynder-at-svare-igen): værkets verden giver anledning til et konkret blik på magt. Undgå de mange abstrakte stemningsord og gentagne forbehold.
- [Medina, Liv Brandt](https://www.aproposmagazine.com/articles/medina-syd-for-solen-2026-anmeldelse): forsvarer genkendelighed som kvalitet. Et selvstændigt vurderingskriterium er stærkere end pligtros. Publikumsreaktionerne er ikke generiske skabelonscener.

Mayday-adressen kunne ikke hentes og tælles ikke med. De første fem var allerede
nævnt i den tidligere indholdsprofil; de er nærlæst igen her. Medina tilføjer et
nyt referencepunkt.

## Diagnose og revision

The Invite revision 2 havde personlige pronomener, men gentog sin tese i abstrakte
variationer. Mange afsnit annoncerede analysen, før de udførte den.
Kildereferater afbrød fremdriften. Humoren var forsigtig, og dommen kom sent.
Løsningen er ikke bare flere 'jeg' eller bandeord.

Revision 3 giver tidlig smag, en konkret indvending mod Joe, sympati med Angela
uden at frikende hendes kontrol og skepsis over for seksuel frihed som status.
Kritikeres vurderinger forbliver tilskrevet. Ingen påstået filmvisning. Titel,
slug, 4/6 stjerner, AI-toggle og eksisterende CMS-item bevares.

## Implementering og begrænsning

Den eksisterende kanoniske v4-prompt er skærpet, ikke erstattet af en parallel
persona. Indholdshashen ændres, og kalibreringsdatoen er eksplicit. Eksisterende
forbrugere omfatter Writer og Liv-generatoren. Ændringen er lokal, ikke deployet.

Der findes allerede 129 linjer i data/apropos-style-samples.jsonl. Loaderen leverer
korte eksempler; denne kalibrering supplerer med begrundede greb. Flere tekster
skal ikke blot betyde flere tilfældige åbningslinjer.
scripts/train-apropos-tov.ts er en heuristisk promptgenerator, ikke vægttræning.
Den er ikke kørt: den overskriver forfatterprompts og giver en generel instruks om
personlige anekdoter, som ikke må erstatte Livs dokumentationskrav.

Test på nøgleord dokumenterer promptkontrakten, ikke menneskelig tekstkvalitet.
Der påstås ikke perfekt tone eller automatisk plagiatfrikendelse.
# Supplerende redaktionel præcisering fra brugeren

Liv skal være underholdende og holdningsstærk med en ung københavnsk stemme.
Den kanoniske TOV har derfor et særskilt afsnit om smag, kant og sammenligninger:
holdningen skal begrundes i stoffet, sammenligninger skal forklare frem for at
name-droppe, og begejstring må være lige så kompromisløs som kritik. Påtaget
ungdomsslang, negativitet på bestilling og København som universel målestok
fravælges. Det ændrer ikke Livs kanoniske biografi eller tillader opdigtede
oplevelser. Præciseringen er lokal og ikke deployet.
