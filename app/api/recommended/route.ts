import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { filterRelevantArticles, detectArticleType, calculateRelevanceScore, type Article } from '@/src/utils/relevance-filter';
import { logger, createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';

interface RecommendedArticle {
  title: string;
  source: string;
  category: string;
  type: 'concert' | 'tv-series' | 'film' | 'game' | 'culture';
  url: string;
  date?: string;
  excerpt?: string;
  relevanceScore?: number;
}

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const requestLogger = createRequestLogger(requestId);
  
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all'; // concert, tv-series, film, game, or all
    
    // Load all articles from data/rage_articles.jsonl
    const articlesPath = path.join(process.cwd(), 'data', 'rage_articles.jsonl');
    
    if (!fs.existsSync(articlesPath)) {
      return NextResponse.json({ recommendations: [] });
    }

    const fileContent = fs.readFileSync(articlesPath, 'utf8');
    const lines = fileContent.trim().split('\n').filter((line: string) => line.trim());
    
    const articles: any[] = [];
    for (const line of lines) {
      try {
        const article = JSON.parse(line);
        articles.push(article);
      } catch (e) {
        // Skip invalid lines
      }
    }

    // Filter recent articles (last 7 days - focus on very recent articles only)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    // Sort articles by date (newest first) to prioritize recent ones
    const sortedArticles = articles.sort((a, b) => {
      const dateA = new Date(a.published_at || a.date || 0);
      const dateB = new Date(b.published_at || b.date || 0);
      return dateB.getTime() - dateA.getTime();
    });
    
    const recentArticles = sortedArticles.filter((article) => {
      const publishedDate = new Date(article.published_at || article.date || 0);
      
      // Skip articles without dates - we want dated articles only
      // This prevents old articles without dates from showing up
      if (publishedDate.getTime() === 0) {
        return false;
      }
      
      // Only include articles from last 7 days
      return publishedDate > sevenDaysAgo;
    });

    // Use AI-based relevance filtering for Apropos Magazine content
    // Lower threshold (10) to ensure we show articles - prioritize but don't filter too strictly
    const relevantArticles = filterRelevantArticles(recentArticles, 10); // Minimum relevance score of 10
    
    // If we have very few relevant articles, include more less-relevant ones
    if (relevantArticles.length < 10 && recentArticles.length > 0) {
      // Sort by relevance score and take top articles even if score is lower
      const sortedByRelevance = recentArticles
        .map((article: any) => ({ 
          ...article, 
          relevanceScore: calculateRelevanceScore(article) 
        }))
        .filter((a: any) => (a.relevanceScore || 0) > 0)
        .sort((a: any, b: any) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
        .slice(0, 50);
      
      // Use sorted articles if we have very few highly relevant ones
      if (sortedByRelevance.length > relevantArticles.length) {
        const topArticles = sortedByRelevance.slice(0, 50);
        
        const recommendations: RecommendedArticle[] = topArticles.map((article: any) => {
          const detectedType = detectArticleType(article);
          return {
            title: article.title,
            source: article.source || 'Unknown',
            category: article.category || 'Generel',
            type: detectedType === 'other' ? 'film' : detectedType,
            url: article.url || '',
            date: article.published_at || article.date,
            excerpt: (article.body_text || article.content || '').toString().substring(0, 200) + '...',
            relevanceScore: article.relevanceScore
          };
        });
        
        return NextResponse.json({
          recommendations,
          count: recommendations.length
        }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } });
      }
    }
    
    // Filter by requested type if specified
    let filteredArticles = relevantArticles;
    if (type !== 'all') {
      filteredArticles = relevantArticles.filter(article => {
        const detectedType = detectArticleType(article);
        return detectedType === type;
      });
    }
    
    // Take top 50 most relevant articles
    const topArticles = filteredArticles.slice(0, 50);

    // Format recommendations
    const recommendations: RecommendedArticle[] = topArticles.map(article => {
      const detectedType = detectArticleType(article);
      return {
        title: article.title,
        source: article.source || 'Unknown',
        category: article.category || 'Generel',
        type: detectedType === 'other' ? 'film' : detectedType,
        url: article.url || '',
        date: article.published_at || article.date,
        excerpt: (article.body_text || article.content || '').toString().substring(0, 200) + '...',
        relevanceScore: (article as any).relevanceScore
      };
    });

    return NextResponse.json({
      recommendations,
      count: recommendations.length
    }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } });

  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    requestLogger.error('Error fetching recommendations', errorObj);
    return NextResponse.json(
      createErrorResponse('Failed to fetch recommendations', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}

