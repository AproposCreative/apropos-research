import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const { token, siteId, articlesCollectionId } = resolveConfig();
    
    if (!token || !siteId || !articlesCollectionId) {
      return NextResponse.json({ error: 'Missing Webflow configuration' }, { status: 400 });
    }

    console.log('🔍 Fetching all articles for training data...');
    
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
      console.error('Failed to fetch articles:', errorData);
      return NextResponse.json({ error: 'Failed to fetch articles from Webflow' }, { status: 500 });
    }

    const articlesData = await articlesResponse.json();
    const articles = articlesData.items || [];
    
    console.log(`✓ Fetched ${articles.length} articles for training`);

    // Analyze field usage patterns
    const fieldAnalysis = analyzeFieldUsage(articles);
    
    // Create training examples
    const trainingExamples = createTrainingExamples(articles, fieldAnalysis);

    return NextResponse.json({
      success: true,
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
    });

  } catch (error) {
    console.error('Error fetching training data:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function resolveConfig() {
  // Try environment variables first, then fallback to config file
  let token = process.env.WEBFLOW_TOKEN;
  let siteId = process.env.WEBFLOW_SITE_ID;
  let articlesCollectionId = process.env.WEBFLOW_ARTICLES_COLLECTION_ID;
  
  // Fallback to config file if env vars not set
  if (!token || !siteId || !articlesCollectionId) {
    try {
      const fs = require('fs');
      const path = require('path');
      const configPath = path.join(process.cwd(), 'data', 'webflow-config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        token = token || config.apiToken;
        siteId = siteId || config.siteId;
        articlesCollectionId = articlesCollectionId || config.articlesCollectionId;
      }
    } catch (error) {
      console.error('Error reading webflow config:', error);
    }
  }
  
  return { token, siteId, articlesCollectionId };
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
