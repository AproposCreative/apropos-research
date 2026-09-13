import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { sourceUrl, isPublicSourceAddress } from '@/lib/factcheck/source-reader';

const MAX_BYTES = 1_000_000;
export function mediaSourceUrl(base: string, path: string): URL {
  if (typeof base !== 'string' || typeof path !== 'string' || base.length > 2048 || path.length > 2048) throw new Error('Ugyldig kildeadresse.');
  return sourceUrl(new URL(path, sourceUrl(base)).href);
}

/** Public HTTPS only, DNS pinned per hop, no cookies/credentials, three redirects. */
export async function downloadMediaXml(value: string, signal: AbortSignal, redirects = 0): Promise<{ text: string; url: string }> {
  signal.throwIfAborted();
  const url = sourceUrl(value);
  let abort: (() => void) | undefined;
  const addresses = await Promise.race([
    lookup(url.hostname, { all: true, family: 4 }),
    new Promise<never>((_, reject) => { abort = () => reject(new Error('Kildetjek tog for lang tid.')); signal.addEventListener('abort', abort, { once: true }); }),
  ]).finally(() => { if (abort) signal.removeEventListener('abort', abort); });
  signal.throwIfAborted();
  if (!addresses.length || addresses.some(({ address }) => !isPublicSourceAddress(address))) throw new Error('Intern netværksadresse er ikke tilladt.');
  const result = await new Promise<{ text?: string; location?: string }>((resolve, reject) => {
    const req = request(url, { signal, agent: false, family: 4,
      lookup: (_host, _options, callback) => callback(null, addresses[0].address, 4),
      headers: { 'User-Agent': 'AproposMediaSources/1.0', Accept: 'application/xml,text/xml,application/rss+xml,application/atom+xml', 'Accept-Encoding': 'identity' },
    }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode || 0)) {
        const location = response.headers.location; response.destroy();
        if (!location || redirects >= 3) reject(new Error('For mange eller ugyldige viderestillinger.'));
        else resolve({ location });
        return;
      }
      if (response.statusCode !== 200 || (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') ||
        !/^(?:application\/(?:xml|rss\+xml|atom\+xml)|text\/xml)(?:;|$)/i.test(response.headers['content-type'] || '')) {
        response.destroy(); reject(new Error('Adressen returnerede ikke et XML-feed eller sitemap.')); return;
      }
      let bytes = 0; const chunks: Buffer[] = [];
      response.on('error', reject);
      response.on('aborted', () => reject(new Error('Kildens svar blev afbrudt.')));
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) { response.destroy(new Error('Feed eller sitemap er større end 1 MB.')); return; }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({ text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject); req.end();
  });
  return result.location ? downloadMediaXml(new URL(result.location, url).href, signal, redirects + 1) : { text: result.text!, url: url.href };
}

const list = (value: unknown): any[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
export function parseMediaXml(text: string): { kind: 'rss' | 'atom' | 'sitemap' | 'index'; links: string[] } {
  if (Buffer.byteLength(text) > MAX_BYTES || /<!DOCTYPE|<!ENTITY/i.test(text) || XMLValidator.validate(text) !== true) throw new Error('Ugyldigt eller for stort XML.');
  const xml = new XMLParser({ ignoreAttributes: false, processEntities: false, parseTagValue: false }).parse(text);
  let kind: 'rss' | 'atom' | 'sitemap' | 'index'; let links: unknown[];
  if (xml.rss?.channel !== undefined) { kind = 'rss'; links = list(xml.rss.channel.item).map(item => item.link); }
  else if (xml.feed !== undefined) { kind = 'atom'; links = list(xml.feed.entry).map(entry => list(entry.link).find(link => !link['@_rel'] || link['@_rel'] === 'alternate')?.['@_href']); }
  else if (xml.urlset !== undefined) { kind = 'sitemap'; links = list(xml.urlset.url).map(item => item.loc); }
  else if (xml.sitemapindex !== undefined) { kind = 'index'; links = list(xml.sitemapindex.sitemap).map(item => item.loc); }
  else throw new Error('XML indeholder ikke RSS, Atom eller sitemap.');
  return { kind, links: [...new Set(links.filter((link): link is string => typeof link === 'string').map(link => link.trim()).filter(Boolean))].slice(0, 1000) };
}

/** At most five XML documents and one total deadline. Counts URLs, not verified articles. */
export async function validateMediaSource(base: string, path: string,
  download = downloadMediaXml) {
  const signal = AbortSignal.timeout(20_000);
  const pending = [mediaSourceUrl(base, path).href]; const visited = new Set<string>(); const urls = new Set<string>();
  let finalUrl = pending[0]; let kind = ''; let partial = false;
  while (pending.length && visited.size < 5) {
    const url = pending.shift()!; if (visited.has(url)) continue; visited.add(url);
    const result = await download(url, signal); finalUrl = result.url;
    const parsed = parseMediaXml(result.text); if (!kind) kind = parsed.kind;
    for (const link of parsed.links) {
      let safe: string;
      try { safe = sourceUrl(link).href; } catch { continue; }
      if (parsed.kind === 'index') { if (!visited.has(safe)) pending.push(safe); }
      else urls.add(safe);
    }
    if (parsed.links.length === 1000) partial = true;
  }
  partial ||= pending.length > 0;
  return { sitemapAccessible: true, hasArticles: urls.size > 0, articleCount: urls.size,
    urlCount: urls.size, kind, checkedAt: new Date().toISOString(), finalUrl, partial,
    sampleUrls: [...urls].slice(0, 5), warning: 'Antallet er fundne links, ikke verificerede artikler.' + (partial ? ' Kun et begrænset udsnit er undersøgt.' : '') };
}
