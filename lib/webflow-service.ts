'use server';
import { getWebflowConfig, saveWebflowConfig } from './webflow-config';
import { readMapping, type WebflowMapping } from './webflow-mapping';

// Resolve config dynamically so UI changes work without restart
function resolveConfig() {
  const file = getWebflowConfig();
  // UI (file) has priority; if UI value er tom streng, treat as unset (override env)
  const token = (file.apiToken !== undefined ? file.apiToken : process.env.WEBFLOW_API_TOKEN) || undefined;
  const siteId = (file.siteId !== undefined ? file.siteId : process.env.WEBFLOW_SITE_ID) || undefined;
  const authorsCollectionId = (file.authorsCollectionId !== undefined ? file.authorsCollectionId : process.env.WEBFLOW_AUTHORS_COLLECTION_ID) || undefined;
  const articlesCollectionId = (file.articlesCollectionId !== undefined ? file.articlesCollectionId : process.env.WEBFLOW_ARTICLES_COLLECTION_ID) || undefined;
  return { token, siteId, authorsCollectionId, articlesCollectionId } as const;
}

{
  const { token, siteId, authorsCollectionId, articlesCollectionId } = resolveConfig();
  console.log('🔧 Webflow config check:', {
    hasToken: !!token,
    hasSiteId: !!siteId,
    hasAuthorsCollectionId: !!authorsCollectionId,
    hasArticlesCollectionId: !!articlesCollectionId,
  });
}

// We call Webflow Data API v2 directly via fetch

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

export type WebflowStatus = {
  connected: boolean;
  hasToken: boolean;
  hasSiteId: boolean;
  hasAuthorsCollectionId: boolean;
  hasArticlesCollectionId: boolean;
  tokenPreview?: string;
  siteId?: string;
  authorsCollectionId?: string;
  articlesCollectionId?: string;
  apiReachable?: boolean;
  collectionsReachable?: boolean;
  error?: string;
};

export async function getWebflowStatus(): Promise<WebflowStatus> {
  const { token, siteId, authorsCollectionId, articlesCollectionId } = resolveConfig();
  const hasToken = !!token;
  const hasSiteId = !!siteId;
  const hasAuthorsCollectionId = !!authorsCollectionId;
  const hasArticlesCollectionId = !!articlesCollectionId;

  let apiReachable = false;
  let collectionsReachable = false;
  let error: string | undefined;

  if (hasToken && hasSiteId) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`https://api.webflow.com/v2/sites/${siteId}/collections`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept-Version': '1.0.0',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      apiReachable = res.status > 0;
      collectionsReachable = res.ok;
      if (!res.ok) {
        try {
          const j = await res.json();
          error = j?.message || `Webflow API error ${res.status}`;
        } catch {}
      }

      // Auto-discover missing collection IDs when possible
      if (collectionsReachable && (!hasAuthorsCollectionId || !hasArticlesCollectionId)) {
        try {
          await discoverWebflowCollections();
          // refresh current view of config
          const refreshed = resolveConfig();
          if (refreshed.authorsCollectionId) ({});
        } catch {}
      }
    } catch (e: any) {
      error = String(e?.message || e);
    }
  }

  const connected = hasToken && hasSiteId && hasAuthorsCollectionId && hasArticlesCollectionId && collectionsReachable;

  return {
    connected,
    hasToken,
    hasSiteId,
    hasAuthorsCollectionId: !!resolveConfig().authorsCollectionId,
    hasArticlesCollectionId: !!resolveConfig().articlesCollectionId,
    tokenPreview: token ? `${token.slice(0, 6)}…` : undefined,
    siteId,
    authorsCollectionId: resolveConfig().authorsCollectionId,
    articlesCollectionId: resolveConfig().articlesCollectionId,
    apiReachable,
    collectionsReachable,
    error,
  };
}

