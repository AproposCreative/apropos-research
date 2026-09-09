import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { request } from 'node:https';
import { sourceUrl, isPublicSourceAddress } from '@/lib/factcheck/source-reader';

/** No credentials, redirects or second DNS lookup. HTML and raster bytes only. */
export async function readPublicMedia(value: string, kind: 'html' | 'image', timeoutMs = 12_000): Promise<Buffer> {
  const url = sourceUrl(value);
  if ([...url.searchParams.keys()].some(key => /token|secret|password|signature|credential|api.?key/i.test(key))) {
    throw new Error('media_url_contains_credentials');
  }
  const signal = AbortSignal.timeout(Math.min(15_000, Math.max(1000, timeoutMs)));
  let abort: () => void = () => {};
  let addresses: LookupAddress[];
  try {
    addresses = await Promise.race([
      lookup(url.hostname, { all: true, family: 4 }),
      new Promise<never>((_, reject) => {
        abort = () => reject(new Error('media_timeout'));
        signal.addEventListener('abort', abort, { once: true });
      }),
    ]);
  } finally { signal.removeEventListener('abort', abort); }
  signal.throwIfAborted();
  if (!addresses.length || addresses.some(({ address }) => !isPublicSourceAddress(address))) throw new Error('media_address_blocked');
  const limit = kind === 'html' ? 1_000_000 : 24 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const req = request(url, { signal, agent: false, family: 4,
      lookup: (_host, _options, callback) => callback(null, addresses[0].address, 4),
      headers: { 'User-Agent': 'AproposMediaReader/1.0', 'Accept-Encoding': 'identity',
        Accept: kind === 'html' ? 'text/html' : 'image/jpeg,image/png,image/webp' },
    }, response => {
      const contentType = response.headers['content-type'] || '';
      const supported = kind === 'html' ? /^text\/html(?:;|$)/i.test(contentType) : /^image\/(?:jpeg|png|webp)(?:;|$)/i.test(contentType);
      if (response.statusCode !== 200 || !supported ||
          (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') ||
          Number(response.headers['content-length'] || 0) > limit) {
        response.destroy(); reject(new Error('media_response_rejected')); return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('error', reject);
      response.on('aborted', () => reject(new Error('media_response_aborted')));
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > limit) { response.destroy(new Error('media_too_large')); return; }
        chunks.push(chunk);
      });
      response.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject); req.end();
  });
}
