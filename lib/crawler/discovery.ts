import * as cheerio from 'cheerio';
import { XMLParser } from 'fast-xml-parser';
import { normalizeUrl, getOrigin, isSameOrigin, shouldIgnoreUrl } from './url-utils';
import { CrawlOptions } from './types';

export async function discoverLinksFromHtml(
  html: string,
  baseUrl: string,
  options: CrawlOptions
): Promise<string[]> {
  const $ = cheerio.load(html);
  const links: Set<string> = new Set();
  const origin = getOrigin(baseUrl);

  // Find all <a> tags with href
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;

    try {
      const absoluteUrl = new URL(href, baseUrl).toString();
      const normalized = normalizeUrl(absoluteUrl, options.stripTrackingParams);

      if (
        isSameOrigin(normalized, origin, options.includeSubdomains) &&
        !shouldIgnoreUrl(normalized, options.ignorePaths)
      ) {
        links.add(normalized);
      }
    } catch {
      // Invalid URL, skip
    }
  });

  // Find canonical links
  $('link[rel="canonical"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;

    try {
      const absoluteUrl = new URL(href, baseUrl).toString();
      const normalized = normalizeUrl(absoluteUrl, options.stripTrackingParams);

      if (
        isSameOrigin(normalized, origin, options.includeSubdomains) &&
        !shouldIgnoreUrl(normalized, options.ignorePaths)
      ) {
        links.add(normalized);
      }
    } catch {
      // Invalid URL, skip
    }
  });

  return Array.from(links);
}

export async function discoverLinksFromSitemap(
  sitemapUrl: string,
  options: CrawlOptions
): Promise<string[]> {
  try {
    const response = await fetch(sitemapUrl, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return [];
    }

    const xml = await response.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });

    const parsed = parser.parse(xml);
    const links: Set<string> = new Set();
    const origin = getOrigin(sitemapUrl);

    // Handle sitemap index
    if (parsed.sitemapindex) {
      const sitemaps = Array.isArray(parsed.sitemapindex.sitemap)
        ? parsed.sitemapindex.sitemap
        : [parsed.sitemapindex.sitemap];

      for (const sitemap of sitemaps) {
        if (sitemap?.loc) {
          const nestedLinks = await discoverLinksFromSitemap(sitemap.loc, options);
          nestedLinks.forEach(link => links.add(link));
        }
      }
    }

    // Handle urlset
    if (parsed.urlset) {
      const urls = Array.isArray(parsed.urlset.url)
        ? parsed.urlset.url
        : [parsed.urlset.url];

      for (const url of urls) {
        if (url?.loc) {
          const normalized = normalizeUrl(url.loc, options.stripTrackingParams);
          if (
            isSameOrigin(normalized, origin, options.includeSubdomains) &&
            !shouldIgnoreUrl(normalized, options.ignorePaths)
          ) {
            links.add(normalized);
          }
        }
      }
    }

    return Array.from(links);
  } catch (error) {
    console.error('Error fetching sitemap:', error);
    return [];
  }
}

export async function findSitemapUrl(baseUrl: string): Promise<string | null> {
  const sitemapPaths = [
    '/sitemap.xml',
    '/sitemap_index.xml',
    '/sitemap-index.xml',
  ];

  for (const path of sitemapPaths) {
    try {
      const sitemapUrl = new URL(path, baseUrl).toString();
      const response = await fetch(sitemapUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok && response.headers.get('content-type')?.includes('xml')) {
        return sitemapUrl;
      }
    } catch {
      // Continue to next path
    }
  }

  return null;
}