// Try to discover collection IDs from site
export async function discoverWebflowCollections(): Promise<{ authorsCollectionId?: string; articlesCollectionId?: string; collections?: any[] }>{
  const { token, siteId } = resolveConfig();
  if (!token || !siteId) {
    throw new Error('Token og Site ID kræves for at finde collections');
  }

  const res = await fetch(`https://api.webflow.com/v2/sites/${siteId}/collections`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept-Version': '1.0.0',
    },
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.message || `Webflow API error ${res.status}`);
  }
  const data = await res.json();
  const cols: any[] = Array.isArray(data) ? data : (data.collections || data.items || []);

  const norm = (s?: string) => (s || '').toLowerCase();
  let authorsId: string | undefined;
  let articlesId: string | undefined;

  for (const c of cols) {
    const slug = norm(c.slug || c.id || '');
    const name = norm(c.name || '');
    if (!authorsId && (slug.includes('author') || name.includes('author') || slug.includes('forfatter') || name.includes('forfatter'))) {
      authorsId = c.id;
    }
    if (!articlesId && (slug.includes('article') || name.includes('article') || slug.includes('post') || name.includes('post') || slug.includes('blog') || name.includes('blog') || slug.includes('artik') || name.includes('artik'))) {
      articlesId = c.id;
    }
  }

  // Persist discovered values if found
  if (authorsId || articlesId) {
    saveWebflowConfig({ authorsCollectionId: authorsId, articlesCollectionId: articlesId });
  }

  return { authorsCollectionId: authorsId, articlesCollectionId: articlesId, collections: cols };
}

