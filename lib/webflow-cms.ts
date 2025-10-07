// Webflow CMS Integration for Apropos Magazine

interface WebflowCMSConfig {
  apiKey: string;
  collectionId: string;
  siteId: string;
}

interface WebflowItem {
  _id?: string;
  'article-title': string;
  'article-slug': string;
  'article-excerpt': string;
  'article-category': string;
  'article-tags': string[];
  'article-author': string;
  'article-published-date': string;
  'article-content': string;
  'article-meta-description': string;
  'article-social-title': string;
  'article-social-description': string;
  'article-seo-title': string;
  'article-seo-description': string;
  'article-reading-time': number;
  'article-word-count': number;
  'article-featured-image'?: string;
  'article-status': 'draft' | 'published' | 'scheduled';
  'is-draft': boolean;
}

export class WebflowCMS {
  private config: WebflowCMSConfig;

  constructor() {
    this.config = {
      apiKey: process.env.WEBFLOW_API_KEY || '',
      collectionId: process.env.WEBFLOW_COLLECTION_ID || '',
      siteId: process.env.WEBFLOW_SITE_ID || ''
    };
  }

  async publishArticle(articleData: any): Promise<{ success: boolean; itemId?: string; error?: string }> {
    try {
      if (!this.config.apiKey || !this.config.collectionId) {
        throw new Error('Webflow API key or Collection ID not configured');
      }

      const webflowItem: WebflowItem = {
        'article-title': articleData.title,
        'article-slug': articleData.slug,
        'article-excerpt': articleData.excerpt,
        'article-category': articleData.category,
        'article-tags': articleData.tags,
        'article-author': articleData.author,
        'article-published-date': articleData.publishedDate,
        'article-content': articleData.content,
        'article-meta-description': articleData.metaDescription,
        'article-social-title': articleData.socialTitle,
        'article-social-description': articleData.socialDescription,
        'article-seo-title': articleData.seoTitle,
        'article-seo-description': articleData.seoDescription,
        'article-reading-time': articleData.readingTime,
        'article-word-count': articleData.wordCount,
        'article-featured-image': articleData.featuredImage,
        'article-status': articleData.status,
        'is-draft': articleData.status === 'draft'
      };

      const response = await fetch(`https://api.webflow.com/v2/collections/${this.config.collectionId}/items`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'accept-version': '1.0.0'
        },
        body: JSON.stringify({
          fieldData: webflowItem
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Webflow API error: ${errorData.message || response.statusText}`);
      }

      const result = await response.json();
      
      return {
        success: true,
        itemId: result.id
      };

    } catch (error) {
      console.error('Webflow publish error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async updateArticle(itemId: string, articleData: any): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.config.apiKey || !this.config.collectionId) {
        throw new Error('Webflow API key or Collection ID not configured');
      }

      const webflowItem: WebflowItem = {
        'article-title': articleData.title,
        'article-slug': articleData.slug,
        'article-excerpt': articleData.excerpt,
        'article-category': articleData.category,
        'article-tags': articleData.tags,
        'article-author': articleData.author,
        'article-published-date': articleData.publishedDate,
        'article-content': articleData.content,
        'article-meta-description': articleData.metaDescription,
        'article-social-title': articleData.socialTitle,
        'article-social-description': articleData.socialDescription,
        'article-seo-title': articleData.seoTitle,
        'article-seo-description': articleData.seoDescription,
        'article-reading-time': articleData.readingTime,
        'article-word-count': articleData.wordCount,
        'article-featured-image': articleData.featuredImage,
        'article-status': articleData.status,
        'is-draft': articleData.status === 'draft'
      };

      const response = await fetch(`https://api.webflow.com/v2/collections/${this.config.collectionId}/items/${itemId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          'accept-version': '1.0.0'
        },
        body: JSON.stringify({
          fieldData: webflowItem
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Webflow API error: ${errorData.message || response.statusText}`);
      }

      return { success: true };

    } catch (error) {
      console.error('Webflow update error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getArticles(): Promise<{ success: boolean; articles?: any[]; error?: string }> {
    try {
      if (!this.config.apiKey || !this.config.collectionId) {
        throw new Error('Webflow API key or Collection ID not configured');
      }

      const response = await fetch(`https://api.webflow.com/v2/collections/${this.config.collectionId}/items`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'accept-version': '1.0.0'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Webflow API error: ${errorData.message || response.statusText}`);
      }

      const result = await response.json();
      
      return {
        success: true,
        articles: result.items
      };

    } catch (error) {
      console.error('Webflow get articles error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
