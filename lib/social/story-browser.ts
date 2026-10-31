import { internalApiHeaders } from '@/lib/api/internal-auth';

export const STORY_LINK_LABEL = 'Læs anmeldelsen';
export function storyBrowserRequested() {
  return process.env.SOCIAL_STORY_DELIVERY === 'business-suite' || !!process.env.SOCIAL_STORY_BROWSER_URL?.trim();
}
export function storyBrowserConfigured() {
  return Boolean(process.env.SOCIAL_STORY_BROWSER_URL?.trim() && process.env.INTERNAL_API_SECRET?.trim());
}
/** A fixed, server configured destination. Never follow a redirect with service auth. */
export async function storyBrowserRequest(path: string, init: RequestInit = {}) {
  const base = new URL(process.env.SOCIAL_STORY_BROWSER_URL || 'https://unconfigured.invalid');
  if (!storyBrowserConfigured() || base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/')
    throw Error('social_story_browser_unavailable');
  return fetch(new URL(path, base), { ...init, headers: internalApiHeaders(), redirect: 'error', cache: 'no-store',
    signal: AbortSignal.timeout(path === '/process' ? 250_000 : 15_000) });
}

export async function dispatchBrowserStory(id: string) {
  // Only the creation winner calls this. A timeout is resolved by GET readback;
  // there is deliberately no transport retry or Graph fallback.
  const response = await storyBrowserRequest('/process', { method: 'POST', body: JSON.stringify({ operationId: id }) });
  if (!response.ok) throw Error('social_story_worker_unconfirmed');
}
