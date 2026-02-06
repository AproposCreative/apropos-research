import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { crawlStore } from '@/lib/crawler/store';
import { WebsiteCrawler } from '@/lib/crawler/crawler';
import { normalizeUrl, getOrigin, normalizeAndValidateUrl } from '@/lib/crawler/url-utils';
import { CrawlOptions } from '@/lib/crawler/types';
import { registerCrawler } from '@/lib/crawler/registry';
import { logger, createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const requestLogger = createRequestLogger(requestId);
  
  try {
    const body = await request.json();
    const { url, options } = body;

    if (!url || typeof url !== 'string') {
      requestLogger.warn('Missing URL in request');
      return NextResponse.json(
        createErrorResponse('URL is required', {
          statusCode: 400,
          errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
          requestId,
        }),
        { status: 400 }
      );
    }

    // Normalize and validate URL (auto-adds https:// if missing)
    const { valid, normalized: normalizedInput } = normalizeAndValidateUrl(url);
    
    if (!valid) {
      requestLogger.warn('Invalid URL format', { url });
      return NextResponse.json(
        createErrorResponse('Invalid URL format', {
          statusCode: 400,
          errorCode: ErrorCode.VALIDATION,
          requestId,
        }),
        { status: 400 }
      );
    }

    // Normalize URL further (remove tracking params, etc.)
    const normalizedUrl = normalizeUrl(normalizedInput, true);
    const origin = getOrigin(normalizedUrl);

    // Merge with defaults
    const crawlOptions: CrawlOptions = {
      url: normalizedUrl,
      respectRobotsTxt: options?.respectRobotsTxt ?? true,
      includeSubdomains: options?.includeSubdomains ?? false,
      includePdfs: options?.includePdfs ?? false,
      maxPages: options?.maxPages ?? 250,
      concurrency: options?.concurrency ?? 3,
      delayMs: options?.delayMs ?? 300,
      maxDepth: options?.maxDepth ?? 6,
      ignorePaths: options?.ignorePaths ?? [],
      stripTrackingParams: options?.stripTrackingParams ?? true,
    };

    // Create session
    const crawlId = uuidv4();
    requestLogger.info('Creating crawl session', { crawlId, url: normalizedUrl });
    const session = crawlStore.createSession(crawlId, crawlOptions, origin);
    
    if (!session) {
      requestLogger.error('Session creation failed', new Error('Failed to create crawl session'));
      return NextResponse.json(
        createErrorResponse('Failed to create crawl session', {
          statusCode: 500,
          errorCode: ErrorCode.INTERNAL_ERROR,
          requestId,
        }),
        { status: 500 }
      );
    }
    
    // Verify session was created
    const verifySession = crawlStore.getSession(crawlId);
    if (!verifySession) {
      requestLogger.error('Session verification failed - session not found after creation');
      return NextResponse.json(
        createErrorResponse('Failed to create crawl session', {
          statusCode: 500,
          errorCode: ErrorCode.INTERNAL_ERROR,
          requestId,
        }),
        { status: 500 }
      );
    }
    requestLogger.info('Session verified, starting crawler', { crawlId });

    // Start crawler in background (don't await)
    const crawler = new WebsiteCrawler(crawlId, crawlOptions);
    registerCrawler(crawlId, crawler);
    
    // Start crawler immediately - it will handle session lookup with retry
    crawler.start().catch((error) => {
      requestLogger.error('Crawler error', error instanceof Error ? error : new Error(String(error)), {
        crawlId,
      });
      const errorSession = crawlStore.getSession(crawlId);
      if (errorSession) {
        crawlStore.updateStatus(crawlId, {
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error occurred during crawling',
          endTime: Date.now(),
        });
      } else {
        requestLogger.error('Cannot update status - session not found', undefined, { crawlId });
      }
    });

    requestLogger.info('Crawl started successfully', { crawlId });
    return NextResponse.json(
      createSuccessResponse({ crawlId }, { requestId })
    );
  } catch (error: any) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    requestLogger.error('Start crawl error', errorObj);
    return NextResponse.json(
      createErrorResponse(errorObj.message || 'Failed to start crawl', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
