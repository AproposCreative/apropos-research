# Publish til Instagram & Facebook – opsætning og test

Design editoren kan poste kort direkte til Instagram (feed og stories) og optionelt til Facebook.

## Flow

1. Vælg artikel og rediger kort samt opslagstekst. Automatisk gemning bevarer teksten, 1:1/9:16, farvetema, tekststørrelser og metadatafelter i en privat, kildeversionsbundet kladde.
2. Klik **Udgiv**. Bekræftelsen viser Instagram og et særskilt Facebook-valg. Facebook følger kun med, hvis brugeren har valgt det; nye kladder starter uden Facebook. Stories bruger kun Instagram.
3. Efter personlig bekræftelse eksporteres den viste version som JPEG. Klienten gemmer forsøgets UUID før afsendelse og uploader til `instagram-publish/{uid}-{sha256}.jpg`. Serveren kontrollerer den faktiske JPEG og digest via den eksisterende Firebase-adgang.
4. En Firestore-transaktion reserverer én operation for godkendt design, tekst, artikel, format og Instagram-konto. Kanalvalget bindes til operationen. Samtidige klik, andre upload-tokens eller en ny enhed kan ikke skabe endnu et opslag af samme version.
5. Før hvert Meta-skrivekald gemmes afsendelsesintentionen. Kvitteringer, opslag-ID'er og faktiske permalink-readbacks gemmes separat for Instagram, Facebook og Facebook-kommentaren. Et uklart svar sendes aldrig automatisk igen.
6. **Kontrollér status** foretager læsninger. Ved kendt Instagram-container kan `PUBLISHED` bekræfte en tabt kvittering. Et manglende permalink eller en Facebook-fejl ændrer ikke et allerede bekræftet Instagram-opslag til fejlet.

For Story er **Download Story** og **Kopiér artikellink** samlet. Den indtegnede Læs nu-knap er grafik; brug Instagrams linkmærkat for et klikbart artikellink.

## Gemning og konfliktkontrol

- Autentificeret `GET /api/design-editor/draft?articleId=...&sourceHash=...` læser den personlige kladde; `PUT` kræver `expectedRevision` og hele kladden.
- Kladder er bundet til verificeret bruger-ID, artikel-ID og hash af CMS-kildens titel/undertitel. En ændret CMS-kilde får sin egen version. Oprindelig artikeltekst ændres ikke.
- Browseren skriver løbende en lokal journal og sender efter 600 ms til serveren. Lukning og skjult side forsøger en keepalive-gemning. Offline arbejde kan ikke ses på en anden enhed, før status er **Gemt** på serveren.
- En nyere serverversion giver HTTP 409. Brugeren vælger **Brug gemt version** eller **Gem mine ændringer**; appen overskriver ikke lydløst den anden enhed.

## API og kvitteringer

- Alle endpoints kræver verificeret redaktionel adgang. Ingen klientleveret brugeridentitet accepteres.
- `POST /api/instagram/publish` kræver `{ requestId, articleId, imageUrl, imageSha256, card, caption, articleUrl, isStory, channels: { instagram: true, facebook: boolean } }`.
- `GET /api/instagram/publish` viser `configured` og `facebookConfigured`. `?articleId=...` giver ejerens historik. `?requestId=...` giver samme forsøgs kvittering og kan læse bekræftede opslag/link tilbage.
- Firestore: `socialEditorDrafts`, `socialEditorOwners`, `socialPublishOperations`, `socialPublishRequests`. Ingen ændring af Storage-regler, credentials eller udbyderbudgetter er nødvendig.
- Et tvetydigt Facebook-svar uden post-ID kan ikke sikkert udledes af lignende opslag. Bevar det som ubekræftet og inspicér kanalen; opret ikke en ny afsendelse for at reparere kvitteringen. Tilsvarende kræver et stoppet forløb før publicering konkret afklaring frem for automatisk genstart.
- Meta kan undlade at levere et permalink, især til Stories. Vis bekræftet status og gemt ID; opfind ikke et link.

## Miljøvariabler

I `.env.local` (og i Vercel under Production/Preview):

| Variabel | Påkrævet | Beskrivelse |
|----------|----------|-------------|
| `INSTAGRAM_ACCOUNT_ID` | Ja | Instagram Business/Creator Account ID (tal). |
| `INSTAGRAM_ACCESS_TOKEN` | Ja | Page access token med nødvendige permissions (se nedenfor). |
| `FACEBOOK_PAGE_ID` | Nej | Facebook-side ID for personligt valgt publicering. Find det via Graph API Explorer: `me?fields=id,name` med din Page valgt. |

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

### Session invalideret (adgangskodeskift)

Hvis diagnose viser **Type: PAGE**, **ingen udløbsdato**, men **Gyldig: nej** og fejl som *«session has been invalidated because the user changed their password»*:

- Det er **ikke** daglig token-udløb — Meta har tilbagekaldt alle tokens knyttet til den Facebook-bruger.
- Løsning: log ind på Facebook, generér **nyt** bruger-token i Graph API Explorer, konvertér på **Indstillinger → Social**, opdater `INSTAGRAM_ACCESS_TOKEN` i Vercel, og **redeploy**.
- Efter opdatering skal **Kør diagnose** vise **Gyldig: ja** og Instagram API OK.

### Sådan genererer du et permanent token (anbefalet)

#### Via appen (nemmest)

1. Gå til **Settings → Social** i appen
2. Følg trinnene og indsæt et kort-livet token fra Graph API Explorer
3. Klik **Konvertér til permanent token**
4. Klik **Gem dette token som Instagram Access Token** (eller indsæt i feltet «Instagram Access Token» og **Gem**)
5. Token gemmes i Firestore (prod) / `data/instagram-config.json` (lokal) og bruges automatisk — Vercel env er kun fallback
6. **Kør diagnose** — Gyldig skal være **ja**

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

- **GET** `/api/instagram/publish` returnerer `{ "configured": true, "facebookConfigured": true/false }` ved redaktionelt login.
- **Settings** → "Test Facebook" knappen verificerer Facebook Page-forbindelse.

## Verifikation

Kør de isolerede automatiske tests og `node scripts/verify-social-delivery-ui.mjs` først. UI-fixturen bruger rigtig React, canvas, JPEG/PNG, kladdejournal og klientflow, med lokale erstatninger for CMS, Firebase og Meta. Den foretager ingen rigtige sociale opslag eller betalte AI-kald.

En reel publicering kræver fortsat personlig bekræftelse i produktet. Kontrollér derefter kvittering og de faktiske kanallinks. Produktionsdeployment eller en fixture-kvittering er ikke dokumentation for et live opslag.

Ved timeout: Hent samme forsøgs status. Route-grænsen er fortsat 120 sekunder. Hvis et afsendelses-intent står uden endelig kvittering, blokkerer den gemte operation en ny afsendelse af samme version. Klienten forsøger ikke automatisk igen.

Se [releasekontrol 30. oktober 2026](./editorial/SOCIAL-DELIVERY-2026-10-30.md).
