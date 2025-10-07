'use server';

import { WebflowClient } from 'webflow-api';

// Webflow API configuration
const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN || 'ab247ccecfe9d2603ee91090458d9373d440539e3e18db611e89d7fdf737b467';
const WEBFLOW_SITE_ID = process.env.WEBFLOW_SITE_ID || '67dbf17ba540975b5b21c180';

console.log('🔧 Webflow config check:', { 
  hasToken: !!WEBFLOW_API_TOKEN, 
  siteId: WEBFLOW_SITE_ID,
  tokenPreview: WEBFLOW_API_TOKEN?.substring(0, 10) + '...',
  envToken: process.env.WEBFLOW_API_TOKEN?.substring(0, 10) + '...'
});

// Initialize Webflow client
const webflow = new WebflowClient({ token: WEBFLOW_API_TOKEN });

// Author interface
export interface WebflowAuthor {
  id: string;
  name: string;
  slug: string;
  bio?: string;
  avatar?: string;
  email?: string;
  social?: {
    twitter?: string;
    instagram?: string;
    linkedin?: string;
  };
  tov?: string; // Tone of voice description
  specialties?: string[]; // Writing specialties
}

// Article field interface
export interface WebflowArticleFields {
  id: string;
  title: string;
  slug: string;
  subtitle?: string;
  content: string;
  excerpt?: string;
  category: string;
  tags: string[];
  author: string;
  rating?: number;
  featuredImage?: string;
  gallery?: string[];
  publishDate?: string;
  status: 'draft' | 'published' | 'archived';
  seoTitle?: string;
  seoDescription?: string;
  readTime?: number;
  wordCount?: number;
  featured?: boolean;
  trending?: boolean;
}

// Get all authors from Webflow
export async function getWebflowAuthors(): Promise<WebflowAuthor[]> {
  try {
    console.log('🔍 getWebflowAuthors called');
    console.log('🔍 Token available:', !!WEBFLOW_API_TOKEN);
    console.log('🔍 Site ID:', WEBFLOW_SITE_ID);
    
    if (!WEBFLOW_API_TOKEN) {
      console.warn('❌ WEBFLOW_API_TOKEN not configured, using fallback authors');
      return getFallbackAuthors();
    }

    // Skip sites check and go directly to authors collection
    console.log('🌐 Connecting directly to authors collection...');
    
    // Get Authors collection
    console.log(`Fetching authors from collection: ${WEBFLOW_SITE_ID}/collections/67dbf17ba540975b5b21c294/items`);
    const authorsResponse = await fetch(`https://api.webflow.com/v2/sites/${WEBFLOW_SITE_ID}/collections/67dbf17ba540975b5b21c294/items`, {
      headers: {
        'Authorization': `Bearer ${WEBFLOW_API_TOKEN}`,
        'Accept-Version': '1.0.0',
      },
    });

    console.log('Authors response status:', authorsResponse.status);

    if (authorsResponse.ok) {
      const authorsData = await authorsResponse.json();
      console.log('✓ Fetched real authors from Webflow, count:', authorsData.items?.length);
      
      return authorsData.items.map((author: any) => ({
        id: author.id,
        name: author.fieldData?.name || 'Unknown Author',
        slug: author.fieldData?.slug || author.id,
        bio: author.fieldData?.bio,
        avatar: author.fieldData?.photo?.url,
        email: author.fieldData?.['e-mail'],
        social: {
          twitter: author.fieldData?.twitter,
          instagram: author.fieldData?.instagram,
          linkedin: author.fieldData?.linkedin,
        },
        tov: author.fieldData?.tov || author.fieldData?.toneOfVoice || generateTOVFromBio(author.fieldData?.bio, author.fieldData?.position),
        specialties: author.fieldData?.specialties || generateSpecialtiesFromPosition(author.fieldData?.position),
      }));
    } else {
      const errorData = await authorsResponse.json();
      console.warn('Could not fetch authors from Webflow:', errorData);
      return getFallbackAuthors();
    }
    
  } catch (error) {
    console.error('Error fetching Webflow authors:', error);
    console.warn('Using fallback authors due to error');
    return getFallbackAuthors();
  }
}

// Get article collection fields
export async function getArticleFields(): Promise<string[]> {
  try {
    if (!WEBFLOW_API_TOKEN) {
      return getDefaultArticleFields();
    }

    const collections = await webflow.collections.list({ siteId: WEBFLOW_SITE_ID });
    const articlesCollection = collections.find((col: any) => 
      col.slug === 'articles' || col.name?.toLowerCase().includes('article')
    );

    if (!articlesCollection) {
      console.warn('Articles collection not found in Webflow');
      return getDefaultArticleFields();
    }

    const collectionDetails = await webflow.collections.get({
      collectionId: articlesCollection.id,
    });

    return collectionDetails.fields.map((field: any) => field.slug);
  } catch (error) {
    console.error('Error fetching Webflow article fields:', error);
    return getDefaultArticleFields();
  }
}

