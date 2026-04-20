import { NextRequest, NextResponse } from 'next/server';
import {
  analyzeTrends,
  generateTrendingTemplates,
  extractKeyPoints,
  inferCategoryFrom,
  type SimpleArticle,
} from '@/src/utils/trending';
import { filterRelevantArticles, calculateRelevanceScore } from '@/src/utils/relevance-filter';
import { createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, ErrorCode } from '@/lib/api/types';
import { getRecentTrendingArticles } from '@/lib/trending/firestore-store';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const requestLogger = createRequestLogger(requestId);

  try {
    const { searchParams } = new URL(request.url);
    const sourceFilter = (searchParams.get('source') || '').toLowerCase().trim() || undefined;
    const days = Number(searchParams.get('days') || 7);
    const limit = Number(searchParams.get('limit') || 200);

    // Hent fra Firestore (erstatter den gamle data/rage_articles.jsonl-pipeline,
    // som ikke virkede serverless).
    const records = await getRecentTrendingArticles({
      days,
      limit,
      source: sourceFilter,
    });

    // Transformer til SimpleArticle-format som resten af siden forventer.
    const allArticles: SimpleArticle[] = records
      .filter((r) => r.title && r.body_text && r.body_text.length >= 50)
      .map((r) => {
        const fullText = r.body_text;
        const content = fullText.slice(0, 200);
        const category = r.category || inferCategoryFrom((r.url || r.title || '').toString());
        return {
          title: r.title,
          category,
          tags: Array.isArray(r.tags) ? r.tags : [],
          source: r.sourceName || r.source,
          date: r.date || r.publishedAt?.toISOString() || undefined,
          content: fullText,
          url: r.url,
          keyPoints: extractKeyPoints(fullText, r.title, content),
        };
      });

    // Relevans-filter (samme tærskel som tidligere).
    const relevantArticles = filterRelevantArticles(allArticles, 10);

    // Hvis vi har for få relevante, fald tilbage til scored ikke-irrelevante.
    if (relevantArticles.length < 10 && allArticles.length > 0) {
      const sortedByRelevance = allArticles
        .map((article) => ({ ...article, relevanceScore: calculateRelevanceScore(article) }))
        .filter((article) => article.relevanceScore && article.relevanceScore > 0)
        .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
        .slice(0, 50);

      if (sortedByRelevance.length > relevantArticles.length) {
        return NextResponse.json(
          {
            success: true,
            trends: analyzeTrends(sortedByRelevance),
            trendingTemplates: generateTrendingTemplates(analyzeTrends(sortedByRelevance), sortedByRelevance),
            articles: sortedByRelevance,
            allArticles: sortedByRelevance,
            totalArticles: sortedByRelevance.length,
          },
          { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } }
        );
      }
    }

    const trends = analyzeTrends(relevantArticles);
    const trendingTemplates = generateTrendingTemplates(trends, trends.relevantArticles || relevantArticles);

    return NextResponse.json(
      {
        success: true,
        trends,
        trendingTemplates,
        articles: relevantArticles,
        allArticles: relevantArticles,
        totalArticles: relevantArticles.length,
      },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } }
    );
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    requestLogger.error('Error analyzing trends', errorObj);
    return NextResponse.json(
      createErrorResponse('Failed to analyze trends', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500, headers: { 'Cache-Control': 's-maxage=60' } }
    );
  }
}