// Get all authors from Webflow
export async function getWebflowAuthors(): Promise<WebflowAuthor[]> {
  try {
    const { token, siteId, authorsCollectionId } = resolveConfig();
    console.log('🔍 getWebflowAuthors called');
    console.log('🔍 Token available:', !!token);
    console.log('🔍 Site ID available:', !!siteId);
    console.log('🔍 Authors collection ID available:', !!authorsCollectionId);
    
    if (!token || !siteId || !authorsCollectionId) {
      console.warn('❌ WEBFLOW_API_TOKEN not configured, using fallback authors');
      return getFallbackAuthors();
    }

    // Skip sites check and go directly to authors collection
    console.log('🌐 Connecting directly to authors collection...');
    
    // Get Authors collection
    console.log(`Fetching authors from collection: ${siteId}/collections/${authorsCollectionId}/items`);
    const authorsResponse = await fetch(`https://api.webflow.com/v2/sites/${siteId}/collections/${authorsCollectionId}/items`, {
      headers: {
        'Authorization': `Bearer ${token}`,
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

// Resolve author itemId by matching name or slug (case-insensitive)
async function resolveAuthorIdFromName(nameOrSlug: string): Promise<string | undefined> {
  const slugify = (s: string) => s
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}+/gu, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  try {
    const { token, siteId, authorsCollectionId } = resolveConfig();
    if (!token || !siteId) return undefined;

    let colId = authorsCollectionId;
    if (!colId) {
      // discover authors-like collection
      const list = await fetch(`https://api.webflow.com/v2/sites/${siteId}/collections`, { headers: { 'Authorization': `Bearer ${token}`, 'Accept-Version': '1.0.0' } });
      const j: any = list.ok ? await list.json() : {};
      const cols: any[] = Array.isArray(j) ? j : (j.collections || j.items || []);
      const norm = (s?: string) => (s || '').toLowerCase();
      const cand = cols.find(c => norm(c.slug).includes('author') || norm(c.name).includes('author') || norm(c.slug).includes('forfatter') || norm(c.name).includes('forfatter'));
      colId = cand?.id;
    }
    if (!colId) return undefined;

    const res = await fetch(`https://api.webflow.com/v2/sites/${siteId}/collections/${colId}/items?limit=200`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept-Version': '1.0.0' },
    });
    if (!res.ok) return undefined;
    const data: any = await res.json();
    const items: any[] = data.items || [];

    const needleRaw = (nameOrSlug || '').trim();
    const needle = needleRaw.toLowerCase();
    const needleSlug = slugify(needleRaw);

    const found = items.find((it: any) => {
      const fd = it.fieldData || {};
      const nm = String(fd.name || '').toLowerCase().trim();
      const sl = String(fd.slug || '').toLowerCase().trim();
      const title = String(fd.title || '').toLowerCase().trim();
      return nm === needle || sl === needle || sl === needleSlug || title === needle;
    }) || items.find((it:any) => {
      // fallback contains match
      const fd = it.fieldData || {};
      const nm = String(fd.name || '').toLowerCase();
      return nm.includes(needle);
    });

    return found?.id;
  } catch {
    return undefined;
  }
}

// Get article collection fields
export async function getArticleFields(): Promise<string[]> {
  try {
    const { token, siteId } = resolveConfig();
    if (!token || !siteId) {
      return getDefaultArticleFields();
    }

    const listRes = await fetch(`https://api.webflow.com/v2/sites/${siteId}/collections`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept-Version': '1.0.0',
      },
    });
    if (!listRes.ok) return getDefaultArticleFields();
    const listData: any = await listRes.json();
    const cols: any[] = Array.isArray(listData) ? listData : (listData.collections || listData.items || []);
    const articlesCollection = cols.find((col: any) =>
      (col.slug || '').toLowerCase() === 'articles' || (col.name || '').toLowerCase().includes('article')
    );

    if (!articlesCollection) {
      console.warn('Articles collection not found in Webflow');
      return getDefaultArticleFields();
    }

    const colRes = await fetch(`https://api.webflow.com/v2/collections/${articlesCollection.id}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept-Version': '1.0.0',
      },
    });
    if (!colRes.ok) return getDefaultArticleFields();
    const colData: any = await colRes.json();
    return (colData.fields || []).map((field: any) => field.slug).filter(Boolean);
  } catch (error) {
    console.error('Error fetching Webflow article fields:', error);
    return getDefaultArticleFields();
  }
}

// Detailed field metadata for the Articles collection (normalized)
export type WebflowFieldMeta = {
  id?: string;
  name?: string;
  slug: string;
  type?: string;
  required?: boolean;
  unique?: boolean;
  editable?: boolean;
  isSystem?: boolean;
  validations?: any;
  reference?: { collectionId?: string; isMulti?: boolean };
  options?: Array<{ id?: string; name?: string; slug?: string; value?: any }>;
};

export async function getArticlesCollectionFieldsDetailed(): Promise<WebflowFieldMeta[]> {
  try {
    const { token, siteId, articlesCollectionId } = resolveConfig();
    if (!token || !siteId) return [];

    let colId = articlesCollectionId;
    if (!colId) {
      // Fallback: discover by listing and picking an articles-like collection
      const listRes = await fetch(`https://api.webflow.com/v2/sites/${siteId}/collections`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept-Version': '1.0.0' },
      });
      if (!listRes.ok) return [];
      const listData: any = await listRes.json();
      const cols: any[] = Array.isArray(listData) ? listData : (listData.collections || listData.items || []);
      const norm = (s?: string) => (s || '').toLowerCase();
      const candidate = cols.find((c: any) => norm(c.slug).includes('article') || norm(c.name).includes('article') || norm(c.slug).includes('blog') || norm(c.name).includes('blog'));
      colId = candidate?.id;
    }

    if (!colId) return [];

    const colRes = await fetch(`https://api.webflow.com/v2/collections/${colId}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept-Version': '1.0.0' },
    });
    if (!colRes.ok) return [];
    const colData: any = await colRes.json();
    const fields: any[] = colData.fields || [];

    return fields.map((f: any) => ({
      id: f.id,
      name: f.name,
      slug: f.slug,
      type: f.type,
      required: !!f.required,
      unique: !!f.unique,
      editable: f.editable !== false,
      isSystem: !!f.system,
      validations: f.validations,
      reference: f.reference ? { collectionId: f.reference?.collectionId || f.collectionId, isMulti: !!f.multiple } : undefined,
      options: Array.isArray(f.options) ? f.options : undefined,
    })).filter((m: WebflowFieldMeta) => !!m.slug);
  } catch (e) {
    console.error('Error fetching detailed Webflow fields:', e);
    return [];
  }
}

// Publish article to Webflow
export async function publishArticleToWebflow(articleData: WebflowArticleFields): Promise<string> {
  try {
    const { token, siteId, articlesCollectionId } = resolveConfig();
    if (!token || !siteId || !articlesCollectionId) {
      throw new Error('Webflow configuration missing (token/site/collection)');
    }

    // Build fieldData via mapping
    const fieldData = buildFieldDataFromMapping(articleData, readMapping());

    // Resolve author reference automatically if provided as a name/slug
    if (fieldData['author']) {
      const authorVal = fieldData['author'];
      if (typeof authorVal === 'string') {
        // Heuristic: if it looks like a name or slug (has spaces or short/non-id), try resolving to itemId
        const looksLikeNameOrSlug = /\s/.test(authorVal) || authorVal.length < 20;
        if (looksLikeNameOrSlug) {
          const resolvedId = await resolveAuthorIdFromName(authorVal).catch(() => undefined);
          if (resolvedId) {
            fieldData['author'] = resolvedId;
          }
        }
      }
    }

    // Filter fieldData to only include slugs that exist in the collection schema
    let requiredSlugs: string[] = [];
    try {
      const schemaRes = await fetch(`https://api.webflow.com/v2/collections/${articlesCollectionId}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept-Version': '1.0.0' },
      });
      if (schemaRes.ok) {
        const schema: any = await schemaRes.json();
        const allowed = new Set<string>((schema.fields || []).map((f: any) => f.slug));
        requiredSlugs = (schema.fields || []).filter((f:any)=>!!f.required).map((f:any)=>f.slug);
        for (const key of Object.keys(fieldData)) {
          if (!allowed.has(key)) delete fieldData[key];
        }
        // Best-effort: if rich text field exists, ensure minimal HTML
        const rich = (schema.fields || []).find((f: any) => f.slug === 'post-body' && /rich/i.test(f.type || ''));
        if (rich && typeof fieldData['post-body'] === 'string' && !fieldData['post-body'].includes('<')) {
          fieldData['post-body'] = `<p>${String(fieldData['post-body']).replace(/\n+/g,'</p><p>')}</p>`;
        }
      }
    } catch {}

    // Pre-validate required fields locally to surface actionable message
    if (requiredSlugs.length > 0) {
      const missing: string[] = [];
      for (const slug of requiredSlugs) {
        const v: any = (fieldData as any)[slug];
        if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
          missing.push(slug);
        }
      }
      if (missing.length > 0) {
        throw new Error(`Validation Error: Missing required fields: ${missing.join(', ')}`);
      }
    }

    // Publish to Articles collection
    const publishResponse = await fetch(`https://api.webflow.com/v2/sites/${siteId}/collections/${articlesCollectionId}/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept-Version': '1.0.0',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fieldData
      }),
    });

    if (publishResponse.ok) {
      const result = await publishResponse.json();
      console.log('✅ Article published successfully to Webflow');
      return result.id;
    } else {
      let errorData: any = null;
      try { errorData = await publishResponse.json(); } catch { errorData = await publishResponse.text(); }
      console.error('Webflow publish error:', errorData);
      const msg = typeof errorData === 'string' ? errorData : (errorData?.message || 'Validation Error');
      const more = typeof errorData === 'string' ? '' : (errorData?.details ? ` | ${JSON.stringify(errorData.details)}` : '');
      throw new Error(`Failed to publish to Webflow: ${msg}${more}`);
    }
    
  } catch (error) {
    console.error('Error publishing article to Webflow:', error);
    throw error;
  }
}

function buildFieldDataFromMapping(articleData: WebflowArticleFields, mapping: WebflowMapping): Record<string, any> {
  const data: Record<string, any> = {};
  const getVal = (key: string) => (articleData as any)[key];
  for (const entry of mapping.entries) {
    const val = transformValue(getVal(entry.internal), entry.transform);
    if (val !== undefined) {
      data[entry.webflowSlug] = val;
    }
  }
  // Defaults/fallbacks
  if (!data['publish-date']) data['publish-date'] = articleData.publishDate || new Date().toISOString();
  if (!data['seo-title'] && articleData.title) data['seo-title'] = articleData.title;
  if (!data['seo-description']) data['seo-description'] = articleData.excerpt || '';
  if (data['status'] === undefined) data['status'] = articleData.status || 'draft';
  return data;
}

function transformValue(value: any, t?: string): any {
  switch (t) {
    case 'plainToHtml':
      if (!value) return value;
      return `<p>${String(value).replace(/\n+/g,'</p><p>')}</p>`;
    case 'markdownToHtml':
      // simple fallback; for real md convert, integrate a parser later
      if (!value) return value;
      return String(value).replace(/^# (.*)$/gm,'<h2>$1</h2>').replace(/\n\n/g,'<br/><br/>');
    case 'stringArray':
      if (Array.isArray(value)) return value;
      if (!value) return [];
      return String(value).split(',').map(s=>s.trim()).filter(Boolean);
    case 'dateIso':
      return value ? new Date(value).toISOString() : undefined;
    case 'referenceId':
      return value; // expect caller to supply itemId
    case 'boolean':
      return !!value;
    case 'number':
      return value === undefined || value === null || value === '' ? undefined : Number(value);
    case 'identity':
    default:
      return value;
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
