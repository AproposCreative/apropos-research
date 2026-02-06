import { NextRequest, NextResponse } from 'next/server';
import { crawlStore } from '@/lib/crawler/store';
import { getCrawler, unregisterCrawler } from '@/lib/crawler/registry';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { crawlId } = body;

    if (!crawlId) {
      return NextResponse.json(
        { error: 'crawlId is required' },
        { status: 400 }
      );
    }

    const crawler = getCrawler(crawlId);
    if (crawler) {
      await crawler.stop();
      unregisterCrawler(crawlId);
    } else {
      // Still update status even if crawler not found
      crawlStore.updateStatus(crawlId, {
        status: 'stopped',
        endTime: Date.now(),
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Stop error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to stop crawl' },
      { status: 500 }
    );
  }
}
