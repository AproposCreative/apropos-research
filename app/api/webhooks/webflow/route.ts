import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/config/env';
import { logger } from '@/lib/logger';
import {
  autoOptimizeArticleByItemId,
  isArticleCollectionWebhookEvent,
  isArticleWebhookOptimizeEnabled,
} from '@/lib/webflow/article-image-auto-optimize';
import { verifyWebflowWebhookSignature } from '@/lib/webflow/verify-webhook-signature';

export const runtime = 'nodejs';
export const maxDuration = 300;

const HANDLED_TRIGGERS = new Set(['collection_item_published', 'collection_item_created']);

type WebflowItem = {
  id?: string;
  collectionId?: string;
};

type WebflowWebhookBody = {
  triggerType?: string;
  payload?: WebflowItem & {
    // collection_item_published sender items som array; øvrige events sender
    // item-felterne direkte på payload.
    items?: WebflowItem[];
  };
};

/** Saml alle item-referencer fra både array- og enkelt-payload-formaterne. */
function extractItems(body: WebflowWebhookBody): WebflowItem[] {
  const out: WebflowItem[] = [];
  const arr = body.payload?.items;
  if (Array.isArray(arr)) {
    for (const it of arr) {
      if (it && typeof it.id === 'string' && it.id.trim()) out.push(it);
    }
  }
  const single = body.payload?.id;
  if (typeof single === 'string' && single.trim() && !out.some((x) => x.id === single)) {
    out.push({ id: single.trim(), collectionId: body.payload?.collectionId });
  }
  return out;
}

function verifyRequest(req: NextRequest, rawBody: string): boolean {
  const clientSecret = process.env.WEBFLOW_WEBHOOK_CLIENT_SECRET?.trim();
  const timestamp = req.headers.get('x-webflow-timestamp') || '';
  const signature = req.headers.get('x-webflow-signature') || '';

  if (clientSecret && timestamp && signature) {
    return verifyWebflowWebhookSignature({
      body: rawBody,
      timestamp,
      signature,
      secret: clientSecret,
    });
  }

  const urlSecret = req.nextUrl.searchParams.get('secret')?.trim();
  const headerSecret = req.headers.get('x-webflow-webhook-secret')?.trim();
  const expected = process.env.WEBFLOW_WEBHOOK_SECRET?.trim();
  if (!expected) return false;
  return urlSecret === expected || headerSecret === expected;
}

/**
 * Webflow CMS → auto-optimering af thumb/Mobile Image + brødtekst-billeder.
 *
 * Opret webhook i Webflow (API anbefales for signatur):
 *   POST https://api.webflow.com/v2/sites/{siteId}/webhooks
 *   triggerType: collection_item_published (evt. collection_item_created)
 *   url: https://{host}/api/webhooks/webflow?secret=...
 *
 * Env: WEBFLOW_WEBHOOK_CLIENT_SECRET (signeret) eller WEBFLOW_WEBHOOK_SECRET (query/header).
 * WEBFLOW_ARTICLE_WEBHOOK_OPTIMIZE=0 slår webhook-flow fra (publish fra app virker stadig hvis auto er på).
 */
export async function POST(req: NextRequest) {
  if (!isArticleWebhookOptimizeEnabled()) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'Webhook-optimering er slået fra' });
  }

  const rawBody = await req.text();
  if (!verifyRequest(req, rawBody)) {
    return NextResponse.json({ ok: false, error: 'Ugyldig webhook-autentificering' }, { status: 401 });
  }

  let body: WebflowWebhookBody;
  try {
    body = JSON.parse(rawBody) as WebflowWebhookBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'Ugyldig JSON' }, { status: 400 });
  }

  const triggerType = body.triggerType || '';
  if (!HANDLED_TRIGGERS.has(triggerType)) {
    return NextResponse.json({ ok: true, skipped: true, reason: `Ignorerer ${triggerType}` });
  }

  const items = extractItems(body).filter((it) =>
    isArticleCollectionWebhookEvent(triggerType, it.collectionId)
  );
  if (items.length === 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'Ingen artikel-items i payload' });
  }

  if (!env.WEBFLOW_API_TOKEN?.trim()) {
    return NextResponse.json({ ok: false, error: 'Webflow ikke konfigureret' }, { status: 503 });
  }

  const results = [];
  for (const it of items) {
    const itemId = it.id as string;
    try {
      const result = await autoOptimizeArticleByItemId(itemId, {
        source: `webhook:${triggerType}`,
        // Publicér optimerede billeder til live. Loop-sikkert: kun re-publish når
        // noget ændrede sig, og andet pass finder alt allerede optimeret.
        publishToLive: true,
      });
      results.push(result);
    } catch (e) {
      logger.error('[webhooks/webflow] optimize failed', e instanceof Error ? e : new Error(String(e)));
      results.push({ itemId, error: e instanceof Error ? e.message : 'Optimering fejlede' });
    }
  }

  return NextResponse.json({ ok: true, triggerType, count: results.length, results });
}
