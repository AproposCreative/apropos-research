import { XMLParser } from "fast-xml-parser";
import { env } from "../utils/env";
import { fetchText } from "../fetch/fetch";
import { getMediaSources } from "../../lib/getMediaSources";

export type FeedItem = { url: string; published_at?: string; source: string };

export async function discoverFromFeed(): Promise<FeedItem[]> {
  // Get dynamic media sources
  let sources = getMediaSources();
  
  // Filter for sources that have RSS/feed paths
  sources = sources.filter(source => {
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
      
      if (!contentType || !contentType.includes("xml")) {
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


