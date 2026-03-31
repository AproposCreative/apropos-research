import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'node:child_process';
import { invalidatePromptsCache } from '../../../../lib/readPrompts';
import { logger, createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';

// Vercel cron job configuration
export const maxDuration = 300; // 5 minutes (requires Vercel Pro plan)
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const requestLogger = createRequestLogger(requestId);
  
  // Vercel automatically sends cron requests with x-vercel-signature header
  // For additional security, you can check for a CRON_SECRET env variable
  // Note: CRON_SECRET not in centralized config yet - add if needed
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  
  // Optional: verify CRON_SECRET if set (for manual testing)
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Allow if it's a Vercel cron request (has x-vercel-signature or in production)
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

  const root = process.cwd();
  const sinceHours = 26;
  const limit = 100;
  const rageCmd = `npm run ingest:rage -- --since=${sinceHours} --limit=${limit}`;
  const aproposCmd = `npm run ingest:apropos`;

  requestLogger.info('Starting daily article ingestion via Vercel cron', { sinceHours, limit });

  return new Promise<NextResponse>((resolve) => {
    exec(rageCmd, { cwd: root, env: process.env, timeout: 1000 * 60 * 4 }, async (err, stdout, stderr) => {
      let rageNewCount = 0;
      if (!err) {
        invalidatePromptsCache();
        requestLogger.info('RAGE ingest completed successfully');
        if (stdout) {
          try {
            const metricsMatch = stdout.match(/newArticles[:\s]+(\d+)/i);
            rageNewCount = metricsMatch ? parseInt(metricsMatch[1]) : 0;
          } catch {}
        }
      } else {
        requestLogger.error('RAGE ingest failed', err instanceof Error ? err : new Error(String(err)), { stderr });
      }

      exec(aproposCmd, { cwd: root, env: process.env, timeout: 1000 * 60 * 2 }, (aproposErr, aproposOut, aproposStderr) => {
        let aproposAdded = 0;
        if (!aproposErr) {
          requestLogger.info('Apropos style ingest completed successfully');
          if (aproposOut) {
            try {
              const m = aproposOut.match(/(\d+)\s*new style samples/i);
              aproposAdded = m ? parseInt(m[1]) : 0;
            } catch {}
          }
        } else {
          requestLogger.warn('Apropos style ingest failed (non-critical)', { error: String(aproposErr) });
        }

        const overallSuccess = !err;
        resolve(NextResponse.json(
          overallSuccess
            ? createSuccessResponse({
                message: 'Daily ingest completed successfully',
                timestamp: new Date().toISOString(),
                sinceHours,
                limit,
                newArticles: rageNewCount,
                aproposStyleSamples: aproposAdded,
              }, { requestId })
            : createErrorResponse('RAGE ingest failed', {
                statusCode: 500,
                errorCode: ErrorCode.INTERNAL_ERROR,
                requestId,
                details: stderr || String(err),
              }),
          { status: overallSuccess ? 200 : 500 }
        ));
      });
    });
  });
}

