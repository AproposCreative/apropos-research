# Newsletter → Google Analytics (GA4) opsætning

Den her vejledning forbinder Resend (mail-leverandør) med Google Analytics 4
så du kan se nyhedsbrevs-åbninger og klik direkte i dit GA-dashboard sammen
med din øvrige web-trafik.

Pipeline:

```
Resend (mail udsendelse)
  │  email.opened / email.clicked / email.delivered / email.bounced / ...
  ▼
POST  https://<dit-domæne>/api/webhooks/resend  (Svix-signeret)
  │  validerer signatur, mapper til GA4 events
  ▼
Google Analytics 4  (Measurement Protocol)
  │  email_open, email_click, email_delivered, ...
  ▼
GA4 Reports + Realtime DebugView
```

UTM-parametre på alle artikellinks i nyhedsbrevet (`utm_source=newsletter`,
`utm_medium=email`, `utm_campaign=weekly-2026-w15`, `utm_content=<slug>`)
sørger for at klik også registreres som `session_source=newsletter` på selve
magasinets sider, så hele funnel'en hænger sammen.

---

## 1. Oprettelse i Google Analytics

1. Sørg for at du har en GA4-property på magasinets website (Stream).
2. **Admin → Data Streams → vælg din stream → Measurement Protocol API secrets → Create**.
3. Giv hemmeligheden et navn (`apropos-newsletter`) og kopiér `secret_value`.
4. Noter dit Measurement ID (formatet `G-XXXXXXX`).

(Valgfrit men anbefalet) Marker disse events som "key events" i GA4:

- `email_open`
- `email_click`
- `email_delivered`
- `email_bounced`
- `email_complained`
- `email_unsubscribed`

---

## 2. Sæt environment variables på Vercel

I Vercel projektets **Settings → Environment Variables** sæt:

| Variabel | Værdi | Scope |
|---|---|---|
| `GA4_MEASUREMENT_ID` | `G-XXXXXXX` (dit Measurement ID) | Production + Preview |
| `GA4_MEASUREMENT_PROTOCOL_SECRET` | hemmeligheden fra GA4 | Production + Preview |
| `RESEND_WEBHOOK_SECRET` | sættes i næste skridt fra Resend | Production + Preview |
| `RESEND_API_KEY` | findes allerede hvis nyhedsbrev sender | Production + Preview |

Hvis `NEXT_PUBLIC_GA_MEASUREMENT_ID` allerede findes, falder server-side
tracking automatisk tilbage til den hvis `GA4_MEASUREMENT_ID` mangler — men
sæt gerne den dedikerede variabel for klarhed.

Redeploy projektet når variablerne er sat.

---

## 3. Opret webhook i Resend

1. Log ind på [resend.com/webhooks](https://resend.com/webhooks).
2. **Add Webhook** → URL: `https://<dit-domæne>/api/webhooks/resend`.
3. Vælg events:
   - `email.delivered`
   - `email.opened` ✱ påkrævet
   - `email.clicked` ✱ påkrævet
   - `email.bounced`
   - `email.complained`
   - `email.unsubscribed`
4. Kopiér **Signing secret** (`whsec_...`) og sæt den som `RESEND_WEBHOOK_SECRET` i Vercel.
5. Redeploy.

---

## 4. Verificér end-to-end

### a) Selvtjek (kræver login):

```
GET  https://<dit-domæne>/api/newsletter/integration-status
GET  https://<dit-domæne>/api/newsletter/ga4-status
```

`integration-status` viser hvilke env-vars der mangler.
`ga4-status` sender en debug-event til GA4's `/debug/mp/collect` og returnerer
eventuelle valideringsfejl direkte fra Google.

### b) Send en test-mail:

Brug "Send test" i nyhedsbrevs-UI (eller tidligere flows). Åbn mailen i en
inbox og klik et link.

### c) Bekræft i GA4:

- Åbn [GA4 Realtime](https://analytics.google.com/analytics/web/#/p_/realtime).
- Du bør se events: `email_delivered`, `email_open`, `email_click`.
- Eventerne har parametre som `email_id`, `subject`, `link` (ved klik) og
  `resend_tag_*` (kampagne, uge, etc.).

---

## 5. Anbefalet GA4-rapport

Lav en custom Exploration i GA4:

- **Dimensions**: `Event name`, `Custom: link`, `Custom: resend_tag_campaign`
- **Metrics**: `Event count`, `Total users`
- **Filters**: `Event name` matches `email_*`

Det giver dig en simpel funnel: leverede → åbnede → klikkede → fra hvilken
artikel/link.

For per-artikel-attribution på selve magasinet: brug GA4's standard rapporter
med `session_source = newsletter` og `session_campaign = weekly-2026-w15`
(UTM'erne fra mailen).

---

## Fejlsøgning

| Symptom | Løsning |
|---|---|
| `503 Webhook ikke konfigureret` | `RESEND_WEBHOOK_SECRET` mangler — sæt den og redeploy. |
| `400 Ugyldig signatur` | Webhook secret matcher ikke Resend dashboard — opdatér i Vercel. |
| Ingen events i GA4 | Kør `/api/newsletter/ga4-status` og tjek `validationMessages`. |
| Events vises men uden `link` på klik | Tjek at Resend webhook har `email.clicked` slået til. |
| Events havner kun i Realtime, ikke i standard reports | GA4 har 24-48 timers forsinkelse på standardrapporter — Realtime/DebugView er sandheden i nuet. |
