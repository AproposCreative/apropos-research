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

- Ingen.

### Staged Webflow-ændringer

- Forsidens danske Organization-schema er udvidet til et sammenhængende `Organization`/`WebSite`/`WebPage`-graph med absolutte URL'er og stabile `@id`-referencer.
- Den generiske Instagram-URL er erstattet af Apropos Magazines konkrete Instagram-, Facebook- og LinkedIn-profiler.
- EN-forsiden har fået et selvstændigt engelsksproget schema i stedet for at arve dansk schema.
- Begge locales er genlæst og matcher det dokumenterede efter-snapshot. Intet er publiceret.
- Article-templatens faste `Apropos Magazine:`-prefix er fjernet fra DK/EN SEO-title-bindingen; CMS-feltet leverer nu hele titlen uden ekstra boilerplate.
- Meta description- og Open Graph-bindingerne er genlæst og bevaret. Intet er publiceret.

### Kodeændringer på audit-branchen

- SEO Engines JSON-LD bruger nu stabile `Organization`, `WebSite`, `WebPage`, `Article` og `Review`-identiteter.
- Article og Review peger på samme `mainEntityOfPage` og publisher-entity.
- JSON-LD-versionen er hævet fra `1.1.0` til `1.2.0`.
- Canonical-jobbet fejler nu sikkert, hvis collectionen ikke har et canonical-felt, og skriver aldrig længere blindt til `canonical-url`.
- Typecheck og 22 SEO-testfiler med 263 tests består efter ændringerne.
- Branch-checkpoint `2594f24` er skubbet til GitHub og åbnet som draft PR #12.
- GitGuardian og Vercel preview-checks består; ingen merge eller production deployment er udført.
