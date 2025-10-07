import { NextRequest, NextResponse } from 'next/server';
import { WebflowCMS } from '@/lib/webflow-cms';

export async function POST(request: NextRequest) {
  try {
    const articleData = await request.json();

    if (!articleData.title || !articleData.content) {
      return NextResponse.json({ 
        error: 'Title and content are required' 
      }, { status: 400 });
    }

    const webflowCMS = new WebflowCMS();
    const result = await webflowCMS.publishArticle(articleData);

    if (!result.success) {
      return NextResponse.json({ 
        error: result.error || 'Failed to publish to Webflow' 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      itemId: result.itemId,
      message: 'Artikel publiseret til Webflow CMS'
    });

  } catch (error) {
    console.error('Publish to Webflow error:', error);
    return NextResponse.json(
      { error: 'Failed to publish article to Webflow' }, 
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { itemId, articleData } = await request.json();

    if (!itemId || !articleData) {
      return NextResponse.json({ 
        error: 'Item ID and article data are required' 
      }, { status: 400 });
    }

    const webflowCMS = new WebflowCMS();
    const result = await webflowCMS.updateArticle(itemId, articleData);

    if (!result.success) {
      return NextResponse.json({ 
        error: result.error || 'Failed to update Webflow article' 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      message: 'Artikel opdateret i Webflow CMS'
    });

  } catch (error) {
    console.error('Update Webflow article error:', error);
    return NextResponse.json(
      { error: 'Failed to update article in Webflow' }, 
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const webflowCMS = new WebflowCMS();
    const result = await webflowCMS.getArticles();

    if (!result.success) {
      return NextResponse.json({ 
        error: result.error || 'Failed to fetch articles from Webflow' 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      articles: result.articles
    });

  } catch (error) {
    console.error('Get Webflow articles error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch articles from Webflow' }, 
      { status: 500 }
    );
  }
}
