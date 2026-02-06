import { NextRequest, NextResponse } from 'next/server';
import { crawlStore } from '@/lib/crawler/store';
import { normalizeUrl, getOrigin } from '@/lib/crawler/url-utils';

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

    const pages = crawlStore.getAllPages(crawlId);
    const completedPages = pages.filter(p => p.status === 'completed');

    if (completedPages.length === 0) {
      return NextResponse.json(
        { error: 'No pages crawled yet' },
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

    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error('Download error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate download' },
      { status: 500 }
    );
  }
}
