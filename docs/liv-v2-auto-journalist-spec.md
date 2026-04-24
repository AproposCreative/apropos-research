# Liv v2 — Auto Journalist Spec (Kultur + Musik)

Formaal: Goer Liv til en stabil, trafikskabende auto-journalist, der skriver holdningsstaerk kulturjournalistik med dokumenterbar research og korrekt Webflow CMS-udfyldning.

## 1) Produktmaal

- Publicer relevante kultur/musik-artikler dagligt i Webflow CMS (draft som default).
- Oege organisk trafik via trend-intention + tydelig SEO-struktur.
- Beskyt kvalitet via gates (research, fakta, tone, duplicate, sikkerhed).
- Giv redaktionen hurtig kontrol via AI Posting-panel (pills, plan, afvis, historik).

## 2) Redaktionsprofil (Liv)

- Kernestemme: sanselig, personlig, feministisk kulturkritik.
- Holdning: skarp over for overturisme/postkort-kultur og tom kulturel branding.
- Eksempelvinkler:
  - Ny dansk albumrelease
  - Queer klubkultur i Koebenhavn
  - Kvindelige headlinere 2026
  - Overturisme i Nyhavn
  - Cykelkultur vs cykelturister i Koebenhavn
- Regel: Kritik rettes mod faenomener/adfaerd/strukturer, ikke dehumanisering af personer eller grupper.

## 3) Kilde- og researchkrav

- Minimum 3 kilder i research-pack naar tilgaengeligt.
- Ingen opfundne fakta (navne, datoer, citater, tal).
- Artikel skal indeholde mindst 2 konkrete verificerbare fakta hvis research findes.
- Usikre paastande nedtones eller fjernes.
- Gem kilde-URL'er i artikelmetadata (AI source + researchSources i pipeline).

## 4) Content format

- Struktur:
  - Aabning i sansning/scene.
  - Analyse med tydelig vinkel.
  - Kontekst + modpres (hype vs substans).
  - Afslutning med efterklang.
- Laengde:
  - 600+ ord for organisk potentiale (som nuvaerende Liv-flow).
- Stil:
  - Ingen generiske nyhedsaabninger.
  - Ingen plotreferat uden analytisk payoff.

## 5) CMS-strategi (Webflow)

- Liv cron skriver som `draft` som default.
- Auto-live kun ved eksplicit setting (fx env override) og fuld gate-pass.
- Obligatoriske felter i Webflow payload:
  - `name`, `slug`, `content`, `seo-title`, `meta-description`
  - `section`, `author`, `ai-generated`, `ai-source-url`, `ai-model`
- Historik skal vise:
  - Firestore runs (pipeline status)
  - Webflow CMS entries (draft/published)

## 6) Gates (release policy)

- Gate 1: moderation/safety.
- Gate 2: fact extraction + source similarity.
- Gate 3: tone-of-voice match (Liv).
- Gate 4: duplicate/slug/recent topic overlap.
- Gate 5: SEO min-quality (title, description, intent match).

Hvis en gate fejler:
- Stop auto-live.
- Gem som draft eller skip med tydelig reason.
- Log i historik med konkret fejlaarsag.

## 7) AI Posting-panel (arbejdsflow)

- Brug eksisterende controls:
  - topic pills
  - direction pills
  - "Brug kun trending-emner"
  - "Preview med retning"
  - "Planlaeg til i morgen"
  - "Afvis/Naeste forslag"
- Drift:
  - Morgen: planlaegning
  - Middag: preview + review
  - Sen eftermiddag: evt. manuel publish af bedste draft

## 8) SEO-operativ model

- 70/20/10 mix:
  - 70% evergreen kultur/musik-intent
  - 20% trend-reaktivt
  - 10% holdningsessay
- Undgaa URL-fragmentering:
  - Hold canonicals konsekvent
  - Redirect legacy paths
- KPI pr. artikel:
  - impressions (GSC), CTR, gennemsnitlig position
  - dwell proxy (engagement)
  - intern klikrate til relaterede artikler

## 9) KPI targets (foerste 8 uger)

- 5-7 Liv drafts/uge.
- 3-5 publicerede kvalitetsartikler/uge.
- 0 hallucinatoriske fakta i stikproevekontrol.
- +20-30% impressions paa kultur/musik clusters.

## 10) Næste implementeringer

1. Tilfoej `sources_count` og `research_confidence` i historik.
2. Tilfoej filter i Historik: "Kun CMS", "Kun cron", "Begge".
3. Tilfoej weekly performance-report for Liv emner/vinkler.
4. Tilfoej fallback-policy: hvis trendscore lav -> evergreen backlog-emne.
