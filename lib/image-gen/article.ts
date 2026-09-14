import { createHash } from 'node:crypto';
import { load } from 'cheerio';

export const imageGenHash = (value: string) => createHash('sha256').update(value).digest('hex');
export type ArticleSection = { id: string; text: string; index: number };
export type ImageGenArticle = {
  id: string; title: string; content: string; version: string; textVersion: string;
  sections: ArticleSection[];
};

/** Snapshot exactly the fields involved in image placement, not AI-derived text. */
export function imageGenArticle(id: string, title: string, content: string, cover: unknown): ImageGenArticle {
  if (!/^[a-f0-9]{24}$/.test(id) || !title.trim() || title.length > 500 ||
      typeof content !== 'string' || Buffer.byteLength(content) > 500_000) throw new Error('image_gen_article_invalid');
  const $ = load(content);
  const sections: ArticleSection[] = [];
  $('p,h2,h3,blockquote,li').each((index, node) => {
    if ($(node).parents('script,style,iframe,object,embed,figure,figcaption').length) return;
    // Nested paragraphs/list items should not repeat the same extract.
    if ($(node).find('p,h2,h3,blockquote,li').length) return;
    const text = $(node).text().replace(/\s+/gu, ' ').trim();
    if (text) sections.push({ id: imageGenHash(`${index}\n${text}`), index, text });
  });
  return { id, title: title.trim(), content,
    version: imageGenHash(JSON.stringify([id, title, content, cover ?? null])),
    textVersion: imageGenHash(JSON.stringify([id, title, sections.map(s => s.text)])), sections };
}

export type ImageGenMotif = { title: string; description: string; sectionId: string; excerpt: string };

/**
 * A bounded, source-backed visual brief from the single press-search step.
 * This is research input, not a licence decision and not an instruction.
 */
export type ImageGenVisualResearch = {
  brief: string;
  sources: string[];
  status: 'researched' | 'unavailable';
};

export function validateImageGenVisualResearch(value: unknown): ImageGenVisualResearch {
  if (!value || typeof value !== 'object') throw new Error('image_gen_visual_research_invalid');
  const { brief, sources, status } = value as Partial<ImageGenVisualResearch>;
  if ((status !== 'researched' && status !== 'unavailable') || typeof brief !== 'string' ||
      brief.length > 2400 || !Array.isArray(sources) || sources.length > 4 ||
      sources.some(source => typeof source !== 'string' || source.length > 500)) {
    throw new Error('image_gen_visual_research_invalid');
  }
  for (const source of sources) {
    try {
      const url = new URL(source);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('invalid_source');
    } catch {
      throw new Error('image_gen_visual_research_invalid');
    }
  }
  return { brief, sources, status };
}

/** A model may choose a scene, but may not invent its supporting quotation. */
export function validateImageGenMotifs(value: unknown, article: ImageGenArticle): ImageGenMotif[] {
  if (!Array.isArray(value) || value.length !== 3) throw new Error('image_gen_motifs_invalid');
  const seen = new Set<string>();
  return value.map(row => {
    if (!row || typeof row !== 'object') throw new Error('image_gen_motifs_invalid');
    const { title, description, sectionId, excerpt } = row;
    if (typeof title !== 'string' || !title.trim() || title.length > 100 ||
        typeof description !== 'string' || description.trim().length < 15 || description.length > 1500 ||
        typeof excerpt !== 'string' || excerpt.trim().length < 10 || excerpt.length > 2000 ||
        typeof sectionId !== 'string') throw new Error('image_gen_motifs_invalid');
    const section = article.sections.find(section => section.id === sectionId);
    if (!section || !section.text.includes(excerpt)) throw new Error('image_gen_excerpt_not_in_article');
    const key = description.trim().toLowerCase();
    if (seen.has(key)) throw new Error('image_gen_duplicate_motif');
    seen.add(key);
    return { title: title.trim(), description: description.trim(), sectionId, excerpt };
  });
}

export type ImageGenPlacement = {
  sectionId: string; url: string; alt: string; caption: string; credit: string;
};

/** Add new figures only. Replacement is a separate explicit operation. */
export function insertImageGenFigures(article: ImageGenArticle, expectedVersion: string, placements: ImageGenPlacement[]) {
  if (article.version !== expectedVersion) throw new Error('image_gen_article_changed');
  if (!placements.length || placements.length > 6 || new Set(placements.map(p => p.url)).size !== placements.length) {
    throw new Error('image_gen_placements_invalid');
  }
  const $ = load(article.content);
  const nodes = $('p,h2,h3,blockquote,li').toArray();
  const seen = new Set<string>();
  for (const p of placements) {
    const section = article.sections.find(s => s.id === p.sectionId);
    if (!section || !nodes[section.index] || seen.has(p.sectionId)) throw new Error('image_gen_anchor_invalid');
    seen.add(p.sectionId);
    const url = new URL(p.url);
    if (url.protocol !== 'https:' || url.username || url.password ||
        !['cdn.prod.website-files.com', 'uploads-ssl.webflow.com'].includes(url.hostname)) throw new Error('image_gen_asset_not_stored');
    if ([p.alt, p.caption, p.credit].some(v => typeof v !== 'string' || !v.trim() || v.length > 500)) {
      throw new Error('image_gen_caption_invalid');
    }
    const figure = $('<figure class="w-richtext-figure-type-image w-richtext-align-fullwidth"></figure>');
    figure.append($('<div></div>').append($('<img>').attr({ src: url.href, alt: p.alt })));
    figure.append($('<figcaption></figcaption>').text(`${p.caption} ${p.credit}`));
    $(nodes[section.index]).after(figure);
  }
  return $('body').html() ?? '';
}
