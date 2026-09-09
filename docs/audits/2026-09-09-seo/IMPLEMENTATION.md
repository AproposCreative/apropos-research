# SEO-rettelser og lokal verifikation

Dato: 2026-09-09. Branch: `codex/seo-audit-20260909`.
Auditbaseline var main `feeb75a`; ændringerne er efterfølgende rebased på Liv-hotfix `3985fb5` uden konflikter.

## Leveret

| Auditfund | Rettelse |
| --- | --- |
| F1: rollback overskriver redaktører | Genlæsning og sammenligning af metadata i samme locale; konflikt afvises. Kun seneste operation gendannes |
| F2: falsk gennemført rollback | Completion gemmes efter CMS-PATCH og exact readback. Retry håndterer både tabt CMS-svar og fejl i versionshistorikken uden ny PATCH |
| F3: samtidige skrivninger | Atomiske idempotency-claims med ejer og udløb; fælles item/locale-lås for worker, opportunity apply og rollback. Scans og status gemmes i transaktioner; godkendte og pending forslag fryses |
| F4: ufuldstændigt nødstop | Gemt stop vinder over env=true og legacy empty-fill. Manglende settings afviser automatisk arbejde. Worker og auto-apply kontrollerer igen før CMS-write. UI forklarer, at en allerede afsendt skrivning kan afsluttes |
| F5: recovery mister locale | Recovery kicker det eksisterende job-id med uændrede locale/attempts og understøtter opportunity-only drift |
| F6: utilsigtet publicering | Worker genbruger locale-fetch med draft-status og publicerer aldrig CMS-item. SEO gemmes staged, så Livs/redaktørens øvrige kladdeændringer ikke frigives af SEO |
| F7: applied uden verificeret resultat | Exact readback; `cmsWriteState=staged_verified` og verificeringstidspunkt. UI skelner nye kladder fra historiske applied-rækker med ukendt live-status |
| F8: misvisende schema-løfte | UI lover ikke længere et opportunity-schema-snapshot, som scan ikke producerer. Den separate SEO JSON-LD-funktion er bevaret |
| F9: modstridende driftsdokumentation | Ny driftstabel med DA/EN, stopprioritet, staged/publiceret og recovery i runbook; opportunity-dokumentation opdateret |

Manuel scan er desuden som standard collect uden CMS-write. Manuel optimize kræver både `mode=optimize` og `autoApply=true`; UI beskriver og bekræfter op til ti metadata-kladder.

Apply gemmer frosne pending versioner før CMS-write. Hvis CMS har gennemført skrivningen, men svaret går tabt, kan næste forsøg verificere resultatet uden at regenerere eller skrive igen. Hvis redaktionelt indhold ændres, før en afbrudt skrivning genoptages, afvises en ny write. Pending handlinger kan gendannes fra optimeringspanelet.

## Verifikation på slutkoden

- **488 Vitest-tests i 47 filer bestået**, heraf **36 nye tests** mod Liv-baseline `3985fb5`.
- Streng SEO-typecheck bestået. Global typecheck bestod efter rebase; det afsluttende Next-build bestod også TypeScript-kontrollen.
- Lint af ændrede kode-/testfiler bestået; React-gennemgang af de to ændrede paneler.
- **Produktionsbuild bestået lokalt**, uden produktionssecrets og uden deployment.
- **207 deployment-manifester** kontrolleret: ingen tmp-, Git- eller root .env-filer.
- Livs runtime-importkontrol bestået for editorial/desk, liv/status, liv/plan og liv/preview med ESM-kompatibilitetskontrollen aktiveret; anonyme kald forbliver afvist.
- **Ni ekstra redaktionelle recovery-tests** bestået.
- `git diff --check` bestået. Tracked researchdata og `vitest.config.ts` er uændrede; tests bruger `./tmp/vitest-rage`.

De nye tests dækker bl.a. nyere redaktørværdier, CMS-PATCH-fejl, forkert readback, tabte svar, fejlet rollback-historik, pending apply, stop under generation, EN/DA-recovery, draft-status, parallelle claims, udløbet ejer, samtidig apply samt eksplicit opt-in til manuel CMS-skrivning. Firestore/CMS er simuleret; der er ikke foretaget produktionskald.

## Recovery og koordination

Friske dependencies blev installeret via SSD-gaten med nul Socket-risici, nul Semgrep-fund, 829 verificerede registry-signaturer og 135 attestations. Alle lifecycle-scripts forblev deaktiverede. Rapport: `20260909T131036Z-apropos-research-seo-audit.log` i SSD'ens dependency-reports.

Ingen package-/lockfile-ændringer. Ingen SEO-ændringer i fælles Webflow-helpers, publish-hook, webhook, auth, Next/Vercel-konfiguration eller Liv-filer sammenlignet med `3985fb5`. Liv-opgaven har eksplicit bekræftet kompatibiliteten af staged-only SEO og separat redaktionel publicering. Dens runtime-hotfix er bevaret.

## Praktiske grænser og næste release

- Ændringerne er lokale. Intet push, deployment, ændring af produktionsindstillinger eller CMS-massekørsel er foretaget af SEO-opgaven.
- Metadata bliver **ikke automatisk synlige på sitet**. Redaktionens publiceringsflow skal publicere dem. `staged_verified` er ikke et mål for SEO-effekt på Google.
- Låsen koordinerer de tre ændrede SEO-skriveveje. Eksterne Webflow-redaktører og de eksisterende eksplicitte arkiv-/backfill-værktøjer deltager ikke i denne lås. CMS-helperen understøtter ikke atomisk compare-and-swap; et lille tidsvindue efter sidste genlæsning kan derfor ikke elimineres lokalt. Ingen automatisk item-publicering sker fra de ændrede veje.
- Gamle claims uden kendt udløbstid genbruges ikke automatisk; tvetydige historiske operationer kræver konkret readback/review. Ingen historiske data er migreret eller nulstillet.
- Authentificeret browser-E2E, faktisk Webflow-lagring og offentlig HTML/SEO-effekt er ikke verificeret. En eventuel serviceprøve skal bruge en særskilt aftalt testartikel og præcise handlinger.
- Push/deploy følger fortsat projektets krav om credential-rotation og særskilt godkendelse af det eksakte rene release-commit. Denne leverance er ikke en sådan godkendelse.
