import { NextRequest, NextResponse } from 'next/server';
import { crawlStore } from '@/lib/crawler/store';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const crawlId = searchParams.get('crawlId');
    const url = searchParams.get('url');

    if (!crawlId || !url) {
      return NextResponse.json(
        { error: 'crawlId and url are required' },
        { status: 400 }
      );
    }

    const session = crawlStore.getSession(crawlId);
    if (!session) {
      return NextResponse.json(
        { error: 'Crawl session not found' },
        { status: 404 }
      );
    }

    const pageData = crawlStore.getPage(crawlId, url);
    if (!pageData) {
      return NextResponse.json(
        { error: 'Page not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(pageData);
  } catch (error: any) {
    console.error('Page error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get page' },
      { status: 500 }
    );
  }
}
