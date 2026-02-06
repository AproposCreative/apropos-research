import { NextRequest, NextResponse } from 'next/server';
import { crawlStore } from '@/lib/crawler/store';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const crawlId = searchParams.get('crawlId');

    if (!crawlId) {
      return NextResponse.json(
        { error: 'crawlId is required' },
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

    return NextResponse.json(session.status);
  } catch (error: any) {
    console.error('Status error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get status' },
      { status: 500 }
    );
  }
}
