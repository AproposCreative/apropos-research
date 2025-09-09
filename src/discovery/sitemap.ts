import { XMLParser } from "fast-xml-parser";
import { env } from "../utils/env";
import { fetchText } from "../fetch/fetch";

export async function discoverFromSitemaps(): Promise<string[]> {
  const sources = [
    { baseUrl: env.RAGE_BASE_URL, sitemapIndex: env.RAGE_SITEMAP_INDEX },
    { baseUrl: 'https://gaffa.dk', sitemapIndex: '/sitemap' },
    { baseUrl: 'https://www.berlingske.dk', sitemapIndex: '/sitemap.xml/news' },
    { baseUrl: 'https://www.bt.dk', sitemapIndex: '/sitemap.xml/news' }
  ];

  const allUrls: string[] = [];

  for (const { baseUrl, sitemapIndex } of sources) {
    try {
      const indexUrl = new URL(sitemapIndex, baseUrl).toString();
      const { text, contentType } = await fetchText(indexUrl);
      
      if (!contentType || !contentType.includes("xml")) {
        console.log(`Skipping ${baseUrl}: not XML content`);
        continue;
      }

      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
      const xml = parser.parse(text);
      
      // Handle both sitemap index and direct sitemap
      let sitemaps: string[] = [];
      
      if (xml?.sitemapindex?.sitemap) {
        // Sitemap index
        const sitemapIndex = xml?.sitemapindex?.sitemap ?? [];
        for (const sm of sitemapIndex) {
          const loc: string | undefined = sm?.loc;
          if (loc) sitemaps.push(loc);
        }
      } else if (xml?.urlset?.url) {
        // Direct sitemap
        sitemaps = [indexUrl];
      }

      for (const smUrl of sitemaps) {
        const { text: smText, contentType: ct } = await fetchText(smUrl);
        if (!ct || !ct.includes("xml")) continue;
        const smXml = parser.parse(smText);
        const urlset = smXml?.urlset?.url ?? [];
        for (const u of urlset) {
          const loc: string | undefined = u?.loc;
          if (loc) allUrls.push(loc);
        }
      }
      
      console.log(`Found ${sitemaps.length} sitemaps from ${baseUrl}`);
    } catch (error) {
      console.error(`Error fetching sitemaps from ${baseUrl}:`, error);
    }
  }

  return allUrls;
}


