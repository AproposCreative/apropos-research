import { NextRequest, NextResponse } from 'next/server';
import { publishArticleToWebflow, WebflowArticleFields } from '@/lib/webflow-service';

export async function POST(request: NextRequest) {
  try {
    const articleData: WebflowArticleFields = await request.json();
    
    // Validate required fields
    if (!articleData.title || !articleData.content) {
      return NextResponse.json(
        { error: 'Title and content are required' },
        { status: 400 }
      );
    }

    // Generate slug if not provided
    if (!articleData.slug) {
      articleData.slug = articleData.title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .trim();
    }

    // Set default values
    articleData.publishDate = articleData.publishDate || new Date().toISOString();
    articleData.status = articleData.status || 'draft';
    articleData.wordCount = articleData.content.split(' ').length;
    articleData.readTime = Math.ceil(articleData.wordCount / 200); // ~200 words per minute

    // Publish to Webflow
    const articleId = await publishArticleToWebflow(articleData);

    return NextResponse.json({
      success: true,
      articleId,
      message: 'Article published successfully to Webflow'
    });

  } catch (error) {
    console.error('Error publishing article:', error);
    return NextResponse.json(
      { 
        error: 'Failed to publish article',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
