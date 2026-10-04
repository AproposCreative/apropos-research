import { editorialRequestAccess } from '@/lib/editorial-access';
import { readAuthorization, consent, revokeConnections, OAuthError } from '@/lib/mcp/oauth';
import { json, oauthFailure, smallBody, sameOrigin, browserSecret } from '@/lib/mcp/http';
import { MCP_SCOPES } from '@/lib/mcp/config';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const access = await editorialRequestAccess(request); if (!access?.owner) throw new OAuthError('access_denied', 403);
    const row = await readAuthorization(new URL(request.url).searchParams.get('request') || '', browserSecret(request));
    return json({ app: 'ChatGPT', scopes: row.scope, redirectUri: row.redirect_uri });
  } catch (e) { return oauthFailure(e); }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const access = await editorialRequestAccess(request); if (!access?.owner) throw new OAuthError('access_denied', 403);
    const body = JSON.parse(await smallBody(request));
    if (typeof body.allow !== 'boolean') throw new OAuthError('invalid_request');
    return json({ redirect: await consent(body.request, browserSecret(request), access.uid, body.allow) });
  } catch (e) { return oauthFailure(e); }
}
export async function DELETE(request: Request) {
  try { sameOrigin(request); const access = await editorialRequestAccess(request);
    if (!access?.owner) throw new OAuthError('access_denied', 403);
    await revokeConnections(access.uid); return json({ revoked: true, scopes: MCP_SCOPES });
  } catch (e) { return oauthFailure(e); }
}
