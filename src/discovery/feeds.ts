import { XMLParser } from "fast-xml-parser";
import { env } from "../utils/env";
import { fetchText } from "../fetch/fetch";

export type FeedItem = { url: string; published_at?: string; source: string };

export async function discoverFromFeed(): Promise<FeedItem[]> {
  const sources = [
    { baseUrl: env.RAGE_BASE_URL, feedPath: '/feed', source: 'soundvenue' }
  ];

  const allItems: FeedItem[] = [];

  for (const { baseUrl, feedPath, source } of sources) {
    try {
      const url = new URL(feedPath, baseUrl).toString();
      const { text, contentType, status } = await fetchText(url);
      
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


