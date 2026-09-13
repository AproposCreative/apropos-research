/** Shared UI policy; the server derives owner status from the verified account. */
export const OWNER_EMAIL = 'frederik@aproposmagazine.com';
export const OWNER_APPS = ['seo-engine', 'podcast', 'newsletter', 'liv-inbox', 'push-desk'] as const;
export type EditorialCapabilities = { owner: boolean };
export const NO_CAPABILITIES: EditorialCapabilities = { owner: false };
export function isOwnerView(view: string | null): boolean {
  return ['seo', 'podcast', 'newsletter', 'liv-inbox', 'push'].includes(view || '');
}
export function isOwnerPage(path: string): boolean {
  return ['/ai/seo', '/ai/podcast', '/ai/newsletter', '/ai/liv-inbox', '/ai/push', '/push', '/liv-inbox', '/settings', '/admin'].some(prefix => path === prefix || path.startsWith(`${prefix}/`));
}

export function canOpenEditorialApp(app: string, capabilities: EditorialCapabilities): boolean {
  return capabilities.owner || !OWNER_APPS.some(id => id === app);
}

/** Applies only after authentication. Public feeds and signed service calls retain
 * their separate middleware handling. Segment boundaries avoid prefix collisions. */
export function requiresEditorialOwner(path: string, method: string): boolean {
  const trees = ['/api/seo', '/api/seo-engine', '/api/podcast', '/api/newsletter',
    '/api/liv-inbox', '/api/push', '/api/push-desk', '/api/admin', '/api/editorial/operations',
    '/api/ai-cost'];
  if (trees.some(prefix => path === prefix || path.startsWith(`${prefix}/`))) return true;
  if (path.endsWith('/settings') || path.endsWith('/control')) return true;
  if (path.startsWith('/api/cron/') || path.startsWith('/api/internal/') || path.startsWith('/api/test-')) return true;
  if (path === '/api/liv/delivery/feed') return !['GET', 'HEAD'].includes(method);
  if (path.startsWith('/api/liv/')) return !['GET', 'HEAD'].includes(method);
  return false;
}
