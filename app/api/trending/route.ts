import { NextRequest, NextResponse } from 'next/server';
import { getMediaSources } from '@/lib/getMediaSources';
import { analyzeTrends, generateTrendingTemplates, extractKeyPoints, inferCategoryFrom, type SimpleArticle } from '@/src/utils/trending';

export async function GET(request: NextRequest) {
  try {
    const mediaSources = await getMediaSources();
    const { searchParams } = new URL(request.url);
    const sourceFilter = (searchParams.get('source') || '').toLowerCase();
    
    // Get recent articles from all media sources
    const allArticles: SimpleArticle[] = [];
    
    for (const source of mediaSources) {
      if (sourceFilter && source.id.toLowerCase() !== sourceFilter && source.name.toLowerCase() !== sourceFilter) {
        continue;
      }
      try {
        // Read articles from the rage_articles.jsonl file for this source
        const fs = require('fs');
        const path = require('path');
        
        // Try to find articles for this source
        const rageArticlesPath = path.join(process.cwd(), 'data', 'rage_articles.jsonl');
        
        if (fs.existsSync(rageArticlesPath)) {
          const fileContent = fs.readFileSync(rageArticlesPath, 'utf8');
          const lines = fileContent.trim().split('\n').filter((line: string) => line.trim());
          const domain = (() => { try { return new URL(source.baseUrl).hostname; } catch { return ''; } })();
          let collected = 0;
          const limit = 80;
          for (let i = lines.length - 1; i >= 0 && collected < limit; i--) {
            const line = lines[i];
            try {
              const article = JSON.parse(line);
              const matches = article.source === source.id || article.source === source.name || (domain && typeof article.url === 'string' && article.url.includes(domain));
              if (!matches) continue;
              const date = article.published_at || article.date || undefined;
              const category = article.category || inferCategoryFrom((article.url || article.title || '').toString());
              const fullText = (article.body_text || article.content || '').toString();
              const content = fullText.slice(0, 200);
              allArticles.push({
                title: article.title,
                category,
                tags: Array.isArray(article.tags) ? article.tags : [],
                source: source.name,
                date,
                content,
                url: article.url,
                keyPoints: extractKeyPoints(fullText, article.title, content)
              });
              collected++;
            } catch {}
          }
        }
      } catch (error) {
        console.error(`Error reading articles for ${source.name}:`, error);
      }
    }

    // Analyze trends
    const trends = analyzeTrends(allArticles);
    
    // Generate trending templates
    const trendingTemplates = generateTrendingTemplates(trends, allArticles);

    return NextResponse.json({
      success: true,
      trends,
      trendingTemplates,
      totalArticles: allArticles.length
    }, { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=1800' } });

  } catch (error) {
    console.error('Error analyzing trends:', error);
    return NextResponse.json(
      { error: 'Failed to analyze trends' },
      { status: 500, headers: { 'Cache-Control': 's-maxage=60' } as any }
    );
  }
}

// local helpers removed in favor of shared utils (imported at top)
/* function analyzeTrends(articles: any[]) {
  // Group by category
  const categoryCounts: { [key: string]: number } = {};
  const tagCounts: { [key: string]: number } = {};
  const titleWords: { [key: string]: number } = {};
  const topicCounts: { [key: string]: number } = {};
  
  articles.forEach(article => {
    // Count categories
    if (article.category) {
      categoryCounts[article.category] = (categoryCounts[article.category] || 0) + 1;
    }
    
    // Count tags
    if (article.tags && Array.isArray(article.tags)) {
      article.tags.forEach((tag: string) => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    }
    
    // Extract meaningful words from titles
    const words = article.title
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3 && !isStopWord(word));
    
    words.forEach(word => {
      titleWords[word] = (titleWords[word] || 0) + 1;
    });

    // Analyze topics from titles
    const title = article.title.toLowerCase();
    
    // Gaming topics
    if (title.includes('game') || title.includes('gaming') || title.includes('xbox') || title.includes('playstation') || title.includes('nintendo')) {
      topicCounts['Gaming'] = (topicCounts['Gaming'] || 0) + 1;
    }
    
    // Tech topics
    if (title.includes('tech') || title.includes('ai') || title.includes('microsoft') || title.includes('apple') || title.includes('google')) {
      topicCounts['Tech'] = (topicCounts['Tech'] || 0) + 1;
    }
    
    // Entertainment topics
    if (title.includes('film') || title.includes('movie') || title.includes('serie') || title.includes('tv') || title.includes('netflix')) {
      topicCounts['Entertainment'] = (topicCounts['Entertainment'] || 0) + 1;
    }
    
    // Music topics
    if (title.includes('music') || title.includes('concert') || title.includes('album') || title.includes('artist')) {
      topicCounts['Music'] = (topicCounts['Music'] || 0) + 1;
    }
    
    // News/Current events
    if (title.includes('news') || title.includes('breaking') || title.includes('update') || title.includes('latest')) {
      topicCounts['News'] = (topicCounts['News'] || 0) + 1;
    }
  });

  // Find top trends
  const topCategories = Object.entries(categoryCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([category, count]) => ({ category, count }));

  const topTags = Object.entries(tagCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));

  const topWords = Object.entries(titleWords)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 15)
    .map(([word, count]) => ({ word, count }));

  const topTopics = Object.entries(topicCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([topic, count]) => ({ topic, count }));

  return {
    topCategories,
    topTags,
    topWords,
    topTopics,
    totalArticles: articles.length
  };
} */

/* function generateTrendingTemplates(trends: any, articles: any[]) {
  const templates = [];
  
  // Generate templates based on top topics
  trends.topTopics.forEach(({ topic, count }) => {
    // Get specific articles for this topic
    const topicArticles = getArticlesForTopic(articles, topic);
    
    templates.push({
      id: `trending-${topic.toLowerCase()}`,
      name: `Trending ${topic}`,
      category: topic,
      description: `Baseret på ${count} artikler om ${topic.toLowerCase()}`,
      content: `Skriv en ${topic.toLowerCase()}-artikel baseret på de aktuelle trends.\n\nFokus på:\n- Hvad der trending inden for ${topic.toLowerCase()}\n- Din unikke vinkel på emnet\n- Apropos' karakteristiske tone\n\nInspiration fra ${count} artikler fra andre medier.`,
      tags: [topic, 'Trending', 'Aktuel'],
      trending: true,
      articleCount: count,
      articles: topicArticles
    });
  });

  // Generate templates based on top categories
  trends.topCategories.forEach(({ category, count }) => {
    const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
    const categoryArticles = getArticlesForCategory(articles, category);
    
    templates.push({
      id: `trending-cat-${category.toLowerCase()}`,
      name: `Trending ${categoryName}`,
      category: categoryName,
      description: `Baseret på ${count} artikler fra andre medier`,
      content: `Skriv en ${categoryName.toLowerCase()}-artikel baseret på de aktuelle trends.\n\nFokus på:\n- Hvad der trending lige nu\n- Din unikke vinkel på emnet\n- Apropos' karakteristiske tone\n\nInspiration fra ${count} artikler fra andre medier.`,
      tags: [categoryName, 'Trending', 'Anmeldelse'],
      trending: true,
      articleCount: count,
      articles: categoryArticles
    });
  });

  // Generate templates based on popular tags
  const popularTags = trends.topTags.slice(0, 3);
  if (popularTags.length > 0) {
    const tagNames = popularTags.map(({ tag }) => tag).join(', ');
    const totalCount = popularTags.reduce((sum, { count }) => sum + count, 0);
    const tagArticles = getArticlesForTags(articles, popularTags.map(({ tag }) => tag));
    
    templates.push({
      id: 'trending-tags',
      name: `Trending: ${tagNames}`,
      category: 'Trending',
      description: `Baseret på ${totalCount} artikler med populære tags`,
      content: `Skriv en artikel om de trending emner: ${tagNames}.\n\nFokus på:\n- Hvorfor disse emner er populære lige nu\n- Din analyse af trenden\n- Apropos' unikke perspektiv\n\nBaseret på ${totalCount} artikler fra andre medier.`,
      tags: popularTags.map(({ tag }) => tag),
      trending: true,
      articleCount: totalCount,
      articles: tagArticles
    });
  }

  // Generate a general trending template
  templates.push({
    id: 'trending-general',
    name: 'Trending Nu',
    category: 'Trending',
    description: `Baseret på ${trends.totalArticles} artikler fra alle medier`,
    content: `Skriv om hvad der trending lige nu baseret på andre medier.\n\nFokus på:\n- Hvilke emner der dominerer\n- Din unikke vinkel\n- Apropos' karakteristiske tone\n\nInspireret af ${trends.totalArticles} artikler fra andre medier.`,
    tags: ['Trending', 'Populær', 'Aktuel'],
    trending: true,
    articleCount: trends.totalArticles,
    articles: articles.slice(0, 10) // Show first 10 articles as examples
  });

  return templates;
} */

/* function getArticlesForTopic(articles: any[], topic: string): any[] {
  const topicKeywords = {
    'Gaming': ['game', 'gaming', 'xbox', 'playstation', 'nintendo', 'pc', 'console'],
    'Tech': ['tech', 'ai', 'microsoft', 'apple', 'google', 'smartphone', 'computer'],
    'Entertainment': ['film', 'movie', 'serie', 'tv', 'netflix', 'streaming', 'cinema'],
    'Music': ['music', 'concert', 'album', 'artist', 'song', 'band', 'festival'],
    'News': ['news', 'breaking', 'update', 'latest', 'report', 'story']
  };

  const keywords = topicKeywords[topic as keyof typeof topicKeywords] || [];
  
  return articles.filter(article => {
    const title = article.title.toLowerCase();
    return keywords.some(keyword => title.includes(keyword));
  }).slice(0, 8); // Limit to 8 articles
} */

/* function getArticlesForCategory(articles: any[], category: string): any[] {
  return articles.filter(article => 
    article.category && article.category.toLowerCase() === category.toLowerCase()
  ).slice(0, 8);
} */

/* function getArticlesForTags(articles: any[], tags: string[]): any[] {
  return articles.filter(article => 
    article.tags && article.tags.some((tag: string) => 
      tags.some(searchTag => tag.toLowerCase().includes(searchTag.toLowerCase()))
    )
  ).slice(0, 8);
} */

/* function isStopWord(word: string): boolean {
  const stopWords = [
    'og', 'eller', 'men', 'for', 'med', 'på', 'til', 'af', 'i', 'det', 'den', 'der', 'som', 'at', 'en', 'et',
    'har', 'kan', 'vil', 'skal', 'må', 'bør', 'kunne', 'ville', 'skulle', 'måtte', 'burde',
    'the', 'and', 'or', 'but', 'for', 'with', 'on', 'to', 'of', 'in', 'that', 'which', 'as', 'a', 'an',
    'have', 'can', 'will', 'shall', 'may', 'should', 'could', 'would', 'might'
  ];
  return stopWords.includes(word.toLowerCase());
} */

/* function inferCategoryFrom(input: string): string {
  const s = input.toLowerCase();
  if (s.includes('/musik') || s.includes('music') || s.includes('koncert')) return 'Musik';
  if (s.includes('/film') || s.includes('movie') || s.includes('cinema')) return 'Film';
  if (s.includes('serie') || s.includes('/tv') || s.includes('netflix') || s.includes('hbo') || s.includes('disney')) return 'Serier & Film';
  if (s.includes('gaming') || s.includes('playstation') || s.includes('xbox') || s.includes('nintendo')) return 'Gaming';
  if (s.includes('tech') || s.includes('teknologi') || s.includes('ai')) return 'Tech';
  if (s.includes('kultur')) return 'Kultur';
  return '';
} */

/* function extractKeyPoints(text: string, title?: string, lead?: string): string[] {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  // Prefer bullet separators, else fall back to sentence split
  const bullets = t.split(/•|\u2022|\n-\s|\n\*\s/).map(s=>s.trim());
  const raw = (bullets.filter(Boolean).length > 1 ? bullets : t.split(/(?<=[\.!\?])\s+/)).map(s=>s.trim());
  // Filter out trivial/short fragments like "7." or "okt."
  const filtered = raw
    .filter(Boolean)
    .filter(s => /[A-Za-zÆØÅæøå]/.test(s))
    // remove bylines, metadata
    .filter(s => !/^\d{1,2}\.?\s*(jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec)\.?/i.test(s))
    .filter(s => !/\b(Af\s+\w|FOTO:|Læsetid|@)\b/i.test(s))
    .filter(s => s.replace(/[^A-Za-zÆØÅæøå0-9]/g,'').length >= 25)
    .map(s => s.length > 200 ? s.slice(0, 197) + '…' : s);
  // De-duplicate near-identical starts
  const unique: string[] = [];
  for (const s of filtered) {
    const key = s.slice(0, 50).toLowerCase();
    const normTitle = (title||'').toLowerCase().trim();
    const normLead = (lead||'').toLowerCase().trim();
    const isDupOfTitle = normTitle && (normTitle.startsWith(key) || key.startsWith(normTitle.slice(0,50)) || s.toLowerCase().includes(normTitle.slice(0,60)));
    const isDupOfLead = normLead && (normLead.startsWith(key) || key.startsWith(normLead.slice(0,50)) || s.toLowerCase().includes(normLead.slice(0,80)));
    if (isDupOfTitle || isDupOfLead) continue;
    if (!unique.some(u => u.slice(0, 50).toLowerCase() === key)) unique.push(s);
    if (unique.length >= 3) break;
  }
  return unique;
} */
