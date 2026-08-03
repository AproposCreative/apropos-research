# Changelog

## 2026-08-03

### Forbindelser og kortlægning

- Verificeret Webflow-site, locales, collections, pages, sitemap og custom code via read-only API.
- Verificeret GitHub-konto `AproposCreative` og repository `AproposCreative/apropos-research`.
- Verificeret Vercel-konto `frederik-7246`, projekt `apropos-research` og aktiv production deployment.
- Linket lokal checkout til Vercel-projektet; `.vercel/` er gitignored.

### Backup og sikkerhed

- Oprettet separat branch `codex/seo-aeo-geo-audit-2026-08-03`.
- Registreret baseline commit og production deployment ID.
- Dokumenteret per-system rollback og krav om Webflow før-snapshots.
- Gemt præcist før-snapshot af forsidens danske schema og den engelske nedarvning.
- Gemt præcist før-snapshot af Article-templatens DK/EN metadata og Open Graph-bindinger.

### Baseline-verifikation

- Typecheck for SEO Engine bestået.
- 22 SEO Engine-testfiler med 262 tests bestået.
- Målt metadata-, interne-link-, heading-, billed-alt-, forfatter- og lokaliseringsgæld uden at skrive til Webflow.
- Registreret 32 dependency-advisories som separat sikkerhedsrisiko; ingen automatisk dependency-opdatering er udført.

### Produktionsændringer

- Den godkendte Webflow SEO-batch blev publiceret til alle fire custom domains og Webflow-subdomænet kl. `2026-08-03T10:11:54Z`.
- Live DK/EN-forsider er efter publicering verificeret med stabile Organization-identiteter, engelsk EN-schema, canonical og gensidige hreflang-links.
- En live dansk artikel er verificeret uden det tidligere faste `Apropos Magazine:`-prefix i `<title>`; canonical og DK/EN-hreflang er bevaret.
- Ingen Webflow CMS-artikler blev redigeret i denne batch.

### Staged Webflow-ændringer

- Forsidens danske Organization-schema er udvidet til et sammenhængende `Organization`/`WebSite`/`WebPage`-graph med absolutte URL'er og stabile `@id`-referencer.
- Den generiske Instagram-URL er erstattet af Apropos Magazines konkrete Instagram-, Facebook- og LinkedIn-profiler.
- EN-forsiden har fået et selvstændigt engelsksproget schema i stedet for at arve dansk schema.
- Begge locales er genlæst og matcher det dokumenterede efter-snapshot; ændringen er efterfølgende publiceret og live-verificeret.
- Article-templatens faste `Apropos Magazine:`-prefix er fjernet fra DK/EN SEO-title-bindingen; CMS-feltet leverer nu hele titlen uden ekstra boilerplate.
- Meta description- og Open Graph-bindingerne er genlæst og bevaret; ændringen er efterfølgende publiceret og live-verificeret.

### Kodeændringer på audit-branchen

- SEO Engines JSON-LD bruger nu stabile `Organization`, `WebSite`, `WebPage`, `Article` og `Review`-identiteter.
- Article og Review peger på samme `mainEntityOfPage` og publisher-entity.
- JSON-LD-versionen er hævet fra `1.1.0` til `1.2.0`.
- Canonical-jobbet fejler nu sikkert, hvis collectionen ikke har et canonical-felt, og skriver aldrig længere blindt til `canonical-url`.
- Typecheck og 22 SEO-testfiler med 263 tests består efter ændringerne.
- Branch-checkpoint `2594f24` er skubbet til GitHub og åbnet som draft PR #12.
- GitGuardian og Vercel preview-checks består; ingen merge eller production deployment er udført.

### SEO Engine (`ai.aproposmagazine.com`)

- Verificeret autentificeret production-UI, build `1.0.0.417c670`, med sunde GSC-, GA4- og Webflow-forbindelser og aktiv automatisk drift.
- Dokumenteret anvendte lowercasede/generiske titler og et query-intent-problem, hvor rå GSC-query blev brugt som værk/entity.
- Rettet branchen til altid at bruge CMS-artiklens redaktionelle titel som entity; GSC-query bruges kun som evidens.
- Gjort fingerprints stabile på side + query og tilføjet UI-sammenlægning af eksisterende legacy-dubletter.
- Nødstop, manuel kørsel, apply og rollback blev ikke aktiveret under auditten.
- Målrettede tests 25/25; fuld suite 27 filer/274 tests; typecheck og lint af ændrede filer består.
- Fuld repository-lint rammer en eksisterende, urørt `module`-navnefejl i `components/marketing/ProductStoryShowcase.tsx`.
