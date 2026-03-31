import { getAdminDb } from './firebase-admin';

interface MediaSource {
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
  { id: 'berlingske', name: 'BERLINGSKE', baseUrl: 'https://www.berlingske.dk', sitemapIndex: '/sitemap.xml/news', enabled: true },
  { id: 'bt', name: 'BT', baseUrl: 'https://www.bt.dk', sitemapIndex: '/sitemap.xml/news', enabled: true },
];

export function getDefaultMediaSources(): MediaSource[] {
  return DEFAULT_MEDIA_SOURCES;
}

/**
 * Fetches all enabled media sources across all users (for cron/system usage).
 * Falls back to defaults if Firestore is unavailable.
 */
export async function getAllEnabledMediaSources(): Promise<MediaSource[]> {
  const db = getAdminDb();
  if (!db) return DEFAULT_MEDIA_SOURCES;

  try {
    const snap = await db.collection('mediaSources').where('enabled', '==', true).get();
    if (snap.empty) return DEFAULT_MEDIA_SOURCES;

    const seen = new Map<string, MediaSource>();
    snap.docs.forEach(d => {
      const data = d.data() as MediaSource;
      const key = data.baseUrl;
      if (!seen.has(key)) {
        seen.set(key, data);
      }
    });
    return Array.from(seen.values());
  } catch (error) {
    console.error('Error loading media sources from Firestore:', error);
    return DEFAULT_MEDIA_SOURCES;
  }
}

/** @deprecated Use getAllEnabledMediaSources() for server-side code */
export function getMediaSources(): MediaSource[] {
  return DEFAULT_MEDIA_SOURCES;
}
