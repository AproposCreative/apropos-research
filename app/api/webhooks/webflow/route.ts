import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/config/env';
import { logger } from '@/lib/logger';
import {
  autoOptimizeArticleByItemId,
  isArticleCollectionWebhookEvent,
  isArticleImageAutoOptimizeEnabled,
  isArticleWebhookOptimizeEnabled,
} from '@/lib/webflow/article-image-auto-optimize';
import { enqueueArticleTranslation } from '@/lib/webflow/enqueue-article-translation';
import { enqueueSeoEngineJob } from '@/lib/seo-engine/enqueue';
import { resolveAutoSeoEngineEnabled } from '@/lib/seo-engine/settings';
import { cmsSeoEmptiness } from '@/lib/seo-engine/cms-contract';
import {
  resolveWebhookSeoHttpStatus,
  shouldAttemptSeoEnqueue,
  shouldEnqueueTranslation,
  shouldRunImageOptimize,
} from '@/lib/seo-engine/webhook-decisions';
import {
  fetchArticleItemByLocale,
  isArticleAutoTranslateEnabledAsync,
  resolveWebflowLocaleIds,
} from '@/lib/webflow/locale-items';
import { verifyWebflowWebhookSignature } from '@/lib/webflow/verify-webhook-signature';

export const runtime = 'nodejs';
export const maxDuration = 300;

const HANDLED_TRIGGERS = new Set(['collection_item_published', 'collection_item_created']);

type WebflowItem = {
  id?: string;
  collectionId?: string;
  cmsLocaleId?: string | null;
};

type WebflowWebhookBody = {
  triggerType?: string;
  payload?: WebflowItem & {
    cmsLocaleId?: string | null;
    items?: WebflowItem[];
  };
};

function extractItems(body: WebflowWebhookBody): WebflowItem[] {
  const out: WebflowItem[] = [];
  const rootLocale = body.payload?.cmsLocaleId;
  const arr = body.payload?.items;
  if (Array.isArray(arr)) {
    for (const it of arr) {
      if (it && typeof it.id === 'string' && it.id.trim()) {
        out.push({
          id: it.id,
          collectionId: it.collectionId ?? body.payload?.collectionId,
          cmsLocaleId: it.cmsLocaleId ?? rootLocale,
        });
      }
    }
  }
  const single = body.payload?.id;
  if (typeof single === 'string' && single.trim() && !out.some((x) => x.id === single)) {
    out.push({
      id: single.trim(),
      collectionId: body.payload?.collectionId,
      cmsLocaleId: rootLocale,
    });
  }
  return out;
}

function isPrimaryLocalePublish(cmsLocaleId?: string | null): boolean {
  const { dk, en } = resolveWebflowLocaleIds();
  if (!cmsLocaleId) return true;
  if (cmsLocaleId === en) return false;
  if (cmsLocaleId === dk) return true;
  return true;
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
 * Webflow CMS webhook — image-opt, EN-translate enqueue, and auto-SEO are independent flags.
 * WEBFLOW_ARTICLE_WEBHOOK_OPTIMIZE only gates image optimization, not SEO/translation.
 */
export async function POST(req: NextRequest) {
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

  const imageOptOn =
    isArticleWebhookOptimizeEnabled() && isArticleImageAutoOptimizeEnabled();
  const autoSeoOn = await resolveAutoSeoEngineEnabled();
  const autoTranslateOn = await isArticleAutoTranslateEnabledAsync();

  const results = [];
  const translationQueued: string[] = [];
  const seoEngineQueued: string[] = [];
  const seoEngineErrors: Array<{ itemId: string; error: string }> = [];

  for (const it of items) {
    const itemId = it.id as string;
    const flags = {
      imageOptOn,
      autoSeoOn,
      autoTranslateOn,
      isPrimaryLocale: isPrimaryLocalePublish(it.cmsLocaleId),
      triggerType,
    };

    if (shouldRunImageOptimize(flags)) {
      try {
        const result = await autoOptimizeArticleByItemId(itemId, {
          source: `webhook:${triggerType}`,
          publishToLive: true,
        });
        results.push(result);
      } catch (e) {
        logger.error('[webhooks/webflow] optimize failed', e instanceof Error ? e : new Error(String(e)));
        results.push({ itemId, error: e instanceof Error ? e.message : 'Optimering fejlede' });
      }
    } else {
      results.push({ itemId, skipped: true, reason: 'image_opt_off' });
    }

    if (shouldEnqueueTranslation(flags)) {
      enqueueArticleTranslation(itemId, `webhook:${triggerType}`);
      translationQueued.push(itemId);
    }

    // Auto-SEO: await durable job write — never OpenAI inline. DK-only. Independent of image-opt.
    if (shouldAttemptSeoEnqueue(flags)) {
      try {
        const { dk } = resolveWebflowLocaleIds();
        const item = await fetchArticleItemByLocale(itemId, dk);
        const empty = cmsSeoEmptiness(item.fieldData);
        if (empty.anyEmpty) {
          const cmsLastUpdated = item.lastUpdated || item.lastPublished || 'unknown';
          const enq = await enqueueSeoEngineJob({
            itemId,
            cmsLastUpdated,
            source: 'webhook',
          });
          seoEngineQueued.push(enq.jobId);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logger.warn('[webhooks/webflow] seo-engine enqueue failed', { itemId, message });
        seoEngineErrors.push({ itemId, error: message });
      }
    }
  }

  const http = resolveWebhookSeoHttpStatus({
    autoSeoOn,
    seoEngineErrors,
    seoEngineQueued,
  });
  return NextResponse.json(
    {
      ok: http.ok,
      triggerType,
      count: results.length,
      results,
      translationQueued,
      seoEngineQueued,
      seoEngineErrors: seoEngineErrors.length ? seoEngineErrors : undefined,
      needsRetry: http.needsRetry || undefined,
    },
    { status: http.status }
  );
}
