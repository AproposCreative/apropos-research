import { load } from 'cheerio';

type OutputImage = { url: string; width: number | null; height: number | null };

/** Update only matching image elements, retaining editorial alt/credits and surrounding HTML. */
export function replaceOptimizedImageHtml(html: string, oldSrc: string, output: OutputImage): string {
  const hasDimensions = Number.isInteger(output.width) && Number.isInteger(output.height) &&
    Number(output.width) > 0 && Number(output.height) > 0;
  return html.replace(/<img\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi, (tag) => {
    const $ = load(tag);
    const image = $('img');
    if (image.attr('src') !== oldSrc) return tag;
    image.attr('src', output.url);
    if (hasDimensions) {
      image.attr('width', String(output.width));
      image.attr('height', String(output.height));
    }
    // Intrinsic dimensions reserve space, but a constrained width must not leave
    // the HTML height fixed (1200x675 displayed at 720x675 stretched film stills).
    // Preserve unrelated inline declarations while overriding stale fixed sizing.
    image.css('max-width', '100%');
    image.css('height', 'auto');
    // Old responsive candidates would bypass the optimized image. Keep layout sizes.
    if (image.attr('srcset') !== undefined) {
      if (hasDimensions) image.attr('srcset', `${output.url} ${output.width}w`);
      else image.removeAttr('srcset');
    }
    // Existing alt="" may be intentional decoration. Never invent a caption from SEO title.
    return $.html(image);
  });
}
