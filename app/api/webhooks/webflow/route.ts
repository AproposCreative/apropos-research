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

type WebflowWebhookBody = {
  triggerType?: string;
  payload?: {
    id?: string;
    siteId?: string;
    collectionId?: string;
    lastPublished?: string;
    lastUpdated?: string;
    isDraft?: boolean;
    fieldData?: Record<string, unknown>;
  };
};

function extractItemId(body: WebflowWebhookBody): string | null {
  const id = body.payload?.id;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
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

  const collectionId = body.payload?.collectionId;
  if (!isArticleCollectionWebhookEvent(triggerType, collectionId)) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'Ikke artikel-collection' });
  }

  const itemId = extractItemId(body);
  if (!itemId) {
    return NextResponse.json({ ok: false, error: 'Mangler item id i payload' }, { status: 400 });
  }

  if (!env.WEBFLOW_API_TOKEN?.trim()) {
    return NextResponse.json({ ok: false, error: 'Webflow ikke konfigureret' }, { status: 503 });
  }

  try {
    const result = await autoOptimizeArticleByItemId(itemId, {
      source: `webhook:${triggerType}`,
    });
    return NextResponse.json({ ok: true, triggerType, ...result });
  } catch (e) {
    logger.error('[webhooks/webflow] optimize failed', e instanceof Error ? e : new Error(String(e)));
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Optimering fejlede' },
      { status: 500 }
    );
  }
}
