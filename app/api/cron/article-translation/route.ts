import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { requireCronSecret } from '@/lib/seo-engine/secret-guards';
import { recoverDueArticleTranslations } from '@/lib/webflow/enqueue-article-translation';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!requireCronSecret(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, considered: await recoverDueArticleTranslations() });
  } catch {
    logger.warn('[article-translation] could not read recovery queue');
    return NextResponse.json({ ok: false, error: 'Translation recovery unavailable' }, { status: 503 });
  }
}
