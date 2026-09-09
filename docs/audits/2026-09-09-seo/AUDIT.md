# SEO-programmet: kortlægning før ændringer

Dato: 2026-09-09. Baseline: `feeb75a92bd2cc88e36183e74c98ec20ad50edb8`, hentet fra GitHub main ved auditstart.
Branch: `codex/seo-audit-20260909`. Worktree: `/Users/frederikkragh/Developer/apropos-research-seo-audit`.

## Afgrænsning og metode

Statisk gennemgang af det lokale checkout: API-ruter, UI, analysepipeline, lagring, CMS-skriveveje, automatisering, eksisterende tests og tidligere audits. Fundene nedenfor er udledt af kode, ikke observerede produktionshændelser. Rapporten fra august er historisk kontekst, ikke bevis for den aktuelle drift.

Ingen applikationskode, Liv-filer, CMS-artikler, produktionsindstillinger eller fælles konfiguration er ændret. Ingen secrets er indlæst. Ingen dependencies, gamle node_modules, caches, buildoutput, Dropbox- eller quarantinefiler er importeret eller eksekveret. Ingen installation, npm-lifecycle-scripts, push eller deployment. Eneste ændring er denne rapport.

Build, Vitest, typecheck og browser-/serviceintegration er ikke kørt i dette nye worktree. Det har ingen nyinstallerede dependencies; tidligere testresultater fra Liv-opgaven er ikke genbrugt som denne audits testresultat. Ved efterfølgende implementering skal friske dependencies gennem SSD-gaten, lifecycle-scripts forblive deaktiverede, og Vitest bruge den eksisterende `RAGE_STORAGE_DIR=./tmp/vitest-rage`. Tracked researchdata må ikke berøres.

## Eksisterende funktioner og grænser

| Område | Implementeret funktion | Data og skriveadgang |
| --- | --- | --- |
| SEO Studio | `app/ai/seo/SeoEngineClient.tsx`: analyse, strategi, feltredigering, historik, arkiv og optimeringskø | UI bruger SEO API og Firebase-login |
| Analyse og strategi | `lib/seo-engine/pipeline.ts`: analyse → strategipakke; inputhash, versioner, validering, evidens, confidence og håndtering af lange artikler | OpenAI samt Firestore; manuel lagring er ikke i sig selv CMS-publicering |
| Feltredigering | `save-fields`, `regenerate-field`, strategi-adoption og revisionstjek | Ejerskab/admin og versionskontrol i Firestore |
| SEO/AEO/schema | Deterministisk JSON-LD, anmeldelsesregler, identitet, forbudte formuleringer og CMS-feltmapping | Pakker/snapshots er ikke i sig selv bevis for JSON-LD i publiceret HTML |
| Empty-fill | Publish-hook → vedvarende jobkø → worker → validering → genlæsning → udfyldning af tomme SEO-felter → readback → publicering | DA/EN; skriver `seo-title` og `meta-description`. Workerens publicering af hele item er særskilt risiko, se F6 |
| Opportunity engine | GSC/GA4, sammenlignelige 28-dages vinduer med datalag, scoring, query/page-fingerprints, lokalemapping og metadataforslag | Daglig indsamling; ugentlig automatisk anvendelse, højst 10 pr. kørsel, 14 dages cooldown og kvalitetsgrænser |
| Arkiv | Audit og jobkø: metadata, canonical, billed-alt, overskrifter og interne links; preview før apply | Admin; bekræftelsestoken, frosne forslag, backups og kontrol. Content-apply kan ændre artikel-HTML og kræver særskilt redaktionel behandling |
| Backfill | CLI med frosset manifest, DA/EN, kontrol af ændringer, backup og stop ved fejl | Kan masseoverskrive CMS; må ikke køres live uden særskilt godkendelse |
| Livs lette SEO | `lib/seo/generate-seo-meta.ts`: AI eller heuristik, brugt af `lib/liv/generate-article.ts` og AI-chat | Bevares. Soft-deprecated betyder ikke ubrugt; må ikke fjernes som oprydning |

Opportunity-forslag er i den gennemgåede vej heuristiske (`opportunity-engine/proposals.ts` bruger `proposeArchiveSeoMetaHeuristic`), mens den almindelige analyse/strategi bruger AI. UI bør gøre den forskel forståelig.

### API-kort

Alle følgende stier er under `/api/seo-engine/`, medmindre andet er angivet:

