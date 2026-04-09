# Publish til Instagram & Facebook – opsætning og test

Design editoren kan poste kort direkte til Instagram (feed og stories) og optionelt til Facebook.

## Flow

1. Bruger vælger artikel i design editoren og åbner **Preview** (Instagram-visning).
2. Klik på **Post til Instagram** (feed) eller **Post til Instagram Story** (story).
3. Appen eksporterer kortet som JPEG (2x opløsning), uploader til Firebase Storage, henter download-URL og kalder `/api/instagram/publish` med `imageUrl` + `caption`.
4. API'et opretter Instagram-media fra `image_url` og caption og publicerer til den konfigurerede IG-konto.
5. Hvis `FACEBOOK_PAGE_ID` er sat (og opslaget er feed, ikke story), forsøger API'et bagefter automatisk at poste samme billede + caption på Facebook-siden.

## Miljøvariabler

I `.env.local` (og i Vercel under Production/Preview):

| Variabel | Påkrævet | Beskrivelse |
|----------|----------|-------------|
| `INSTAGRAM_ACCOUNT_ID` | Ja | Instagram Business/Creator Account ID (tal). |
| `INSTAGRAM_ACCESS_TOKEN` | Ja | Page access token med nødvendige permissions (se nedenfor). |
| `FACEBOOK_PAGE_ID` | Nej | Facebook-side ID for auto-posting. Find det via Graph API Explorer: `me?fields=id,name` med din Page valgt. |

Firebase (til upload af billedet):
- `NEXT_PUBLIC_FIREBASE_*` (apiKey, projectId, storageBucket, osv.) skal være sat.

## Token Permissions (Scopes)

Tokenet **skal** være et **Page Access Token** (ikke User Token) med følgende permissions:

| Permission | Formål |
|------------|--------|
| `instagram_basic` | Basis-adgang til IG-konto |
| `instagram_content_publish` | Publicere feed-opslag og stories |
| `pages_show_list` | Se tilknyttede sider |
| `pages_read_engagement` | Læse side-engagement |
| `pages_manage_posts` | Auto-publicere til Facebook-siden (kun nødvendig med `FACEBOOK_PAGE_ID`) |

### Token-livstid

| Token-type | Levetid |
|------------|---------|
| Short-lived User Token (fra Graph API Explorer) | ~1 time |
| Long-lived User Token (via exchange) | ~60 dage |
| **Page Access Token fra long-lived user token** | **Aldrig** (permanent) |

**Vigtigt:** Brug altid et **permanent Page Access Token**. Det fås ved at konvertere et kort-livet token i to trin (se nedenfor). Sæt aldrig et short-lived token direkte i env — det udløber efter 1 time.

### Sådan genererer du et permanent token (anbefalet)

#### Via appen (nemmest)

1. Gå til **Settings → Social** i appen
2. Følg trinnene og indsæt et kort-livet token fra Graph API Explorer
3. Klik **Konvertér til permanent token**
4. Kopiér det permanente Page Access Token
5. Sæt det som `INSTAGRAM_ACCESS_TOKEN` i Vercel → Environment Variables → Production
6. Redeploy

#### Manuelt (fallback)

**Trin 1: Hent kort-livet token**

1. Gå til [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Vælg din app (fx "Apropos Publisher v2")
3. Under **User or Page**: vælg **User** / din Facebook-bruger — **ikke** kun Page-token. `fb_exchange_token` kræver et kort-livet **user** access token; Page-token giver fejl eller forkert resultat.
4. Tilføj permissions: `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`
5. Klik **Generate Access Token** og godkend

**Diagnose:** I appen under **Indstillinger → Social** kan du klikke **Kør diagnose** for at se om `INSTAGRAM_ACCESS_TOKEN` i miljøet er gyldig, har rigtig type (PAGE) og de nødvendige scopes.

**Trin 2: Konvertér til long-lived user token**

```bash
curl -s "https://graph.facebook.com/v24.0/oauth/access_token?\
grant_type=fb_exchange_token&\
client_id=DIN_APP_ID&\
client_secret=DIN_APP_SECRET&\
fb_exchange_token=DIT_SHORT_LIVED_TOKEN"
```

**Trin 3: Hent permanent Page Access Token**

```bash
curl -s "https://graph.facebook.com/v24.0/DIN_PAGE_ID?\
fields=access_token&\
access_token=DIT_LONG_LIVED_USER_TOKEN"
```

Det returnerede `access_token` er permanent og udløber aldrig. Sæt det som `INSTAGRAM_ACCESS_TOKEN`.

### Krævet env til token-konvertering

| Variabel | Beskrivelse |
|----------|-------------|
| `META_APP_ID` | App ID fra Meta App Dashboard → Settings → Basic |
| `META_APP_SECRET` | App Secret fra Meta App Dashboard → Settings → Basic |

## Tjek at det er sat op

- **GET** `/api/instagram/publish` returnerer `{ "configured": true }` når konfigureret.
- **Settings** → "Test Facebook" knappen verificerer Facebook Page-forbindelse.

## Test end-to-end

1. **Firebase**: Tjek at Storage-upload virker.
2. **Instagram API**: Verificer med GET `/api/instagram/publish`.
3. **Design editor**: Gå til `/design-editor`, vælg en artikel, og klik **Post til Instagram**.
4. Forventet:
   - Feed: "Opslaget er publiceret på Instagram og Facebook."
   - Story: "Story er publiceret på Instagram."
   - Fejl: Beskeden vises under knappen.

## Almindelige fejl

- **"Instagram-publish er ikke konfigureret"** — Manglende env vars.
- **"Firebase Storage er ikke tilgængelig"** — Manglende `NEXT_PUBLIC_FIREBASE_*`.
- **"Instagram-tokenet er udløbet"** — Generer nyt Page access token.
- **"Media ID is not available"** — Instagram behandler stadig billedet. Appen prøver automatisk op til 6 gange.
- **"pages_manage_posts are not available"** — Tilføj "Manage everything on your Page" use case i Meta App Dashboard under Brugssituationer.
- **"Manglende eller ugyldig imageUrl"** — Tjek Firebase Storage-regler for `instagram-publish/*`.

## Serverless Timeout

Instagram's billedbehandling kan tage op til 90 sekunder. Vercel's default function timeout er 10 sekunder (Free) / 60 sekunder (Pro). Denne route har `maxDuration` sat, men ved timeout-problemer:
1. Opgradér til Vercel Pro for længere function duration
2. Prøv igen efter et par sekunder (klienten har retry-logik)
