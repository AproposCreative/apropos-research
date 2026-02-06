import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { crawlStore } from '@/lib/crawler/store';
import { WebsiteCrawler } from '@/lib/crawler/crawler';
import { normalizeUrl, getOrigin, normalizeAndValidateUrl } from '@/lib/crawler/url-utils';
import { CrawlOptions } from '@/lib/crawler/types';
import { registerCrawler } from '@/lib/crawler/registry';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, options } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    // Normalize and validate URL (auto-adds https:// if missing)
    const { valid, normalized: normalizedInput } = normalizeAndValidateUrl(url);
    
    if (!valid) {
      return NextResponse.json(
        { error: 'Invalid URL format' },
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
    console.log('[Start] Creating session with crawlId:', crawlId);
    const session = crawlStore.createSession(crawlId, crawlOptions, origin);
    console.log('[Start] Session created:', session ? 'success' : 'failed');
    
    // Verify session was created
    const verifySession = crawlStore.getSession(crawlId);
    if (!verifySession) {
      console.error('[Start] Session verification failed - session not found after creation');
      return NextResponse.json(
        { error: 'Failed to create crawl session' },
        { status: 500 }
      );
    }
    console.log('[Start] Session verified, starting crawler');

    // Start crawler in background (don't await)
    const crawler = new WebsiteCrawler(crawlId, crawlOptions);
    registerCrawler(crawlId, crawler);
    
    // Start crawler immediately - it will handle session lookup with retry
    crawler.start().catch((error) => {
      console.error('[Start] Crawler error:', error);
      console.error('[Start] Error stack:', error.stack);
      const errorSession = crawlStore.getSession(crawlId);
      if (errorSession) {
        crawlStore.updateStatus(crawlId, {
          status: 'error',
          error: error.message || 'Unknown error occurred during crawling',
          endTime: Date.now(),
        });
      } else {
        console.error('[Start] Cannot update status - session not found');
      }
    });

    console.log('[Start] Returning crawlId:', crawlId);
    return NextResponse.json({ crawlId });
  } catch (error: any) {
    console.error('Start crawl error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to start crawl' },
      { status: 500 }
    );
  }
}
