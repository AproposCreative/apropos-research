# Apropos Magazine AI cultural desk audit

Dato: 2026-09-09
Checkout: `codex/remove-postcss-malware`
HEAD: `5ee2cb7 security: avoid shell in refresh fallback`

## Konklusion

Repositoryet har en fungerende Next.js/Firebase/Webflow-platform med en allerede delvist implementeret Liv-pipeline. Den nuværende løsning kan vælge et emne, generere en artikel, køre flere sikkerhedstjek og oprette et Webflow CMS-item som draft eller published. Den er dog ikke endnu en sikker, dokumenteret daglig kulturredaktion.

De største mangler er:

1. Editorial discovery har kun fire beats og mangler den krævede brede kulturdækning.
2. Editorial queue og coverage/dedupe er primært client-side/localStorage, ikke en server-side Firestore-kilde.
3. Live-publicering styres af en fri env-værdi, ikke af en eksplicit workflow-state med human approval.
4. Factcheck- og source-similarity-fejl kan markeres som `skipped` og stadig tillade auto-publish.
5. Den generiske artikel- og billedrute er ældre end Liv-flowet og mangler samme strukturerede kontrakt, kildekrav og billedasset-model.
6. API-auth er global og grovkornet: enhver gyldig Firebase-bruger får adgang til alle beskyttede API-ruter.

## Repository og deployment-baseline

- Checkoutet var rent ved auditstart.
- Den lokale branch er `codex/remove-postcss-malware`; den er tre commits foran `origin/codex/remove-postcss-malware`.
- Push-remote er bevidst sat til `disabled://PUSH-BLOCKED-UNTIL-CREDENTIAL-ROTATION`.
- `origin` er derfor kun brugt til read-only reference. Remote-branchen `feat/liv-cultural-desk-and-image-v2` findes ikke.
- Next 16 bruger `proxy.ts` til API-beskyttelse og request IDs.
- Vercel cron planlægger Liv kl. 08:00 UTC via `/api/cron/liv-daily-article`.
- GitHub Actions har stadig en `daily-ingest` workflow med `contents: write` og `git push`. Det er i konflikt med projektets recovery-sikkerhed og bør fjernes eller gøres read-only i en separat sikkerhedsændring.

## Arkitektur og flow

Den relevante aktuelle kæde er:

```text
/api/trending
  -> lib/liv/pick-topic.ts
  -> lib/liv/generate-article.ts
  -> lib/liv/run-safety-gates.ts
  -> lib/liv/research-qa.ts
  -> lib/liv/build-cms-payload.ts
  -> lib/articles/publish.ts
  -> lib/webflow-service.ts
  -> Webflow CMS
```

Liv-historik og dagsplan ligger i Firestore-collections `livDailyArticles` og `livDailyPlan`. Den generelle editorial cockpit bruger derimod `lib/editorial/engine.ts` sammen med `lib/editorial/signal-store.ts`, hvor publicerede signaler og dækkede emner gemmes i browserens `localStorage`.

## Det fungerer allerede

- Next.js-app med central env-validering, Firebase client/admin og Firestore-adaptere.
- Global API-gate via `proxy.ts`: Firebase ID-token, `INTERNAL_API_SECRET` eller `CRON_SECRET` i production.
- Livs dagskørsel har atomisk Firestore claim/finish og retry-/stale-processing-håndtering.
- Liv har en særskilt persona-prompt i `data/author-prompts/liv-brandt.txt` med eksplicit forbud mod opdigtede erfaringer og fakta.
- Liv-flowet kræver mindst to URL-baserede researchkilder og har moderation, source-similarity, factcheck, TOV og research-QA.
- Webflow-publish går gennem en canonical normalisering og har default-status `draft`.
- Firebase Storage-upload med WebP-optimering findes i `lib/images/optimize-and-upload.ts`.
- Vercel cron-konfigurationen har en daglig Liv-kørsel og flere eksisterende background jobs.
- Testbaseline: 38 testfiler, 353 tests passerede. `npm run security:config` passerede. `npm run type-check` passerede.

## Gaps og risici

### P0: Auto-publish fail-open på ufuldstændig verifikation

`lib/liv/run-safety-gates.ts` markerer factcheck som `pass: true, skipped: true`, når API'et fejler eller returnerer et ubrugeligt svar. Source-similarity kan også springes over ved fejl. Cron-ruten tester kun `gates.pass`, ikke `anyGateSkipped`, før den publicerer. Det bryder kravet om, at auto-publish kun må ske efter godkendt kildekontrol og kvalitetstjek.

### P0: Publiceringsmodel mangler draft/approval/auto som workflow

`LIV_DAILY_WEBFLOW_STATUS` kan sættes til `published`, og `buildLivCmsPayload` sender derefter live-status. Der findes ikke en Firestore approval-record, en samlet publication mode eller en server-side policy, der kræver alle gates og en eksplicit redaktionel tilladelse. En miljøvariabel er derfor den afgørende live-switch.

### P1: Editorial queue er ikke en persistent queue

`app/api/editorial/signals` og `app/api/editorial/research` er request-baserede og skriver ikke signal, dossier, artikelstatus, gate-resultater eller beslutninger til Firestore. `lib/editorial/signal-store.ts` bruger localStorage til published IDs og coverage. En ny browser, bruger eller maskine kan derfor miste dedupe- og coverage-state.

### P1: Dækningen er for snæver

`lib/editorial/types.ts` definerer kun `musik`, `film-tv`, `gaming` og `kultur`. Det repræsenterer ikke kulturpolitik, teater/scenekunst, litteratur, billedkunst/museer, arkitektur/design, kulturarv eller ændrede kulturvaner som separate prioriterbare beats. Livs emnescorer er desuden tydeligt musik-/koncerttunge.

