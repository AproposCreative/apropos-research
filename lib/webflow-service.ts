'use server';
import { getWebflowConfig, saveWebflowConfig } from './webflow-config';
import { readMapping, type WebflowMapping } from './webflow-mapping';
import { env } from '@/lib/config/env';
import { logger } from '@/lib/logger';
import { maybeOptimizeMobileImageForFieldData } from '@/lib/webflow/mobile-image-optimizer';
import {
  extractFirstYouTubeUrl,
  isLikelyUrl,
  normalizeYouTubeUrl,
  stripHtml,
  transformValue,
} from '@/lib/webflow/field-mapping';
import { fotoCreditFromFeaturedUrl } from '@/lib/liv/cms-webflow-meta';
import { resolveBestOfficialFeaturedImage } from '@/lib/liv/fetch-official-images';
import type {
  WebflowArticleFields,
  WebflowAuthor,
  WebflowFieldMeta,
  WebflowStatus,
} from '@/lib/webflow/types';

export type { WebflowArticleFields, WebflowAuthor, WebflowFieldMeta, WebflowStatus };

// Resolve config dynamically so UI changes work without restart
function resolveConfig() {
  const file = getWebflowConfig();
  // UI (file) has priority; if UI value er tom streng, treat as unset (override env)
  const token = (file.apiToken !== undefined ? file.apiToken : env.WEBFLOW_API_TOKEN) || undefined;
  const siteId = (file.siteId !== undefined ? file.siteId : env.WEBFLOW_SITE_ID) || undefined;
  const authorsCollectionId = (file.authorsCollectionId !== undefined ? file.authorsCollectionId : env.WEBFLOW_AUTHORS_COLLECTION_ID) || undefined;
  const articlesCollectionId = (file.articlesCollectionId !== undefined ? file.articlesCollectionId : env.WEBFLOW_ARTICLES_COLLECTION_ID) || undefined;
  const sectionsCollectionId = env.WEBFLOW_SECTIONS_COLLECTION_ID || undefined;
  const topicsCollectionId = env.WEBFLOW_TOPICS_COLLECTION_ID || undefined;
  const festivalsCollectionId = env.WEBFLOW_FESTIVALS_COLLECTION_ID || undefined;
  const streamingServicesCollectionId = env.WEBFLOW_STREAMING_SERVICES_COLLECTION_ID || undefined;
  return { token, siteId, authorsCollectionId, articlesCollectionId, sectionsCollectionId, topicsCollectionId, festivalsCollectionId, streamingServicesCollectionId } as const;
}

{
  const { token, siteId, authorsCollectionId, articlesCollectionId } = resolveConfig();
  logger.debug('Webflow config check', {
    hasToken: !!token,
    hasSiteId: !!siteId,
    hasAuthorsCollectionId: !!authorsCollectionId,
    hasArticlesCollectionId: !!articlesCollectionId,
  });
}

// We call Webflow Data API v2 directly via fetch

// Types moved to lib/webflow/types.ts (re-exported above for backwards compat).

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

// `stripHtml` lives in `lib/webflow/field-mapping.ts` (imported above).

