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
  // Hourly ingest: last 2 hours, limit 50 articles (more frequent, smaller batches)
  const sinceHours = 2;
  const limit = 50;
  const cmd = `npm run ingest:rage -- --since=${sinceHours} --limit=${limit}`;

  requestLogger.info('Starting hourly article ingestion via Vercel cron', { sinceHours, limit });

  // Use promisified exec for better error handling
  return new Promise<NextResponse>((resolve) => {
    exec(cmd, { cwd: root, env: process.env, timeout: 1000 * 60 * 5 }, async (err, stdout, stderr) => {
      if (!err) {
        invalidatePromptsCache();
        requestLogger.info('Hourly ingest completed successfully');
        
        let newCount = 0;
        if (stdout) {
          requestLogger.debug('Ingest stdout', { stdout: stdout.substring(0, 500) });
          // Extract metrics from output if available
          try {
            const metricsMatch = stdout.match(/newArticles[:\s]+(\d+)/i);
            newCount = metricsMatch ? parseInt(metricsMatch[1]) : 0;
            if (newCount > 0) {
              requestLogger.info('New articles ingested', { count: newCount });
            }
          } catch {}
        }
        
        resolve(NextResponse.json(
          createSuccessResponse({
            message: 'Hourly ingest completed successfully',
            timestamp: new Date().toISOString(),
            sinceHours,
            limit,
            newArticles: newCount,
          }, { requestId }),
          { status: 200 }
        ));
      } else {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        requestLogger.error('Hourly ingest failed', errorObj, { stderr });
        resolve(NextResponse.json(
          createErrorResponse('Ingest failed', {
            statusCode: 500,
            errorCode: ErrorCode.INTERNAL_ERROR,
            requestId,
            details: stderr || String(err),
          }),
          { status: 500 }
        ));
      }
    });
  });
}

