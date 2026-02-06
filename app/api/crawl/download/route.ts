import { NextRequest, NextResponse } from 'next/server';
import { crawlStore } from '@/lib/crawler/store';
import { normalizeUrl, getOrigin } from '@/lib/crawler/url-utils';
import { logger, createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, ErrorCode } from '@/lib/api/types';

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const requestLogger = createRequestLogger(requestId);
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const crawlId = searchParams.get('crawlId');

    if (!crawlId) {
      requestLogger.warn('Missing crawlId');
      return NextResponse.json(
        createErrorResponse('crawlId is required', {
          statusCode: 400,
          errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
          requestId,
        }),
        { status: 400 }
      );
    }

    const session = crawlStore.getSession(crawlId);
    if (!session) {
      requestLogger.warn('Crawl session not found', { crawlId });
      return NextResponse.json(
        createErrorResponse('Crawl session not found', {
          statusCode: 404,
          errorCode: ErrorCode.NOT_FOUND,
          requestId,
        }),
        { status: 404 }
      );
    }

    const pages = crawlStore.getAllPages(crawlId);
    const completedPages = pages.filter(p => p.status === 'completed');

    if (completedPages.length === 0) {
      requestLogger.warn('No pages crawled yet', { crawlId });
      return NextResponse.json(
        createErrorResponse('No pages crawled yet', {
          statusCode: 400,
          errorCode: ErrorCode.VALIDATION,
          requestId,
        }),
        { status: 400 }
      );
    }

    // Generate filename
    const date = new Date().toISOString().split('T')[0];
    const domain = new URL(session.options.url).hostname.replace(/\./g, '-');
    const filename = `crawled-text-${domain}-${date}.txt`;

    // Build content
    const lines: string[] = [];

    // Index
    lines.push('=== CRAWL INDEX ===');
    lines.push(`Domain: ${session.options.url}`);
    lines.push(`Crawl Date: ${new Date(session.status.startTime).toISOString()}`);
    lines.push(`Total Pages Crawled: ${completedPages.length}`);
    lines.push(`Pages Found: ${session.status.pagesFound}`);
    lines.push('');
    lines.push('URLs (in crawl order):');
    completedPages.forEach((page, index) => {
      lines.push(`${String(index + 1).padStart(3, '0')}. ${page.finalUrl}`);
    });
    lines.push('');
    lines.push('='.repeat(80));
    lines.push('');

    // Page content
    completedPages.forEach((page, index) => {
      lines.push(`=== PAGE ${String(index + 1).padStart(3, '0')} ===`);
      lines.push(`URL: ${page.finalUrl}`);
      lines.push(`TITLE: ${page.title}`);
      if (page.metaDescription) {
        lines.push(`META: ${page.metaDescription}`);
      }
      lines.push(`TEXT:`);
      lines.push('');
      lines.push(page.text);
      lines.push('');
      lines.push('='.repeat(80));
      lines.push('');
    });

    const content = lines.join('\n');

    requestLogger.info('Generated download file', { filename, pageCount: completedPages.length });

    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    requestLogger.error('Download error', errorObj);
    return NextResponse.json(
      createErrorResponse(errorObj.message || 'Failed to generate download', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
