# SEO, AEO og GEO audit — 2026-08-03

Status: baseline og backupstrategi er oprettet. Første reversible Webflow-batch er publiceret og live-verificeret; kodeændringer ligger fortsat kun i draft PR.

## Omfang

- Webflow-site, CMS, metadata, sitemap, locales, canonical/hreflang og structured data
- Vercel-projekt, aktiv produktionsdeployment, cron-konfiguration og miljøvariabel-dækning
- GitHub-repository, eksisterende SEO Engine, tests og deployment-workflow
- Redaktionel kvalitet på danske og engelske artikler
- AEO/GEO-entiteter: Organization, Person, Article/Review, emner, sektioner, tjenester og festivaler

## Kortlagt setup

- Webflow-site: `Apropos Magazine` (`67dbf17ba540975b5b21c180`)
- Primært locale: dansk (`da`), CMS locale `67dbf17ba540975b5b21c225`
- Sekundært locale: engelsk (`en`), CMS locale `690ca0f6b0d13d8788354156`
- GitHub: `AproposCreative/apropos-research`, default branch `main`
- Baseline-commit: `417c670`
- Vercel-projekt: `frederik-kraghs-projects/apropos-research`
- Vercel project ID: `prj_sUVIsBr9l8DbjEFDrz6WUAQZcxGE`
- Aktiv produktion: `dpl_9ujAKWuZmyWaEgNoSbEEmS19ehGN` (`Ready`)
- Produktionsdomæner omfatter `ai.aproposmagazine.com` og `subscribe.aproposmagazine.com`
- Publiceringssite: `www.aproposmagazine.com`; apex og `.dk` viderestiller til `www.aproposmagazine.com`

## Sikker arbejdsrækkefølge

1. Alle kodeændringer laves på `codex/seo-aeo-geo-audit-2026-08-03`.
2. Baseline-tests køres før første kodeændring.
3. Hver Webflow-ændring får et eksakt før-snapshot i `backups/` med site-, collection-, item-, locale- og felt-id.
4. CMS-ændringer gennemføres i små batches og verificeres med readback før næste batch.
5. Kode deployes først som Vercel Preview fra en pull request.
6. Live-HTML kontrolleres for canonical, hreflang, metadata og JSON-LD før merge/publish.
7. Produktion ændres kun efter et tydeligt kontrolpunkt og kan rulles tilbage efter `ROLLBACK.md`.

## Beskyttelsesregler

- Ingen ændring af titel/H1, brødtekst, holdning, rating, forfatter, publiceringsdato eller slug gennem automatisk SEO-optimering.
- Webflow full-site publish kræver staging/readback, eksakt backup og et eksplicit kontrolpunkt.
- Ingen secrets kopieres til dokumentation eller commits.
- Eksisterende EN-locale må ikke antages; 27 danske artikel-items mangler aktuelt EN-variant.
- Nye artikler skal fortsat oprettes med både DK- og EN-locale i samme bulk-create.
- `sources/` i det overordnede ChatGPT-projekt er read-only reference og berøres ikke.

## Dokumenter

- `BASELINE.md`: observeret teknisk og redaktionel status
- `ROLLBACK.md`: rollback pr. system
- `CHANGELOG.md`: ændringer udført under arbejdet
- `SEO-ENGINE-AUDIT.md`: live kontrol af GSC/GA4/Webflow-maskinen og dens guardrails
