/**
 * Opretter Webflow webhook(s) til auto billede-optimering ved CMS publish/oprettelse.
 *
 * Kræver: WEBFLOW_API_TOKEN, WEBFLOW_SITE_ID, NEXT_PUBLIC_BASE_URL (eller WEBHOOK_BASE_URL)
 * Valgfri: WEBFLOW_WEBHOOK_CLIENT_SECRET (signeret webhook — anbefales ved API-oprettelse)
 *
 * Kør: npx tsx scripts/setup-webflow-article-webhook.ts
 */

const token = process.env.WEBFLOW_API_TOKEN?.trim();
const siteId = process.env.WEBFLOW_SITE_ID?.trim();
const base =
  process.env.WEBHOOK_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');

if (!token || !siteId) {
  console.error('Mangler WEBFLOW_API_TOKEN og WEBFLOW_SITE_ID');
  process.exit(1);
}
if (!base) {
  console.error('Mangler NEXT_PUBLIC_BASE_URL eller WEBHOOK_BASE_URL');
  process.exit(1);
}

const secret = process.env.WEBFLOW_WEBHOOK_SECRET?.trim();
const webhookUrl = `${base.replace(/\/$/, '')}/api/webhooks/webflow${secret ? `?secret=${encodeURIComponent(secret)}` : ''}`;

const triggers = ['collection_item_published', 'collection_item_created'] as const;

async function createWebhook(triggerType: string) {
  const res = await fetch(`https://api.webflow.com/v2/sites/${siteId}/webhooks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept-Version': '1.0.0',
    },
    body: JSON.stringify({
      triggerType,
      url: webhookUrl,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${triggerType}: ${(data as { message?: string }).message || res.status}`);
  }
  return data;
}

(async () => {
  console.log('Webhook URL:', webhookUrl);
  for (const t of triggers) {
    try {
      const data = await createWebhook(t);
      console.log(`OK ${t}:`, (data as { id?: string }).id || data);
    } catch (e) {
      console.error(String(e instanceof Error ? e.message : e));
    }
  }
  console.log('\nTip: Sæt WEBFLOW_WEBHOOK_CLIENT_SECRET hvis Webflow sender x-webflow-signature.');
})();
