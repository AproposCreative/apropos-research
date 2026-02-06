import { NextResponse } from 'next/server';
import { readPrompts } from '@/lib/readPrompts';
import { logger, createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';

// Helper to map source name to media ID
function mapSourceToId(source: string | undefined, url?: string): string | undefined {
  const normalized = (source || '').trim().toLowerCase();
  if (!normalized && url) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace('www.', '').toLowerCase();
      if (host.includes('berlingske')) return 'berlingske';
      if (host.includes('bt.dk')) return 'bt';
      if (host.includes('gaffa')) return 'gaffa';
      if (host.includes('soundvenue')) return 'soundvenue';
      if (host.includes('ign.com')) return 'ign-nordic';
      if (host.includes('ekkofilm')) return 'ekkofilm';
    } catch {}
  }
  if (!normalized) return undefined;
  if (normalized.includes('berlingske')) return 'berlingske';
  if (normalized === 'bt' || normalized.includes('bt.dk')) return 'bt';
  if (normalized.includes('gaffa')) return 'gaffa';
  if (normalized.includes('soundvenue')) return 'soundvenue';
  if (normalized.includes('ign')) return 'ign-nordic';
  if (normalized.includes('ekkofilm')) return 'ekkofilm';
  return undefined;
}

export async function GET(request: Request) {
  const requestId = getRequestId(request as any);
  const requestLogger = createRequestLogger(requestId);
  
  try {
    // Read articles from JSONL file (same source as /alle-medier)
    const articles = await readPrompts();
    
    // Count articles per media source
    const counts: Record<string, number> = {};
    let total = 0;
    
    articles.forEach(article => {
      const mediaId = mapSourceToId(article.source, article.url);
      if (mediaId) {
        counts[mediaId] = (counts[mediaId] || 0) + 1;
        total++;
      }
    });
    
    requestLogger.info('Article counts loaded', { total, sources: Object.keys(counts).length });
    
    return NextResponse.json(
      createSuccessResponse({
        counts: {
          ...counts,
          total
        }
      }, { requestId })
    );
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    requestLogger.error('Error loading article counts', errorObj);
    return NextResponse.json(
      createErrorResponse('Failed to load counts', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}