| Ruter | Formål / kontrol |
| --- | --- |
| `analyze`, `strategize` | Analyse/strategi; login/allowlist, ejerskab hvor relevant; særskilt lokal demo |
| `get`, `history`, `save-fields`, `regenerate-field` | Historik, læsning, soft-delete og revisionsstyret redigering; owner/admin |
| `preview`, `run`, `status` | Empty-fill-preview/kørsel og driftstilstand; admin på run og ændring af global status |
| `archive-audit`, `archive-audit/preview`, `archive-audit/apply` | Arkivscan og metadataændringer; admin, preview og eksplicit bekræftelse |
| `archive-audit/content-preview`, `archive-audit/content-apply` | Indholdsrettelser; admin og eksplicit bekræftelse |
| `archive-jobs/scan`, `archive-jobs/[jobId]` | Jobliste, scan, preview, apply og opfølgning; admin |
| `opportunities`, `opportunities/[id]`, `opportunities/scan` | Fælles optimeringskø; SEO-allowlist, ikke samme owner/admin-model som arkivet |
| `/api/internal/seo-engine-article` | Worker; kræver internt secret |
| `/api/cron/seo-engine-recovery` | Genstart af køjob; kræver cron-secret |
| `/api/cron/seo-engine-opportunities/daily`, `/weekly` | Indsamling/optimering; kræver cron-secret |
| `/api/seo/generate` | Ældre generator; fælles proxy-auth, ikke SEO Engines særskilte allowlist. Bevar Liv-kompatibilitet |

Vigtigt: `opportunities/scan` er som standard `mode=optimize` med automatisk apply. Det er ikke et read-only audit-endpoint. Et rent CMS-læseflow skal udtrykkeligt vælge `mode=collect` og `autoApply=false`; scanning kan stadig gemme rapporter i Firestore. Ingen af disse endpoints blev kaldt under auditten.

### Lagring, auth og drift

- SEO-kerne: `seoEngineArticles`, `seoEngineAnalysisRuns`, `seoEngineInputSnapshots`, `seoEngineVersions`, `seoEngineFieldRevisions`, `seoEngineJobs`, `seoEngineContentClaims`, `seoEngineRateLimits`.
- Opportunity: `seoEngineOpportunities`, `seoEngineOpportunityVersions`, `seoEngineOpportunityAudit`, `seoEngineOpportunityScans`, `seoEngineOpportunityUrlCooldown`, `seoEngineOpportunityIdempotency`.
- Arkiv: jobs, gemte previews og `seoEngineArchiveApplyBackups`; filbackup bruger serverless-egnet tempsti.
- Indstillinger: `appSettings/seoEngine`, med separate legacy empty-fill- og opportunity-flags.
- `proxy.ts` giver fælles API-auth. SEO-ruter tilføjer Firebase UID-allowlist; tomme lister i production afviser adgang. Systemejede dokumenter kræver admin. Worker og cron har særskilte secrets og accepterer ikke blot almindeligt Firebase-login.
- `vercel.json` angiver recovery hvert 15. minut, daily kl. 06:15 og weekly mandag kl. 06:30 efter cron-planens tidsgrundlag. Den aktuelle produktionskonfiguration er ikke verificeret her.
- `tsconfig.seo-engine.json` har strict scope; `vitest.config.ts` isolerer teststorage. Der findes mange målrettede tests, men dækningen af de faktiske write-/rollback-forløb er utilstrækkelig til at afvise nedenstående fund.

## Prioriterede fund

### F1 · P1 · Rollback kan overskrive nyere redaktionelle metadata

`lib/seo-engine/opportunity-engine/apply.ts:289` (`rollbackOpportunity`) bygger patch fra tidligere versioner uden at hente det aktuelle CMS-item og kontrollere, at felterne stadig svarer til versionens `after`.

Reproducerbart forløb ud fra koden: anvend SEO-forslag → redaktør ændrer metadata → rollback gendanner ældre metadata over redaktørens ændring. Apply har stale-write-kontrol, men rollback har ikke.

Rettelsesretning: genlæs samme locale, sammenlign med seneste verificerede anvendelse, afvis konflikt og vis konkret diff. Test nyere redaktørændring samt uændret item.

### F2 · P1 · Fejlet rollback kan blive registreret som udført

Samme fil, `apply.ts:328`: versioner får `rolledBackAt` før CMS-PATCH ved linje 349. Hvis PATCH fejler, springer næste forsøg de markerede versioner over ved linje 313 og kan derefter sætte opportunity til `rolled_back` uden at have gendannet CMS.