### P1: Dedupe er begrænset og semantisk svagt

Liv deduperer kun mod publicerede emner/slugs fra omtrent de seneste 14 dage i `livDailyArticles`. Editorial-engine bruger token-overlap i input, men uden en Firestore-backed global article/source registry. Kilder, idéer, afviste signaler og drafts deduperes ikke på tværs af systemet.

### P1: Billedflowet opfylder ikke hele den ønskede asset-kontrakt

AI-billeder genereres som DALL-E `1792x1024` og beskrives som 1920x1080, men der er ingen eksplicit final resize/crop-kontrakt til præcis 1920x1080. Generisk `/api/generate-image` returnerer en URL og sender den videre til process-image; Livs CMS-payload bruger primært officielle image suggestions. Der er ingen samlet artikelbundet image record med prompt, kilde/licens, variant, status og Webflow-resultat. Game-billeder kan komme direkte fra Google Images.

### P1: API authorization er ikke rolle-/scope-baseret

`proxy.ts` håndhæver auth i production, men `isApiRequestAuthorized` accepterer ethvert gyldigt Firebase ID-token til alle protected API-ruter. Route handlers for editorial research, generation, quality-check og Webflow publish foretager ikke yderligere rolle- eller scope-kontrol. Development bliver åbent, hvis `INTERNAL_API_SECRET` mangler.

### P2: Kvalitetstjekket er et separat AI-svar uden hårde tærskler

`/api/quality-check` kører fem parallelle modelvurderinger og returnerer score/anbefalinger, men enforcement ligger hos klienten. Der er ingen deterministiske krav til kildeliste, dansk sprog, forbudte em-dashes, titel/meta/slug-forhold, kildedatoer eller gentagne AI-formuleringer.

### P2: Logging og datahygiejne

Nogle routes logger titel, excerpt, promptmetadata og image URL previews. Det er nyttigt ved fejlsøgning, men bør samles i strukturerede audit events med redaction og retention. Firestore collection-/datatype-kontrakter er spredt i kode uden en samlet schema-/migrationbeskrivelse.

### P2: GitHub automation kan skrive til repositoryet

`.github/workflows/daily-ingest.yml` installerer afhængigheder, skriver data/prompts og pusher. Det er ikke nødvendigt for en Firestore/Webflow-baseret daglig redaktion og er ikke foreneligt med den aktuelle push-blocker.

## Datamodel, som den er nu

Dokumenteret direkte i kode:

- `livDailyArticles`: én daglig claim/history record, status, topic, title, slug, Webflow item ID og gate results.
- `livDailyPlan`: én dagsplan med topic hint, directive, expanded directive og status.
- `mediaSources`, `drafts` og flere ældre Firebase client collections i `lib/firebase-service.ts`.
- Editorial coverage/signals: browser `localStorage`, ikke Firestore.
- Firebase Storage: `processed-images/YYYY/MM`, `apropos-config`, artikelimports, podcast paths og andre feature paths.
- Webflow: Authors, Articles, Sections, Topics, Festivals og Streaming Services via env-/data-config.

Der mangler en samlet persistent model for `editorialSignals`, `researchDossiers`, `articleDrafts`, `sourceRegistry`, `coverageLedger`, `qualityChecks`, `imageAssets` og `publicationAttempts`.

## Prioriteret implementeringsplan

### Fase 1, sikkerhed og invariants

1. Indfør en central `publicationMode`: `draft | human_approval | auto_publish`.
2. Gør alle sikkerhedsgates fail-closed for auto-publish. `skipped` må aldrig være publishable.
3. Gem hver run, gate, kilde og publiceringsbeslutning i Firestore med idempotency key.
4. Gør Webflow publish-route scoped og valideret server-side. Live-status må kun kunne vælges af workflow-policy.
5. Tilføj tests for unauthorized, skipped gate, duplicate, approval og auto-publish.

### Fase 2, persistent editorial desk

1. Indfør Firestore collections for signals, dossiers, coverage og source registry.
2. Udvid beats til de ti krævede kulturfelter med balance-/rotationsscore.
3. Flyt dedupe fra localStorage til server-side canonical URL, source hash, title fingerprint og semantic similarity.
4. Gør editorial queue stateful: discovered → researched → drafted → quality_checked → awaiting_approval → published/rejected.

### Fase 3, artikel- og billedpipeline

1. Saml Liv og generisk artikelgeneration i én struktureret article contract på dansk.
2. Håndhæv SEO metadata, læsetid, forfatter, kategori, slug, kildeliste og publiceringsdato.
3. Byg en image asset record, der gemmer original, processed 1920x1080 final, WebP variants, prompt, source/license, article ID og Webflow URL.
4. Brug officielle/licenserede billeder med tydelig prioritet for anmeldelser og generér kun AI-billeder efter policy.

### Fase 4, drift og observability

1. Tilføj metrics for beat coverage, duplicate rejection, gate failures, human approvals og publish outcomes.
2. Tilføj runbook, Firestore indexes/rules og retention.
3. Gør GitHub ingest read-only eller fjern push-jobbet.
4. Verificér Vercel preview med test-secrets only. Ingen push/deploy uden separat godkendelse og credential rotation.

## Første implementeringssnit

Det næste sikre kodetrin er en lille, testbar ændring i Liv publication policy og Firestore audit-loggen. Den bør ikke ændre Webflow credentials eller deployment. Først derefter bør editorial queue og billedasset-kontrakten bygges ovenpå.

