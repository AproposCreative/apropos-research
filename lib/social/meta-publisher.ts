import type { SocialPublisher } from './publish-runner';
import { MetaRequestError } from './meta-error';
const GRAPH = 'https://graph.facebook.com/v24.0';
type Config = { instagramId: string; facebookPageId?: string; token: string };
/** Keep the working Graph version/login path. No transport retries for writes. */
export function metaPublisher(config: Config): SocialPublisher {
  async function graph(path: string, body?: Record<string, unknown>, token = config.token, form = false): Promise<Record<string, any>> {
    const response = await fetch(`${GRAPH}/${path}`, {
      method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' } : {}) },
      ...(body ? { body: form ? new URLSearchParams(Object.entries(body).map(([key, value]) => [key, String(value)])).toString() : JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000), cache: 'no-store',
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error) throw new MetaRequestError(response.status >= 400 && response.status < 500 && response.status !== 408,
      Number.isSafeInteger(result.error?.code) ? result.error.code : undefined);
    return result;
  }
  let pageToken: string | undefined;
  async function facebookToken() {
    if (!config.facebookPageId) throw Error('facebook_not_configured');
    if (!pageToken) pageToken = (await graph(`${config.facebookPageId}?fields=access_token`)).access_token || config.token;
    return pageToken!;
  }
  return {
    async create(input) {
      const result = await graph(`${config.instagramId}/media`, input.isStory
        ? { image_url: input.imageUrl, media_type: 'STORIES' }
        : { image_url: input.imageUrl, caption: input.caption });
      if (typeof result.id !== 'string' || !/^\d+$/.test(result.id)) throw Error('meta_container_missing');
      return result.id;
    },
    async ready(id) {
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        const result = await graph(`${id}?fields=status_code`);
        if (result.status_code === 'FINISHED') return;
        if (['ERROR', 'EXPIRED', 'PUBLISHED'].includes(result.status_code)) throw Error('meta_container_not_publishable');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      throw Error('meta_container_pending');
    },
    async instagram(id) { return (await graph(`${config.instagramId}/media_publish`, { creation_id: id })).id; },
    async facebook(input) {
      const result = await graph(`${config.facebookPageId}/photos`, { url: input.imageUrl, message: input.caption }, await facebookToken(), true);
      // post_id identifies the actual Page post. Never mistake a photo ID for a post ID.
      if (typeof result.post_id !== 'string') throw Error('meta_facebook_post_id_missing');
      return result.post_id;
    },
    async comment(id, articleUrl) { return (await graph(`${id}/comments`, { message: articleUrl }, await facebookToken(), true)).id; },
    async link(channel, id) {
      const field = channel === 'instagram' ? 'permalink' : 'permalink_url';
      const value = (await graph(`${id}?fields=${field}`, undefined, channel === 'facebook' ? await facebookToken() : config.token))[field];
      if (typeof value !== 'string') return null;
      const url = new URL(value);
      const domain = channel === 'instagram' ? 'instagram.com' : 'facebook.com';
      return url.protocol === 'https:' && (url.hostname === domain || url.hostname.endsWith('.'+domain)) ? value : null;
    },
  };
}
export async function instagramContainerPublished(id: string, token: string) {
  const response = await fetch(`${GRAPH}/${encodeURIComponent(id)}?fields=status_code`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000), cache: 'no-store',
  });
  if (!response.ok) return false;
  return (await response.json()).status_code === 'PUBLISHED';
}
