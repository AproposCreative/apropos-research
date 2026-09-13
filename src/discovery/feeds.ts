import { XMLParser } from "fast-xml-parser";
import { env } from "../utils/env";
import { downloadMediaXml, parseMediaXml } from "../../lib/media-source-validation";
import { getMediaSources, type MediaSource } from "../../lib/getMediaSources";

export type FeedItem = { url: string; published_at?: string; source: string };

export async function discoverFromFeed(sourceId?: string, configuredSources?: MediaSource[]): Promise<FeedItem[]> {
  const signal = AbortSignal.timeout(20_000);
  let downloads = 0;
  // Get dynamic media sources
  const available = configuredSources ?? getMediaSources();
  let sources = available.filter(s => !sourceId || s.id === sourceId);
  
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
  if (configuredSources === undefined && feedSources.length === 0 && (!sourceId || sourceId === 'soundvenue')) {
    feedSources.push({ baseUrl: env.RAGE_BASE_URL, feedPath: '/feed', source: 'soundvenue' });
  }
  
  // Also add default feed paths for sources that don't have feed in sitemapIndex
  // This ensures we still discover from feeds even if sitemapIndex points to sitemap
  // BUT: For BT and Berlingske, skip feeds (they're general news, not relevant)
  const defaultSources = available.filter(s => {
    if (sourceId && s.id !== sourceId) return false;
    if (!s.enabled) return false;
    // Skip BT and Berlingske - they're general news, not relevant for Apropos
    const publisherId = s.id.toLowerCase();
    if (publisherId.includes('bt') || publisherId.includes('berlingske')) return false;
    return true;
  });
  
  for (const source of defaultSources) {
    if (configuredSources !== undefined) continue; // Explicit configuration, no guessed feed endpoints.
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
    if (configuredSources !== undefined && (downloads >= 20 || signal.aborted)) break;
    try {
      const url = new URL(feedPath, baseUrl).toString();
      
      // Force refresh for feed discovery (no conditional requests)
      let text: string; let contentType: string | null; let status: number;
      if (configuredSources !== undefined) {
        downloads++;
        text = (await downloadMediaXml(url, signal)).text;
        parseMediaXml(text); // Reject malformed XML/DTD before the legacy date parser.
        contentType = 'application/xml'; status = 200;
      } else {
        const response = await fetch(url, { headers: { 'User-Agent': 'Apropos Research Bot 1.0' },
          redirect: 'follow', signal: AbortSignal.timeout(10000) });
        text = await response.text(); contentType = response.headers.get('content-type'); status = response.status;
      }
      
      if (status === 304) {
        continue;
      }
      
      if (!contentType || !(contentType.includes("xml") || contentType.includes("rss"))) {
        continue;
      }

      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
      const xml = parser.parse(text);
      
      // Try RSS 2.0
      const rawItems = xml?.rss?.channel?.item ?? [];
      const items = Array.isArray(rawItems) ? rawItems : [rawItems];
      
      for (const it of items) {
        const link: string | undefined = it?.link ?? it?.guid?.["#text"]; 
        if (typeof link !== 'string' || !link.trim()) continue;
        const pub = it?.pubDate ?? it?.published ?? undefined;
        allItems.push({ url: link.trim(), published_at: pub, source });
      }
      
      console.log(`Found ${items.length} items from ${source}`);
    } catch (error) {
      console.error(`Error fetching from ${source}:`, error);
    }
  }

  return allItems;
}
