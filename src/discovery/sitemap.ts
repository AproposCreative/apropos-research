import { XMLParser } from "fast-xml-parser";
import { env } from "../utils/env";
import { fetchText } from "../fetch/fetch";
import { getMediaSources } from "../../lib/getMediaSources";

export async function discoverFromSitemaps(): Promise<string[]> {
  // Load dynamic sources from file system
  let sources = getMediaSources().map(source => ({
    baseUrl: source.baseUrl,
    sitemapIndex: source.sitemapIndex
  }));

  // Fallback to default sources if no dynamic sources found
  if (sources.length === 0) {
    sources = [
      { baseUrl: env.RAGE_BASE_URL, sitemapIndex: env.RAGE_SITEMAP_INDEX },
      { baseUrl: 'https://gaffa.dk', sitemapIndex: '/sitemap' },
      { baseUrl: 'https://www.berlingske.dk', sitemapIndex: '/sitemap.xml/news' },
      { baseUrl: 'https://www.bt.dk', sitemapIndex: '/sitemap.xml/news' }
    ];
  }

  const allUrls: string[] = [];

  for (const { baseUrl, sitemapIndex } of sources) {
    // Handle multiple sitemap paths separated by comma
    const sitemapPaths = sitemapIndex.split(',').map(path => path.trim());
    
    for (const sitemapPath of sitemapPaths) {
      try {
        const indexUrl = new URL(sitemapPath, baseUrl).toString();
        const { text, contentType } = await fetchText(indexUrl);
        
        if (!contentType || !(contentType.includes("xml") || contentType.includes("rss"))) {
          console.log(`Skipping ${baseUrl}${sitemapPath}: not XML/RSS content (got: ${contentType})`);
          continue;
        }
        
        console.log(`Found sitemap at ${baseUrl}${sitemapPath}`);

      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
      const xml = parser.parse(text);
      
      // Handle both sitemap index and direct sitemap
      let sitemaps: string[] = [];
      
      if (xml?.sitemapindex?.sitemap) {
        // Sitemap index
        const sitemapList = xml?.sitemapindex?.sitemap ?? [];
        if (Array.isArray(sitemapList)) {
          for (const sm of sitemapList) {
            const loc: string | undefined = sm?.loc;
            if (loc) sitemaps.push(loc);
          }
        } else if (sitemapList && sitemapList.loc) {
          // Single sitemap (not array)
          sitemaps.push(sitemapList.loc);
        }
      } else if (xml?.urlset?.url) {
        // Direct sitemap
        sitemaps = [indexUrl];
      }

      // Recursive function to handle nested sitemap indexes
      const processSitemap = async (smUrl: string, depth = 0): Promise<void> => {
        if (depth > 3) return; // Prevent infinite recursion
        
        try {
          const { text: smText, contentType: ct } = await fetchText(smUrl);
          if (!ct || !ct.includes("xml")) return;
          
          const smXml = parser.parse(smText);
          
          if (smXml?.sitemapindex?.sitemap) {
            // This is another sitemap index, recurse
            const nestedSitemaps = smXml?.sitemapindex?.sitemap ?? [];
            for (const nestedSm of nestedSitemaps.slice(0, 5)) { // Limit to first 5 to avoid timeout
              const nestedLoc: string | undefined = nestedSm?.loc;
              if (nestedLoc) {
                await processSitemap(nestedLoc, depth + 1);
              }
            }
          } else if (smXml?.urlset?.url) {
            // This is a direct sitemap with URLs
            const urlset = smXml?.urlset?.url ?? [];
            for (const u of urlset) {
              const loc: string | undefined = u?.loc;
              if (loc) allUrls.push(loc);
            }
          }
        } catch (error) {
          console.warn(`Error processing sitemap ${smUrl}:`, error);
        }
      };

        for (const smUrl of sitemaps) {
          await processSitemap(smUrl);
        }
        
        console.log(`Found ${sitemaps.length} sitemaps from ${baseUrl}${sitemapPath}`);
        break; // Stop after finding the first working sitemap
      } catch (error) {
        console.warn(`Error fetching sitemap from ${baseUrl}${sitemapPath}:`, error);
        // Continue to next sitemap path if this one fails
      }
    }
  }

  return allUrls;
}


