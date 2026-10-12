import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { request } from 'node:https';
import { sourceUrl, isPublicSourceAddress } from '@/lib/factcheck/source-reader';
import { isLivTudumSource, LIV_TUDUM_HTML_MAX_BYTES } from './photo-credit';
import { ChatFileError } from '@/lib/editorial/chat-file-error';

/** No credentials, redirects or second DNS lookup. HTML and raster bytes only. */
export async function readPublicMedia(value: string, kind: 'html' | 'image', timeoutMs = 12_000): Promise<Buffer> {
  return (await downloadMedia(value, kind, AbortSignal.timeout(Math.min(15000, Math.max(1000, timeoutMs))), false, 0)).bytes;
}

export type PublicMediaResponse = { bytes: Buffer; finalUrl: string; contentType: string; status: number };
/** Press pages may redirect twice. Every hop gets fresh public-DNS validation
 * and IP pinning, with one deadline and no credentials/cookies on any hop. */
export function readPressMedia(value: string, kind: 'html' | 'image', timeoutMs = 8000): Promise<PublicMediaResponse> {
  return downloadMedia(value, kind, AbortSignal.timeout(Math.min(15000, Math.max(1000, timeoutMs))), false, 2);
}

/** Explicit ChatGPT file input only. Never persist/log this temporary signed URL.
 * Same DNS pinning, no redirects, content-type/byte bounds as public media. */
export async function readChatGptImage(value: string): Promise<Buffer> {
  try { sourceUrl(value); } catch { throw new ChatFileError('mcp_submission_file_reference_invalid'); }
  // Native openai/fileParams supplies a temporary download_url, not a stable
  // vendor hostname. It is untrusted input, not proof of OpenAI provenance.
  // Validate the destination itself (public DNS pinned to one IP, HTTPS only,
  // no redirects/cookies/auth headers), then bound and decode raster bytes.
  // Do not maintain a region list or trust every account on a cloud suffix.
  // https://developers.openai.com/plugins/reference#file-inputs
  try { return (await downloadMedia(value, 'image', AbortSignal.timeout(15000), true, 0)).bytes; }
  catch { throw new ChatFileError('mcp_submission_file_download_failed'); }
}

async function downloadMedia(value: string, kind: 'html' | 'image', signal: AbortSignal, signedFile: boolean, redirects: number): Promise<PublicMediaResponse> {
  const url = sourceUrl(value);
  if (!signedFile && [...url.searchParams.keys()].some(key => /token|secret|password|signature|credential|api.?key/i.test(key))) {
    throw new Error('media_url_contains_credentials');
  }
  signal.throwIfAborted();
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
  const limit = kind === 'html' ? isLivTudumSource(url.href) ? LIV_TUDUM_HTML_MAX_BYTES : 1_000_000 : 24 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const req = request(url, { signal, agent: false, family: 4,
      lookup: (_host, _options, callback) => callback(null, addresses[0].address, 4),
      headers: { 'User-Agent': 'AproposMediaReader/1.0', 'Accept-Encoding': 'identity',
        Accept: kind === 'html' ? 'text/html' : 'image/jpeg,image/png,image/webp' },
    }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode || 0) && redirects > 0 && response.headers.location) {
        response.destroy();
        try { resolve(downloadMedia(new URL(response.headers.location, url).href, kind, signal, signedFile, redirects - 1)); }
        catch { reject(new Error('media_redirect_rejected')); }
        return;
      }
      const contentType = response.headers['content-type'] || '';
      const supported = kind === 'html' ? /^text\/html(?:;|$)/i.test(contentType) :
        /^image\/(?:jpeg|png|webp)(?:;|$)/i.test(contentType) ||
        // Native file stores may serve generic binary. Import still requires
        // successful bounded raster decoding before storage/CMS attachment.
        (signedFile && /^application\/octet-stream(?:;|$)/i.test(contentType));
      if (response.statusCode !== 200 || !supported ||
          (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') ||
          Number(response.headers['content-length'] || 0) > limit) {
        response.destroy(); reject(Object.assign(new Error('media_response_rejected'), { status: response.statusCode || null, finalUrl: url.href, contentType: contentType.slice(0, 100) })); return;
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
      response.on('end', () => resolve({ bytes: Buffer.concat(chunks), finalUrl: url.href, contentType: contentType.split(';')[0].toLowerCase(), status: response.statusCode! }));
    });
    req.on('error', reject); req.end();
  });
}
