import { NextResponse } from 'next/server';
import { readPrompts } from '@/lib/readPrompts';

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

export async function GET() {
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
    
    return NextResponse.json({ 
      counts: {
        ...counts,
        total
      }
    });
  } catch (error) {
    console.error('Error loading article counts:', error);
    return NextResponse.json({ 
      counts: { 
        total: 0
      },
      error: 'Failed to load counts' 
    }, { status: 500 });
  }
}
