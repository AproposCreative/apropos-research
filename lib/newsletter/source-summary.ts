import type { NewsletterArticle } from '@/lib/newsletter/webflow-sources';

function firstCompleteSentence(raw: string): string | null {
  const text = raw.replace(/\s+/g, ' ').trim();
  const match = text.match(/^(.{30,220}?[.!?])(?:\s|$)/u);
  return match ? match[1].trim() : null;
}

/**
 * Free, source-bound fallback for scheduled mail. It quotes only the existing
 * CMS titles and the first complete sentence of each excerpt. If those facts
 * are insufficient, the caller must not replace them with generic copy.
 */
export function buildSourceBasedNewsletterIntro(articles: NewsletterArticle[]): string | null {
  const leadArticle = articles[0];
  const lead = leadArticle && {
    title: leadArticle.title.replace(/\s+/g, ' ').trim(),
    sentence: firstCompleteSentence(leadArticle.excerpt),
  };
  if (!lead?.title || !lead.sentence) return null;

  const secondArticle = articles[1];
  const second = secondArticle && {
    title: secondArticle.title.replace(/\s+/g, ' ').trim(),
    sentence: firstCompleteSentence(secondArticle.excerpt),
  };
  if (!second?.title || !second.sentence) return null;

  const thirdTitle = articles[2]?.title.replace(/\s+/g, ' ').trim();

  const firstParagraph = `Vi lægger ud med »${lead.title}«. ${lead.sentence}`;
  const secondParagraph = `Læs også »${second.title}«. ${second.sentence}` +
    (thirdTitle ? ` Du finder desuden »${thirdTitle}« nedenfor.` : '');

  return `${firstParagraph}\n\n${secondParagraph}`;
}