Rettelsesretning: særskilt pending/succeeded/failed-operation, genoptageligt write-forløb og readback før completion. Test PATCH-fejl og retry. Versionsbackup før ændring er korrekt; completion-markøren skal vente.

### F3 · P1 · Idempotens beskytter ikke mod samtidige kørsler

`lib/seo-engine/opportunity-engine/store.ts:352`: `claimIdempotencyKey` afviser kun `status === 'applied'` ved linje 362. En igangværende `claimed` kan derfor claim'es af endnu en transaktion. Manuel kørsel og cron kan begge komme forbi, genlæse samme CMS og skrive samme forslag, med overlappende versionshistorik.

Rettelsesretning: atomisk lease med ejer og udløbstid, completion kun fra lease-ejer; suppler med item/locale-lås på tværs af forskellige opportunity-keys. Test parallel claim, udløbet lease og fejl mellem CMS-write og persistens.

### F4 · P1 · Nødstop dækker ikke alle automatiske skriveveje

- `opportunity-engine/settings.ts:51`: eksplicit env=true returnerer før Firestore-indstillingen. UI-nødstop kan således gemmes uden at standse dette override.
- `after-publish.ts:48`: `runtime.shouldAutoFillOnPublish || legacyAutoSeo` kan fortsat enqueue med opportunity-nødstop aktivt.
- Worker kontrollerer ikke et samlet nødstop umiddelbart før PATCH/publicering. Runbook beskriver, at igangværende job kan færdiggøres, mens UI lover ingen automatiske writes (`OpportunityQueuePanel.tsx:226`, `SeoEngineSection.tsx:318`).

Rettelsesretning: definer én autoritativ stopregel, der vinder over enable-flags; genkontroller før skrivning. UI skal vise aktivt override og præcis stopsemantik. Bevar mulighed for manuelt godkendte handlinger efter en tydelig kontrakt. Koordinér publish-hook med Liv.

### F5 · P1 · Recovery mister EN-locale og bruger et andet enable-flag

`app/api/cron/seo-engine-recovery/route.ts:28`: re-enqueue sender ikke `job.locale`. `jobs.ts:61` falder tilbage til DA, og job-id indeholder locale. Et ventende EN-job bliver derfor ikke genstartet som det oprindelige EN-job; der kan i stedet oprettes eller kickes et DA-job. Svaret tæller det oprindelige job som kicked.

Desuden stopper recovery ved legacy-flaget alene (`route.ts:20`), selv om after-publish kan enqueue via opportunity-flaget. Opportunity-only drift kan derfor efterlade job uden recovery.

Rettelsesretning: genstart præcis det eksisterende job-id med bevaret locale og fælles tilladelsesregel. Test EN, DA og opportunity=true/legacy=false. Rettelsen kan holdes i SEO-ruter og kræver ingen cron-planændring.

### F6 · P1 · Workerens publiceringskontrol er svagere end enqueue-kontrollen

`auto-seo-worker.ts:24` og `:108`: snapshot medtager ikke `isDraft`. Ved linje 304 er `lastPublished` alene nok til at kalde item-publicering. En tidligere publiceret artikel kan have redaktionelle kladdeændringer; workerens metadata-PATCH er begrænset, men det efterfølgende publish-kald er på item-niveau.

Stale-checks reducerer risikoen, men kan ikke i sig selv afgøre, om allerede eksisterende staged indhold er godkendt. Der er også et tidsvindue mellem sidste læsning og publicering.

Rettelsesretning: hent draft-/publiceringsstatus, og afklar staged-versus-live-kontrakten før automatisk item-publicering. Test et tidligere publiceret item med `isDraft=true`, staged bodyændring og samtidig Liv-redigering. Den faktiske Webflow-liveeffekt skal verificeres senere med en særskilt godkendt testartikel. Fælles Webflow-helper må ikke ændres ukoordineret.

### F7 · P2 · Opportunity “applied” er ikke verificeret live-effekt

`opportunity-engine/apply.ts:217` udfører PATCH og markerer applied uden readback eller eksplicit publish. Den anvendte helper i `lib/webflow/locale-items.ts` kalder `/collections/{id}/items`, og publicering er en særskilt helper. Koden beviser således CMS-request-succes, ikke at det præcise forslag er gemt og synligt på artiklens offentlige side.

