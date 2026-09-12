import { EventEmitter } from 'node:events';
import { beforeEach, describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }));
vi.mock('node:https', () => ({ request: mocks.request }));
import { retrieveSource } from '@/lib/factcheck/source-reader';

describe('source reader transport', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  });
  function reply(statusCode: number, headers: Record<string, string>, body = '') {
    mocks.request.mockImplementation((_url, _options, callback) => {
      const req = new EventEmitter() as EventEmitter & { end: () => void };
      req.end = () => {
        const response = new EventEmitter() as EventEmitter & { statusCode: number; headers: Record<string, string>; destroy: (error?: Error) => void };
        response.statusCode = statusCode; response.headers = headers;
        response.destroy = error => { if (error) response.emit('error', error); };
        callback(response);
        response.emit('data', Buffer.from(body));
        response.emit('end');
      };
      return req;
    });
  }
  it('blocks DNS resolution to private addresses without making an HTTPS request', async () => {
    mocks.lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    await expect(retrieveSource('https://museum.dk/article', 's1')).rejects.toThrow('netværksadresse');
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it('rejects mixed public/private DNS answers', async () => {
    mocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }]);
    await expect(retrieveSource('https://museum.dk/article', 's1')).rejects.toThrow();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it('does not follow redirects, even to another public website', async () => {
    reply(302, { location: 'https://other.dk/article' });
    await expect(retrieveSource('https://museum.dk/article', 's1')).rejects.toThrow();
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
  it.each([{ 'content-type': 'application/pdf' }, { 'content-type': 'text/html', 'content-encoding': 'gzip' }])('rejects unsupported response headers %j', async headers => {
    reply(200, headers);
    await expect(retrieveSource('https://museum.dk/article', 's1')).rejects.toThrow();
  });
  it('rejects oversized responses', async () => {
    reply(200, { 'content-type': 'text/html' }, 'x'.repeat(1_000_001));
    await expect(retrieveSource('https://museum.dk/article', 's1')).rejects.toThrow('for stor');
  });
  it('bounds Tudum article HTML at 4 MiB and keeps other pages at 1 MB', async () => {
    const body = `<script>${' '.repeat(1_100_000)}</script><div data-uia="article-content" data-sel="article-content">${'Kulturel baggrund. '.repeat(20)}</div>`;
    reply(200, { 'content-type': 'text/html' }, body);
    expect((await retrieveSource('https://www.netflix.com/tudum/articles/the-gentlemen', 's1')).text).toContain('Kulturel baggrund.');
    await expect(retrieveSource('https://www.netflix.com/browse', 's1')).rejects.toThrow('for stor');
    await expect(retrieveSource('https://evil.netflix.com/tudum/articles/the-gentlemen', 's1')).rejects.toThrow('for stor');
    reply(200, { 'content-type': 'text/html' }, ' '.repeat(4 * 1024 * 1024 + 1));
    await expect(retrieveSource('https://www.netflix.com/tudum/articles/the-gentlemen', 's1')).rejects.toThrow('for stor');
  });
  it('pins the public address and sends no authorization or cookies', async () => {
    reply(200, { 'content-type': 'text/html; charset=utf-8' }, `<article>${'Kulturel baggrund. '.repeat(20)}</article>`);
    const result = await retrieveSource('https://museum.dk/article', 's1');
    expect(result.text).toContain('Kulturel baggrund.');
    const options = mocks.request.mock.calls[0][1];
    expect(options.headers.Authorization).toBeUndefined();
    expect(options.headers.Cookie).toBeUndefined();
    expect(options.agent).toBe(false);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    const callback = vi.fn(); options.lookup('museum.dk', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '93.184.216.34', 4);
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
  });
});
