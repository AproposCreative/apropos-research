import { load } from 'cheerio';
import { imageMeetsPolicy } from '@/lib/images/inspect-image';

export const IMAGE_DELIVERY_VERSION = 'original-preserving-delivery-2026-10-28-v2';
const imageUrl = (v: unknown) => typeof v === 'string' ? v : (v as { url?: string } | null)?.url;

/** Positive byte/dimension verification, never a URL/extension heuristic.
 * A disabled sub-optimizer or failed inspection cannot be recorded as compliant. */
export async function verifyArticleImageDelivery(fields: Record<string, unknown>) {
  const cover = imageUrl(fields.thumb), mobile = imageUrl(fields['mobile-image']);
  if (cover && !mobile) throw Error('image_delivery_missing_mobile');
  const checks: Array<{ role: string; url: string; kb: number; edge: number }> = [];
  if (cover) checks.push({ role: 'thumb', url: cover, kb: 450, edge: 2400 });
  if (mobile) checks.push({ role: 'mobile-image', url: mobile, kb: 260, edge: 1200 });
  for (const field of ['content', 'post-body']) {
    const $ = load(typeof fields[field] === 'string' ? fields[field] as string : '');
    for (const [index, node] of $('img').toArray().entries()) {
      const url = $(node).attr('src');
      if (!url) throw Error(`image_delivery_missing_src:${field}:${index}`);
      checks.push({ role: `${field}:${index}`, url, kb: 200, edge: 1200 });
    }
  }
  const inspected = new Map<string, Promise<boolean>>();
  for (const check of checks) {
    const key = `${check.kb}:${check.edge}:${check.url}`;
    if (!inspected.has(key)) inspected.set(key, imageMeetsPolicy(check.url, check.kb, check.edge));
    if (!await inspected.get(key)) throw Error(`image_delivery_noncompliant:${check.role}`);
  }
  return { version: IMAGE_DELIVERY_VERSION, verifiedImages: checks.length };
}
