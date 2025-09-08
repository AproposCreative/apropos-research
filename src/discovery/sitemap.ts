import { XMLParser } from "fast-xml-parser";
import { env } from "../utils/env";
import { fetchText } from "../fetch/fetch";

export async function discoverFromSitemaps(): Promise<string[]> {
  const indexUrl = new URL(env.RAGE_SITEMAP_INDEX, env.RAGE_BASE_URL).toString();
  const { text, contentType } = await fetchText(indexUrl);
  if (!contentType || !contentType.includes("xml")) return [];
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const xml = parser.parse(text);
  const sitemaps: string[] = [];
  const sitemapIndex = xml?.sitemapindex?.sitemap ?? [];
  for (const sm of sitemapIndex) {
    const loc: string | undefined = sm?.loc;
    if (loc) sitemaps.push(loc);
  }

  const urls: string[] = [];
  for (const smUrl of sitemaps) {
    const { text: smText, contentType: ct } = await fetchText(smUrl);
    if (!ct || !ct.includes("xml")) continue;
    const smXml = parser.parse(smText);
    const urlset = smXml?.urlset?.url ?? [];
    for (const u of urlset) {
      const loc: string | undefined = u?.loc;
      if (loc) urls.push(loc);
    }
  }
  return urls;
}


