# Webflow-pilot: konkrete ændringer klar til Designer-gennemgang

Status: **lokalt forslag, ikke skrevet i Webflow**. Kilde: frisk offentlig HTML og SVG 9. september 2026. Ingen antagelse om at publiceret HTML svarer til aktuelle upublicerede Designer-værdier. Før mutation skal element-ID, bindingsfelter og aktuelle værdier genlæses og gemmes.

## Adgang og koordinering

Webflow-connectorens siteoversigt viser kun Azide 2.0 og North Consulting. GET på Apropos' site-ID `67dbf17ba540975b5b21c180` (verificeret i offentlig HTML) returnerer 404. Der er ikke oprettet eller hentet credentials som workaround. Brugeren er bedt om at tilknytte Apropos til forbindelsen. Liv har bekræftet ingen konkurrerende Webflow-templateændringer og ingen Apropos-session at stille til rådighed. Livs godkendelse af OpenAI-adgang giver ikke adgang til Webflow.

## Pilot A: fælles logoer og søgeikon

Forsidens side-ID: `67dbf17ba540975b5b21c201`. Find de præcise elementer via Designer og eksisterende klasser; ret i komponentdefinitionen, hvis den er fælles. Gem alle eksisterende attributter og styles før ændring.

| Element | Offentlig før-værdi | Verificeret assetforhold | Foreslået efter-værdi |
|---|---|---|---|
| `img.brand-mobile` | width=666.5, ingen height, alt="" | SVG viewBox 0 0 373 55 | width=373, height=55; bevar eksisterende visuel CSS-størrelse |
| `img.brand-desktop` | width=666.5, ingen height, alt="" | SVG viewBox 0 0 260 104 | width=260, height=104; bevar eksisterende visuel CSS-størrelse |
| `img.search-image` | width=21, ingen height, alt="" | SVG viewBox 0 0 24 24 | width=21, height=21; bevar alt="" hvis kontrol har tilgængeligt navn |

Disse er forskellige logoaktiver med forskellige forhold; de må ikke få samme højde. SVG-kilder ligger på cdn.prod.website-files.com under Apropos site-ID, henholdsvis `67f7966d9192c68997f60640_aproposlogo.svg`, `6821b5bfbc78ea7107f64809_AproposHorizontal.svg` og `68834f478da8def5ab643817_Search.svg`.

Logoets link skal have tilgængeligt navn “Apropos Magazine – forside” (EN “Apropos Magazine – home”). Brug eksisterende linknavn, hvis korrekt; ellers passende logo-alt. Undgå at tilføje flere konkurrerende navne. Search-kontrollen skal have “Søg” / “Search”. Afklar faktiske bindings- og komponentmuligheder før skrivning.

Accept: samme visuelle størrelse før/efter på desktop og mobil; korrekt billedforhold; ingen layout-hop; meningsfuldt navn ved tastatur/skærmlæser. Hvis dimensioner styrer fallback-layoutet anderledes, ret CSS i samme isolerede pilot eller rul ændringen tilbage. Ingen global asset-komprimering.

## Pilot B: festivalskabelonens H1

Verificeret eksempel `/festivals/copenhell`, side-ID `6804c5e38d47b543c1a57ff9`.

| Før | Efter-forslag |
|---|---|
| `h2.second-title`: Copenhell | Primær H1 med samme navn-binding og samme klasse |
| `h1.blog-title.tema`: tom | Tag ændres til et neutralt element, hvis understøttet; ingen ny tekst og ingen sletning uden kontrol af binding |
| `h1.h3`: festivalbeskrivelsen | Beskrivende tekst som p med samme klasse/binding |

Dette præciserer planens oprindelige mulighed: der findes allerede en synlig festivalnavne-overskrift, så genbrug den frem for at opfinde en ny. Offentlig HTML er ikke tilstrækkelig til at vælge mellem bindingsrettelse og tagskift i den tomme heading. Hvis Webflow-elementtypen kun tillader H1–H6, skal løsningen bygges med en bevaret kopi/preview og faktiske bindingsoplysninger; ingen blind sletning.

Accept: én ikke-tom H1 med korrekt festivalnavn; beskrivelsen bevares ordret; ingen ekstra tom heading; DA og EN har samme korrekte struktur. Locale-tekster oversættes ikke automatisk.

## Pilot C: forfattermetadata

Verificeret eksempel `/author/liv-brandt`, side-ID `67dbf17ba540975b5b21c20b`.

- Bevar title: “Apropos Magazine: Liv Brandt – Skribent og kulturkommentator” (faktisk title indeholder dobbelt mellemrum, som ikke i sig selv kræver rettelse).
- Nuværende description er sitets generiske “Apropos Magazine dækker musik, film, kultur og kaos med kant, karakter og kærlighed til det, der rører sig.”
- Konkret DA-forslag: **“Læs artikler af Liv Brandt, skribent og kulturkommentator på Apropos Magazine.”**
- EN-forslag efter bekræftelse af EN-sidens indhold: **“Read articles by Liv Brandt, writer and cultural commentator at Apropos Magazine.”**

Begge forslag er afledt af den offentlige rolle og artikelliste, uden opdigtet biografi. Bind mønstret pr. forfatter og locale, når feltmodellen er verificeret. Ret først piloten; ingen masseændring af forfatterposter. Selve Liv-redaktionens kode, prompts og artikler berøres ikke.

## Fund der kræver anden behandling

`/podcast` (side-ID `6a86befdfea567fbd326efe5`) leverer title “Podcast”, ingen description, ingen headings eller billeder. Efter scripts/styles er fjernet, er der ingen reel synlig podcasttekst i server-HTML; kun tekst fra en iframe-fallback. EN har samme problem i sitemap-auditen. Derfor: kontroller i renderet browser om en integration faktisk leverer indhold, og afklar sidens tilsigtede funktion. Tilføj ikke en SEO-beskrivelse der lover episoder, som endnu ikke kan findes. Noindex/fjernelse fra sitemap kræver særskilt begrundet beslutning, ikke automatisk “fix”.

Forsiden mangler H1, men består af flere redaktionelle sektioner. En synlig, fælles identitetsoverskrift skal placeres ud fra designet. Forslag til tekst: “Apropos Magazine – musik, film og kultur”. Den må ikke erstatte en aktuel artikeloverskrift eller skjules alene for en auditscore.

## Udførelsesprotokol ved tilgængelig Apropos-forbindelse

1. Genlæs siteinstruktioner, locale-ID'er, page/component-ID'er og element-/bindingsværdier. Gem snævert før-snapshot uden credentials.
2. Kontrollér med Liv at skabelonerne stadig er ledige. Ingen ændring af auth, dependencies eller deploymentkonfiguration.
3. Udfør den mindste understøttede upublicerede pilot, ét område ad gangen. Læs værdier tilbage efter hvert write. Undgå at overskrive hele attribut- eller settingslister med et ufuldstændigt udsnit.
4. Kontrollér visuelt begge breakpoints og DA/EN. Hold eksisterende staged redaktionelt indhold uden for eventuel udgivelse.
5. Gem præcis før/efter-liste og rollback-værdier. Stop ved konkurrerende ændringer, uventet binding eller utilstrækkelig rollback.
6. Ingen publish i denne pilot. Produktion kræver separat konkret godkendelse; “fortsæt” er her udførelse af den aftalte upublicerede pakke.
