import { load } from 'cheerio';
import { ensureTextFreeImage, readEditorialImage } from '@/lib/images/text-free';

/** Runs before CMS save/publish, not in a best-effort optimizer catch block.
 * Captions and real source credits stay outside the pixels and are untouched. */
export async function enforceTextFreeArticleImages(fields: Record<string, unknown>) {
  const seen = new Map<string, Promise<string>>();
  const clean = (url: string) => {
    if (!seen.has(url)) seen.set(url, (async () => {
      const source = await readEditorialImage(url);
      const result = await ensureTextFreeImage(source);
      // A CMS/CDN copy of a previously cleaned derivative is already clean.
      // Do not rewrite its URL back to storage and create a webhook publish loop.
      return result.bytes.equals(source) ? url : result.receipt.image.url;
    })());
    return seen.get(url)!;
  };
  for (const key of ['thumb', 'mobile-image']) {
    const value = fields[key];
    const url = typeof value === 'string' ? value : (value as { url?: string } | null)?.url;
    if (!url) continue;
    const replacement = await clean(url);
    if (replacement !== url) fields[key] = { url: replacement, alt: typeof value === 'object' && value ? (value as { alt?: string }).alt || '' : '' };
  }
  // Preserve HTML byte-for-byte unless an actual image edit is necessary.
  for (const key of ['content', 'post-body']) {
    if (typeof fields[key] !== 'string') continue;
    const original = fields[key] as string, $ = load(original);
    let changed = false;
    for (const node of $('img').toArray()) {
      const url = $(node).attr('src'); if (!url) continue;
      const replacement = await clean(url);
      if (replacement !== url) { $(node).attr('src', replacement).removeAttr('srcset'); changed = true; }
    }
    if (changed) fields[key] = $('body').html() || $.html();
  }
}
