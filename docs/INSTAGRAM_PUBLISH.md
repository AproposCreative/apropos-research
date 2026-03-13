# Publish til Instagram – opsætning og test

Design editoren kan poste kort direkte til Instagram. Her er kravene og hvordan du tester.

## Flow

1. Bruger vælger artikel i design editoren og åbner **Preview** (Instagram-visning).
2. Klik på **Post til Instagram**.
3. Appen eksporterer kortet som JPEG (2× opløsning), uploader til Firebase Storage, henter download-URL og kalder `/api/instagram/publish` med `imageUrl` + `caption`.
4. API’et opretter Instagram-media fra `image_url` og caption og publicerer til den konfigurerede IG-konto.
5. Hvis `FACEBOOK_PAGE_ID` er sat (og opslaget ikke er story), forsøger API’et bagefter automatisk at poste samme billede + caption på Facebook-siden.

## Miljøvariabler

I `.env.local` (og i Vercel under Production/Preview):

| Variabel | Beskrivelse |
|----------|--------------|
| `INSTAGRAM_ACCOUNT_ID` | Instagram Business/Creator Account ID (tal). Findes i Meta Business Suite eller via Graph API. |
| `INSTAGRAM_ACCESS_TOKEN` | **Page** access token med `instagram_content_publish` (eller tilsvarende) for den Facebook-side der er koblet til IG-kontoen. |
| `FACEBOOK_PAGE_ID` | (Valgfri) Facebook-side ID. Hvis sat, publiceres feed-opslag automatisk til siden efter vellykket Instagram-publicering. |

Firebase (til upload af billedet):

- `NEXT_PUBLIC_FIREBASE_*` (apiKey, projectId, storageBucket, osv.) skal være sat, så Storage er tilgængelig i browseren.

## Sådan finder du værdierne

### INSTAGRAM_ACCOUNT_ID

1. Gå til [Meta for Developers](https://developers.facebook.com/) → din app → **Instagram Graph API**.
2. Under **User Token** eller via [Graph API Explorer](https://developers.facebook.com/tools/explorer/): kald `me/accounts` (Facebook Pages) og find den side der er knyttet til din IG-konto; eller brug dokumentationen til at hente IG Business Account ID for den bruger/side.

Alternativt: brug endpointet `me?fields=instagram_business_account` med en bruger-token der har adgang til IG-forretningskontoen – feltet `instagram_business_account.id` er din `INSTAGRAM_ACCOUNT_ID`.

### INSTAGRAM_ACCESS_TOKEN

- Skal være en **Page** access token (ikke User access token), med rettighed til at publicere på den tilknyttede Instagram-konto.
- I Meta App Dashboard: **Instagram** → **Basic Display** eller **Instagram Graph API** → generer token med scope `instagram_content_publish` (og evt. `pages_show_list`, `pages_read_engagement`).
- Page tokens kan udløbe; ved 503/502 med “token udløbet” skal du generere et nyt og opdatere `INSTAGRAM_ACCESS_TOKEN`.

## Tjek at det er sat op

- **GET** `/api/instagram/publish` returnerer `{ "configured": true }` når både `INSTAGRAM_ACCOUNT_ID` og `INSTAGRAM_ACCESS_TOKEN` er sat (ellers `configured: false`).
- I browseren: åbn `http://localhost:3000/api/instagram/publish` og tjek payload.

## Test end-to-end

1. **Firebase**: Tjek at du er logget ind og at Storage-upload virker (fx ved at uploade et billede et andet sted i appen, eller at der ikke kommer “Firebase Storage er ikke tilgængelig” i design editoren).
2. **Instagram API**: Sørg for at `INSTAGRAM_ACCOUNT_ID` og `INSTAGRAM_ACCESS_TOKEN` er sat og at GET `/api/instagram/publish` giver `configured: true`.
3. **Design editor**: Gå til `/design-editor`, vælg en artikel, åbn **Preview**, og klik **Post til Instagram**.
4. Forventet:
   - Success: “Opslaget er publiceret på Instagram” – tjek den tilknyttede IG-konto.
   - Fejl: Beskeden vises under knappen (fx “Instagram-tokenet er udløbet” eller “Firebase Storage er ikke tilgængelig”). Tjek server-logs for `/api/instagram/publish` ved 502/500.

## Almindelige fejl

- **“Instagram-publish er ikke konfigureret”**  
  INSTAGRAM_ACCOUNT_ID eller INSTAGRAM_ACCESS_TOKEN mangler eller er tomme. Sæt dem i `.env.local` og genstart dev-server.

- **“Firebase Storage er ikke tilgængelig”**  
  Firebase er ikke initialiseret i browseren (manglende eller forkerte `NEXT_PUBLIC_FIREBASE_*`).

- **“Instagram-tokenet er udløbet”**  
  Udskift `INSTAGRAM_ACCESS_TOKEN` med et nyt Page access token fra Meta.

- **“Manglende eller ugyldig imageUrl”**  
  Upload til Storage eller `getDownloadURL` fejlede; tjek at Storage-regler tillader upload til den brugte path (`instagram-publish/*`) og at download-URL’en er tilgængelig (Instagram’s servere skal kunne hente billedet via den URL).