// Get all authors from Webflow
export async function getWebflowAuthors(): Promise<WebflowAuthor[]> {
  try {
    const { token, siteId, authorsCollectionId } = resolveConfig();
    logger.debug('getWebflowAuthors called', {
      hasToken: !!token,
      hasSiteId: !!siteId,
      hasAuthorsCollectionId: !!authorsCollectionId,
    });
    
    if (!token || !siteId || !authorsCollectionId) {
      logger.warn('WEBFLOW_API_TOKEN not configured, using fallback authors');
      return getFallbackAuthors();
    }

    // Skip sites check and go directly to authors collection
    logger.debug('Connecting directly to authors collection');
    
    // Get Authors collection
    logger.debug('Fetching authors from collection', { siteId, authorsCollectionId });
    const authorsResponse = await fetch(`https://api.webflow.com/v2/sites/${siteId}/collections/${authorsCollectionId}/items`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept-Version': '1.0.0',
      },
    });

    logger.debug('Authors response status', { status: authorsResponse.status });

    if (authorsResponse.ok) {
      const authorsData = await authorsResponse.json();
      logger.info('Fetched real authors from Webflow', { count: authorsData.items?.length });
      
      return authorsData.items.map((author: any) => {
        const rawTov = author.fieldData?.['author-prompt'] || author.fieldData?.authorPrompt || author.fieldData?.tov || author.fieldData?.toneOfVoice || generateTOVFromBio(author.fieldData?.bio, author.fieldData?.position);
        return {
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
          tov: stripHtml(rawTov),
          specialties: author.fieldData?.specialties || generateSpecialtiesFromPosition(author.fieldData?.position),
        };
      });
    } else {
      const errorData = await authorsResponse.json();
      logger.warn('Could not fetch authors from Webflow', { errorData: JSON.stringify(errorData).substring(0, 200) });
      return getFallbackAuthors();
    }
    
  } catch (error) {
    logger.error('Error fetching Webflow authors', error instanceof Error ? error : new Error(String(error)));
    logger.warn('Using fallback authors due to error');
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

// Resolve section itemId by matching name or slug (case-insensitive)
async function resolveSectionIdFromName(nameOrSlug: string): Promise<string | undefined> {
  const slugify = (s: string) => s
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}+/gu, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  try {
    const { token, siteId } = resolveConfig();
    if (!token || !siteId) return undefined;

    // Use sections collection ID from config
    const sectionsCollectionId = '67dbf17ba540975b5b21c2ae'; // From Webflow API response

    const res = await fetch(`https://api.webflow.com/v2/sites/${siteId}/collections/${sectionsCollectionId}/items?limit=200`, {
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

async function resolveStreamingServiceIdFromName(nameOrSlug: string): Promise<string | undefined> {
  const slugify = (s: string) => s
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}+/gu, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  try {
    const { token, siteId } = resolveConfig();
    if (!token || !siteId) return undefined;

    let collectionId = resolveConfig().streamingServicesCollectionId;
    if (!collectionId) {
      try {
        const listRes = await fetch(`https://api.webflow.com/v2/sites/${siteId}/collections`, {
          headers: { 'Authorization': `Bearer ${token}`, 'Accept-Version': '1.0.0' },
        });
        if (listRes.ok) {
          const listData: any = await listRes.json().catch(() => ({}));
          const cols: any[] = Array.isArray(listData) ? listData : (listData.collections || listData.items || []);
          const norm = (s?: string) => (s || '').toLowerCase();
          const candidate = cols.find((col: any) => {
            const slug = norm(col.slug);
            const name = norm(col.name);
            return slug.includes('stream') || name.includes('stream');
          });
          collectionId = candidate?.id;
        }
      } catch (err) {
        logger.warn('[webflow] auto-discovery of streaming services collection failed', { err: err instanceof Error ? err.message : String(err) });
      }
    }

    if (!collectionId) return undefined;

    const res = await fetch(`https://api.webflow.com/v2/sites/${siteId}/collections/${collectionId}/items?limit=200`, {
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
      const nm = String(fd.name || fd.title || fd.label || '').toLowerCase().trim();
      const sl = String(fd.slug || '').toLowerCase().trim();
      return nm === needle || sl === needle || sl === needleSlug;
    }) || items.find((it:any) => {
      const fd = it.fieldData || {};
      const nm = String(fd.name || fd.title || fd.label || '').toLowerCase();
      return nm.includes(needle);
    });

    return found?.id;
  } catch (error) {
    logger.warn('[webflow] unable to resolve streaming service ID', { err: error instanceof Error ? error.message : String(error) });
    return undefined;
  }
}

const topicSlugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

async function fetchTopicCollectionItems(siteId: string, collectionId: string, token: string): Promise<any[]> {
  const base = `https://api.webflow.com/v2/sites/${siteId}/collections/${collectionId}/items`;
  const all: any[] = [];
  let offset = 0;
  const limit = 100;
  while (offset < 5000) {
    const res = await fetch(`${base}?offset=${offset}&limit=${limit}`, {
      headers: { Authorization: `Bearer ${token}`, 'Accept-Version': '1.0.0' },
    });
    if (!res.ok) break;
    const data: any = await res.json();
    const batch = data.items || [];
    all.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  return all;
}

// Resolve topic itemId by matching name or slug (case-insensitive)
async function resolveTopicIdFromName(nameOrSlug: string): Promise<string | undefined> {
  try {
    const { token, siteId } = resolveConfig();
    if (!token || !siteId) return undefined;

    const collectionId =
      resolveConfig().topicsCollectionId?.trim() || '67dbf17ba540975b5b21c2af';

    const items = await fetchTopicCollectionItems(siteId, collectionId, token);
    if (!items.length) return undefined;

    const needleRaw = (nameOrSlug || '').trim();
    const needle = needleRaw.toLowerCase();
    const needleSlug = topicSlugify(needleRaw);
    const needleFirst = needle.split(/\s*&\s*|,\s*|\/|\s+/)[0]?.trim() || needle;

    const score = (it: any): number => {
      const fd = it.fieldData || {};
      const nm = String(fd.name ?? fd.title ?? '').toLowerCase().trim();
      const sl = String(fd.slug ?? '').toLowerCase().trim();
      const title = String(fd.title ?? '').toLowerCase().trim();
      if (nm === needle || title === needle) return 100;
      if (sl === needle || sl === needleSlug || topicSlugify(nm) === needleSlug) return 95;
      if (nm.startsWith(needleFirst) || sl.startsWith(topicSlugify(needleFirst))) return 85;
      if (nm.includes(needle) || title.includes(needle)) return 70;
      if (needleFirst.length >= 3 && (nm.includes(needleFirst) || sl.includes(topicSlugify(needleFirst)))) return 60;
      return 0;
    };

    let best: { id: string; s: number } | undefined;
    for (const it of items) {
      const s = score(it);
      if (s > 0 && (!best || s > best.s)) {
        best = { id: it.id, s };
      }
    }
    return best?.id;
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
      logger.warn('[webflow] articles collection not found');
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
    logger.error('[webflow] error fetching article fields', error instanceof Error ? error : new Error(String(error)));
    return getDefaultArticleFields();
  }
}

// `WebflowFieldMeta` lever i `lib/webflow/types.ts` (re-exporteret øverst).

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
      required: !!(f.required || f.isRequired),
      unique: !!f.unique,
      editable: f.editable !== false,
      isSystem: !!(f.system || f.isSystem),
      validations: f.validations,
      reference: f.reference ? { collectionId: f.reference?.collectionId || f.collectionId, isMulti: !!f.multiple } : undefined,
      options: Array.isArray(f.options) ? f.options : undefined,
    })).filter((m: WebflowFieldMeta) => !!m.slug);
  } catch (e) {
    logger.error('[webflow] error fetching detailed fields', e instanceof Error ? e : new Error(String(e)));
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

    const normalizedPlatform = (articleData.platform || '').trim();
    if (!articleData.streaming_service && normalizedPlatform && !isLikelyUrl(normalizedPlatform)) {
      articleData.streaming_service = normalizedPlatform;
    }
    if (!articleData.watchUrl && articleData.streamingUrl) {
      articleData.watchUrl = articleData.streamingUrl;
    }
    if (!articleData.watchUrl && normalizedPlatform && isLikelyUrl(normalizedPlatform)) {
      articleData.watchUrl = normalizedPlatform;
    }
    if (articleData.watchUrl && !isLikelyUrl(articleData.watchUrl)) {
      articleData.watchUrl = undefined;
    }
    if (!articleData.videoTrailer && articleData.video_trailer) {
      articleData.videoTrailer = articleData.video_trailer;
    }
    if (!articleData.videoTrailer) {
      const youtubeCandidate = extractFirstYouTubeUrl(
        `${articleData.videoTrailer || ''}\n${articleData.content || ''}\n${articleData.excerpt || ''}`
      );
      if (youtubeCandidate) {
        articleData.videoTrailer = youtubeCandidate;
      }
    }
    if (articleData.videoTrailer) {
      const normalizedTrailer = normalizeYouTubeUrl(articleData.videoTrailer);
      articleData.videoTrailer = normalizedTrailer || undefined;
      if (articleData.videoTrailer) {
        articleData.video_trailer = articleData.videoTrailer;
      }
    }

    const mergeImageSourceUrls = (): string[] => {
      const raw = [
        ...(articleData.imageSourceUrls || []),
        articleData.aiSourceUrl || '',
      ].filter((u): u is string => typeof u === 'string' && /^https?:\/\//i.test(u.trim()));
      const out: string[] = [];
      for (const u of raw) {
        const t = u.trim();
        if (out.includes(t)) continue;
        out.push(t);
        if (out.length >= 14) break;
      }
      return out;
    };

    const imageSourceList = mergeImageSourceUrls();
    if (imageSourceList.length > 0) {
      const fromOfficial = await resolveBestOfficialFeaturedImage(imageSourceList);
      if (fromOfficial) {
        articleData.featuredImage = fromOfficial;
        logger.info('[webflow] featuredImage from official page (og / JSON-LD)', {
          preview: fromOfficial.slice(0, 100),
        });
      }
    }

    if (articleData.featuredImage?.trim()) {
      const fc = fotoCreditFromFeaturedUrl(articleData.featuredImage.trim());
      if (fc) {
        articleData = { ...articleData, fotoCredit: fc };
      }
    }

    // Remove intro from content if intro is provided separately (to avoid duplication in Webflow)
    // Import removeIntroFromContent function
    const removeIntroFromContent = (content: string) => {
      if (!content) return content;
      // Remove the intro section from content - improved regex
      return content.replace(/^intro\s*:\s*[\s\S]+?(?=\n\n|\n[A-ZÆØÅ]|$)/im, '').trim();
    };
    
    // If intro is provided separately, remove it from content to avoid duplication
    if (articleData.intro && articleData.content) {
      const contentWithoutIntro = removeIntroFromContent(articleData.content);
      if (contentWithoutIntro !== articleData.content) {
        // Intro was removed from content, use the cleaned version
        articleData = { ...articleData, content: contentWithoutIntro };
        console.log('✅ Removed intro from content (intro is sent separately to Webflow)');
      }
    }

    {
      const a = articleData.author;
      const name = typeof a === 'string' ? a.trim() : '';
      if (name && /liv\s*brandt/i.test(name)) {
        articleData = { ...articleData, aiGenerated: true };
      }
    }

    // Build fieldData via mapping
    const fieldData = await buildFieldDataFromMapping(articleData, readMapping());
    await maybeOptimizeMobileImageForFieldData({
      fieldData,
      articleTitle: articleData.title,
      articleSlug: articleData.slug,
    });

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

    // Resolve section reference automatically if provided as a name/slug
    if (fieldData['section']) {
      const sectionVal = fieldData['section'];
      if (typeof sectionVal === 'string') {
        const looksLikeNameOrSlug = /\s/.test(sectionVal) || sectionVal.length < 20;
        if (looksLikeNameOrSlug) {
          const resolvedId = await resolveSectionIdFromName(sectionVal).catch(() => undefined);
          if (resolvedId) {
            fieldData['section'] = resolvedId;
          }
        }
      }
    }

    // Primary Topic + Topics (multi): prøv hele topicsSelected i rækkefølge til første match,
    // derefter alle øvrige der matcher (typisk Musik + Festival + …).
    const topicsSelected = (articleData as any).topicsSelected as string[] | undefined;
    if (Array.isArray(topicsSelected) && topicsSelected.length > 0) {
      const resolvedIdsOrdered: string[] = [];
      const seen = new Set<string>();
      for (const raw of topicsSelected) {
        const name = String(raw || '').trim();
        if (!name) continue;
        const looksLikeId = /^[a-f0-9]{24}$/i.test(name);
        const id = looksLikeId ? name : await resolveTopicIdFromName(name).catch(() => undefined);
        if (id && !seen.has(id)) {
          seen.add(id);
          resolvedIdsOrdered.push(id);
        }
      }
      if (resolvedIdsOrdered.length > 0) {
        fieldData['topic'] = resolvedIdsOrdered[0];
        // Multi-reference "Topics" skal ikke være tom bare fordi kun ét navn matchede —
        // Webflow UI viser ellers "Pick Topics..." selv om Primary Topic er sat.
        fieldData['topics'] = resolvedIdsOrdered;
      }
    } else {
      if (fieldData['topic']) {
        const topicVal = fieldData['topic'];
        if (typeof topicVal === 'string') {
          const looksLikeNameOrSlug = /\s/.test(topicVal) || topicVal.length < 20;
          if (looksLikeNameOrSlug) {
            const resolvedId = await resolveTopicIdFromName(topicVal).catch(() => undefined);
            if (resolvedId) {
              fieldData['topic'] = resolvedId;
            }
          }
        }
      }

      if (fieldData['topics']) {
        const topicsVal = fieldData['topics'];
        if (Array.isArray(topicsVal)) {
          const resolvedIds = [];
          for (const topicVal of topicsVal) {
            if (typeof topicVal === 'string') {
              const looksLikeNameOrSlug = /\s/.test(topicVal) || topicVal.length < 20;
              if (looksLikeNameOrSlug) {
                const resolvedId = await resolveTopicIdFromName(topicVal).catch(() => undefined);
                if (resolvedId) {
                  resolvedIds.push(resolvedId);
                }
              } else {
                resolvedIds.push(topicVal);
              }
            } else {
              resolvedIds.push(topicVal);
            }
          }
          fieldData['topics'] = resolvedIds;
        }
      }
    }

    // Resolve streaming service - use the correct field slug from Webflow: "simple-rerfence"
    // Use default slug first, will be updated after schema check
    let streamingFieldSlug = 'simple-rerfence';
    
    // Try multiple sources for streaming service value
    const streamingCandidates: (string | undefined)[] = [
      typeof fieldData['simple-rerfence'] === 'string' ? fieldData['simple-rerfence'] : undefined,
      typeof fieldData['simple-reference'] === 'string' ? fieldData['simple-reference'] : undefined,
      typeof fieldData['streaming-service'] === 'string' ? fieldData['streaming-service'] : undefined, // Legacy slug
      articleData.streaming_service,
      articleData.platform,
      (articleData as any).streaming_service,
      (articleData as any).platform
    ];
    
    console.log('🔍 Streaming service candidates:', streamingCandidates);
    
    const streamingLabel = streamingCandidates.find((value) => {
      if (!value) return false;
      const trimmed = value.trim();
      if (!trimmed) return false;
      const looksLikeId = /^[a-f0-9]{24}$/i.test(trimmed);
      if (looksLikeId) {
        // Will set correct field after schema check
        return false;
      }
      return !isLikelyUrl(trimmed);
    });
    
    console.log('🔍 Selected streaming service label:', streamingLabel);
    
    // Store streaming service value temporarily - will be set to correct field after schema check
    const streamingServiceValue = streamingLabel ? streamingLabel.trim() : null;

    if (!fieldData['watch-now-link'] && articleData.watchUrl && isLikelyUrl(articleData.watchUrl)) {
      fieldData['watch-now-link'] = articleData.watchUrl.trim();
    }
    if (typeof fieldData['watch-now-link'] === 'string') {
      const link = fieldData['watch-now-link'].trim();
      if (!isLikelyUrl(link)) {
        logger.warn('[webflow] removing non-URL watch-now-link value', { link: String(link).slice(0, 200) });
        delete fieldData['watch-now-link'];
      } else {
        fieldData['watch-now-link'] = link;
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
        requiredSlugs = (schema.fields || [])
          .filter((f:any)=>!!(f.required || f.isRequired))
          .map((f:any)=>f.slug);
        
        // Canonicalize common slug aliases to avoid CMS field drops when schema uses alternate names.
        const aliasPairs: Array<[string, string]> = [
          ['content', 'post-body'],
          ['post-body', 'content'],
          ['meta-description', 'seo-description'],
          ['seo-description', 'meta-description'],
        ];
        for (const [from, to] of aliasPairs) {
          if (allowed.has(to) && !fieldData[to] && fieldData[from]) {
            fieldData[to] = fieldData[from];
          }
        }
        
        // Check field types for streaming-service and thumb
        // Try multiple possible slug variations for thumb field
        const thumbField = (schema.fields || []).find((f: any) => 
          f.slug === 'thumb' || 
          f.slug === 'thumbnail' ||
          f.slug === 'Thumb' ||
          f.displayName?.toLowerCase() === 'thumb'
        );
        
        const streamingServiceField = (schema.fields || []).find((f: any) => 
          f.slug === 'simple-rerfence' ||
          f.slug === 'simple-reference' ||
          f.slug === 'streaming-service' ||
          f.displayName?.toLowerCase().includes('streaming') ||
          f.displayName?.toLowerCase().includes('service')
        );
        
        // Log all field slugs in schema for debugging
        const allFieldSlugs = (schema.fields || []).map((f: any) => f.slug);
        const allFieldsDetailed = (schema.fields || []).map((f: any) => ({
          slug: f.slug,
          displayName: f.displayName,
          type: f.type,
          isRequired: f.isRequired
        }));
        
        console.log('🔍 Webflow schema check - COMPLETE FIELD LIST:');
        console.log('📋 Total fields:', (schema.fields || []).length);
        console.log('📋 All field slugs:', allFieldSlugs);
        console.log('📋 All fields detailed:', JSON.stringify(allFieldsDetailed, null, 2));
        console.log('🔍 Webflow schema check:', {
          totalFieldsInSchema: (schema.fields || []).length,
          allowedFields: Array.from(allowed),
          fieldsBeforeFilter: Object.keys(fieldData),
          requiredFields: requiredSlugs,
          streamingServiceFieldType: streamingServiceField?.type,
          streamingServiceFieldReference: streamingServiceField?.reference,
          streamingServiceFieldInSchema: !!streamingServiceField,
          streamingServiceFieldSlug: streamingServiceField?.slug,
          streamingServiceFieldDisplayName: streamingServiceField?.displayName,
          thumbFieldType: thumbField?.type,
          thumbFieldInSchema: !!thumbField,
          thumbFieldSlug: thumbField?.slug,
          thumbFieldDisplayName: thumbField?.displayName,
          allFieldSlugs: allFieldSlugs // Log all field slugs to help identify the correct field name
        });
        
        // If streaming service is a reference field, we MUST resolve it to an ID
        // Use the correct field slug from Webflow
        streamingFieldSlug = streamingServiceField?.slug || 'simple-rerfence';
        
        // Now resolve streaming service value to the correct field
        if (streamingServiceValue) {
          const trimmed = streamingServiceValue;
          const resolvedStreamingId = await resolveStreamingServiceIdFromName(trimmed);
          if (resolvedStreamingId) {
            fieldData[streamingFieldSlug] = resolvedStreamingId;
            console.log('✅ Resolved streaming service to ID:', trimmed, '->', resolvedStreamingId);
          } else {
            // If resolution fails, check if it's already an ID
            if (/^[a-f0-9]{24}$/i.test(trimmed)) {
              fieldData[streamingFieldSlug] = trimmed;
              console.log('✅ Using streaming service as ID (looks like ID):', trimmed);
            } else if (streamingServiceField && streamingServiceField.type === 'Reference') {
              // It's a reference field - must be an ID, but we can't resolve it
              logger.warn('[webflow] streaming field is a Reference but value cannot be resolved', { field: streamingFieldSlug, value: String(trimmed).slice(0, 200) });
              // Try one more time as last resort
              const lastResortId = await resolveStreamingServiceIdFromName(trimmed).catch(() => null);
              if (lastResortId) {
                fieldData[streamingFieldSlug] = lastResortId;
                console.log('✅ Resolved streaming service ID at last resort:', lastResortId);
              } else {
                // Remove it if we can't resolve it - Webflow won't accept a string for a reference field
                logger.warn('[webflow] cannot resolve Reference field to ID — removing', { field: streamingFieldSlug });
                delete fieldData[streamingFieldSlug];
              }
            } else {
              // It's a plain text field - we can keep the string value
              fieldData[streamingFieldSlug] = trimmed;
              console.log('✅ Streaming service value set in fieldData (plain text):', trimmed);
            }
          }
        } else if (!fieldData[streamingFieldSlug] && (articleData.streaming_service || articleData.platform)) {
          // Final check: Ensure streaming service is in fieldData if it exists in articleData
          const fallbackValue = (articleData.streaming_service || articleData.platform || '').trim();
          if (fallbackValue && !isLikelyUrl(fallbackValue)) {
            const resolvedFallbackId = await resolveStreamingServiceIdFromName(fallbackValue).catch(() => null);
            if (resolvedFallbackId) {
              fieldData[streamingFieldSlug] = resolvedFallbackId;
              console.log('✅ Added streaming service as fallback (resolved to ID):', resolvedFallbackId);
            } else if (!streamingServiceField || streamingServiceField.type !== 'Reference') {
              // Only set as string if it's not a reference field
              fieldData[streamingFieldSlug] = fallbackValue;
              console.log('✅ Added streaming service as fallback (plain text):', fallbackValue);
            }
          }
        }
        
        // Clean up legacy 'streaming-service' field if we're using new slug
        if (streamingFieldSlug !== 'streaming-service' && fieldData['streaming-service']) {
          delete fieldData['streaming-service'];
        }
        
        // If thumb field doesn't exist in schema - but user says it exists in Webflow
        // Keep it anyway - Webflow might accept it even if schema doesn't show it
        if (!thumbField && fieldData['thumb']) {
          logger.warn('[webflow] "thumb" field not in schema — keeping (user-confirmed)');
          // Don't delete - keep it and let Webflow handle validation
        }
        
        const removedFields: string[] = [];
        for (const key of Object.keys(fieldData)) {
          if (!allowed.has(key)) {
            removedFields.push(key);
            // Don't remove streaming service (simple-rerfence) or thumb - user confirms they exist in Webflow
            // Let Webflow handle validation instead of pre-filtering
            const streamingFieldSlug = streamingServiceField?.slug || 'simple-rerfence';
            if (key === streamingFieldSlug || key === 'simple-rerfence' || key === 'simple-reference' || key === 'streaming-service' || key === 'thumb') {
              logger.warn('[webflow] field not in schema — keeping (user-confirmed)', { field: key });
              // Don't delete - keep it
            } else {
              // Remove other fields that don't exist in schema
              delete fieldData[key];
            }
          }
        }
        
        if (removedFields.length > 0) {
          console.log('❌ Removed fields not in Webflow schema:', removedFields.filter(f => f !== 'streaming-service' && f !== 'thumb'));
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

    // Determine if this is an update or create
    const isUpdate = articleData.webflowId && articleData.webflowId !== '';
    const url = isUpdate 
      ? `https://api.webflow.com/v2/sites/${siteId}/collections/${articlesCollectionId}/items/${articleData.webflowId}`
      : `https://api.webflow.com/v2/sites/${siteId}/collections/${articlesCollectionId}/items`;
    const method = isUpdate ? 'PATCH' : 'POST';
    
    console.log(`🔄 ${isUpdate ? 'Updating' : 'Creating'} article in Webflow:`, {
      url,
      method,
      webflowId: articleData.webflowId,
      fieldDataKeys: Object.keys(fieldData),
      streamingService: fieldData['streaming-service'],
      thumb: fieldData['thumb'] ? 'Present' : 'Missing',
      thumbUrl: fieldData['thumb'] ? (typeof fieldData['thumb'] === 'string' ? fieldData['thumb'].substring(0, 100) + '...' : 'Not a string') : 'N/A'
    });

    // Publish to Articles collection
    const publishResponse = await fetch(url, {
      method,
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
      console.log(`✅ Article ${isUpdate ? 'updated' : 'published'} successfully to Webflow`);
      console.log('📊 Final field data sent to Webflow:', {
        streamingService: fieldData['streaming-service'] ? 'Sent' : 'Not sent',
        thumb: fieldData['thumb'] ? 'Sent' : 'Not sent',
        allFields: Object.keys(fieldData)
      });
      return result.id || articleData.webflowId;
    } else {
      let errorData: any = null;
      try { errorData = await publishResponse.json(); } catch { errorData = await publishResponse.text(); }
      logger.error(
        '[webflow] publish error',
        new Error(typeof errorData === 'string' ? errorData : (errorData?.message || 'Webflow publish failed')),
        {
          errorData,
          streamingService: fieldData['streaming-service'],
          thumb: fieldData['thumb'] ? 'Present' : 'Missing',
          fieldKeys: Object.keys(fieldData),
        }
      );
      const msg = typeof errorData === 'string' ? errorData : (errorData?.message || 'Validation Error');
      const more = typeof errorData === 'string' ? '' : (errorData?.details ? ` | ${JSON.stringify(errorData.details)}` : '');
      throw new Error(`Failed to publish to Webflow: ${msg}${more}`);
    }
    
  } catch (error) {
    logger.error('[webflow] error publishing article', error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

async function buildFieldDataFromMapping(articleData: WebflowArticleFields, mapping: WebflowMapping): Promise<Record<string, any>> {
  const data: Record<string, any> = {};
  const getVal = (key: string) => {
    const value = (articleData as any)[key];
    // Backwards-compat: SetupWizard historically wrote `press` only.
    // The canonical Webflow field is `presseakkreditering`; if the canonical
    // value is missing but the legacy `press` is set, fall back to it.
    if (
      key === 'presseakkreditering' &&
      (value === undefined || value === null) &&
      ((articleData as any).press === true || (articleData as any).press === false)
    ) {
      return (articleData as any).press;
    }
    return value;
  };
  
  console.log('🔍 Building field data from mapping:', {
    mappingEntries: mapping.entries.length,
    articleDataKeys: Object.keys(articleData)
  });
  
  for (const entry of mapping.entries) {
    const rawVal = getVal(entry.internal);
    const val = transformValue(rawVal, entry.transform);
    console.log(`🔍 Field mapping: ${entry.internal} -> ${entry.webflowSlug}`, {
      rawValue: rawVal,
      transformedValue: val,
      transform: entry.transform,
      included: val !== undefined
    });
    if (val !== undefined) {
      data[entry.webflowSlug] = val;
    }
  }
  
  // Log streaming service specifically for debugging
  console.log('🔍 Streaming service in articleData:', {
    streaming_service: articleData.streaming_service,
    platform: articleData.platform,
    streaming_service_in_data: data['streaming-service'],
    all_articleData_keys: Object.keys(articleData)
  });
  
  // Ensure streaming_service is mapped if it exists in articleData but not in data
  // Use the correct field slug from Webflow: "simple-rerfence"
  if (!data['simple-rerfence'] && !data['simple-reference'] && (articleData.streaming_service || articleData.platform)) {
    const streamingValue = articleData.streaming_service || articleData.platform;
    if (streamingValue && typeof streamingValue === 'string' && streamingValue.trim() && !isLikelyUrl(streamingValue)) {
      data['simple-rerfence'] = streamingValue.trim();
      console.log('✅ Added streaming_service to data from articleData (simple-rerfence):', streamingValue);
    }
  }
  if (typeof data['watch-now-link'] === 'string') {
    const link = data['watch-now-link'].trim();
    if (!isLikelyUrl(link)) {
      delete data['watch-now-link'];
    } else {
      data['watch-now-link'] = link;
    }
  }
  if (typeof data['video-trailer'] === 'string') {
    const normalized = normalizeYouTubeUrl(data['video-trailer']);
    if (normalized) {
      data['video-trailer'] = normalized;
    } else {
      delete data['video-trailer'];
    }
  }
  // Special handling for image field - ensure it's included if available
  // Webflow Image fields accept URLs directly, but they must be publicly accessible
  // The image URL should be a publicly accessible URL - Webflow will download it
  // NOTE: Webflow does NOT accept data URLs (data:image/...) - must be HTTP/HTTPS URLs
  if (articleData.featuredImage) {
    let imageUrl = articleData.featuredImage.trim();
    console.log('🖼️ Featured image check:', {
      hasImage: !!imageUrl,
      imageLength: imageUrl?.length || 0,
      imagePreview: imageUrl?.substring(0, 100) || 'N/A',
      isDataUrl: imageUrl?.startsWith('data:image/'),
      isHttpUrl: isLikelyUrl(imageUrl),
      alreadyInData: !!data['thumb']
    });
    
    if (imageUrl) {
      // Check if it's a data URL (base64) - Webflow doesn't accept these
      // NOTE: /api/process-image should be updated to return HTTP URLs instead of data URLs
      // For now, we skip data URLs - they need to be uploaded to Firebase Storage first
      // TODO: Fix /api/process-image to upload to Firebase Storage and return HTTP URL
      if (imageUrl.startsWith('data:image/')) {
        logger.warn('[webflow] featured image is data URL — skipping (Webflow requires HTTP/HTTPS, fix /api/process-image)');
        // Don't add to data - Webflow will reject it anyway
      } else if (isLikelyUrl(imageUrl)) {
        // Use 'thumb' as the slug (from mapping.json) - this should match Webflow field slug
        // Always set thumb if we have a valid HTTP URL (even if mapping already set it, use the direct value)
        data['thumb'] = imageUrl;
        console.log('🖼️ Added featured image URL to field data (thumb):', imageUrl.substring(0, 100) + '...');
      } else {
        logger.warn('[webflow] featured image URL is not valid HTTP/HTTPS', { imageUrl: imageUrl.substring(0, 100) });
      }
    }
  } else {
    console.log('⚠️ No featured image in articleData');
  }
  
  // Defaults/fallbacks
  if (!data['publish-date']) data['publish-date'] = articleData.publishDate || new Date().toISOString();
  if (!data['seo-title'] && articleData.title) data['seo-title'] = articleData.title;
  if (!data['meta-description']) data['meta-description'] = articleData.seoDescription || articleData.excerpt || '';
  if (!data['seo-description']) data['seo-description'] = data['meta-description'] || articleData.seoDescription || articleData.excerpt || '';
  if (data['status'] === undefined) data['status'] = articleData.status || 'draft';
  
  // Log final field data for debugging
  console.log('🔍 Final field data keys:', Object.keys(data));
  console.log('🔍 Final field data values:', {
    'streaming-service': data['simple-rerfence'] || data['streaming-service'],
    'thumb': data['thumb'] ? 'Present' : 'Missing',
    'thumb-value': data['thumb'] ? (typeof data['thumb'] === 'string' ? data['thumb'].substring(0, 100) + '...' : typeof data['thumb']) : 'N/A',
    'thumb-length': data['thumb'] ? (typeof data['thumb'] === 'string' ? data['thumb'].length : 0) : 0,
    'featuredImage-in-articleData': !!articleData.featuredImage,
    'featuredImage-preview': articleData.featuredImage ? articleData.featuredImage.substring(0, 100) + '...' : 'N/A',
    'featuredImage-isDataUrl': articleData.featuredImage ? articleData.featuredImage.startsWith('data:image/') : false,
    'featuredImage-isHttpUrl': articleData.featuredImage ? isLikelyUrl(articleData.featuredImage) : false
  });
  
  // Final check: Ensure thumb is set if featuredImage exists and is an HTTP URL
  if (!data['thumb'] && articleData.featuredImage) {
    const imageUrl = articleData.featuredImage.trim();
    if (isLikelyUrl(imageUrl)) {
      data['thumb'] = imageUrl;
      console.log('✅ Added thumb as final fallback (HTTP URL):', imageUrl.substring(0, 100) + '...');
    } else if (!imageUrl.startsWith('data:image/')) {
      logger.warn('[webflow] featuredImage exists but is neither HTTP URL nor data URL', { imageUrl: imageUrl.substring(0, 100) });
    }
  }

  return data;
}

// transformValue / isLikelyUrl / extractFirstYouTubeUrl / normalizeYouTubeUrl
// flyttet til `lib/webflow/field-mapping.ts` (importeret øverst).

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
