import { XMLParser } from "fast-xml-parser";
import { env } from "../utils/env";
import { fetchText } from "../fetch/fetch";
import { getMediaSources } from "../../lib/getMediaSources";

export type FeedItem = { url: string; published_at?: string; source: string };

export async function discoverFromFeed(): Promise<FeedItem[]> {
  // Get dynamic media sources
  let sources = getMediaSources();
  
  // Filter for enabled sources and sources that have RSS/feed paths
  sources = sources.filter(source => {
    if (!source.enabled) return false;
    const sitemapPath = source.sitemapIndex.toLowerCase();
    return sitemapPath.includes('feed') || sitemapPath.includes('rss');
  });

  // Convert to feed sources format
  const feedSources = sources.map(source => ({
    baseUrl: source.baseUrl,
    feedPath: source.sitemapIndex,
    source: source.id
  }));

  // Fallback to default Soundvenue feed if no dynamic sources found
  if (feedSources.length === 0) {
    feedSources.push({ baseUrl: env.RAGE_BASE_URL, feedPath: '/feed', source: 'soundvenue' });
  }
  
  // Also add default feed paths for sources that don't have feed in sitemapIndex
  // This ensures we still discover from feeds even if sitemapIndex points to sitemap
  // BUT: For BT and Berlingske, skip feeds (they're general news, not relevant)
  const defaultSources = getMediaSources().filter(s => {
    if (!s.enabled) return false;
    // Skip BT and Berlingske - they're general news, not relevant for Apropos
    const sourceId = s.id.toLowerCase();
    if (sourceId.includes('bt') || sourceId.includes('berlingske')) return false;
    return true;
  });
  
  for (const source of defaultSources) {
    // Skip if already added above
    if (feedSources.some(fs => fs.source === source.id)) continue;
    
    // Try common feed paths
    const commonFeedPaths = ['/feed', '/rss', '/feed.xml', '/rss.xml'];
    for (const feedPath of commonFeedPaths) {
      feedSources.push({ baseUrl: source.baseUrl, feedPath, source: source.id });
    }
  }
  
  // Special handling for Ekkofilm - try their specific feed path
  const ekkofilmSource = defaultSources.find(s => s.id.toLowerCase().includes('ekkofilm'));
  if (ekkofilmSource && !feedSources.some(fs => fs.source === ekkofilmSource.id)) {
    feedSources.push({ baseUrl: ekkofilmSource.baseUrl, feedPath: '/feeds/artikler/', source: ekkofilmSource.id });
  }

  const allItems: FeedItem[] = [];

  for (const { baseUrl, feedPath, source } of feedSources) {
    try {
      const url = new URL(feedPath, baseUrl).toString();
      
      // Force refresh for feed discovery (no conditional requests)
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Apropos Research Bot 1.0' },
        redirect: 'follow'
      });
      const text = await response.text();
      const contentType = response.headers.get('content-type');
      const status = response.status;
      
      if (status === 304) {
        continue;
      }
      
      if (!contentType || !(contentType.includes("xml") || contentType.includes("rss"))) {
        continue;
      }

      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
      const xml = parser.parse(text);
      
      // Try RSS 2.0
      const items = xml?.rss?.channel?.item ?? [];
      
      for (const it of items) {
        const link: string | undefined = it?.link ?? it?.guid?.["#text"]; 
        if (!link) continue;
        const pub = it?.pubDate ?? it?.published ?? undefined;
        allItems.push({ url: link, published_at: pub, source });
      }
      
      console.log(`Found ${items.length} items from ${source}`);
    } catch (error) {
      console.error(`Error fetching from ${source}:`, error);
    }
  }

  return allItems;
}


