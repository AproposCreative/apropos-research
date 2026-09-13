import { getAdminDb } from './firebase-admin';

export interface MediaSource {
  id: string;
  name: string;
  baseUrl: string;
  sitemapIndex: string;
  enabled: boolean;
  userId?: string;
}

const DEFAULT_MEDIA_SOURCES: MediaSource[] = [
  { id: 'soundvenue', name: 'Soundvenue', baseUrl: 'https://soundvenue.com', sitemapIndex: '/sitemap.xml', enabled: true },
  { id: 'gaffa', name: 'GAFFA', baseUrl: 'https://gaffa.dk', sitemapIndex: '/sitemap', enabled: true },
  { id: 'berlingske', name: 'BERLINGSKE', baseUrl: 'https://www.berlingske.dk', sitemapIndex: '/news-sitemap.xml', enabled: true },
  { id: 'bt', name: 'BT', baseUrl: 'https://www.bt.dk', sitemapIndex: '/news-sitemap.xml', enabled: true },
];

export function getDefaultMediaSources(): MediaSource[] {
  return DEFAULT_MEDIA_SOURCES;
}

/**
 * System ingestion reads only explicitly configured shared sources.
 * Personal collections are never promoted into the shared research corpus.
 */
export async function getAllEnabledMediaSources(): Promise<MediaSource[]> {
  const db = getAdminDb();
  if (!db) throw new Error('shared_media_sources_unavailable');

  try {
    const snap = await db.collection('sharedMediaSources').where('enabled', '==', true).get();

    const seen = new Map<string, MediaSource>();
    snap.docs.forEach(d => {
      const data = { ...d.data(), id: d.id } as MediaSource;
      if (data.enabled !== true || data.userId || !data.name || !data.baseUrl || !data.sitemapIndex) return;
      const key = data.baseUrl;
      if (!seen.has(key)) {
        seen.set(key, data);
      }
    });
    return Array.from(seen.values());
  } catch (error) {
    throw new Error('shared_media_sources_unavailable');
  }
}

/** @deprecated Use getAllEnabledMediaSources() for server-side code */
export function getMediaSources(): MediaSource[] {
  return DEFAULT_MEDIA_SOURCES;
}
