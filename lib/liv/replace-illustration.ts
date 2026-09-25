import { load } from 'cheerio';
import type { GeneratedArticle } from './generate-article';
import type { MediaEvidence } from './automatic-media';
import { livImageArticleHash } from './article-image-hash';

/** Replaces one generated asset, never source prose or another role. Caller must
 * independently validate the new pixels; this helper grants no approval. */
export function replaceLivIllustration(article: GeneratedArticle, image: MediaEvidence): GeneratedArticle {
  const media = article.preparedMedia, old = media?.find(m => m.role === image.role);
  if (!old || old.kind !== 'illustration' || image.kind !== 'illustration' || !article.selectedImage ||
    media?.length !== 3 || old.alt !== image.alt || old.caption !== image.caption || old.credit !== image.credit ||
    old.contentHash === image.contentHash || media.some(m => m.role !== image.role && m.contentHash === image.contentHash)) {
    throw new Error('liv_media_repair_invalid');
  }
  const revised = { ...article, preparedMedia: media.map(m => m.role === image.role ? image : m), selectedImage: { ...article.selectedImage } };
  if (image.role === 'hero') {
    revised.selectedImage = { ...revised.selectedImage, url: image.url, sourceUrl: image.url,
      storagePath: image.storagePath, contentHash: image.contentHash, sourceHash: image.sourceHash,
      width: image.width, height: image.height, bytes: image.bytes } as typeof revised.selectedImage;
  } else {
    const $ = load(article.content);
    const figure = $(`figure[data-liv-media="${image.role}"]`), img = figure.children('img');
    if (figure.length !== 1 || img.length !== 1 || img.attr('src') !== old.url || img.attr('alt') !== old.alt) throw new Error('liv_media_repair_invalid');
    img.attr('src', image.url).attr('width', String(image.width)).attr('height', String(image.height));
    revised.content = $('body').html() || $.html();
  }
  revised.selectedImage.articleHash = livImageArticleHash(revised);
  return revised;
}
