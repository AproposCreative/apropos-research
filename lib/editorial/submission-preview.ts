import { load } from 'cheerio';
/** Read-only rendering data: never execute imported rich text in the approval UI. */
export function submissionPreviewBlocks(content: string) {
  const $ = load(content);
  $('script,style,template,noscript,iframe,object,svg').remove();
  const blocks: Array<{ kind: 'text' | 'image'; text?: string; url?: string; alt?: string; caption?: string; heading?: 'h2' | 'h3' }> = [];
  function visit(nodes: ReturnType<typeof $>) {
    nodes.each((_, node) => {
      if (node.type === 'text') { const text = $(node).text().trim(); if (text) blocks.push({ kind: 'text', text }); return; }
      if (node.type !== 'tag') return;
      const el = $(node);
      if (node.name === 'img') {
        const url = el.attr('src') || '';
        if (url.startsWith('https://')) blocks.push({ kind: 'image', url, alt: el.attr('alt') || '', caption: el.closest('figure').find('figcaption').text() });
      } else if (node.name === 'figcaption') return;
      else if (el.find('img,p,h1,h2,h3,blockquote,li,figure').length) visit(el.contents());
      else { const text = el.text().trim(); if (text) blocks.push({ kind: 'text', text,
        ...(['h1', 'h2', 'h3'].includes(node.name) ? { heading: node.name === 'h3' ? 'h3' as const : 'h2' as const } : {}) }); }
    });
  }
  visit($('body').contents());
  return blocks;
}

/** Safe, deterministic presentation of saved data. No generation or approval. */
export function articleReadingPreview(article: Record<string, unknown>) {
  const plain = (value: unknown) => {
    if (typeof value !== 'string') return '';
    const $ = load(value); $('script,style,template,noscript').remove(); return $.root().text().trim();
  };
  const cover = typeof article.featuredImage === 'string' ? article.featuredImage :
    (article.featuredImage as { url?: string } | undefined)?.url;
  return {
    title: plain(article.title), subtitle: plain(article.subtitle), intro: plain(article.intro),
    author: plain(article.author), category: plain(article.category),
    featuredImage: cover?.startsWith('https://') ? cover : '', featuredImageAlt: plain(article.featuredImageAlt),
    fotoCredit: plain(article.fotoCredit), seoTitle: plain(article.seoTitle), seoDescription: plain(article.seoDescription),
    slug: plain(article.slug), articleFormat: plain(article.articleFormat),
    rating: typeof article.rating === 'number' && article.rating > 0 ? article.rating : null,
    blocks: submissionPreviewBlocks(typeof article.content === 'string' ? article.content : ''),
  };
}
export type ArticleReadingPreview = ReturnType<typeof articleReadingPreview>;
