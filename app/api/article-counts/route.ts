import { NextResponse } from 'next/server';
import { readPrompts } from '../../../lib/readPrompts';
import { getMediaSources } from '../../../lib/getMediaSources';

export async function GET() {
  try {
    const articles = await readPrompts();
    const mediaSources = getMediaSources();
    
    // Count articles per media source
    const counts: Record<string, number> = {};
    
    mediaSources.forEach(source => {
      try {
        const mediaUrl = new URL(source.baseUrl);
        const mediaDomain = mediaUrl.hostname;
        
        const count = articles.filter(article => {
          const articleSource = (article.source || '').toLowerCase();
          
          // Direct match by media ID first
          if (articleSource === source.id) {
            return true;
          }
          
          // Domain-based matching
          return articleSource.includes(mediaDomain);
        }).length;
        
        counts[source.id] = count;
      } catch (error) {
        console.error(`Error processing media source ${source.id}:`, error);
        counts[source.id] = 0;
      }
    });
    
    return NextResponse.json({ counts });
  } catch (error) {
    console.error('Error getting article counts:', error);
    return NextResponse.json({ error: 'Failed to get article counts' }, { status: 500 });
  }
}
