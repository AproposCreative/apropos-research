import { EventEmitter } from 'node:events';
import { beforeEach, describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }));
vi.mock('node:https', () => ({ request: mocks.request }));
import { readPublicMedia } from '@/lib/liv/public-media-reader';
import { extractCandidateImagesFromHtml, fetchOfficialImagesFromPage } from '@/lib/liv/fetch-official-images';

function reply(status: number, headers: Record<string, string>, chunks: Buffer[] = []) {
  mocks.request.mockImplementation((_url, _opts, callback) => {
    const req = new EventEmitter() as EventEmitter & { end: () => void };
    req.end = () => {
      const response = Object.assign(new EventEmitter(), { statusCode: status, headers, destroy: (error?: Error) => { if (error) response.emit('error', error); } });
      callback(response); for (const chunk of chunks) response.emit('data', chunk); response.emit('end');
    };
    return req;
  });
}
beforeEach(() => { vi.resetAllMocks(); mocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]); });
describe('Liv public media transport', () => {
  it.each(['http://example.com/a', 'https://127.0.0.1/a', 'https://internal.local/a', 'https://user:pass@example.com/a', 'https://example.com/a?api_key=test'])('blocks unsafe URL %s before network', async url => {
    await expect(readPublicMedia(url, 'image')).rejects.toThrow(); expect(mocks.lookup).not.toHaveBeenCalled(); expect(mocks.request).not.toHaveBeenCalled();
  });
  it('rejects mixed DNS results and never follows a redirect', async () => {
    mocks.lookup.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }]);
    await expect(readPublicMedia('https://example.com/a', 'image')).rejects.toThrow('address_blocked');
    expect(mocks.request).not.toHaveBeenCalled(); reply(302, { location: 'https://internal.local/a' });
    await expect(readPublicMedia('https://example.com/a', 'image')).rejects.toThrow('response_rejected'); expect(mocks.request).toHaveBeenCalledTimes(1);
  });
  it.each([{ 'content-type': 'image/svg+xml' }, { 'content-type': 'text/html' }, { 'content-type': 'image/png', 'content-encoding': 'gzip' }, { 'content-type': 'image/png', 'content-length': String(25 * 1024 * 1024) }])('rejects unsafe image responses %j', async headers => {
    reply(200, headers); await expect(readPublicMedia('https://example.com/a', 'image')).rejects.toThrow();
  });
  it('bounds streamed bytes without trusting Content-Length', async () => {
    reply(200, { 'content-type': 'image/png' }, [Buffer.alloc(24 * 1024 * 1024), Buffer.from('x')]);
    await expect(readPublicMedia('https://example.com/a', 'image')).rejects.toThrow('too_large');
    reply(200, { 'content-type': 'text/html' }, [Buffer.alloc(1_000_001)]);
    await expect(readPublicMedia('https://example.com/a', 'html')).rejects.toThrow('too_large');
  });
  it('allows bounded larger Tudum articles without relaxing other HTML limits', async () => {
    reply(200, { 'content-type': 'text/html' }, [Buffer.alloc(1_100_000)]);
    expect((await readPublicMedia('https://www.netflix.com/tudum/articles/the-gentlemen', 'html')).length).toBe(1_100_000);
    for (const url of ['https://www.netflix.com/browse', 'https://evil.netflix.com/tudum/articles/the-gentlemen']) {
      await expect(readPublicMedia(url, 'html')).rejects.toThrow('too_large');
    }
    reply(200, { 'content-type': 'text/html' }, [Buffer.alloc(4 * 1024 * 1024 + 1)]);
    await expect(readPublicMedia('https://www.netflix.com/tudum/articles/the-gentlemen', 'html')).rejects.toThrow('too_large');
    reply(200, { 'content-type': 'text/html', 'content-length': String(4 * 1024 * 1024 + 1) });
    await expect(readPublicMedia('https://www.netflix.com/tudum/articles/the-gentlemen', 'html')).rejects.toThrow('response_rejected');
  });
  it('pins DNS, omits app headers and uses the same safe transport for source pages', async () => {
    reply(200, { 'content-type': 'text/html' }, [Buffer.from('<meta property="og:image" content="/hero.webp">')]);
    expect(await fetchOfficialImagesFromPage('https://museum.dk/article')).toEqual(['https://museum.dk/hero.webp']);
    const opts = mocks.request.mock.calls[0][1]; const cb = vi.fn(); opts.lookup('museum.dk', {}, cb);
    expect(cb).toHaveBeenCalledWith(null, '93.184.216.34', 4); expect(opts.headers.Authorization).toBeUndefined(); expect(opts.headers.Cookie).toBeUndefined(); expect(opts.agent).toBe(false);
  });
  it('excludes scripts, data URLs and private IPs from extracted suggestions', () => {
    const html = ['javascript:alert(1)', 'data:image/png;base64,a', 'https://127.0.0.1/a', '/good.png'].map(url => `<meta property="og:image" content="${url}">`).join('');
    expect(extractCandidateImagesFromHtml(html, 'https://museum.dk/article')).toEqual(['https://museum.dk/good.png']);
  });
});
