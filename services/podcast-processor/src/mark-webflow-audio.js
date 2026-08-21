/**
 * Best-effort: sæt Webflow Articles Switch `lydversion` = true efter podcast publish.
 * Kræver WEBFLOW_API_TOKEN + WEBFLOW_ARTICLES_COLLECTION_ID (valgfrit på Cloud Run).
 */

const FIELD = 'lydversion';

function locales() {
  return {
    dk: process.env.WEBFLOW_CMS_LOCALE_DK || '67dbf17ba540975b5b21c225',
    en: process.env.WEBFLOW_CMS_LOCALE_EN || '690ca0f6b0d13d8788354156',
  };
}

function runtime() {
  const token = process.env.WEBFLOW_API_TOKEN?.trim();
  const collectionId = process.env.WEBFLOW_ARTICLES_COLLECTION_ID?.trim();
  if (!token || !collectionId) return null;
  return { token, collectionId };
}

async function listMatch(runtime, slug, cmsLocaleId) {
  const pageSize = 100;
  let offset = 0;
  while (offset < 5000) {
    const qs = new URLSearchParams({
      limit: String(pageSize),
      offset: String(offset),
    });
    if (cmsLocaleId) qs.set('cmsLocaleId', cmsLocaleId);
    const res = await fetch(
      `https://api.webflow.com/v2/collections/${runtime.collectionId}/items?${qs}`,
      {
        headers: { Authorization: `Bearer ${runtime.token}`, 'Accept-Version': '1.0.0' },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const page = data.items || [];
    const match = page.find((it) => String(it.fieldData?.slug || '').trim() === slug);
    if (match?.id) return String(match.id);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return null;
}

async function findItemId(runtime, slug) {
  const loc = locales();
  return (
    (await listMatch(runtime, slug, loc.dk)) ||
    (await listMatch(runtime, slug, loc.en)) ||
    (await listMatch(runtime, slug))
  );
}

async function fetchLocale(runtime, itemId, cmsLocaleId) {
  const qs = new URLSearchParams({ cmsLocaleId });
  const res = await fetch(
    `https://api.webflow.com/v2/collections/${runtime.collectionId}/items/${itemId}?${qs}`,
    { headers: { Authorization: `Bearer ${runtime.token}`, 'Accept-Version': '1.0.0' } }
  );
  if (!res.ok) return null;
  return res.json();
}

async function patchLocale(runtime, itemId, cmsLocaleId, fieldData) {
  const res = await fetch(`https://api.webflow.com/v2/collections/${runtime.collectionId}/items`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${runtime.token}`,
      'Accept-Version': '1.0.0',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ items: [{ id: itemId, cmsLocaleId, fieldData }] }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.message || `Webflow patch ${res.status}`);
  }
}

async function publishLocale(runtime, itemId, cmsLocaleId) {
  const res = await fetch(
    `https://api.webflow.com/v2/collections/${runtime.collectionId}/items/publish`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${runtime.token}`,
        'Accept-Version': '1.0.0',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ items: [{ id: itemId, cmsLocaleIds: [cmsLocaleId] }] }),
    }
  );
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.message || `Webflow publish ${res.status}`);
  }
}

export async function markWebflowAudioVersion(slug) {
  const rt = runtime();
  if (!rt) {
    console.warn('[podcast] lydversion skipped — Webflow env mangler');
    return { ok: false, skipped: 'no-webflow-env' };
  }

  const itemId = await findItemId(rt, String(slug || '').trim());
  if (!itemId) {
    console.warn('[podcast] lydversion: ingen artikel', slug);
    return { ok: false, skipped: 'not-found' };
  }

  const loc = locales();
  const updated = [];
  for (const cmsLocaleId of [loc.dk, loc.en]) {
    try {
      const item = await fetchLocale(rt, itemId, cmsLocaleId);
      if (!item) continue;
      if (item.fieldData?.[FIELD] === true) {
        updated.push(cmsLocaleId);
        continue;
      }
      await patchLocale(rt, itemId, cmsLocaleId, { [FIELD]: true });
      const isLive = item.isDraft !== true && Boolean(item.lastPublished);
      if (isLive) await publishLocale(rt, itemId, cmsLocaleId);
      updated.push(cmsLocaleId);
    } catch (err) {
      console.warn('[podcast] lydversion patch failed', slug, cmsLocaleId, err);
    }
  }
  return { ok: updated.length > 0, itemId, updated };
}
