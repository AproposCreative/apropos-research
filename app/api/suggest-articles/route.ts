import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

interface ArticleSuggestion {
  title: string;
  source: string;
  category: string;
  url: string;
  publishedAt: string;
  tags: string[];
  excerpt: string;
  trend?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { category, tags, limit = 10 } = await request.json();

    // Load all articles from prompts/rage_prompts.jsonl
    const promptsPath = path.join(process.cwd(), 'prompts', 'rage_prompts.jsonl');
    
    if (!fs.existsSync(promptsPath)) {
      return NextResponse.json({ suggestions: [] });
    }

    const fileContent = fs.readFileSync(promptsPath, 'utf8');
    const lines = fileContent.trim().split('\n');
    
    const articles: any[] = [];
    for (const line of lines) {
      try {
        const article = JSON.parse(line);
        articles.push(article);
      } catch (e) {
        // Skip invalid lines
      }
    }

    // Filter recent articles (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentArticles = articles.filter(article => {
      const publishedDate = new Date(article.published_at || article.date || 0);
      return publishedDate > sevenDaysAgo;
    });

    // Filter by category if provided
    let filteredArticles = recentArticles;
    if (category) {
      filteredArticles = recentArticles.filter(article => {
        const articleCategory = article.category?.toLowerCase() || '';
        return articleCategory.includes(category.toLowerCase()) ||
               category.toLowerCase().includes(articleCategory);
      });
    }

    // Score articles based on relevance
    const scoredArticles = filteredArticles.map(article => {
      let score = 0;
      
      // Title relevance
      if (tags && tags.length > 0) {
        const titleLower = (article.title || '').toLowerCase();
        tags.forEach((tag: string) => {
          if (titleLower.includes(tag.toLowerCase())) {
            score += 10;
          }
        });
      }
      
      // Source diversity bonus
      if (!['aproposmagazine.com'].includes(article.source?.toLowerCase())) {
        score += 5;
      }
      
      // Recency bonus
      const publishedDate = new Date(article.published_at || article.date || 0);
      const daysSincePublished = Math.floor((Date.now() - publishedDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSincePublished === 0) score += 15; // Today
      else if (daysSincePublished === 1) score += 10; // Yesterday
      else if (daysSincePublished <= 3) score += 5; // Last 3 days
      
      return {
        ...article,
        score
      };
    });

    // Sort by score and take top results
    const topArticles = scoredArticles
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // Detect trends
    const trends = detectTrends(topArticles);

    // Format suggestions
    const suggestions: ArticleSuggestion[] = topArticles.map(article => ({
      title: article.title,
      source: article.source || 'Unknown',
      category: article.category || 'Generel',
      url: article.url || '',
      publishedAt: article.published_at || article.date || '',
      tags: article.tags || [],
      excerpt: article.summary?.substring(0, 150) + '...' || '',
      trend: trends.find(t => 
        article.title.toLowerCase().includes(t.keyword.toLowerCase())
      )?.keyword
    }));

    return NextResponse.json({
      suggestions,
      trends,
      count: suggestions.length
    });

  } catch (error) {
    console.error('Error suggesting articles:', error);
    return NextResponse.json(
      { error: 'Failed to suggest articles' },
      { status: 500 }
    );
  }
}

function detectTrends(articles: any[]): { keyword: string; count: number; category: string }[] {
  const keywords = new Map<string, { count: number; category: string }>();
  
  // Common words to exclude
  const excludeWords = new Set([
    'i', 'og', 'er', 'det', 'til', 'med', 'på', 'en', 'af', 'den', 'for', 'som', 'et', 'har', 'om',
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did'
  ]);
  
  articles.forEach(article => {
    const words = (article.title || '').toLowerCase().split(/\s+/);
    words.forEach((word: string) => {
      // Clean word
      word = word.replace(/[^a-zæøå0-9]/g, '');
      
      // Skip if too short, excluded, or not interesting
      if (word.length < 4 || excludeWords.has(word) || /^\d+$/.test(word)) {
        return;
      }
      
      const existing = keywords.get(word) || { count: 0, category: article.category || 'Generel' };
      keywords.set(word, {
        count: existing.count + 1,
        category: existing.category
      });
    });
  });
  
  // Convert to array and sort by count
  const trends = Array.from(keywords.entries())
    .filter(([_, data]) => data.count >= 2) // Must appear at least twice
    .map(([keyword, data]) => ({
      keyword,
      count: data.count,
      category: data.category
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5); // Top 5 trends
  
  return trends;
}

