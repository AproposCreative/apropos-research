import { OAuthError } from './oauth';
import { PRIVATE_HEADERS, MCP_ORIGIN, OAUTH_COOKIE } from './config';
export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: PRIVATE_HEADERS });
export async function smallBody(request: Request, max = 8000) {
  const reader = request.body?.getReader(); if (!reader) throw new OAuthError('invalid_request');
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const chunk = await reader.read(); if (chunk.done) break;
    size += chunk.value.length; if (size > max) throw new OAuthError('request_too_large', 413); chunks.push(chunk.value);
  } } finally { await reader.cancel(); }
  return Buffer.concat(chunks).toString('utf8');
}
export const oauthFailure = (error: unknown) => json({ error: error instanceof OAuthError ? error.code : 'invalid_request' }, error instanceof OAuthError ? error.status : 400);
export const browserSecret = (request: Request) => request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(`${OAUTH_COOKIE}=`))?.split('=')[1] || '';
export function sameOrigin(request: Request) {
  if (request.headers.get('origin') !== MCP_ORIGIN && !(process.env.NODE_ENV !== 'production' && request.headers.get('origin') === new URL(request.url).origin)) {
    throw new OAuthError('access_denied', 403);
  }
}
