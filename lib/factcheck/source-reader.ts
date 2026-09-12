import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';
import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';
import { isLivTudumSource, LIV_TUDUM_HTML_MAX_BYTES } from '@/lib/liv/photo-credit';

export interface RetrievedSource {
  id: string;
  url: string;
  title: string;
  text: string;
  contentHash: string;
  retrievedAt: string;
  publishedAt: string | null;
}

export function sourceUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      isIP(url.hostname) || url.hostname.includes(':') || !url.hostname.includes('.') ||
      /\.(?:localhost|local|internal|test|invalid)$/i.test(url.hostname) || url.hostname.endsWith('.')) {
    throw new Error('Kilden skal have en offentlig HTTPS-adresse uden login.');
  }
  url.hash = '';
  return url;
}

/** Conservative IPv4-only egress. Never connect to a private or reserved address. */
export function isPublicSourceAddress(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    // IANA: 192.0.0/24 (protocol assignments) and 192.0.2/24 (documentation),
    // not all of 192.0/16. Keep the separate 192.168/16 private block intact.
    (a === 192 && (b === 168 || (b === 0 && [0, 2].includes(c)))) ||
    (a === 198 && [18, 19, 51].includes(b)) || (a === 203 && b === 0));
}

async function download(url: URL, signal: AbortSignal): Promise<string> {
  const byteLimit = isLivTudumSource(url.href) ? LIV_TUDUM_HTML_MAX_BYTES : 1_000_000;
  const addresses = await Promise.race([
    lookup(url.hostname, { all: true, family: 4 }),
    new Promise<never>((_, reject) => {
      signal.addEventListener('abort', () => reject(new Error('Kildehentning tog for lang tid.')), { once: true });
    }),
  ]);
  signal.throwIfAborted();
  if (!addresses.length || addresses.some(({ address }) => !isPublicSourceAddress(address))) {
    throw new Error('Kildens netværksadresse er ikke tilladt.');
  }
  // Pin the validated IP. No second DNS lookup, redirects, cookies or app credentials.
  return new Promise((resolve, reject) => {
    const req = request(url, {
      signal, agent: false, family: 4,
      lookup: (_hostname, _options, callback) => callback(null, addresses[0].address, 4),
      headers: { 'User-Agent': 'AproposSourceVerifier/1.0', Accept: 'text/html', 'Accept-Encoding': 'identity' },
    }, response => {
      if (response.statusCode !== 200 || !/^text\/html(?:;|$)/i.test(response.headers['content-type'] || '') ||
          (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity')) {
        response.destroy();
        reject(new Error('Kilden returnerede ikke en direkte HTML-side.'));
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > byteLimit) {
          response.destroy(new Error('Kildesiden er for stor.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      response.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

function publicationDate(raw: string | undefined, now: number): string | null {
  // Schema.org permits a local datetime without timezone. Retain only its
  // explicit calendar date rather than inventing a timezone/time precision.
  if (raw && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(raw)) raw = raw.slice(0, 10);
  if (!raw || !/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/.test(raw)) return null;
  const day = Date.parse(raw.slice(0, 10));
  const time = Date.parse(raw);
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== raw.slice(0, 10) ||
      !Number.isFinite(time) || time > now + 300_000) return null;
  return new Date(time).toISOString();
}

export function parseSourceHtml(url: string, html: string, id: string, now = Date.now()): RetrievedSource {
  const $ = cheerio.load(html);
  const title = $('meta[property="og:title"]').attr('content') || $('title').text();
  const explicitDate = $('meta[property="article:published_time"]').attr('content') ||
    $('meta[name="date"]').attr('content') || $('time[itemprop="datePublished"][datetime]').first().attr('datetime');
  let publishedAt = publicationDate(explicitDate, now);
  if (!explicitDate) {
    const pageIdentity = (value: unknown): string | null => {
      try {
        const candidate = sourceUrl(typeof value === 'string' ? value : '');
        for (const key of [...candidate.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) candidate.searchParams.delete(key);
        candidate.searchParams.sort();
        return `${candidate.origin}${candidate.pathname.replace(/\/$/, '')}${candidate.search}`;
      } catch { return null; }
    };
    const current = pageIdentity(url);
    const dates = new Set<string>();
    const types = new Set(['Article', 'NewsArticle', 'BlogPosting', 'ReportageNewsArticle', 'AnalysisNewsArticle', 'OpinionNewsArticle']);
    $('script[type="application/ld+json"]').slice(0, 20).each((_, element) => {
      const raw = $(element).text();
      if (raw.length > 150000) return;
      try {
        const parsed = JSON.parse(raw);
        const roots = Array.isArray(parsed) ? parsed : [parsed];
        const nodes = roots.flatMap(root => root && Array.isArray(root['@graph']) ? root['@graph'] : [root]).slice(0, 100);
        for (const node of nodes) {
          if (!node || typeof node !== 'object' || ![node['@type']].flat().some(type => types.has(type))) continue;
          const identity = node.url || (typeof node.mainEntityOfPage === 'object' ? node.mainEntityOfPage?.['@id'] : node.mainEntityOfPage) || node['@id'];
          if (!current || pageIdentity(identity) !== current || typeof node.datePublished !== 'string') continue;
          const date = publicationDate(node.datePublished, now);
          if (date) dates.add(date);
        }
      } catch { /* Malformed metadata is not evidence. Never execute scripts. */ }
    });
    if (dates.size === 1) publishedAt = [...dates][0];
  }
  // This news template renders its publication date in the article hero, not
  // metadata. Never infer it from event dates, body prose, scripts or other sites.
  const page = new URL(url);
  if (!explicitDate && /^(www\.)?roskilde-festival\.dk$/.test(page.hostname) && page.pathname.startsWith('/nyheder/')) {
    const dates = $('[class*="article-hero-module"][class*="appearanceText"]')
      .filter((_, el) => !$(el).closest('nav,footer,[hidden],[aria-hidden="true"]').length)
      .map((_, el) => $(el).text().trim()).get().filter(value => /^\d{2}\.\d{2}\.\d{4}$/.test(value));
    const unique = [...new Set(dates)];
    if (unique.length === 1) {
      const [day, month, year] = unique[0].split('.');
      publishedAt = publicationDate(`${year}-${month}-${day}`, now);
    }
  }
  // Article headers carry real headlines, bylines and standfirsts. Only the
  // site's outer navigation header is boilerplate, not the article's header.
  $('header').filter((_, element) => !$(element).closest('article').length).remove();
  $('script,style,noscript,nav,footer,form,iframe,svg,[hidden],[aria-hidden="true"]').remove();
  const tudum = isLivTudumSource(url);
  const tudumContent = $('[data-uia="article-content"][data-sel="article-content"]');
  if (tudum && tudumContent.length !== 1) throw new Error('Ingen entydig Tudum-artikeltekst i kilden.');
  const root = tudum ? tudumContent : $('article').first().length ? $('article').first() : $('main').first();
  if (tudum) root.find('article').remove(); // Related-story cards are not this article's evidence.
  // An archive/navigation page is not silently treated as article evidence.
  if (!root.length) throw new Error('Ingen afgrænset artikeltekst i kilden.');
  root.find('p,h1,h2,h3,li,br').each((_, el) => { $(el).append('\n'); });
  const text = root.text().replace(/\s+/gu, ' ').trim().slice(0, 16_000);
  if (text.length < 200) throw new Error('For lidt kildetekst til faktatjek.');
  return { id, url, title: title.trim().slice(0, 250), text,
    contentHash: createHash('sha256').update(text).digest('hex'),
    retrievedAt: new Date(now).toISOString(), publishedAt };
}

export async function retrieveSource(value: string, id: string): Promise<RetrievedSource> {
  const url = sourceUrl(value);
  const html = await download(url, AbortSignal.timeout(12_000));
  return parseSourceHtml(url.href, html, id);
}
