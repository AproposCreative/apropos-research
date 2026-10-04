import { load } from 'cheerio';

/** Imported rich text is data, never executable HTML. Reject, don't silently edit prose. */
export function assertArticleMarkupSafe(html: string) {
  const $ = load(html);
  if ($('script,style,iframe,object,embed,svg,math,link,meta,base,form,input,button,textarea,select').length) throw Error('mcp_unsafe_article_markup');
  $('*').each((_, node) => {
    if (node.type !== 'tag') return;
    for (const [name, value] of Object.entries(node.attribs)) {
      if (/^on/i.test(name) || /^(srcdoc|action|formaction)$/i.test(name) ||
          (name === 'style' && /url\s*\(|expression|@import/i.test(value))) throw Error('mcp_unsafe_article_markup');
      if (['href', 'src', 'poster', 'xlink:href'].includes(name) &&
          !/^(?:https:\/\/|\/[^/]|#)/i.test(value.replace(/[\u0000-\u0020\u007f]/g, ''))) throw Error('mcp_unsafe_article_markup');
      if (name === 'srcset' && !value.split(',').every(v => /^\s*https:\/\//i.test(v))) throw Error('mcp_unsafe_article_markup');
    }
  });
}
export function articleImages(html: string) {
  const $ = load(html);
  return $('img[src]').toArray().slice(0, 30).flatMap(node => {
    try {
      const url = new URL($(node).attr('src') || '');
      if (url.protocol !== 'https:' || url.username || url.password) return [];
      return [{ url: url.href, alt: $(node).attr('alt') || '', caption: $(node).closest('figure').find('figcaption').text() }];
    } catch { return []; }
  });
}
export function articleAssetSignature(html: string) {
  const $ = load(html);
  return $('img,video,audio,source,picture,iframe').toArray().map(node => $.html(node));
}
