# GEO: konkret implementering og næste skabelonpakke

## Verificeret udgangspunkt

9. september 2026. Morningscore GEO 43%, rapport fra 8. september, 924 sider. Indhold 79%, SEO/links/brandomtale 40%, sociale medier 60%, virksomheds-anmeldelser 0%. GEO er værktøjets sammensatte indikator, ikke en måling af citeringer i ChatGPT eller Google AI. Indholdstallet omfatter bl.a. antal sider; flere sider er ikke automatisk bedre journalistik.

Fem offentlige pilot-URL'er er genhentet uden credentials. Se geo-pilot.json og scripts/geo-public-audit.mjs. Alle fem svarer 200. Untamed DA og Justice EN har parsebar Article JSON-LD med forfatternavn, profil-link, publicerings-/ændringsdato og korrekt sprog. /om, /author/liv-brandt og /author/casper-fiil har ingen JSON-LD. Fravær er en forbedringsmulighed, ikke bevis på manglende indeksering. robots.txt indeholdt kun sitemapreferencen; ingen ændring af crawleradgang nødvendig på dette grundlag. CDN/WAF-regler er ikke undersøgt.

## Rettet lokalt i SEO-programmet

Generatorens WebPage peger nu på den tilhørende Article som mainEntity; Article peger tilbage via mainEntityOfPage. Inputkontrakten og CMS-adapteren kan bevare en eksplicit opløst authorUrl. Både Article og Review bruger samme profilvalidering. Relative/gættede adresser, javascript-URL'er og URL'er med credentials udelades. Der konstrueres aldrig en profil ud fra et personnavn. Eksisterende forfatternavne, datoer og Review-ratingbetingelser er bevaret. JSON-LD-version hævet til 1.3.0.

Begrænsning: authorUrl er en valgfri inputoplysning. Callers, der ikke leverer en verificeret profil, får stadig navn uden URL. Der er ikke tilføjet et nyt globalt CMS-opslag eller ændret Livs pipeline. Webflows eksisterende Article-template er en separat kilde og bliver ikke automatisk ændret af dette patch. Ingen gamle artikler er opdateret.

## Konkret Webflow-pakke

1. /om: geo-about-proposed.json indeholder en færdig minimal AboutPage/Organization-graf baseret på det synlige navn og den faktiske side. Samme organization-ID som SEO-programmet. Ingen opdigtet adresse, stiftelsesår, rating eller sociale profiler. Indsæt kun én gang efter kontrol af aktuelle page-/site-embeds. EN får egen sidetitel, URL og sprog efter læsning af den faktiske EN-side.
2. Menneskelige forfatterprofiler: ProfilePage med mainEntity Person, eksakt CMS-navn, verificeret profil-URL og synlig biografi. Profilsidens H1 bør være personens navn; rolle bliver separat underoverskrift. Piloten viser i stedet rollen som H1. Casper-siden er første egnede pilot. Livs redaktionelle AI-identitet må ikke ændres eller få opdigtede menneskelige kvalifikationer; afstem synlig disclosure og model med Liv-opgaven før markup.
3. Artikeltemplate: bevar eksisterende Article-graf. Normaliser profil-URL til den aktuelle absolutte DA/EN-adresse, og match artikel/forfatter/publisher-identitet. Ingen ekstra konkurrerende Article-graf. Verificér citattegn og HTML-entities via sikker JSON-serialisering, før dynamiske tekstfelter indlejres.
4. Synligt indhold: bind faktiske forfattere og oprindelige datoer, tydeliggør rettelser og kildehenvisninger hvor de allerede findes. Redaktionel kritik, vurderinger, credits og historiske festivalår må ikke omskrives automatisk.
5. Interne links: prioriter eksisterende trafikpiloter Untamed, Den gode stemning, OneRepublic, O Days og festivalindgange. Link kun til emnemæssigt relevante guides, anmeldelser og forfatterprofiler i samme locale. Journalistisk kildearbejde koordineres med Liv; links og omtale købes ikke for at hæve en score.

Skabelonpakken er forberedt, ikke installeret eller publiceret. Ingen CMS-bulk. Næste præcise ændringspakke kræver readback af Designer og skal verificeres i rendered HTML før offentlig effekt kan hævdes.

## Måling og release

620 tests i 58 filer samt strict SEO TypeScript, lint og fuld lokal Next-produktionsbuild består. Fem nye tests dækker grafrelationer og profil-URL'er. Public-audit-scriptet er kørt mod de fem angivne sider; det er ikke et heldækkende crawl. Ingen dependencies eller auth-/deploymentfiler ændret.

Morningscores helbredsscanning fra SEO-releasen er allerede i gang; der startes ikke en dublet eller en betalt GEO-rapport. Efter godkendt GEO-udgivelse kontrolleres rå/renderet JSON-LD, relevante profiler, interne links og DA/EN. Følg Search Console-visninger/klik og dokumenterede AI-henvisninger over tid, ikke kun samlet GEO-score. Tidligere releasegodkendelse af 617a251 omfatter ikke dette nye kodepatch.

## Primære kilder

- https://developers.google.com/search/docs/appearance/ai-features : almindelig SEO, tilgængeligt tekstindhold, interne links og markup der matcher synligt indhold. Ingen særskilt AI-fil eller særlig GEO-schema kræves.
- https://developers.google.com/search/docs/appearance/structured-data/article : forfatterens type/navn/profil-URL hjælper med identifikation.

Der loves ingen bestemt GEO-score, AI-citering eller placering som følge af schema alene.
