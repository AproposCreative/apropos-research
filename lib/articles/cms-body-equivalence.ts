import { load } from 'cheerio';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { readLivStoredImage } from '@/lib/liv/stored-image-reader';

/** Ignore CMS serialization whitespace, never changed prose or asset targets. */
export function cmsBodyEvidence(html: string) {
  const $ = load(html);
  const targets = $('a,img,iframe,video,audio,source').toArray().map(element => {
    const node = $(element);
    return { tag: String(node.prop('tagName') || '').toLowerCase(), href: node.attr('href') || '', src: node.attr('src') || '',
      srcset: node.attr('srcset') || '', poster: node.attr('poster') || '', alt: node.attr('alt') || '' };
  });
  $('script,style').remove();
  $('p,div,h1,h2,h3,h4,h5,h6,li,blockquote,figure,figcaption,br,hr,tr,td,th').each((_, element) => {
    $(element).before(' ').after(' ');
  });
  return { text: $('body').text().replace(/\s+/gu, ' ').trim(), targets };
}

export function sameCmsBody(expected: string, stored: string): boolean {
  const wanted = cmsBodyEvidence(expected);
  return !!wanted.text && JSON.stringify(wanted) === JSON.stringify(cmsBodyEvidence(stored));
}

/** Webflow rehosts embedded files. Accept ONLY a changed img src on its CDN
 * after proving identical nonempty raster bytes. Prose, captions, link targets,
 * alt text, order and every other target attribute remain exact. GETs only. */
export async function sameCmsBodyWithStoredImages(expected: string, stored: string,
  readImage: (url: string) => Promise<Buffer> = readLivStoredImage): Promise<boolean> {
  if (sameCmsBody(expected, stored)) return true;
  const wanted = cmsBodyEvidence(expected), actual = cmsBodyEvidence(stored);
  if (!wanted.text || wanted.text !== actual.text || wanted.targets.length !== actual.targets.length ||
      wanted.targets.filter(t => t.tag === 'img').length > 12) return false;
  const pairs: Array<[string, string]> = [];
  for (const [index, target] of wanted.targets.entries()) {
    const saved = actual.targets[index];
    if (JSON.stringify(target) === JSON.stringify(saved)) continue;
    if (target.tag !== 'img' || saved.tag !== 'img' || JSON.stringify({ ...target, src: saved.src }) !== JSON.stringify(saved)) return false;
    try {
      const url = new URL(saved.src), source = new URL(target.src);
      if (source.protocol !== 'https:' || url.protocol !== 'https:' || url.username || url.password || url.port || url.hash ||
          !['cdn.prod.website-files.com', 'uploads-ssl.webflow.com', 'assets-global.website-files.com'].includes(url.hostname)) return false;
    } catch { return false; }
    pairs.push([target.src, saved.src]);
  }
  const hashes = new Map<string, string>();
  const hash = async (url: string) => {
    if (hashes.has(url)) return hashes.get(url)!;
    const bytes = await readImage(url);
    if (!bytes.length || bytes.length > 24 * 1024 * 1024) throw Error('invalid_image');
    const meta = await sharp(bytes, { limitInputPixels: 80_000_000 }).metadata();
    if (!['jpeg', 'png', 'webp'].includes(meta.format || '') || !meta.width || !meta.height || (meta.pages ?? 1) !== 1) throw Error('invalid_image');
    const digest = createHash('sha256').update(bytes).digest('hex'); hashes.set(url, digest); return digest;
  };
  try { for (const [a, b] of pairs) if (await hash(a) !== await hash(b)) return false; }
  catch { return false; }
  return true;
}