// Publish article to Webflow
export async function publishArticleToWebflow(articleData: WebflowArticleFields): Promise<string> {
  try {
    if (!WEBFLOW_API_TOKEN) {
      throw new Error('Webflow API token not configured');
    }

    // Publish to Articles collection
    const publishResponse = await fetch(`https://api.webflow.com/v2/sites/${WEBFLOW_SITE_ID}/collections/67dbf17ba540975b5b21c2a6/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WEBFLOW_API_TOKEN}`,
        'Accept-Version': '1.0.0',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fieldData: {
          name: articleData.title,
          slug: articleData.slug,
          subtitle: articleData.subtitle,
          'post-body': articleData.content,
          excerpt: articleData.excerpt,
          category: articleData.category,
          tags: articleData.tags,
          author: articleData.author,
          rating: articleData.rating,
          'featured-image': articleData.featuredImage,
          'publish-date': articleData.publishDate || new Date().toISOString(),
          status: articleData.status || 'draft',
          'seo-title': articleData.seoTitle || articleData.title,
          'seo-description': articleData.seoDescription || articleData.excerpt,
          'read-time': articleData.readTime,
          'word-count': articleData.wordCount,
          featured: articleData.featured || false,
          trending: articleData.trending || false,
        }
      }),
    });

    if (publishResponse.ok) {
      const result = await publishResponse.json();
      console.log('✅ Article published successfully to Webflow');
      return result.id;
    } else {
      const errorData = await publishResponse.json();
      console.error('Webflow publish error:', errorData);
      throw new Error(`Failed to publish to Webflow: ${errorData.message || 'Unknown error'}`);
    }
    
  } catch (error) {
    console.error('Error publishing article to Webflow:', error);
    throw error;
  }
}

// Helper function to generate TOV from bio and position
function generateTOVFromBio(bio: string, position: string): string {
  if (!bio) return 'Apropos stil';
  
  // Extract key characteristics from bio
  const lowerBio = bio.toLowerCase();
  let tov = 'Apropos stil';
  
  if (lowerBio.includes('analytisk')) tov += ', analytisk';
  if (lowerBio.includes('ironi') || lowerBio.includes('ironisk')) tov += ', ironisk';
  if (lowerBio.includes('humor') || lowerBio.includes('humoristisk')) tov += ', humoristisk';
  if (lowerBio.includes('nysgerrig')) tov += ', nysgerrig';
  if (lowerBio.includes('reflekteret')) tov += ', reflekteret';
  if (lowerBio.includes('nøgtern')) tov += ', nøgtern';
  if (lowerBio.includes('sprogligt præcis')) tov += ', sprogligt præcis';
  
  return tov;
}

// Helper function to generate specialties from position
function generateSpecialtiesFromPosition(position: string): string[] {
  if (!position) return ['Generel'];
  
  const lowerPos = position.toLowerCase();
  const specialties: string[] = [];
  
  if (lowerPos.includes('kultur')) specialties.push('Kultur');
  if (lowerPos.includes('anmeld')) specialties.push('Anmeldelser');
  if (lowerPos.includes('film')) specialties.push('Film');
  if (lowerPos.includes('musik')) specialties.push('Musik');
  if (lowerPos.includes('gaming')) specialties.push('Gaming');
  if (lowerPos.includes('tech')) specialties.push('Tech');
  if (lowerPos.includes('skribent')) specialties.push('Skribent');
  if (lowerPos.includes('redaktør')) specialties.push('Redaktion');
  
  return specialties.length > 0 ? specialties : ['Generel'];
}

// Fallback authors when Webflow is not available
function getFallbackAuthors(): WebflowAuthor[] {
  return [
    {
      id: 'frederik-kragh',
      name: 'Frederik Kragh',
      slug: 'frederik-kragh',
      bio: 'Chefredaktør og grundlægger af Apropos Magazine',
      tov: 'Analytisk, nysgerrig, med et skarpt øje for detaljer og en passion for at fortælle gode historier.',
      specialties: ['Gaming', 'Tech', 'Kultur'],
    },
    {
      id: 'martin-kongstad',
      name: 'Martin Kongstad',
      slug: 'martin-kongstad',
      bio: 'Senior journalist med fokus på gaming og underholdning',
      tov: 'Humoristisk, ironisk, med en let tilgang til komplekse emner og en kærlighed for popkultur.',
      specialties: ['Gaming', 'Anmeldelser', 'Interviews'],
    },
    {
      id: 'casper-christensen',
      name: 'Casper Christensen',
      slug: 'casper-christensen',
      bio: 'Kulturjournalist og filmkritiker',
      tov: 'Reflekteret, dybdegående, med en passion for at udforske kulturelle fænomener.',
      specialties: ['Film', 'Kultur', 'Anmeldelser'],
    },
  ];
}

// Default article fields
function getDefaultArticleFields(): string[] {
  return [
    'title',
    'slug',
    'subtitle',
    'content',
    'excerpt',
    'category',
    'tags',
    'author',
    'rating',
    'featuredImage',
    'publishDate',
    'status',
    'seoTitle',
    'seoDescription',
    'readTime',
    'wordCount',
    'featured',
    'trending',
  ];
}
