import { mcpRequestAccess, oauthRateLimit, OAuthError } from '@/lib/mcp/oauth';
import { PRIVATE_HEADERS } from '@/lib/mcp/config';
import { sameOrigin } from '@/lib/mcp/http';
import { withoutPaidAi } from '@/lib/ai/no-paid-calls';
import { EXISTING_COVER_AUTHORIZATION as permit } from '@/lib/editorial/existing-cover-authorization';
import { stageExistingCover } from '@/lib/editorial/stage-existing-cover';
export const maxDuration = 120;
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: PRIVATE_HEADERS });
/** One exact historical file. No approve, send, publish or generic upload mode. */
export async function POST(req: Request) {
  const access = await mcpRequestAccess(req);
  if (!access?.owner || access.uid !== permit.uid) return json({ error: 'unauthorized' }, 403);
  try {
    sameOrigin(req);
    await oauthRateLimit(`existing-cover-${access.uid}`, 10);
    const revision = Number(req.headers.get('x-submission-revision'));
    if (!Number.isSafeInteger(revision) || revision < 1 || req.headers.get('content-type') !== 'image/png')
      return json({ error: 'invalid_request' }, 400);
    const reader = req.body?.getReader();
    if (!reader) return json({ error: 'invalid_request' }, 400);
    const chunks: Uint8Array[] = []; let count = 0;
    try { for (;;) { const part = await reader.read(); if (part.done) break;
      count += part.value.length;
      if (count > permit.byteCount) return json({ error: 'request_too_large' }, 413);
      chunks.push(part.value);
    } } finally { await reader.cancel(); }
    return json(await withoutPaidAi(() => stageExistingCover(access.uid, revision, Buffer.concat(chunks))));
  } catch (error) {
    if (error instanceof OAuthError) return json({ error: error.code }, error.status);
    const code = error instanceof Error && /^mcp_submission_[a-z_]+$/.test(error.message) ? error.message : 'invalid_request';
    return json({ error: code }, 400);
  }
}