Rettelsesretning: adskil gemt, verificeret og publiceret. Tilføj exact readback; afklar publicering med Liv og F6 før eventuel implementering. Mål ikke SEO-effekt fra applied-tidspunktet uden verificeret live-tidspunkt.

### F8 · P2 · UI lover schema-snapshot, som opportunity-scan ikke producerer

`opportunity-engine/engine.ts:464` sætter `serverJsonLdHtml: null`; apply gemmer kun schema-version, hvis feltet findes. UI beskriver alligevel server-schema-snapshot som del af normal optimering. Dette er ikke en mangel på al JSON-LD i programmet, men en forskel mellem den konkrete opportunity-vej og dens beskrivelse.

Rettelsesretning: tilpas produktteksten til faktisk output, eller byg en valideret schema-vej med eksplicit publiceringsansvar. Verificer publiceret HTML særskilt.

### F9 · P2 · Runbook modsiger den aktuelle locale-/driftsmodel

`docs/seo-engine-runbook.md` beskriver både default OFF for auto og default ON for opportunity, samt “DK only / Never EN” i empty-only-afsnittet, mens after-publish og worker understøtter DA/EN. Det gør operationalisering og fejlsøgning usikker, særligt ved F4/F5.

Rettelsesretning: dokumentér hver skrivevej, præcis enable-/stopprioritet, locale og forskellen på CMS-lagring og live-publicering i én driftstabel.

## Forbedringsplan og acceptkriterier

1. Ret F1–F3 i en lille SEO-only ændring: konfliktbeskyttet rollback, genoptagelse ved fejl og reelle claims. Kræv tests med mock-CMS/Firestore, samtidighed og fejlindsprøjtning.
2. Saml stop-/køkontrakten og ret F4/F5. Kræv matrix for begge flags, alle locales og køjob efter stop. Koordinér publish-hook med Liv, selv hvis rettelsen kun ligger under SEO.
3. Afklar og test F6/F7 sammen med Liv: ingen automatisk frigivelse af staged redaktionelt indhold; præcis readback og synlig status for pending/publiceret. Ingen live test uden særskilt aftale om testartikel og handlinger.
4. Ret F8/F9, og gør manuel indsamling tydeligt forskellig fra anvendelse. Bevar historikken og vis faktisk forslagstype, datoperiode og begrundelse.
5. Tilføj resultatopfølgning: verificeret live-tidspunkt, før/efter GSC-vinduer, CTR/klik og position med sæson-/nyhedskontekst. Rapportér ændringer som observationer, ikke bevis for kausal SEO-effekt.

Eksisterende korrekte byggesten skal genbruges: feltallowlist, locale-mapping, validering, review-title-regler, inputhash/revisioner, frosne previews, backup og historik. August-fixet mod rå queries som værknavn findes i den aktuelle `proposals.ts`; det skal ikke genimplementeres. Det samme gælder stabilt fingerprint og UI-samling af køhistorik.

## Koordination med Liv

Liv-opgaven `01a08533-1099-7121-989d-fb0f5da99c36` er orienteret om worktree, scope, ingen fælles filændringer og de konkrete write-/stop-risici. Dette er en koordineringsmeddelelse, ikke en godkendelse af fremtidige fælles ændringer.

| Fælles område | Kontrakt for efterfølgende ændringer |
| --- | --- |
| `lib/articles/publish.ts`, `lib/webflow/locale-items.ts`, `app/api/webhooks/webflow/route.ts` | Aftal ejerskab og publish-/staged-semantik med Liv før ændring |
| `lib/seo/generate-seo-meta.ts`, `lib/liv/generate-article.ts`, AI-chat | Bevar Livs generator og returformat; ingen fjernelse som “legacy cleanup” |
| `proxy.ts`, `lib/api/*`, Firebase-auth og fælles settings | Aftal roller og callers med Liv; ingen global auth-omlægning i SEO-audit |
| `package.json`, lockfile, Next/Vercel-konfiguration og Firestore-regler/indexes | Ingen ændringer her. Dependencyændringer kræver SSD-gate; push/deploy følger særskilt credential-rotation og godkendelse af eksakt rent commit |
| `vitest.config.ts`, researchdata og Liv-persona/prompts | Bevar storage-isolation, redaktionelle data og Liv-redaktionen |

Denne leverance afslutter kortlægningen før kodeændringer. Prioriteringerne er en lokal implementeringsplan, ikke tilladelse til CMS-masseændringer eller deployment.
