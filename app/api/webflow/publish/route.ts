import { NextRequest, NextResponse } from 'next/server';
import { publishArticleToWebflow, WebflowArticleFields } from '@/lib/webflow-service';

export async function POST(request: NextRequest) {
  try {
    const articleData: WebflowArticleFields = await request.json();
    
    // Debug: Log what we receive
    console.log('📤 Received article data for Webflow publish:', {
      title: articleData.title,
      slug: articleData.slug,
      subtitle: articleData.subtitle,
      content: articleData.content?.substring(0, 100) + '...',
      excerpt: articleData.excerpt,
      category: articleData.category,
      tags: articleData.tags,
      author: articleData.author,
      rating: articleData.rating,
      seoTitle: articleData.seoTitle,
      seoDescription: articleData.seoDescription,
      readTime: articleData.readTime,
      wordCount: articleData.wordCount,
      featured: articleData.featured,
      trending: articleData.trending,
      featuredImage: articleData.featuredImage ? 'Present' : 'Missing'
    });
    
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

    // Check if this is an update to existing article
    const isUpdate = articleData.webflowId && articleData.webflowId !== '';
    console.log('🔄 Publish mode:', isUpdate ? 'UPDATE existing article' : 'CREATE new article', 
                isUpdate ? `ID: ${articleData.webflowId}` : '');

    // Publish to Webflow
    const articleId = await publishArticleToWebflow(articleData);

    return NextResponse.json({
      success: true,
      articleId,
      message: 'Article published successfully to Webflow'
    });

  } catch (error) {
    console.error('Error publishing article:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { 
        error: 'Failed to publish article',
        details: message
      },
      { status: 500 }
    );
  }
}
