import { XMLParser } from "fast-xml-parser";
import { env } from "../utils/env";
import { fetchText } from "../fetch/fetch";

export type FeedItem = { url: string; published_at?: string };

export async function discoverFromFeed(): Promise<FeedItem[]> {
  const url = new URL(env.RAGE_FEED_PATH, env.RAGE_BASE_URL).toString();
  const { text, contentType } = await fetchText(url);
  if (!contentType || !contentType.includes("xml")) {
    return [];
  }
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const xml = parser.parse(text);
  // Try RSS 2.0
  const items = xml?.rss?.channel?.item ?? [];
  const out: FeedItem[] = [];
  for (const it of items) {
    const link: string | undefined = it?.link ?? it?.guid?.["#text"]; 
    if (!link) continue;
    const pub = it?.pubDate ?? it?.published ?? undefined;
    out.push({ url: link, published_at: pub });
  }
  return out;
}


