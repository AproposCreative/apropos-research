// Webflow Authors Integration for Apropos Magazine

import { env } from '@/lib/config/env';
import { logger } from '@/lib/logger';
import { fetchWebflowAuthorItems, webflowAuthorTov } from '@/lib/webflow/author-retrieval';

export interface WebflowAuthor {
  id: string;
  name: string;
  slug: string;
  bio?: string;
  image?: string;
  tov?: string; // Tone of Voice beskrivelse
}

export class WebflowAuthors {
  private apiKey: string;
  private authorsCollectionId: string;

  constructor() {
    this.apiKey = env.WEBFLOW_API_TOKEN || '';
    this.authorsCollectionId = env.WEBFLOW_AUTHORS_COLLECTION_ID || '';
  }

  async getAuthors(): Promise<{ success: boolean; authors?: WebflowAuthor[]; error?: string }> {
    try {
      if (!this.apiKey || !this.authorsCollectionId) {
        // Fallback to scraped Apropos authors if Webflow not configured
        try {
          const fs = require('fs');
          const path = require('path');
          const authorsFile = path.join(process.cwd(), 'data', 'apropos-authors.json');
          
          if (fs.existsSync(authorsFile)) {
            const authorsData = JSON.parse(fs.readFileSync(authorsFile, 'utf8'));
            const scrapedAuthors: WebflowAuthor[] = authorsData
              .filter((author: any) => author.articles.length >= 3) // Only authors with 3+ articles
              .map((author: any) => ({
                id: author.name.toLowerCase().replace(/\s+/g, '-'),
                name: author.name,
                slug: author.name.toLowerCase().replace(/\s+/g, '-'),
                bio: `${author.articles.length} artikler • ${author.commonThemes.slice(0, 3).join(', ')}`,
                tov: author.toneOfVoice || 'Apropos stil - Personlig, ærlig, kulturelt bevidst'
              }));
            
            if (scrapedAuthors.length > 0) {
              return { success: true, authors: scrapedAuthors };
            }
          }
        } catch (error) {
          logger.error('Could not load scraped authors', error instanceof Error ? error : new Error(String(error)));
        }
        
        // Ultimate fallback
        return {
          success: true,
          authors: [
            {
              id: 'frederik-kragh',
              name: 'Frederik Kragh',
              slug: 'frederik-kragh',
              tov: 'Martin Kongstad x Casper Christensen - Personlig, ærlig, humoristisk, skarp, kulturelt bevidst'
            }
          ]
        };
      }

      const items = await fetchWebflowAuthorItems({ token: this.apiKey, collectionId: this.authorsCollectionId,
        localeId: env.WEBFLOW_CMS_LOCALE_DK });
      
      const authors: WebflowAuthor[] = items.map(item => ({
        id: item.id,
        name: item.fieldData['author-name'] || item.fieldData.name,
        slug: item.fieldData['author-slug'] || item.fieldData.slug || item.slug || item.id,
        bio: item.fieldData['author-bio'] || item.fieldData.bio,
        image: item.fieldData['author-image'] || item.fieldData.image,
        tov: webflowAuthorTov(item.fieldData)
      }));

      return {
        success: true,
        authors
      };

    } catch (error) {
      console.error('Webflow authors fetch error:', error);
      // Return fallback authors on error
      return {
        success: true,
        authors: [
          {
            id: 'frederik-kragh',
            name: 'Frederik Kragh',
            slug: 'frederik-kragh',
            tov: 'Martin Kongstad x Casper Christensen - Personlig, ærlig, humoristisk, skarp, kulturelt bevidst'
          }
        ]
      };
    }
  }

  async getAuthorById(authorId: string): Promise<{ success: boolean; author?: WebflowAuthor; error?: string }> {
    try {
      const authorsResult = await this.getAuthors();
      
      if (!authorsResult.success || !authorsResult.authors) {
        return { success: false, error: 'Could not fetch authors' };
      }

      const author = authorsResult.authors.find(a => a.id === authorId);
      
      if (!author) {
        return { success: false, error: 'Author not found' };
      }

      return { success: true, author };

    } catch (error) {
      console.error('Get author by ID error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
