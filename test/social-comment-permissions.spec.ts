import { afterEach, expect, it, vi } from 'vitest';
import { runInstagramTokenDiagnostics } from '@/lib/meta/instagram-token-diagnostics';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function setup(scopes: string[], targets?: string[]) {
  vi.stubEnv('META_APP_ID', 'app'); vi.stubEnv('META_APP_SECRET', 'secret');
  vi.stubEnv('INSTAGRAM_ACCOUNT_ID', 'ig'); vi.stubEnv('FACEBOOK_PAGE_ID', 'page');
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    expect(!init?.method || init.method === 'GET').toBe(true);
    if (url.includes('/debug_token?')) return Response.json({ data: { is_valid: true, type: 'PAGE', expires_at: 0, scopes,
      ...(targets ? { granular_scopes: [{ scope: 'pages_manage_engagement', target_ids: targets }] } : {}) } });
    if (url.includes('/ig?')) return Response.json({ id: 'ig', username: 'apropos' });
    if (url.includes('/page?')) return Response.json({ id: 'page', name: 'Apropos' });
    throw Error('Unexpected endpoint');
  }); vi.stubGlobal('fetch', fetch); return fetch;
}
it('distinguishes a working posting connection from missing Facebook comment permission', async () => {
  const fetch = setup(['instagram_basic', 'instagram_content_publish', 'pages_read_engagement', 'pages_manage_posts']);
  const result = await runInstagramTokenDiagnostics('page-token');
  expect(result.ok).toBe(true); expect(result.facebookOk).toBe(true);
  expect(result.facebookCommentsReady).toBe(false);
  expect(result.primaryAction).toContain('pages_manage_engagement');
  expect(result.debug?.missingScopes).toContain('pages_manage_engagement');
  expect(fetch).toHaveBeenCalledTimes(3);
});
it('recognizes comment permission for the actual Page and keeps the existing token flow', async () => {
  setup(['pages_manage_engagement'], ['page']);
  const result = await runInstagramTokenDiagnostics('page-token');
  expect(result.facebookCommentsReady).toBe(true); expect(result.primaryAction).toBeNull();
});
it('does not claim access when permission only covers another Page', async () => {
  setup(['pages_manage_engagement'], ['another-page']);
  expect((await runInstagramTokenDiagnostics('page-token')).facebookCommentsReady).toBe(false);
});
