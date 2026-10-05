import { load } from 'cheerio';
/** Read-only rendering data: never execute imported rich text in the approval UI. */
export function submissionPreviewBlocks(content: string) {
  const $ = load(content);
  const blocks: Array<{ kind: 'text' | 'image'; text?: string; url?: string; alt?: string; caption?: string }> = [];
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
      else { const text = el.text().trim(); if (text) blocks.push({ kind: 'text', text }); }
    });
  }
  visit($('body').contents());
  return blocks;
}
