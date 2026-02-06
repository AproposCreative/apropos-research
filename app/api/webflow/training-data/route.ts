import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/config/env';
import { logger, createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/api/request-utils';
import { createErrorResponse, createSuccessResponse, ErrorCode } from '@/lib/api/types';
import { getWebflowConfig } from '@/lib/webflow-config';

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  const requestLogger = createRequestLogger(requestId);
  
  try {
    const cfg = getWebflowConfig();
    const token = cfg.apiToken || env.WEBFLOW_API_TOKEN;
    const siteId = cfg.siteId || env.WEBFLOW_SITE_ID;
    const articlesCollectionId = cfg.articlesCollectionId || env.WEBFLOW_ARTICLES_COLLECTION_ID;
    
    if (!token || !siteId || !articlesCollectionId) {
      requestLogger.warn('Missing Webflow configuration');
      return NextResponse.json(
        createErrorResponse('Missing Webflow configuration', {
          statusCode: 400,
          errorCode: ErrorCode.MISSING_REQUIRED_FIELD,
          requestId,
        }),
        { status: 400 }
      );
    }

    requestLogger.info('Fetching all articles for training data');
    
    // Fetch all articles with all fields
    const articlesResponse = await fetch(
      `https://api.webflow.com/v2/sites/${siteId}/collections/${articlesCollectionId}/items?limit=100`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept-Version': '1.0.0',
        },
      }
    );

    if (!articlesResponse.ok) {
      const errorData = await articlesResponse.json();
      requestLogger.error('Failed to fetch articles', new Error('Failed to fetch articles from Webflow'), { errorData });
      return NextResponse.json(
        createErrorResponse('Failed to fetch articles from Webflow', {
          statusCode: 500,
          errorCode: ErrorCode.EXTERNAL_API,
          requestId,
        }),
        { status: 500 }
      );
    }

    const articlesData = await articlesResponse.json();
    const articles = articlesData.items || [];
    
    requestLogger.info('Fetched articles for training', { count: articles.length });

    // Analyze field usage patterns
    const fieldAnalysis = analyzeFieldUsage(articles);
    
    // Create training examples
    const trainingExamples = createTrainingExamples(articles, fieldAnalysis);

    return NextResponse.json(
      createSuccessResponse({
        totalArticles: articles.length,
        fieldAnalysis,
        trainingExamples: trainingExamples.slice(0, 10), // Return first 10 as examples
        allArticles: articles.map(article => ({
          id: article.id,
          name: article.fieldData?.name,
          slug: article.fieldData?.slug,
          fieldData: article.fieldData,
          createdOn: article.createdOn,
          lastUpdated: article.lastUpdated
        }))
      }, { requestId })
    );

  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    requestLogger.error('Error fetching training data', errorObj);
    return NextResponse.json(
      createErrorResponse('Internal server error', {
        statusCode: 500,
        errorCode: ErrorCode.INTERNAL_ERROR,
        requestId,
      }),
      { status: 500 }
    );
  }
}

function analyzeFieldUsage(articles: any[]) {
  const fieldStats: Record<string, {
    used: number;
    total: number;
    percentage: number;
    examples: string[];
    types: Set<string>;
  }> = {};

  // Initialize field tracking
  const allFields = new Set<string>();
  articles.forEach(article => {
    if (article.fieldData) {
      Object.keys(article.fieldData).forEach(field => allFields.add(field));
    }
  });

  // Analyze each field
  allFields.forEach(field => {
    let used = 0;
    const examples: string[] = [];
    const types = new Set<string>();

    articles.forEach(article => {
      const value = article.fieldData?.[field];
      if (value !== undefined && value !== null && value !== '') {
        used++;
        
        // Collect examples (max 5)
        if (examples.length < 5 && typeof value === 'string' && value.length > 0) {
          examples.push(value.substring(0, 100)); // Truncate long examples
        }
        
        // Track data types
        types.add(typeof value);
      }
    });

    fieldStats[field] = {
      used,
      total: articles.length,
      percentage: Math.round((used / articles.length) * 100),
      examples,
      types
    };
  });

  return fieldStats;
}

function createTrainingExamples(articles: any[], fieldAnalysis: any) {
  return articles
    .filter(article => article.fieldData?.name && article.fieldData?.content)
    .map(article => {
      const fieldData = article.fieldData;
      
      return {
        input: {
          title: fieldData.name,
          content: fieldData.content,
          author: fieldData.author,
          section: fieldData.section,
          topic: fieldData.topic
        },
        expectedOutput: {
          // Map to our standardized field names
          name: fieldData.name,
          seoTitle: fieldData['seo-title'],
          seoDescription: fieldData['meta-description'],
          subtitle: fieldData.subtitle,
          intro: fieldData.intro,
          content: fieldData.content,
          rating: fieldData.stjerne,
          streaming_service: fieldData['watch-now-link'],
          author: fieldData.author,
          illustration: fieldData.thumb,
          section: fieldData.section,
          topic: fieldData.topic,
          topic_two: fieldData['topic-two'],
          minutes_to_read: fieldData['minutes-to-read'],
          featured: fieldData.featured,
          presseakkreditering: fieldData.presseakkreditering,
          festival: fieldData.festival,
          start_dato: fieldData['start-dato'],
          slut_dato: fieldData['slut-dato'],
          location: fieldData.location
        },
        fieldUsage: Object.keys(fieldData).reduce((acc, key) => {
          acc[key] = fieldData[key] !== undefined && fieldData[key] !== null && fieldData[key] !== '';
          return acc;
        }, {} as Record<string, boolean>)
      };
    });
}
