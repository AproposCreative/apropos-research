import { NextRequest, NextResponse } from 'next/server';
import { invalidatePromptsCache } from '../../../../lib/readPrompts';
import { logger, createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { runIngestToFirestore } from '@/lib/trending/ingest-runner';

// Vercel cron job configuration
export const maxDuration = 300; // 5 minutes (requires Vercel Pro plan)
export const runtime = 'nodejs';

/**
 * Daglig artikel-ingest cron.
 *
 * Tidligere implementering brugte `exec("npm run ingest:rage")` og skrev til
 * `data/rage_articles.jsonl` — det virker ikke på Vercel hvor filsystemet er
 * read-only. Den nye implementering kalder `runIngestToFirestore` direkte
 * (samme proces) og persisterer til Firestore.
 */
export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const requestLogger = createRequestLogger(requestId);

  // Auth: enten Vercel cron-signatur eller Bearer CRON_SECRET (manuel test).
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    const isVercelCron = request.headers.get('x-vercel-signature') || process.env.VERCEL === '1';
    if (!isVercelCron) {
      requestLogger.warn('Unauthorized cron request');
      return NextResponse.json(
        createErrorResponse('Unauthorized', {
          statusCode: 401,
          errorCode: ErrorCode.AUTHENTICATION,
          requestId,
        }),
        { status: 401 }
      );
    }
  }

  // Tillad query-overrides til manuel testing.
  const sp = request.nextUrl.searchParams;
  const sinceHrs = Number(sp.get('sinceHrs') || 26);
  const limit = Number(sp.get('limit') || 100);
  const sourceFilter = sp.get('source') || undefined;
  const pruneOlderThanDays = Number(sp.get('pruneDays') || 21);

  requestLogger.info('Starting daily article ingestion (Firestore)', {
    sinceHrs,
    limit,
    sourceFilter,
    pruneOlderThanDays,
  });

  try {
    const metrics = await runIngestToFirestore({
      sinceHrs,
      limit,
      source: sourceFilter,
      pruneOlderThanDays,
    });

    // Invalider lokal prompts-cache (no-op på serverless, men stadig relevant
    // for dev-server hvor filer faktisk eksisterer).
    invalidatePromptsCache();

    requestLogger.info('Daily ingest completed', { ...metrics });

    return NextResponse.json(
      createSuccessResponse({
        ok: true,
        metrics,
        message: `Ingested ${metrics.added} new + ${metrics.updated} updated articles`,
      })
    );
  } catch (err) {
    const errorObj = err instanceof Error ? err : new Error(String(err));
    requestLogger.error('Daily ingest failed', errorObj);
    logger.error('[cron/daily-ingest] failed', errorObj);
    return NextResponse.json(
      createErrorResponse(`Daily ingest failed: ${errorObj.message}`, {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
