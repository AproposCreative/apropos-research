import { NextResponse } from 'next/server';
import {
  isArticleImageAutoOptimizeEnabled,
  isArticleWebhookOptimizeEnabled,
} from '@/lib/webflow/article-image-auto-optimize';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    enabled: isArticleImageAutoOptimizeEnabled(),
    webhook: isArticleWebhookOptimizeEnabled(),
  });
}
