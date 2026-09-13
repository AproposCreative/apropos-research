import { beforeEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
const m = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: m.lookup }));
vi.mock('node:https', () => ({ request: m.request }));
import { downloadMediaXml, mediaSourceUrl, parseMediaXml, validateMediaSource } from '@/lib/media-source-validation';
function response(text: string, statusCode = 200, headers: Record<string, string> = { 'content-type': 'application/xml' }) {
  return (_url: unknown, _options: unknown, callback: (response: unknown) => void) => {
    const req = new EventEmitter() as EventEmitter & { end: () => void };
    req.end = () => { const stream = Object.assign(new PassThrough(), { statusCode, headers }); callback(stream); queueMicrotask(() => stream.end(text)); };
    return req;
  };
}
beforeEach(() => { vi.resetAllMocks(); m.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]); m.request.mockImplementation(response('<urlset/>')); });
it.each(['http://public.com/rss', 'https://127.0.0.1/rss', 'https://private.local/rss', 'https://user:pass@public.com/rss'])('rejects unsafe address %s', async url => {
  await expect(downloadMediaXml(url, AbortSignal.timeout(1000))).rejects.toThrow(); expect(m.request).not.toHaveBeenCalled();
});
it('pins public DNS and never includes app credentials in network requests', async () => {
  expect(await downloadMediaXml('https://public.com/rss', AbortSignal.timeout(1000))).toEqual({ text: '<urlset/>', url: 'https://public.com/rss' });
  const options = m.request.mock.calls[0][1]; const callback = vi.fn(); options.lookup('public.com', {}, callback);
  expect(callback).toHaveBeenCalledWith(null, '8.8.8.8', 4);
  expect(options.headers.Authorization).toBeUndefined(); expect(options.headers.Cookie).toBeUndefined();
});
it('rejects private DNS and redirects to local addresses before connecting', async () => {
  m.lookup.mockResolvedValueOnce([{ address: '10.0.0.1', family: 4 }]);
  await expect(downloadMediaXml('https://public.com/rss', AbortSignal.timeout(1000))).rejects.toThrow('Intern'); expect(m.request).not.toHaveBeenCalled();
  m.request.mockImplementationOnce(response('', 302, { location: 'https://127.0.0.1/rss' }));
  await expect(downloadMediaXml('https://public.com/rss', AbortSignal.timeout(1000))).rejects.toThrow(); expect(m.request).toHaveBeenCalledTimes(1);
});
it('bounds response size, MIME type and redirect count', async () => {
  m.request.mockImplementationOnce(response('x'.repeat(1000001)));
  await expect(downloadMediaXml('https://public.com/rss', AbortSignal.timeout(1000))).rejects.toThrow('1 MB');
  m.request.mockImplementationOnce(response('<html/>', 200, { 'content-type': 'text/html' }));
  await expect(downloadMediaXml('https://public.com/rss', AbortSignal.timeout(1000))).rejects.toThrow('XML');
  m.request.mockImplementation(response('', 302, { location: '/again' }));
  await expect(downloadMediaXml('https://public.com/rss', AbortSignal.timeout(1000))).rejects.toThrow('viderestillinger');
});
it('validates XML and excludes DTD/entity declarations', () => {
  for (const xml of ['<rss>', '<html/>', '<!DOCTYPE rss><rss/>', '<!ENTITY a "b"><rss/>']) expect(() => parseMediaXml(xml)).toThrow();
  expect(parseMediaXml('<rss><channel><item><link>https://public.com/a</link></item></channel></rss>')).toEqual({ kind: 'rss', links: ['https://public.com/a'] });
  expect(parseMediaXml('<feed><entry><link href="https://public.com/a"/></entry></feed>')).toEqual({ kind: 'atom', links: ['https://public.com/a'] });
});
it('counts leaf links, not sitemap files, and uses at most five downloads', async () => {
  const download = vi.fn().mockImplementation(async (url: string) => ({ url, text: '<urlset><url><loc>https://public.com/a</loc></url></urlset>' }));
  download.mockResolvedValueOnce({ url: 'https://public.com/index', text: `<sitemapindex>${Array.from({ length: 8 }, (_, i) => `<sitemap><loc>https://public.com/${i}.xml</loc></sitemap>`).join('')}</sitemapindex>` });
  const result = await validateMediaSource('https://public.com', '/index', download);
  expect(download).toHaveBeenCalledTimes(5); expect(result.urlCount).toBe(1); expect(result.partial).toBe(true);
  expect(result.warning).toContain('ikke verificerede artikler');
});
it('does not follow unsafe child sitemap URLs and handles an empty feed honestly', async () => {
  const download = vi.fn().mockResolvedValue({ url: 'https://public.com/index', text: '<sitemapindex><sitemap><loc>https://127.0.0.1/a</loc></sitemap></sitemapindex>' });
  const result = await validateMediaSource('https://public.com', '/index', download);
  expect(download).toHaveBeenCalledTimes(1); expect(result.hasArticles).toBe(false); expect(result.urlCount).toBe(0);
  expect(() => mediaSourceUrl('https://public.com', 'http://private.local')).toThrow();
});
