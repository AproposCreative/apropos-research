# 📖 Cron Schedule Forklaring

## Hvad er en Cron Schedule?

En cron schedule er en måde at fortælle systemet hvornår en opgave skal køre. Det bruges til at køre jobs automatisk på bestemte tidspunkter.

## Cron Expression Format

Format: `minut time dag måned ugedag`

### Eksempler:

#### `"0 * * * *"` (Hver time)
- **Minut:** `0` (på slaget)
- **Time:** `*` (alle timer)
- **Dag:** `*` (alle dage)
- **Måned:** `*` (alle måneder)
- **Ugedag:** `*` (alle ugedage)
- **Betyder:** Hver time på slaget (00:00, 01:00, 02:00, osv.)
- **Kører:** 24 gange per dag

#### `"0 2 * * *"` (1 gang per dag)
- **Minut:** `0` (på slaget)
- **Time:** `2` (kl. 02:00)
- **Dag:** `*` (alle dage)
- **Måned:** `*` (alle måneder)
- **Ugedag:** `*` (alle ugedage)
- **Betyder:** 1 gang per dag kl. 02:00 UTC
- **Kører:** 1 gang per dag

## Vercel Hobby Plan Limits

Ifølge [Vercel dokumentation](https://vercel.com/docs/cron-jobs/usage-and-pricing):

- **Max 2 cron jobs** per account
- **Max 1 cron job per dag** (hver cron job må kun køre 1 gang per dag)
- **Unlimited** på Pro plan

## Vores Problem

**Før:**
```json
"schedule": "0 * * * *"  // Hver time (24 gange per dag)
```
- ❌ Bruder Vercel Hobby plan limit (max 1 per dag)
- ❌ Vercel afviser deployment

**Efter:**
```json
"schedule": "0 2 * * *"  // 1 gang per dag kl. 02:00 UTC
```
- ✅ Overholder Vercel Hobby plan limit (1 per dag)
- ✅ Vercel accepterer deployment

## Andre Cron Eksempler

- `"0 0 * * *"` - Hver dag kl. 00:00 (midnat)
- `"0 12 * * *"` - Hver dag kl. 12:00 (middag)
- `"0 0 * * 0"` - Hver søndag kl. 00:00
- `"*/30 * * * *"` - Hver 30. minut (hver time)
- `"0 */6 * * *"` - Hver 6. time (00:00, 06:00, 12:00, 18:00)

## Vores Cron Job

Vi har én cron job der:
- Kører **1 gang per dag kl. 02:00 UTC**
- Henter nye artikler fra medier
- Opdaterer databasen

Dette matcher også vores GitHub Actions workflow der kører kl. 02:00 UTC.

---

**Konklusion:** Cron schedule er nu fixet til at køre 1 gang per dag, hvilket overholder Vercel Hobby plan limits.

