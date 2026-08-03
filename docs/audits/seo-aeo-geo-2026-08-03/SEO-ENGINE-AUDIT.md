# SEO Engine-audit (`ai.aproposmagazine.com`)

Kontrolleret i den autentificerede produktionsgrænseflade 2026-08-03. Der er ikke kørt en manuel optimering, anvendt forslag, aktiveret nødstop eller rullet noget tilbage under kontrollen.

## Status

- Live build: `1.0.0.417c670` (samme baseline som `main` ved auditstart).
- GSC, GA4 og Webflow rapporteres sunde.
- Automatisk opportunity-optimering er aktiv.
- Sikkerhedsarkitekturen er grundlæggende god: kun SEO-title og meta description kan auto-skrives; versionshistorik, cooldown, stale-write-kontrol og rollback findes.

## Fund

### P1 — rå GSC-query kunne blive artikelnavn

Opportunity Engine brugte den bedst scorende Google-query som `workName`. GSC-queryer er ofte lowercasede, forkortede eller formuleret som spørgsmål. Det gav blandt andet anvendte titler som:

- `now you see me 3 anmeldelse`
- `roskilde 2026 anmeldelse`
- `den gode stemning anmeldelse`
- `lucky serie anmeldelse`
- `tobias rahim roskilde 2026 anmeldelse`

Der lå også et åbent Outlander-forslag, hvor spørgsmålet `hvor mange sæsoner er der af outlander` blev gjort til en anmeldelsestitel. Det er både en redaktionel kvalitetsrisiko og en search-intent-risiko.

**Rettelse på PR-branchen:** CMS-artiklens titel er nu autoritativ kilde til værk/entity og kapitalisering. GSC-queryen bruges fortsat som evidens til scoring og rationale, men kan ikke længere blive den skrevne entity.

### P1 — historiske dubletter i køen

Fingerprintet bestod af side + query + det aktuelle signalsæt. Når signalerne ændrede sig mellem scanninger, blev der derfor oprettet en ny række for samme side/query. UI'et hentede alle statusser og viste flere O Days- og Roskilde-poster samtidig.

**Rettelse på PR-branchen:** nye fingerprints bruger side + query. UI'et samler desuden eksisterende legacy-dubletter og viser den senest opdaterede række.

### P2 — stærke muligheder kræver redaktionel behandling

De største synlige muligheder havde reel GSC-evidens, blandt andet:

- O Days 2026: ca. 2.787 impressions, CTR 0,1 %, position 7,5 for `o days program`.
- Syd for Solen 2026: ca. 4.220 impressions, CTR 0,0 %, position 7,1.
- Torsdag på Roskilde Festival 2025: ca. 652 impressions, CTR 0,6 %, position 5,6 og fald fra ca. 1.213 impressions.

De bør prioriteres, men deres metadata skal bygge på artikelens officielle navne, format og faktiske intent — ikke en mekanisk `query + anmeldelse`-formel.

## Verifikation af rettelsen

- Målrettet Opportunity Engine-suite: 25/25 tests bestået.
- Fuld suite: 27 testfiler, 274 tests bestået.
- TypeScript typecheck bestået.
- Lint af alle ændrede filer bestået.
- Repositoryets fulde lint er fortsat blokeret af en eksisterende, urørt fejl i `components/marketing/ProductStoryShowcase.tsx` (`module`-variabel).

## Drift indtil merge

Den aktive production build indeholder endnu ikke rettelserne. Undlad manuel optimering og masseanvendelse. Hvis automatisk drift skal standses før PR-review og production deployment, bruges det eksisterende nødstop; dette blev ikke ændret uden særskilt godkendelse.
